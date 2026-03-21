import { openai } from "../lib/openai.js";
import { scrapeUrl } from "./scraper.service.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface BrandVoiceProfile {
  tone: string;
  vocabulary_level: string;
  claims: string[];
  icp_language: string[];
  differentiators: string[];
  avoid_claims: string[];
}

export async function getBrandVoice(brandId: string): Promise<BrandVoiceProfile> {
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id, url, name, brand_voice")
    .eq("id", brandId)
    .single();

  if (!brand) throw new Error("Brand not found");

  if (brand.brand_voice) {
    return brand.brand_voice as BrandVoiceProfile;
  }

  // Lazy derive
  let pageContent = "";
  try {
    const scraped = await scrapeUrl(brand.url);
    pageContent = scraped.markdown.slice(0, 8000);
  } catch {
    pageContent = `Brand URL: ${brand.url}, Name: ${brand.name || "Unknown"}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a brand voice analyst. Extract the brand's communication style from website content.
Return a JSON object with these exact fields:
{
  "tone": "e.g. friendly and direct, professional but approachable",
  "vocabulary_level": "simple|intermediate|technical",
  "claims": ["specific product/service claims the brand makes"],
  "icp_language": ["phrases and terms their ideal customers use"],
  "differentiators": ["what makes them different from competitors"],
  "avoid_claims": ["things they explicitly don't claim or would find off-brand"]
}`,
      },
      {
        role: "user",
        content: `Analyze the brand voice from this website content for ${brand.name || brand.url}:\n\n${pageContent}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");

  const brandVoice: BrandVoiceProfile = {
    tone: raw.tone || "professional",
    vocabulary_level: raw.vocabulary_level || "intermediate",
    claims: raw.claims || [],
    icp_language: raw.icp_language || [],
    differentiators: raw.differentiators || [],
    avoid_claims: raw.avoid_claims || [],
  };

  // Store for future use
  await supabaseAdmin
    .from("brands")
    .update({ brand_voice: brandVoice })
    .eq("id", brandId);

  return brandVoice;
}
