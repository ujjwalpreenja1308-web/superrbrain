import { describe, expect, it } from "vitest";
import {
  getBrightDataSnapshotId,
  parseBrightDataBatchPayload,
  parseBrightDataPayload,
} from "./brightdata.service.js";

describe("Bright Data response parsing", () => {
  it("parses the documented array response and all citation fields", () => {
    expect(
      parseBrightDataPayload([
        {
          answer_text_markdown: "A useful answer",
          citations: [{ url: "https://one.example" }],
          search_sources: [{ url: "https://two.example" }],
          links_attached: [{ url: "https://one.example" }],
        },
      ]),
    ).toEqual({
      text: "A useful answer",
      citations: ["https://one.example", "https://two.example"],
    });
  });

  it("rejects empty arrays and empty answers instead of saving fake results", () => {
    expect(() => parseBrightDataPayload([])).toThrow(
      "Bright Data returned no result record",
    );
    expect(() => parseBrightDataPayload([{ answer_text: "" }])).toThrow(
      "Bright Data returned an empty answer",
    );
  });

  it("identifies deferred snapshot responses", () => {
    expect(getBrightDataSnapshotId({ snapshot_id: "s_test" })).toBe("s_test");
    expect(getBrightDataSnapshotId([{ snapshot_id: "not-an-ack" }])).toBeNull();
  });

  it("surfaces provider errors and snapshots that bypass polling", () => {
    expect(() => parseBrightDataPayload([{ error: "Token expired" }])).toThrow(
      "Bright Data error: Token expired",
    );
    expect(() => parseBrightDataPayload({ snapshot_id: "s_test" })).toThrow(
      "Bright Data deferred the request",
    );
  });

  it("orders batch records by their tracking index", () => {
    expect(
      parseBrightDataBatchPayload(
        [
          { index: 1, answer_text: "second" },
          { index: 0, answer_text: "first" },
        ],
        2,
      ),
    ).toEqual([
      { text: "first", citations: [] },
      { text: "second", citations: [] },
    ]);
  });

  it("rejects incomplete batch snapshots", () => {
    expect(() =>
      parseBrightDataBatchPayload([{ index: 0, answer_text: "first" }], 2),
    ).toThrow("returned 1 of 2 results");
  });
});
