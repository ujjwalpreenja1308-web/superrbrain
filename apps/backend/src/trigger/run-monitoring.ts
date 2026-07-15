import { logger, task } from "@trigger.dev/sdk/v3";
import { runMonitoringPipeline } from "../services/run-monitoring.service.js";

// Kept temporarily so existing queued Trigger.dev runs fail over to the same
// implementation. New runs are dispatched to Upstash Workflow.
export const runMonitoring = task({
  id: "run-monitoring",
  run: async (payload: { brandId: string; runId?: string }) => {
    const result = await runMonitoringPipeline(payload.brandId, payload.runId);
    logger.info("Monitoring run completed", {
      brandId: payload.brandId,
      runId: result.runId,
      visibilityScore: result.visibility_score,
      gapScore: result.gap_score,
    });
    return result;
  },
});
