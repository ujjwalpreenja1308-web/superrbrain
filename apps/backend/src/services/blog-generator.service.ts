/**
 * Blog Generator Service
 *
 * Pipeline:
 *   1. Pull top 3 cited URLs for a brand (listicle + blog, by frequency)
 *   2. Crawl each with Firecrawl → get full markdown
 *   3. Analyze AEO patterns across all 3 articles (what structure/tone got them cited)
 *   4. Generate a new AEO-optimized blog post for the brand mirroring those patterns
 *   5. Include explicit visual directives (where to add images/tables/charts)
 *
 * AEO = Answer Engine Optimization — optimizing content to get cited by AI search engines
 */

import { openai } from "../lib/openai.js";
import { scrapeUrl } from "./scraper.service.js";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AeoPatterns {
  word_count_avg: number;
  heading_structure: string[];       // e.g. ["H1: brand comparison title", "H2: per product", "H3: pros/cons"]
  tone: string;                      // e.g. "direct, data-driven, first-person"
  format_patterns: string[];         // e.g. ["numbered list", "comparison table", "verdict box"]
  citation_triggers: string[];       // phrases/structures that likely make AI cite this
  opening_pattern: string;           // how the article opens (hook style)
  conclusion_pattern: string;        // how it closes
}

export interface VisualDirective {
  position: string;                  // e.g. "after-introduction", "between-section-2-and-3"
  type: "comparison-table" | "product-image" | "rating-chart" | "infographic" | "screenshot" | "callout-box";
  description: string;               // exact instruction to the writer
}

export interface BlogGeneratorOutput {
  source_urls: string[];
  source_titles: string[];
  aeo_patterns: AeoPatterns;
  title: string;
  slug: string;
  meta_description: string;
  content_markdown: string;
  target_queries: string[];
  visual_directives: VisualDirective[];
  word_count: number;
}

// ── Step 1: Get top 3 cited URLs for a brand ─────────────────────────────────

export async function getTopCitedUrls(brandId: string): Promise<{ url: string; frequency: number; title: string | null }[]> {
  const { data } = await supabaseAdmin
    .from("citations")
    .select("url, domain, title, source_type")
    .eq("brand_id", brandId)
    .in("source_type", ["listicle", "blog", "review_site", "news"])
    .not("url", "like", "%reddit.com%")
    .not("url", "like", "%youtube.com%");

  if (!data?.length) return [];

  // Count frequency per URL
  const freq = new Map<string, { count: number; title: string | null }>();
  for (const row of data) {
    const existing = freq.get(row.url) || { count: 0, title: row.title };
    freq.set(row.url, { count: existing.count + 1, title: row.title });
  }

  return Array.from(freq.entries())
    .map(([url, { count, title }]) => ({ url, frequency: count, title }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);
}

// ── Step 2: Crawl articles ────────────────────────────────────────────────────

interface CrawledArticle {
  url: string;
  title: string;
  markdown: string;
  word_count: number;
}

async function crawlArticles(urls: { url: string; title: string | null }[]): Promise<CrawledArticle[]> {
  const results = await Promise.allSettled(
    urls.map(async ({ url, title }) => {
      const scraped = await scrapeUrl(url);
      return {
        url,
        title: scraped.title || title || url,
        markdown: scraped.markdown.slice(0, 12000), // cap at 12k chars per article
        word_count: scraped.markdown.split(/\s+/).length,
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CrawledArticle> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((a) => a.markdown.length > 200);
}

// ── Step 3: Analyze AEO patterns ─────────────────────────────────────────────

async function analyzeAeoPatterns(
  articles: CrawledArticle[],
  brandName: string,
  industry: string
): Promise<AeoPatterns> {
  const articlesText = articles
    .map((a, i) => `=== ARTICLE ${i + 1}: ${a.title} (${a.word_count} words) ===\n${a.markdown}`)
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are an AEO (Answer Engine Optimization) expert. Your job is to analyze articles that get cited by AI search engines (ChatGPT, Perplexity) and extract the structural patterns that make them citation-worthy.

AI search engines cite articles that:
- Directly answer specific questions with structured data
- Use clear H2/H3 headings that mirror search queries
- Include comparison tables, numbered rankings, or verdict sections
- State facts confidently without hedging
- Have a clear "best X for Y" or "X vs Y" structure
- Are specific and data-driven, not vague

Analyze the provided articles and return JSON with these exact fields:
{
  "word_count_avg": <number>,
  "heading_structure": ["description of H1 pattern", "H2 pattern", "H3 pattern"],
  "tone": "brief description of tone",
  "format_patterns": ["pattern1", "pattern2", ...],
  "citation_triggers": ["specific phrase/structure that triggers AI citation", ...],
  "opening_pattern": "how these articles open (first 2-3 sentences pattern)",
  "conclusion_pattern": "how these articles close"
}`,
      },
      {
        role: "user",
        content: `Analyze these ${articles.length} articles from the ${industry} industry that were cited by AI search engines when users searched for information in this niche.

Brand context: ${brandName}

${articlesText}

Extract the AEO patterns — what structural and content choices made these get cited?`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");
  return {
    word_count_avg: raw.word_count_avg || 1200,
    heading_structure: raw.heading_structure || [],
    tone: raw.tone || "direct and informative",
    format_patterns: raw.format_patterns || [],
    citation_triggers: raw.citation_triggers || [],
    opening_pattern: raw.opening_pattern || "",
    conclusion_pattern: raw.conclusion_pattern || "",
  };
}

// ── Step 4: Generate AEO-optimized blog post ──────────────────────────────────

async function generateBlogPost(
  brandName: string,
  brandUrl: string,
  industry: string,
  targetQueries: string[],
  patterns: AeoPatterns,
  sourceArticles: CrawledArticle[]
): Promise<{ title: string; slug: string; meta_description: string; content: string; visual_directives: VisualDirective[] }> {

  const primaryQuery = targetQueries[0] || `best ${industry} options`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are an AEO content writer. Your goal is to write blog posts that get cited by AI search engines like ChatGPT and Perplexity.

AEO WRITING RULES (non-negotiable):
1. Structure mirrors what AI engines cite — use H2s that are exact question phrases (e.g. "Is X worth it?", "X vs Y: Which is Better?")
2. Every section answers one specific question directly in the first sentence
3. Use numbered lists and comparison tables — AI engines pull these verbatim
4. State facts confidently. Never hedge with "may", "might", "could potentially"
5. Include a "Bottom Line" or "Verdict" section — AI engines cite these as quick answers
6. Brand mention must be natural: one specific claim + one differentiator, not a sales pitch
7. Word count target: ${patterns.word_count_avg} words (±10%)
8. Tone: ${patterns.tone}

VISUAL DIRECTIVE FORMAT:
After each section where a visual would help, add this exact marker on its own line:
[VISUAL: type | description of what to show]
Types: comparison-table, product-image, rating-chart, infographic, screenshot, callout-box

Example: [VISUAL: comparison-table | Compare top 5 products on price, protein content, and third-party testing]

OUTPUT FORMAT — return a JSON object:
{
  "title": "SEO title (60 chars max, includes primary keyword)",
  "slug": "url-slug-with-hyphens",
  "meta_description": "155 chars max, includes primary keyword + click hook",
  "content": "full markdown content with [VISUAL: ...] markers",
  "visual_directives": [
    { "position": "after section name", "type": "comparison-table", "description": "what to show" }
  ]
}`,
      },
      {
        role: "user",
        content: `Write an AEO-optimized blog post for ${brandName} (${brandUrl}).

PRIMARY TARGET QUERY: "${primaryQuery}"
ALSO TARGETS: ${targetQueries.slice(1, 4).join(", ")}

INDUSTRY: ${industry}

PATTERNS FROM TOP-CITED ARTICLES IN THIS NICHE:
- Heading structure: ${patterns.heading_structure.join(" → ")}
- Format patterns: ${patterns.format_patterns.join(", ")}
- Citation triggers: ${patterns.citation_triggers.join(", ")}
- Opening pattern: ${patterns.opening_pattern}
- Conclusion pattern: ${patterns.conclusion_pattern}

The blog post should:
1. Mirror the structure of articles AI already cites in this niche
2. Naturally position ${brandName} as one of the options (not the only option — that's less credible)
3. Include specific, verifiable claims about ${brandName} where possible
4. Be the most comprehensive, direct answer to "${primaryQuery}" on the internet`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4000,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");

  // Extract visual directives from content markers
  const visualDirectives: VisualDirective[] = raw.visual_directives || [];

  // Also parse inline [VISUAL: ...] markers from content as backup
  const inlineVisuals = [...(raw.content || "").matchAll(/\[VISUAL:\s*([^|]+)\|([^\]]+)\]/g)];
  for (const match of inlineVisuals) {
    const type = match[1].trim().toLowerCase().replace(/\s+/g, "-") as VisualDirective["type"];
    const description = match[2].trim();
    if (!visualDirectives.some((v) => v.description === description)) {
      visualDirectives.push({ position: "inline", type, description });
    }
  }

  return {
    title: raw.title || `Best ${industry} options: Complete Guide`,
    slug: raw.slug || raw.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "blog-post",
    meta_description: raw.meta_description || "",
    content: raw.content || "",
    visual_directives: visualDirectives,
  };
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runBlogGeneratorPipeline(
  brandId: string,
  brandName: string,
  brandUrl: string,
  industry: string,
  targetQueries: string[]
): Promise<BlogGeneratorOutput> {
  // Step 1: Get top cited URLs
  const topCited = await getTopCitedUrls(brandId);
  if (!topCited.length) {
    throw new Error("No cited URLs found for this brand. Run a monitoring job first.");
  }

  // Step 2: Crawl them
  const articles = await crawlArticles(topCited.map((c) => ({ url: c.url, title: c.title })));
  if (!articles.length) {
    throw new Error("Could not crawl any of the top cited URLs.");
  }

  // Step 3: Analyze AEO patterns
  const patterns = await analyzeAeoPatterns(articles, brandName, industry);

  // Step 4: Generate blog post
  const blog = await generateBlogPost(
    brandName,
    brandUrl,
    industry,
    targetQueries,
    patterns,
    articles
  );

  const wordCount = blog.content.split(/\s+/).length;

  return {
    source_urls: articles.map((a) => a.url),
    source_titles: articles.map((a) => a.title),
    aeo_patterns: patterns,
    title: blog.title,
    slug: blog.slug,
    meta_description: blog.meta_description,
    content_markdown: blog.content,
    target_queries: targetQueries,
    visual_directives: blog.visual_directives,
    word_count: wordCount,
  };
}
