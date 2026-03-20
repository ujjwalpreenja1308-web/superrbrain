import { openai } from "../lib/openai.js";

interface BrandExtraction {
  name: string;
  category: string;
  description: string;
  competitors: { name: string; url?: string }[];
}

export async function extractBrandData(
  markdown: string,
  url: string
): Promise<BrandExtraction> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a brand analyst. Given scraped website content, extract brand information.
Return JSON with:
- name: brand name
- category: specific category (e.g. "project management software", "DTC skincare", "B2B accounting SaaS", "personal injury law firm", "plant-based protein powder") — be specific, not generic
- description: one sentence describing what they sell/offer and who their buyer/user is
- competitors: array of 3-5 real direct competitors as objects with "name" and optional "url" — these should be brands a buyer would compare against, not industry bodies or publishers

Work for any industry: SaaS, e-commerce, professional services, marketplaces, consumer goods, agencies, etc.`,
      },
      {
        role: "user",
        content: `Website URL: ${url}\n\nWebsite content:\n${markdown.slice(0, 6000)}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from GPT-4o mini");

  return JSON.parse(content);
}

export async function generatePrompts(
  brandName: string,
  category: string,
  description: string,
  competitors: { name: string }[]
): Promise<string[]> {
  const competitorNames = competitors.map((c) => c.name).join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You generate search prompts — the exact queries a real buyer/user would ask an AI assistant before purchasing or adopting a product or service. These must be tailored to the specific industry and category, not generic.

Generate 15-20 diverse prompts covering:
- "Best [category] for [specific use case or persona]" queries
- Comparison queries ("X vs Y", "alternatives to X")
- Review/recommendation queries ("is [category] worth it", "honest reviews")
- Problem-first queries ("how to solve [problem] with [category]")
- Reddit-style: "Reddit recommendations for [category]", "what does Reddit say about [category]"
- YouTube-style: "YouTube reviews [category]", "best [category] review YouTube"
- Community/trust: "has anyone used [category]", "experiences with [category]"
- Price/value queries: "best budget [category]", "is [category] worth the price"
- Industry-specific queries: think about what a real buyer in THIS specific industry would search

Tailor the prompts to the industry — a SaaS tool buyer asks very differently than someone buying supplements or hiring a lawyer.
Do NOT mention the specific brand name in the prompts.
Return JSON: { "prompts": ["prompt1", "prompt2", ...] }`,
      },
      {
        role: "user",
        content: `Brand: ${brandName}
Category: ${category}
Description: ${description}
Known competitors: ${competitorNames}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from GPT-4o mini");

  const parsed = JSON.parse(content);
  return parsed.prompts;
}
