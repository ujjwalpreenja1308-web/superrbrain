import { task, schedules, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { trackPageCitations } from "../services/page-citation-tracker.service.js";

// One-off: track citations for a specific page
export const trackPageCitationsTask = task({
  id: "track-page-citations",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;
    logger.info(`Tracking citations for page ${pageId}`);
    await trackPageCitations(pageId);
    return { pageId, tracked: true };
  },
});

// Runs every 6 hours — tracks citations for all published pages based on priority
export const citationTrackingCron = schedules.task({
  id: "citation-tracking-cron",
  cron: "0 */6 * * *",
  run: async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // High priority: published within 48h — check frequently
    const { data: highPriorityPages } = await supabaseAdmin
      .from("pages")
      .select("id, published_at")
      .in("status", ["published", "winning", "stale"])
      .gte("published_at", twoDaysAgo);

    // Medium priority: published > 48h ago, last check > 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: mediumPriorityPages } = await supabaseAdmin
      .from("pages")
      .select("id, last_citation_check_at")
      .in("status", ["published", "winning", "stale"])
      .lt("published_at", twoDaysAgo)
      .or(`last_citation_check_at.is.null,last_citation_check_at.lt.${threeDaysAgo}`);

    const pages = [
      ...(highPriorityPages ?? []).map((p) => p.id),
      ...(mediumPriorityPages ?? []).slice(0, 20).map((p) => p.id), // cap at 20 medium per run
    ];

    let triggered = 0;
    for (const pageId of pages) {
      tasks
        .trigger("track-page-citations", { pageId })
        .catch((err) => console.error(`Failed to trigger citation tracking for ${pageId}:`, err.message));
      triggered++;
    }

    logger.info(`Triggered citation tracking for ${triggered} pages`);
    return { triggered };
  },
});
