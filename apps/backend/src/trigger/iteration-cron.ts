import { schedules, logger } from "@trigger.dev/sdk/v3";
import { runIterationLoop } from "../services/iteration-loop.service.js";

// Weekly: evaluate all page states and dispatch refresh/patch/archive
export const iterationCron = schedules.task({
  id: "iteration-cron",
  cron: "0 4 * * 1", // Every Monday at 4 AM UTC
  run: async () => {
    logger.info("Running weekly iteration loop...");
    const result = await runIterationLoop();
    logger.info(
      `Iteration complete — evaluated: ${result.evaluated}, updated: ${result.updated}, archived: ${result.archived}`
    );
    return result;
  },
});
