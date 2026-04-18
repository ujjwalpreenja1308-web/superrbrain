import { openai } from "../lib/openai.js";
import { scrapeUrl } from "./scraper.service.js";
import { scrapeWithBrightData } from "./brightdata.service.js";
import type { CompetitorBlueprintShape } from "@covable/shared";

const WHY_WINNING_ENUM = [
  "DEFINITIVE_RANKING",
  "COMPARISON_STRUCTURE",
  "HIGH_ENTITY_DENSITY",
  "REDUNDANT_PHRASING",
  "FAQ_COVERAGE",
  "FRESHNESS_SIGNAL",
  "DIRECT_ANSWER",
  "AUTHORITATIVE_TONE",
] as const;

export type WhyWinningSignal = (typeof WHY_WINNING_ENUM)[number];

export interface DeconstructedBlueprint {
  schema: CompetitorBlueprintShape;
  why_winning_signals: WhyWinningSignal[];
  raw_markdown: string;
}

export async function findCompetitorUrls(
  promptText: string,
  country?: string
): Promise<string[]> {
  if (!process.env.BRIGHTDATA_API_KEY) return [];

  try {
    const result = await scrapeWithBrightData(promptText, country, true);
    // Extract URLs from citations — these are the pages an LLM cites
    return result.citations.slice(0, 8).filter((url) => {
      // Filter out social media, video, and known non-listicle domains
      const blocked = ["youtube.com", "twitter.com", "x.com", "facebook.com", "instagram.com"];
      return !blocked.some((d) => url.includes(d));
    });
  } catch {
    return [];
  }
}

export async function extractBlueprint(
  markdown: string,
  promptText: string
): Promise<CompetitorBlueprintShape> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "competitor_blueprint",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  level: { type: "number" },
                  text: { type: "string" },
                },
                required: ["level", "text"],
                additionalProperties: false,
              },
            },
            list_items: {
              type: "array",
              items: { type: "string" },
            },
            entities: {
              type: "array",
              items: { type: "string" },
            },
            repeated_phrases: {
              type: "array",
              items: { type: "string" },
            },
            has_comparison_table: { type: "boolean" },
            has_faq: { type: "boolean" },
            has_tldr: { type: "boolean" },
            word_count: { type: "number" },
            citation_density: { type: "number" },
            citation_position: {
              type: "object",
              properties: {
                in_title: { type: "boolean" },
                in_h2: { type: "boolean" },
                in_top_3_items: { type: "boolean" },
                in_table: { type: "boolean" },
              },
              required: ["in_title", "in_h2", "in_top_3_items", "in_table"],
              additionalProperties: false,
            },
          },
          required: [
            "headings",
            "list_items",
            "entities",
            "repeated_phrases",
            "has_comparison_table",
            "has_faq",
            "has_tldr",
            "word_count",
            "citation_density",
            "citation_position",
          ],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `You are a content analyst specializing in listicle structure extraction.
Given markdown content of a web page, extract its structural blueprint.

Rules:
- headings: all h2 and h3 headings with their level (2 or 3) and text
- list_items: all list items (bullet or numbered) — deduplicated, max 50
- entities: named brands, tools, products, companies — proper nouns only, no generic terms
- repeated_phrases: exact phrases (3+ words) that appear 3 or more times (normalize case)
- has_comparison_table: true if a markdown table comparing multiple options exists
- has_faq: true if there is a section with questions and answers
- has_tldr: true if there is a TL;DR, summary, or "in a nutshell" section near the top
- word_count: approximate word count of the markdown
- citation_density: number of unique named entities divided by (word_count / 100)
- citation_position: where does the primary entity (most-mentioned brand) appear`,
      },
      {
        role: "user",
        content: `Prompt context: "${promptText}"\n\nPage content:\n${markdown.slice(0, 12000)}`,
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content!) as CompetitorBlueprintShape;
}

export async function detectWhyWinning(
  markdown: string,
  intent: string
): Promise<WhyWinningSignal[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "why_winning",
        strict: true,
        schema: {
          type: "object",
          properties: {
            signals: {
              type: "array",
              items: {
                type: "string",
                enum: [...WHY_WINNING_ENUM],
              },
            },
          },
          required: ["signals"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Analyze this content and identify which signals make an LLM likely to extract and cite it.

Available signals:
- DEFINITIVE_RANKING: Contains clear "best", "top", ranked numbered lists
- COMPARISON_STRUCTURE: Side-by-side comparisons, tables comparing options
- HIGH_ENTITY_DENSITY: Many named tools/brands per paragraph (>3 per 100 words)
- REDUNDANT_PHRASING: Core keyword/phrase repeated 5+ times
- FAQ_COVERAGE: Directly answers common question variants
- FRESHNESS_SIGNAL: Year mentions, "updated", "as of [date]"
- DIRECT_ANSWER: Opens with a direct answer before elaborating
- AUTHORITATIVE_TONE: Uses definitive statements, statistics, expert language

Return only the signals present in this content (max 5 most prominent).`,
      },
      {
        role: "user",
        content: `Intent: "${intent}"\n\nContent:\n${markdown.slice(0, 8000)}`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  return (parsed.signals ?? []) as WhyWinningSignal[];
}

export async function deconstructUrl(
  url: string,
  promptText: string,
  intent: string
): Promise<DeconstructedBlueprint> {
  const scraped = await scrapeUrl(url);
  const [schema, why_winning_signals] = await Promise.all([
    extractBlueprint(scraped.markdown, promptText),
    detectWhyWinning(scraped.markdown, intent),
  ]);

  return {
    schema,
    why_winning_signals,
    raw_markdown: scraped.markdown,
  };
}
