export const MONITORING_RUN_STALE_MS = 10 * 60 * 1000;

export function isMonitoringRunStale(
  status: string,
  updatedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (status !== "running" || !updatedAt) return false;
  const updatedAtMs = Date.parse(updatedAt);
  return (
    Number.isFinite(updatedAtMs) && now - updatedAtMs >= MONITORING_RUN_STALE_MS
  );
}
