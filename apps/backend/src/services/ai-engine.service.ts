import { openai } from "../lib/openai.js";
import {
  scrapeWithBrightData,
  scrapeWithBrightDataBatch,
} from "./brightdata.service.js";
import type { AiEngine } from "@covable/shared";
import {
  parseAiResponse,
  type AiQueryResult,
} from "./ai-response-parser.service.js";

export type { AiQueryResult } from "./ai-response-parser.service.js";

export interface LocationContext {
  country?: string; // ISO code e.g. "IN", "US"
  city?: string;
}

export async function firePrompt(
  promptText: string,
  brandName: string,
  competitors: { name: string }[],
  engine: AiEngine,
  location?: LocationContext,
): Promise<AiQueryResult> {
  if (process.env.BRIGHTDATA_API_KEY) {
    const result = await scrapeWithBrightData(promptText, location?.country);
    return parseAiResponse(
      result.text,
      brandName,
      competitors,
      "chatgpt",
      result.citations,
    );
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
  location?: LocationContext,
): Promise<AiQueryResult[]> {
  if (process.env.BRIGHTDATA_API_KEY) {
    const bdResults = await scrapeWithBrightDataBatch(
      prompts.map((prompt) => ({ prompt, country: location?.country })),
    );
    return bdResults.map((r) =>
      parseAiResponse(r.text, brandName, competitors, "chatgpt", r.citations),
    );
  }

  // Fallback: parallel individual OpenAI calls
  return Promise.all(
    prompts.map((p) => queryChatGPT(p, brandName, competitors, location)),
  );
}

async function queryChatGPT(
  promptText: string,
  brandName: string,
  competitors: { name: string }[],
  location?: LocationContext,
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

  return parseAiResponse(text, brandName, competitors, "chatgpt", citations);
}
