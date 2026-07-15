import { describe, expect, it } from "vitest";
import {
  BRAND_ONBOARDING_STALE_MS,
  isBrandOnboardingStale,
} from "./onboarding-state.js";

describe("brand onboarding state", () => {
  const now = Date.parse("2026-07-15T12:00:00.000Z");

  it("marks only old pending or onboarding jobs as stale", () => {
    expect(
      isBrandOnboardingStale(
        "onboarding",
        new Date(now - BRAND_ONBOARDING_STALE_MS).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(
      isBrandOnboardingStale(
        "pending",
        new Date(now - BRAND_ONBOARDING_STALE_MS + 1).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(
      isBrandOnboardingStale(
        "ready",
        new Date(now - BRAND_ONBOARDING_STALE_MS * 2).toISOString(),
        now,
      ),
    ).toBe(false);
  });
});
