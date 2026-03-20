import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";

export const weeklyCron = schedules.task({
  id: "weekly-monitoring-cron",
  cron: "0 9 * * 1", // Every Monday at 9am UTC
  run: async () => {
    const { data: brands } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("status", "ready");

    if (!brands?.length) {
      return { triggered: 0 };
    }

    let triggered = 0;
    for (const brand of brands) {
      await tasks.trigger("run-monitoring", {
        brandId: brand.id,
        runId: crypto.randomUUID(),
      });
      triggered++;
    }

    return { triggered };
  },
});
