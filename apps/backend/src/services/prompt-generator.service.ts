import { openai } from "../lib/openai.js";
import {
  curateGeneratedPrompts,
  GENERATED_PROMPT_CATEGORIES,
  type QualityPrompt,
} from "./prompt-quality.service.js";

export interface BrandExtraction {
  name: string;
  category: string;
  description: string;
  competitors: { name: string; url?: string }[];
}

export type GeneratedPrompt = QualityPrompt;

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
- category: specific category (e.g. "project management software", "DTC skincare", "B2B accounting SaaS", "personal injury law firm", "plant-based protein powder"). Be specific, not generic.
- description: one sentence describing what they sell/offer and who their buyer/user is
- competitors: array of 3-5 real direct competitors as objects with "name" and optional "url". These should be brands a buyer would compare against, not industry bodies or publishers.

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
  competitors: { name: string }[],
  count = 10
): Promise<GeneratedPrompt[]> {
  const competitorList = competitors
    .map((competitor) => competitor.name.trim())
    .filter(Boolean);
  const competitorNames = competitorList.join(", ") || "None provided";
  const promptCount = Math.max(1, Math.min(count, 100));
  const candidateCount = Math.min(
    125,
    promptCount + Math.max(8, Math.ceil(promptCount * 0.5)),
  );
  const competitorPromptLimit = Math.max(1, Math.floor(promptCount * 0.3));
  const recencyPromptLimit = Math.max(1, Math.floor(promptCount * 0.2));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generated_monitoring_prompts",
        strict: true,
        schema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  category: {
                    type: "string",
                    enum: [...GENERATED_PROMPT_CATEGORIES],
                  },
                },
                required: ["text", "category"],
                additionalProperties: false,
              },
            },
          },
          required: ["prompts"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Write monitoring queries that sound like something a real person would type into an AI assistant while choosing a product, service, or provider. The goal is realistic language and useful buyer intent, not wording that tries to force web browsing.

Generate ${candidateCount} distinct candidates across these four categories as evenly as possible:

1. "best_for": A recommendation for a concrete need, audience, constraint, or use case.
Example: "What's the best ${category} for a small team with a limited budget?"

2. "comparison": A natural comparison between options, approaches, or known competitors.
Example: "Which is easier for a small team, ${competitorList[0] ?? "a simple tool"} or ${competitorList[1] ?? "a more advanced option"}?"

3. "reviews": A question about customer experience, reliability, drawbacks, or common complaints.
Example: "What do customers complain about most when choosing ${category}?"

4. "price_value": A question about price, total cost, value, contracts, guarantees, or cheaper alternatives.
Example: "How much should a small business expect to pay for ${category}?"

Natural writing rules:
- Write one clear intent per query in plain conversational English.
- Aim for 5 to 18 words and never exceed 22 words.
- Use the language that fits this industry. People hire a lawyer, choose software, book a service, or buy a product.
- Use ordinary punctuation. Never use an em dash or en dash. Use a comma, colon, parentheses, or a separate sentence instead.
- Use no more than one question mark and do not combine several questions.
- Do not write headlines, labels, keyword strings, ad copy, or placeholders in brackets.
- Do not append robotic phrases such as "Real experiences?", "What's everyone recommending?", or "right now" to make a query sound current.
- Mention a year, "recent", "latest", "currently", or "right now" only when freshness materially changes the answer. At most ${recencyPromptLimit} of the final queries may use any recency signal.
- Do not mention Reddit. That source is not part of this generator.
- Do not mention the monitored brand "${brandName}". We want to measure whether an AI recommends it without being prompted.
- Known competitors are: ${competitorNames}. Mention them only in a comparison or review where a person would naturally name one. At most ${competitorPromptLimit} final queries may mention competitors.
- Avoid near-duplicates that merely swap "best", "top", "latest", a year, or a buyer type.
- Tailor every query to this exact category and description. Do not assume the business is ecommerce.

Return only the structured JSON requested by the schema.`,
      },
      {
        role: "user",
        content: `Brand: ${brandName}
Category: ${category}
Description: ${description}
Known competitors: ${competitorNames}
Create more candidates than the final set so weak or repetitive queries can be removed.`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from GPT-4o mini");

  const parsed = JSON.parse(content) as { prompts?: unknown };
  const prompts = curateGeneratedPrompts(parsed.prompts, {
    limit: promptCount,
    brandName,
    competitorNames: competitorList,
  });

  if (!prompts.length) {
    throw new Error("Prompt generation returned no usable prompts");
  }

  return prompts;
}
