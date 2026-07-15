import { describe, expect, it } from "vitest";
import { parseAiResponse } from "./ai-response-parser.service.js";

describe("parseAiResponse", () => {
  it("does not report empty brand or competitor names as mentions", () => {
    const result = parseAiResponse(
      "A normal answer",
      "  ",
      [{ name: "" }],
      "chatgpt",
      [],
    );

    expect(result.brand_mentioned).toBe(false);
    expect(result.brand_position).toBeNull();
    expect(result.competitor_mentions).toEqual([]);
  });

  it("ranks the brand among earlier competitor mentions", () => {
    const result = parseAiResponse(
      "Acme is useful, but Superbrain is the better fit.",
      "Superbrain",
      [{ name: "Acme" }],
      "chatgpt",
      ["https://example.com"],
    );

    expect(result.brand_mentioned).toBe(true);
    expect(result.brand_position).toBe(2);
    expect(result.competitor_mentions).toEqual([
      { name: "Acme", position: null },
    ]);
  });
});
