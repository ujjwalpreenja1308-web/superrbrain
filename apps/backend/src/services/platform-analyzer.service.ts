import { openai } from "../lib/openai.js";
import { scrapeUrl } from "./scraper.service.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { PlatformProfile } from "@superrbrain/shared";

export interface PlatformAnalysis {
  subreddit: string | null;
  format_rules: Record<string, unknown>;
  tone_parameters: Record<string, unknown>;
  content_patterns: Record<string, unknown>;
  sample_comments: unknown[];
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractSubreddit(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([^/]+)/i);
  return match ? match[1] : null;
}

function isStale(lastAnalyzedAt: string): boolean {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return new Date(lastAnalyzedAt) < sevenDaysAgo;
}

export async function analyzePlatform(url: string): Promise<PlatformAnalysis> {
  const domain = extractDomain(url);

  // Check cache
  const { data: cached } = await supabaseAdmin
    .from("platform_profiles")
    .select("*")
    .eq("domain", domain)
    .single();

  if (cached && !isStale(cached.last_analyzed_at)) {
    return {
      subreddit: cached.subreddit,
      format_rules: cached.format_rules as Record<string, unknown>,
      tone_parameters: cached.tone_parameters as Record<string, unknown>,
      content_patterns: cached.content_patterns as Record<string, unknown>,
      sample_comments: cached.sample_comments as unknown[],
    };
  }

  // Scrape and analyze
  let pageContent = "";
  try {
    const scraped = await scrapeUrl(url);
    pageContent = scraped.markdown.slice(0, 8000);
  } catch {
    pageContent = `URL: ${url}`;
  }

  const subreddit = extractSubreddit(url);

  const systemPrompt = `You are an expert at analyzing online community culture, tone, and content patterns.
Analyze the provided content from a Reddit page and extract detailed cultural/format insights.
Return a JSON object with these exact fields:
{
  "format_rules": {
    "typical_length": "short|medium|long",
    "uses_markdown": true/false,
    "uses_links": true/false,
    "preferred_structure": "description of structure (e.g. direct answer, story format, list)"
  },
  "tone_parameters": {
    "formality": "casual|semi-formal|formal",
    "humor_level": "none|light|heavy",
    "technical_depth": "beginner|intermediate|expert",
    "community_vibe": "brief description"
  },
  "content_patterns": {
    "common_openers": ["example opener 1", "example opener 2"],
    "engagement_triggers": ["what gets upvotes here"],
    "avoid_patterns": ["what gets downvoted or removed"]
  },
  "sample_comments": ["example comment 1 in this community's style", "example comment 2"]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this Reddit content from ${subreddit ? `r/${subreddit}` : url}:\n\n${pageContent}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");

  const analysis: PlatformAnalysis = {
    subreddit,
    format_rules: raw.format_rules || {},
    tone_parameters: raw.tone_parameters || {},
    content_patterns: raw.content_patterns || {},
    sample_comments: raw.sample_comments || [],
  };

  // Upsert cache
  await supabaseAdmin.from("platform_profiles").upsert(
    {
      domain,
      platform_type: "reddit",
      subreddit,
      format_rules: analysis.format_rules,
      tone_parameters: analysis.tone_parameters,
      content_patterns: analysis.content_patterns,
      sample_comments: analysis.sample_comments,
      last_analyzed_at: new Date().toISOString(),
    },
    { onConflict: "domain" }
  );

  return analysis;
}
