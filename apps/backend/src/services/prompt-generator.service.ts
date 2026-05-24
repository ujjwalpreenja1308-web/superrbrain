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
    model: "gpt-4o-mini",
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
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You generate AI search monitoring prompts — the exact queries a real online shopper types into ChatGPT, Perplexity, or Claude when they are actively ready to buy from an ecommerce store. These are high-intent purchase queries, not informational ones.

TARGET PERSONA: Someone with their wallet out, comparing options before checkout. They want to know WHERE to buy, WHICH brand is best right now, and WHETHER it's worth the price TODAY.

CRITICAL RULE: Every prompt must force the AI to search the web in real-time. Use these search-forcing techniques:
1. Year/recency: "in ${currentYear}", "as of ${currentMonth} ${currentYear}", "right now", "currently"
2. Purchase intent signals: "worth buying", "should I buy", "best place to buy", "where to order"
3. Recency + reviews: "recent buyer reviews", "latest customer feedback ${currentYear}"
4. Competitor comparisons with year: "[Brand A] vs [Brand B] ${currentYear} — which should I buy?"
5. Live pricing/deals: "current price", "best deal right now", "discount codes ${currentYear}", "cheapest place to buy"
6. Reddit purchase advice: "Reddit ${currentYear} — is [X] worth buying?", "what does Reddit say about buying [X]"

BANNED PATTERNS (do NOT use — these never trigger web search):
- "How does X work?" — informational, no search
- "What is X?" — definitional
- "Benefits of X" — educational
- "How to use X" — tutorial
- "Features of X" — product info

Generate exactly 50 prompts across these 5 categories (10 prompts each), ALL written from the POV of an ecommerce buyer:

CATEGORY 1 - "best_for": Best product/brand for a specific buyer type or use case
  Good: "Best ${category} to buy in ${currentYear} for [specific buyer type or use case]?"
  Good: "Which ${category} brand is actually worth buying right now for [pain point]?"
  Focus: match product to buyer — gifting, budget shoppers, professionals, first-timers, etc.

CATEGORY 2 - "comparison": Head-to-head brand/product comparisons with purchase framing
  Good: "[Competitor A] vs [Competitor B] — which should I buy in ${currentYear}?"
  Good: "Is [Competitor] still the best ${category} to order in ${currentYear} or are there better options?"
  Focus: buyers comparing 2-3 brands before checkout

CATEGORY 3 - "reviews": Recent buyer/customer reviews with freshness signals
  Good: "Honest ${currentYear} buyer reviews of [Competitor] — is it worth it?"
  Good: "What are customers saying about [Competitor] in ${currentMonth} ${currentYear}? Real experiences?"
  Focus: post-purchase validation, trust signals, quality concerns

CATEGORY 4 - "reddit_community": Reddit purchase advice threads (forces live search for recent buying discussions)
  Good: "Reddit ${currentYear}: best ${category} to buy — what's everyone recommending?"
  Good: "Is [Competitor] worth buying? What does Reddit say in ${currentYear}?"
  Focus: social proof, community buying recommendations

CATEGORY 5 - "price_value": Pricing, deals, and value-for-money with live signals
  Good: "Best price for ${category} in ${currentYear} — where should I order from?"
  Good: "Is [Competitor] worth the price in ${currentYear}? Current deals and discount codes?"
  Focus: cost-conscious buyers looking for best value or deals before purchasing

Rules:
- Every prompt must sound like a real shopper about to buy, not a researcher
- Do NOT mention the brand name "${brandName}" in any prompt
- Vary competitors mentioned: ${competitorNames}
- Tailor to the specific product/industry — a supplement buyer asks differently than a furniture buyer
- Include specific buyer contexts: gifting, bulk buying, first purchase, repeat purchase, budget vs premium

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
