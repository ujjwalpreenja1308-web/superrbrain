import { PLAN_LIMITS } from "@covable/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { getPlanTier } from "../middleware/requirePlan.js";
import { scrapeUrl } from "./scraper.service.js";
import {
  extractBrandData,
  generatePrompts,
  type BrandExtraction,
  type GeneratedPrompt,
} from "./prompt-generator.service.js";

export interface BrandOnboardingStart {
  url: string;
  userId: string;
  promptLimit: number;
}

export async function beginBrandOnboarding(
  brandId: string,
): Promise<BrandOnboardingStart> {
  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .update({ status: "onboarding", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .in("status", ["pending", "onboarding"])
    .select("url, user_id")
    .maybeSingle();

  if (error || !brand) {
    throw new Error(
      `Failed to start brand onboarding: ${error?.message ?? "brand is not retryable"}`,
    );
  }

  const tier = await getPlanTier(brand.user_id);
  return {
    url: brand.url,
    userId: brand.user_id,
    promptLimit: Math.min(PLAN_LIMITS[tier].maxPrompts, 25),
  };
}

export async function scrapeBrandWebsite(url: string): Promise<string> {
  const scraped = await scrapeUrl(url);
  if (!scraped.markdown.trim()) {
    throw new Error("Website analysis returned no readable content");
  }
  // Workflow step results are persisted in QStash messages. The extractor only
  // needs the opening content, so keep the durable payload comfortably small.
  return scraped.markdown.slice(0, 20_000);
}

export async function extractBrandProfile(
  markdown: string,
  url: string,
): Promise<BrandExtraction> {
  return extractBrandData(markdown, url);
}

export async function saveBrandProfile(
  brandId: string,
  extracted: BrandExtraction,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      name: extracted.name,
      category: extracted.category,
      description: extracted.description,
      competitors: extracted.competitors,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId);

  if (error) {
    throw new Error(`Failed to save extracted brand data: ${error.message}`);
  }
}

export async function generateBrandPrompts(
  extracted: BrandExtraction,
  promptLimit: number,
): Promise<GeneratedPrompt[]> {
  const prompts = await generatePrompts(
    extracted.name,
    extracted.category,
    extracted.description,
    extracted.competitors,
    promptLimit,
  );
  if (!prompts.length) throw new Error("Prompt generation returned no prompts");
  return prompts;
}

export async function saveBrandPrompts(
  brandId: string,
  prompts: GeneratedPrompt[],
): Promise<number> {
  const { data: existingPrompts, error: existingPromptsError } =
    await supabaseAdmin.from("prompts").select("text").eq("brand_id", brandId);
  if (existingPromptsError) {
    throw new Error(
      `Failed to check existing prompts: ${existingPromptsError.message}`,
    );
  }

  const existingTexts = new Set(
    (existingPrompts ?? []).map((prompt) => prompt.text.trim().toLowerCase()),
  );
  const promptRows = prompts
    .filter((prompt) => !existingTexts.has(prompt.text.trim().toLowerCase()))
    .map((prompt) => ({
      brand_id: brandId,
      text: prompt.text,
      category: prompt.category,
      is_active: true,
    }));

  if (promptRows.length) {
    const { error } = await supabaseAdmin.from("prompts").insert(promptRows);
    if (error) throw new Error(`Failed to save prompts: ${error.message}`);
  }

  return prompts.length;
}

export async function markBrandOnboardingReady(brandId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brands")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("id", brandId);
  if (error) {
    throw new Error(`Failed to complete brand onboarding: ${error.message}`);
  }
}

export async function markBrandOnboardingError(brandId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brands")
    .update({ status: "error", updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .in("status", ["pending", "onboarding"]);
  if (error) {
    console.error(`Failed to mark brand ${brandId} as errored:`, error.message);
  }
}

export async function runBrandOnboarding(brandId: string) {
  try {
    const start = await beginBrandOnboarding(brandId);
    const markdown = await scrapeBrandWebsite(start.url);
    const extracted = await extractBrandProfile(markdown, start.url);
    await saveBrandProfile(brandId, extracted);
    const prompts = await generateBrandPrompts(extracted, start.promptLimit);
    const promptCount = await saveBrandPrompts(brandId, prompts);
    await markBrandOnboardingReady(brandId);

    return { success: true, brandName: extracted.name, promptCount };
  } catch (error) {
    await markBrandOnboardingError(brandId);
    throw error;
  }
}
