import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { planReinforcement } from "../services/reinforcement.service.js";

export const reinforcePage = task({
  id: "reinforce-page",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;

    const { data: page } = await supabaseAdmin
      .from("pages")
      .select("id, status, published_url")
      .eq("id", pageId)
      .single();

    if (!page) throw new Error(`Page ${pageId} not found`);
    if (page.status !== "published" && page.status !== "winning") {
      logger.warn(`Page ${pageId} is not published (status: ${page.status}) — skipping reinforcement`);
      return { skipped: true };
    }

    logger.info(`Planning reinforcement for page ${pageId}`);
    const jobCount = await planReinforcement(pageId);
    logger.info(`Created ${jobCount} reinforcement jobs`);

    // Trigger channel-specific tasks
    tasks
      .trigger("reinforce-reddit", { pageId })
      .catch((err) => console.error("Failed to trigger reinforce-reddit:", err.message));

    tasks
      .trigger("reinforce-medium", { pageId })
      .catch((err) => console.error("Failed to trigger reinforce-medium:", err.message));

    return { pageId, jobCount };
  },
});
