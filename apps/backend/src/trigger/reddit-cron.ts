import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";

// Runs every 6 hours — picks up all active monitors and fires a scan
export const redditMonitorCron = schedules.task({
  id: "reddit-monitor-cron",
  cron: "0 */6 * * *",
  run: async () => {
    const { data: monitors } = await supabaseAdmin
      .from("reddit_monitors")
      .select("id, user_id")
      .eq("is_active", true);

    if (!monitors?.length) return { triggered: 0 };

    let triggered = 0;
    for (const monitor of monitors) {
      await tasks.trigger("reddit-monitor", {
        monitorId: monitor.id,
        userId: monitor.user_id,
      });
      triggered++;
    }

    return { triggered };
  },
});
