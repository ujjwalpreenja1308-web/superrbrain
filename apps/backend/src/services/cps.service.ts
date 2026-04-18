import { openai } from "../lib/openai.js";
import type { CPSBreakdown } from "@covable/shared";

interface PageData {
  title: string;
  content: string;
  tldr: string;
}

interface PromptData {
  text: string;
}

export interface CPSResult {
  score: number;
  breakdown: CPSBreakdown;
}

// Entity score: brand in title + H2 + table + top 3 list items
export function computeEntityScore(page: PageData, brandName: string): number {
  const lower = page.content.toLowerCase();
  const brandLower = brandName.toLowerCase();
  const titleLower = page.title.toLowerCase();

  let score = 0;
  // In title (0.30)
  if (titleLower.includes(brandLower)) score += 0.30;
  // In TL;DR (0.20)
  if (page.tldr.toLowerCase().includes(brandLower)) score += 0.20;
  // In first H3 heading (0.25)
  const firstH3Match = lower.match(/### .+/);
  if (firstH3Match && firstH3Match[0].includes(brandLower)) score += 0.25;
  // In comparison table section (0.15)
  const tableIdx = lower.indexOf("## comparison table");
  if (tableIdx !== -1 && lower.slice(tableIdx, tableIdx + 2000).includes(brandLower)) score += 0.15;
  // In summary (0.10)
  const summaryIdx = lower.lastIndexOf("## summary");
  if (summaryIdx !== -1 && lower.slice(summaryIdx).includes(brandLower)) score += 0.10;

  return Math.min(1, score);
}

// Structure score: has all required sections
export function computeStructureScore(page: PageData): number {
  const content = page.content.toLowerCase();
  let score = 0;

  // Has TL;DR (0.20)
  if (page.tldr.length > 20) score += 0.20;
  // Has comparison table (0.20)
  if (content.includes("## comparison table") || content.includes("| tool |")) score += 0.20;
  // Has FAQ (0.20)
  if (content.includes("## frequently asked") || content.includes("## faq")) score += 0.20;
  // Has ≥8 list items (0.25)
  const h3Count = (content.match(/### /g) ?? []).length;
  if (h3Count >= 8) score += 0.25;
  else if (h3Count >= 5) score += 0.15;
  // Has summary (0.15)
  if (content.includes("## summary")) score += 0.15;

  return Math.min(1, score);
}

// Redundancy score: main keyword repeated 5-8 times
export function computeRedundancyScore(content: string, keyword: string): number {
  const lower = content.toLowerCase();
  const kw = keyword.toLowerCase();
  // Count phrase occurrences (non-overlapping)
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(kw, idx)) !== -1) {
    count++;
    idx += kw.length;
  }
  if (count >= 5 && count <= 8) return 1.0;
  if (count >= 3 && count < 5) return 0.6;
  if (count > 8 && count <= 12) return 0.8;
  if (count > 12) return 0.5; // over-stuffed
  return 0.2;
}

// Intent coverage: what % of prompt variants does the content address?
export function computeIntentCoverageScore(content: string, variants: string[]): number {
  if (!variants.length) return 0.5;
  const lower = content.toLowerCase();
  let covered = 0;
  for (const variant of variants) {
    // Check if key entity words from the variant appear in content
    const words = variant.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matchCount = words.filter((w) => lower.includes(w)).length;
    if (matchCount / words.length >= 0.6) covered++;
  }
  return covered / variants.length;
}

// Freshness score: has year or "updated [month year]"
export function computeFreshnessScore(content: string): number {
  const currentYear = new Date().getFullYear();
  const lower = content.toLowerCase();
  if (lower.includes(`updated`) && lower.includes(currentYear.toString())) return 1.0;
  if (lower.includes(currentYear.toString())) return 0.5;
  if (lower.includes((currentYear - 1).toString())) return 0.2;
  return 0;
}

// Anti-generic score: uses detectGenericScore (LLM-based), cached per page
export async function computeAntiGenericScore(content: string): Promise<number> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generic_check",
        strict: true,
        schema: {
          type: "object",
          properties: { score: { type: "number" } },
          required: ["score"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Rate content for generic AI writing on 1-10 (10=most generic). Check for: vague adjectives, missing named comparisons, filler phrases, AI tells (delve/tapestry/robust/seamless). Return only the numeric score.`,
      },
      { role: "user", content: content.slice(0, 2000) },
    ],
  });
  const parsed = JSON.parse(response.choices[0].message.content!);
  const genericScore = parsed.score as number;
  return 1 - genericScore / 10; // invert: higher generic = lower anti-generic score
}

export async function computeCPS(
  page: PageData & { id: string },
  prompt: PromptData,
  brandName: string,
  promptVariants: string[]
): Promise<CPSResult> {
  const entity_score = computeEntityScore(page, brandName);
  const structure_score = computeStructureScore(page);

  // Extract primary keyword (first 3-4 meaningful words from prompt)
  const keyword = prompt.text
    .toLowerCase()
    .replace(/^(what|which|how|who|where|when|is|are|the|a|an)\s+/i, "")
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");

  const redundancy_score = computeRedundancyScore(page.content, keyword);
  const intent_coverage_score = computeIntentCoverageScore(page.content, promptVariants);
  const freshness_score = computeFreshnessScore(page.content);
  const anti_generic_score = await computeAntiGenericScore(page.content);

  const total =
    entity_score * 0.25 +
    structure_score * 0.20 +
    redundancy_score * 0.20 +
    intent_coverage_score * 0.15 +
    freshness_score * 0.10 +
    anti_generic_score * 0.10;

  const breakdown: CPSBreakdown = {
    entity_score,
    structure_score,
    redundancy_score,
    intent_coverage_score,
    freshness_score,
    anti_generic_score,
    total,
  };

  return { score: Math.min(1, total), breakdown };
}
