export const BRAND_ONBOARDING_STALE_MS = 3 * 60 * 1000;

export function isBrandOnboardingStale(
  status: string,
  updatedAt: string,
  now = Date.now(),
): boolean {
  if (status !== "pending" && status !== "onboarding") return false;

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) return true;

  return now - updatedAtMs >= BRAND_ONBOARDING_STALE_MS;
}
