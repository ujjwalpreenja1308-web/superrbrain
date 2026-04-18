import { openai } from "../lib/openai.js";
import { scrapeWithBrightData, scrapeWithBrightDataBatch } from "./brightdata.service.js";
import type { AiEngine } from "@covable/shared";

export interface AiQueryResult {
  engine: AiEngine;
  raw_response: string;
  citations: string[];
  brand_mentioned: boolean;
  brand_position: number | null;
  competitor_mentions: { name: string; position: number | null }[];
}

export interface LocationContext {
  country?: string; // ISO code e.g. "IN", "US"
  city?: string;
}

export async function firePrompt(
  promptText: string,
  brandName: string,
  competitors: { name: string }[],
  engine: AiEngine,
  location?: LocationContext
): Promise<AiQueryResult> {
  if (process.env.BRIGHTDATA_API_KEY) {
    const result = await scrapeWithBrightData(promptText, location?.country);
    return parseResponse(result.text, brandName, competitors, "chatgpt", result.citations);
  }
  return await queryChatGPT(promptText, brandName, competitors, location);
}

/**
 * Fire all prompts in a single Bright Data API call (one poll cycle for all).
 * Falls back to individual parallel OpenAI calls if Bright Data is not configured.
 * Returns results in the same order as input prompts.
 */
export async function firePromptBatch(
  prompts: string[],
  brandName: string,
  competitors: { name: string }[],
  location?: LocationContext
): Promise<AiQueryResult[]> {
  if (process.env.BRIGHTDATA_API_KEY) {
    const bdResults = await scrapeWithBrightDataBatch(
      prompts.map((prompt) => ({ prompt, country: location?.country }))
    );
    return bdResults.map((r) => parseResponse(r.text, brandName, competitors, "chatgpt", r.citations));
  }

  // Fallback: parallel individual OpenAI calls
  return Promise.all(
    prompts.map((p) => queryChatGPT(p, brandName, competitors, location))
  );
}

async function queryChatGPT(
  promptText: string,
  brandName: string,
  competitors: { name: string }[],
  location?: LocationContext
): Promise<AiQueryResult> {
  const requestParams: any = {
    model: "gpt-4o-mini",
    tools: [{ type: "web_search_preview" }],
    input: promptText,
  };

  if (location?.country || location?.city) {
    requestParams.web_search_options = {
      user_location: {
        type: "approximate",
        approximate: {
          ...(location.country && { country: location.country }),
          ...(location.city && { city: location.city }),
        },
      },
    };
  }

  const response = await openai.responses.create(requestParams);

  const text =
    response.output
      .filter((b: any) => b.type === "message")
      .flatMap((b: any) => b.content)
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("") || "";

  // Extract citations from annotations
  const citations: string[] = [];
  for (const block of response.output) {
    if (block.type === "message") {
      for (const content of (block as any).content ?? []) {
        for (const annotation of content.annotations ?? []) {
          if (annotation.type === "url_citation" && annotation.url) {
            if (!citations.includes(annotation.url)) {
              citations.push(annotation.url);
            }
          }
        }
      }
    }
  }

  return parseResponse(text, brandName, competitors, "chatgpt", citations);
}


function parseResponse(
  text: string,
  brandName: string,
  competitors: { name: string }[],
  engine: AiEngine,
  citations: string[]
): AiQueryResult {
  const lowerText = text.toLowerCase();

  const brandIndex = lowerText.indexOf(brandName.toLowerCase());
  const brand_mentioned = brandIndex !== -1;

  let brand_position: number | null = null;
  if (brand_mentioned) {
    const allMentions: { name: string; index: number }[] = [];

    if (brandIndex !== -1) {
      allMentions.push({ name: brandName, index: brandIndex });
    }

    for (const comp of competitors) {
      const compIndex = lowerText.indexOf(comp.name.toLowerCase());
      if (compIndex !== -1) {
        allMentions.push({ name: comp.name, index: compIndex });
      }
    }

    allMentions.sort((a, b) => a.index - b.index);
    brand_position =
      allMentions.findIndex((m) => m.name === brandName) + 1 || null;
  }

  const competitor_mentions = competitors
    .map((comp) => {
      const compIndex = lowerText.indexOf(comp.name.toLowerCase());
      if (compIndex === -1) return null;
      return { name: comp.name, position: null as number | null };
    })
    .filter(Boolean) as { name: string; position: number | null }[];

  return {
    engine,
    raw_response: text,
    citations,
    brand_mentioned,
    brand_position,
    competitor_mentions,
  };
}
