import type { SourceType } from "@covable/shared";
import { ollamaJsonCompletion } from "../lib/ollama.js";

export interface CitationAnalysis {
  url: string;
  domain: string;
  source_type: SourceType;
  title: string | null;
  brands_mentioned: { name: string; frequency: number }[];
  content_snippet: string;
}

export function buildCitationRows(
  responseIds: string[],
  brandId: string,
  analysis: CitationAnalysis,
  runId: string,
) {
  return responseIds.map((responseId) => ({
    ai_response_id: responseId,
    brand_id: brandId,
    url: analysis.url,
    domain: analysis.domain,
    source_type: analysis.source_type,
    title: analysis.title,
    brands_mentioned: analysis.brands_mentioned,
    content_snippet: analysis.content_snippet,
    run_id: runId,
  }));
}

export function mergeBrandMentions(
  ...groups: { name: string; frequency: number }[][]
): { name: string; frequency: number }[] {
  const merged = new Map<string, { name: string; frequency: number }>();
  for (const mention of groups.flat()) {
    const name = mention.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.frequency = Math.max(existing.frequency, mention.frequency);
    } else {
      merged.set(key, { name, frequency: Math.max(1, mention.frequency) });
    }
  }
  return [...merged.values()];
}

export function normalizeUrlForComparison(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid"].includes(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return input.trim();
  }
}

/**
 * Use the configured Ollama Cloud model to extract actual brand/company names
 * mentioned in an AI response.
 * This replaces naive string-matching against a predefined competitor list.
 */
export async function extractBrandsFromResponse(
  responseText: string,
  brandName: string,
): Promise<{ name: string; frequency: number }[]> {
  const raw = await ollamaJsonCompletion<{ brands?: unknown }>({
    temperature: 0,
    maxTokens: 1000,
    messages: [
      {
        role: "system",
        content: `Extract all real brand or company names mentioned in the text.
Return JSON: { "brands": ["Brand A", "Brand B"] }
Rules:
- Only include actual company/brand names (e.g. "Garden of Life", "Ritual", "Athletic Greens")
- Do NOT include generic ingredients, nutrients, or concepts (e.g. "Spirulina", "Vitamin D", "Probiotics")
- Do NOT include the brand "${brandName}"
- If no brand names appear, return { "brands": [] }`,
      },
      { role: "user", content: responseText.slice(0, 3000) },
    ],
  });
  const names: unknown[] = Array.isArray(raw?.brands) ? raw.brands : [];
  const normalizedBrand = brandName.trim().toLowerCase();
  return [
    ...new Set(
      names
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(
          (name) => name.length > 0 && name.toLowerCase() !== normalizedBrand,
        ),
    ),
  ].map((name) => ({ name, frequency: 1 }));
}

/**
 * Enrich a citation URL using only:
 * 1. The URL itself (domain, source type)
 * 2. The AI response text that cited it (brands mentioned in context)
 *
 * No external scraping — everything comes from what the AI already returned.
 */
export function enrichCitation(
  url: string,
  responseText: string,
  brandName: string,
  competitors: { name: string }[],
): CitationAnalysis {
  let domain = "";
  try {
    domain = new URL(url).hostname.replace("www.", "");
  } catch {
    domain = url;
  }

  const source_type = refineSourceType(url, classifyByDomain(domain));

  // Extract a snippet from the response text around where this URL was mentioned
  const urlIndex = responseText.indexOf(url);
  let content_snippet = "";
  if (urlIndex !== -1) {
    const start = Math.max(0, urlIndex - 200);
    const end = Math.min(responseText.length, urlIndex + 200);
    content_snippet = responseText.slice(start, end).trim();
  }

  // Determine which brands appear in the response text or are the cited domain itself
  const lowerText = responseText.toLowerCase();
  const allBrands = [{ name: brandName }, ...competitors]
    .map((brand) => ({ name: brand.name.trim() }))
    .filter((brand) => brand.name.length > 0);
  const brands_mentioned = allBrands
    .map((b) => {
      const count = countOccurrences(lowerText, b.name.toLowerCase());
      return count > 0 ? { name: b.name, frequency: count } : null;
    })
    .filter(Boolean) as { name: string; frequency: number }[];

  // Only check if the cited URL's domain belongs to a known competitor
  // e.g. if a competitor's own website is cited, that's a signal
  if (brands_mentioned.length === 0) {
    const domainLower = domain
      .toLowerCase()
      .replace(/\.(com|co|org|net|us|io).*$/, "");
    for (const comp of competitors) {
      const competitorName = comp.name.trim();
      const compNorm = competitorName.toLowerCase().replace(/\s+/g, "");
      if (!compNorm || !domainLower) continue;
      if (domainLower.includes(compNorm) || compNorm.includes(domainLower)) {
        brands_mentioned.push({ name: competitorName, frequency: 1 });
        break;
      }
    }
    // Do NOT derive brand names from random domains — those are just publishing sources, not competitors
  }

  // Derive a readable title from the domain
  const title = domainToTitle(domain);

  return {
    url,
    domain,
    source_type,
    title,
    brands_mentioned,
    content_snippet,
  };
}

export function enrichCitationsBatch(
  urls: string[],
  responseText: string,
  brandName: string,
  competitors: { name: string }[],
): CitationAnalysis[] {
  return [...new Set(urls)].map((url) =>
    enrichCitation(url, responseText, brandName, competitors),
  );
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;

  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(term, pos)) !== -1) {
    count++;
    pos += term.length;
  }
  return count;
}

function domainToTitle(domain: string): string {
  // Strip TLD and format nicely: "nytimes.com" -> "Nytimes", "reddit.com" -> "Reddit"
  const base = domain.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Universal domain patterns — works for any industry
const DOMAIN_RULES: { pattern: RegExp; type: SourceType }[] = [
  // Community / discussion
  { pattern: /reddit\.com|redd\.it/, type: "reddit" },
  { pattern: /youtube\.com|youtu\.be/, type: "youtube" },
  {
    pattern:
      /twitter\.com|x\.com|instagram\.com|tiktok\.com|facebook\.com|linkedin\.com|pinterest\.com/,
    type: "social",
  },
  { pattern: /quora\.com/, type: "social" },

  // Review platforms (universal)
  {
    pattern:
      /trustpilot|g2\.com|capterra|getapp|software advice|sourceforge|producthunt|yelp\.com|tripadvisor|glassdoor|indeed\.com|sitejabber|bbb\.org|reviewgeek|wirecutter|rtings\.com|pcmag\.com|techradar|cnet\.com|tomsguide|bestreviews|consumerreports/,
    type: "review_site",
  },

  // Marketplaces (universal e-commerce + vertical)
  {
    pattern:
      /amazon\.|ebay\.|etsy\.|walmart\.|target\.|bestbuy\.|shopify\.|bigcommerce\.|gumroad\.|appsumo\./,
    type: "marketplace",
  },

  // Directories / databases (universal)
  {
    pattern:
      /wikipedia\.|crunchbase\.|owler\.|zoominfo\.|dnb\.com|clutch\.co|goodfirms\.|sortlist\.|g2\.com|alternativeto\.net|slashdot\.org/,
    type: "directory",
  },

  // News / editorial (universal — major outlets + tech + business + health)
  {
    pattern:
      /nytimes|washingtonpost|theguardian|bbc\.|reuters|apnews|forbes|businessinsider|techcrunch|wired\.com|theverge|engadget|venturebeat|wsj\.com|bloomberg\.|ft\.com|economist\.|inc\.com|entrepreneur\.com|fastcompany|mashable|zdnet|healthline|webmd|medicalnewstoday|verywellhealth|mayoclinic|nhs\.uk/,
    type: "news",
  },
];

function classifyByDomain(domain: string): SourceType {
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(domain)) return rule.type;
  }
  return "blog";
}

const LISTICLE_PATTERNS = [
  /\/best[-_]/i,
  /\/top[-_\d]/i,
  /\/\d+[-_](best|top|ways|tips|supplements|brands|products|picks)/i,
  /[-_](best|top)[-_]/i,
  /\/guide[-_]/i,
  /\/ultimate[-_]/i,
  /\/most[-_]/i,
  /\/ranked/i,
  /\/roundup/i,
  /\/picks/i,
  /\/recommended/i,
  /\/essentials/i,
  /\/awards/i,
];

export function refineSourceType(
  url: string,
  currentType: SourceType,
): SourceType {
  if (currentType !== "blog") return currentType;
  if (LISTICLE_PATTERNS.some((p) => p.test(url))) return "listicle";
  return "blog";
}
