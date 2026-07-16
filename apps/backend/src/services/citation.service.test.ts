import { describe, expect, it } from "vitest";
import {
  buildCitationRows,
  enrichCitation,
  mergeBrandMentions,
  normalizeUrlForComparison,
  shouldIncludeCitationMapSource,
} from "./citation.service.js";

describe("citation helpers", () => {
  it("does not hang or report a mention when the brand name is blank", () => {
    const result = enrichCitation(
      "https://example.com/article",
      "A useful answer with no named brand.",
      "",
      [{ name: "" }],
    );

    expect(result.brands_mentioned).toEqual([]);
  });

  it("stores one citation row per response so frequency remains measurable", () => {
    const analysis = enrichCitation(
      "https://example.com/article",
      "Acme is recommended.",
      "Acme",
      [],
    );
    const rows = buildCitationRows(
      ["response-1", "response-2"],
      "brand-1",
      analysis,
      "run-1",
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.ai_response_id)).toEqual([
      "response-1",
      "response-2",
    ]);
  });

  it("normalizes analytics parameters without conflating different pages", () => {
    expect(
      normalizeUrlForComparison(
        "https://example.com/article/?utm_source=newsletter&FBCLID=tracking#section",
      ),
    ).toBe("https://example.com/article");
    expect(normalizeUrlForComparison("https://example.com/other")).not.toBe(
      normalizeUrlForComparison("https://example.com/article"),
    );
  });

  it("deduplicates localized URLs and hides brandless editorial sources", () => {
    expect(
      normalizeUrlForComparison(
        "https://www.example.com/en-hu/article?utm_source=chatgpt",
      ),
    ).toBe(normalizeUrlForComparison("http://example.com/ko-hk/article"));
    expect(shouldIncludeCitationMapSource("blog", [])).toBe(false);
    expect(shouldIncludeCitationMapSource("listicle", [])).toBe(false);
    expect(shouldIncludeCitationMapSource("reddit", [])).toBe(true);
    expect(shouldIncludeCitationMapSource("blog", [{ name: "Ethique" }])).toBe(
      true,
    );
  });

  it("merges extracted competitors without erasing a detected brand", () => {
    expect(
      mergeBrandMentions(
        [{ name: "Superbrain", frequency: 2 }],
        [{ name: "Acme", frequency: 1 }],
      ),
    ).toEqual([
      { name: "Superbrain", frequency: 2 },
      { name: "Acme", frequency: 1 },
    ]);
  });
});
