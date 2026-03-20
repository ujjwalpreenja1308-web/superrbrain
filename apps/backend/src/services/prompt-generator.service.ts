import { openai } from "../lib/openai.js";

interface BrandExtraction {
  name: string;
  category: string;
  description: string;
  competitors: { name: string; url?: string }[];
}

export interface GeneratedPrompt {
  text: string;
  category: string;
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
): Promise<GeneratedPrompt[]> {
  const competitorNames = competitors.map((c) => c.name).join(", ");
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString("en-US", { month: "long" });

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You generate AI search monitoring prompts — the exact queries a real buyer/user asks ChatGPT, Perplexity, or Claude before purchasing. These MUST trigger live web search in AI engines.

CRITICAL RULE: Every single prompt must force the AI to search the web in real-time, not answer from memory. Use these proven search-forcing techniques:

SEARCH-FORCING PATTERNS (use these):
1. Year/date injection: "in ${currentYear}", "as of ${currentMonth} ${currentYear}", "currently", "right now", "latest"
2. Recency signals: "recent reviews", "latest recommendations", "up-to-date", "most popular right now"
3. Comparison with year: "best X vs Y in ${currentYear}", "up-to-date comparison of"
4. Reddit/community with year: "what does Reddit say about [X] in ${currentYear}", "Reddit ${currentYear} [X]"
5. Live pricing: "current pricing", "current plans", "pricing in ${currentYear}"
6. Freshness: "recent experiences with", "what are people saying in ${currentYear} about"

BANNED PATTERNS (these NEVER trigger web search - DO NOT USE):
- "How does [X] work?" — AI answers from memory
- "What is [category]?" — definitional, no web search
- "How to choose [X]" — educational, no web search
- "Benefits of [X]" — informational, no web search
- "What are the features of [X]" — no web search

Generate exactly 20 prompts across these 5 categories (4 prompts each):

CATEGORY 1 - "best_for": Best-for queries with year + recency signal
  Good: "What is the best ${category} for [specific use case] in ${currentYear}?"
  Good: "Which ${category} is currently rated highest for [persona] — ${currentYear} update?"

CATEGORY 2 - "comparison": Competitor comparisons with year injection
  Good: "Up-to-date comparison: [Competitor A] vs [Competitor B] for [use case] in ${currentYear}"
  Good: "Is [Competitor] still the best ${category} in ${currentYear}, or have better alternatives emerged?"

CATEGORY 3 - "reviews": Review queries with freshness signals
  Good: "Latest honest reviews of ${category} tools in ${currentYear} — what are users saying right now?"
  Good: "Recent ${currentYear} experiences with [Competitor] — is it still worth it?"

CATEGORY 4 - "reddit_community": Reddit/community queries with year (forces live search for recent threads)
  Good: "What does Reddit recommend for ${category} in ${currentYear}?"
  Good: "Reddit ${currentYear}: best ${category} tools — what's the current consensus?"

CATEGORY 5 - "price_value": Pricing/value with current signals (forces live pricing check)
  Good: "Current pricing breakdown: ${category} tools compared in ${currentYear}"
  Good: "Is [Competitor] worth the price in ${currentYear}? Latest pricing and user value ratings"

Rules:
- Tailor every prompt to THIS specific industry — a SaaS buyer asks differently than a supplement buyer
- Do NOT mention the brand name "${brandName}" in any prompt
- Vary competitors mentioned: ${competitorNames}
- Keep prompts natural, like a real user would type them
- Mix in specific use cases, personas, and pain points relevant to the category

Return JSON:
{
  "prompts": [
    { "text": "exact prompt text", "category": "best_for" },
    { "text": "exact prompt text", "category": "comparison" },
    ...
  ]
}`,
      },
      {
        role: "user",
        content: `Brand: ${brandName}
Category: ${category}
Description: ${description}
Known competitors: ${competitorNames}
Current date: ${currentMonth} ${currentYear}`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from GPT-4o mini");

  const parsed = JSON.parse(content);
  return parsed.prompts as GeneratedPrompt[];
}
