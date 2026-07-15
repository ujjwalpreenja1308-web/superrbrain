import { describe, expect, it } from "vitest";
import {
  isMonitoringRunStale,
  MONITORING_RUN_STALE_MS,
} from "./monitoring-state.js";

describe("monitoring run state", () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");

  it("marks only old running jobs as stale", () => {
    expect(
      isMonitoringRunStale(
        "running",
        new Date(now - MONITORING_RUN_STALE_MS).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(
      isMonitoringRunStale(
        "running",
        new Date(now - MONITORING_RUN_STALE_MS + 1).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(
      isMonitoringRunStale(
        "ready",
        new Date(now - MONITORING_RUN_STALE_MS * 2).toISOString(),
        now,
      ),
    ).toBe(false);
  });
});
