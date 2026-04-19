import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";

export const weeklyCron = schedules.task({
  id: "weekly-monitoring-cron",
  cron: "0 9 * * 1", // Every Monday at 9am UTC
  run: async () => {
    // Apply pending reddit monitor config changes
    const { data: pendingMonitors } = await supabaseAdmin
      .from("reddit_monitors")
      .select("id, pending_keywords, pending_subreddits")
      .not("pending_keywords", "is", null);

    if (pendingMonitors?.length) {
      for (const monitor of pendingMonitors) {
        await supabaseAdmin
          .from("reddit_monitors")
          .update({
            keywords: monitor.pending_keywords,
            subreddits: monitor.pending_subreddits ?? undefined,
            pending_keywords: null,
            pending_subreddits: null,
            pending_effective_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", monitor.id);
      }
    }

    // Apply pending prompt changes
    const { data: brandsWithPendingPrompts } = await supabaseAdmin
      .from("brands")
      .select("id, pending_prompts")
      .not("pending_prompts", "is", null);

    if (brandsWithPendingPrompts?.length) {
      for (const brand of brandsWithPendingPrompts) {
        const pendingPrompts = brand.pending_prompts as { id?: string; text: string; is_active: boolean; category: string | null }[];

        // Deactivate all existing prompts
        await supabaseAdmin.from("prompts").update({ is_active: false }).eq("brand_id", brand.id);

        // Upsert the pending set
        await supabaseAdmin.from("prompts").upsert(
          pendingPrompts.map((p) => ({
            ...(p.id ? { id: p.id } : {}),
            brand_id: brand.id,
            text: p.text,
            is_active: p.is_active,
            category: p.category ?? null,
          })),
          { onConflict: "id" }
        );

        // Clear pending
        await supabaseAdmin
          .from("brands")
          .update({ pending_prompts: null, pending_prompts_effective_at: null })
          .eq("id", brand.id);
      }
    }

    // Trigger weekly monitoring run for all ready brands
    const { data: brands } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("status", "ready");

    if (!brands?.length) {
      return { triggered: 0, pendingApplied: pendingMonitors?.length ?? 0 };
    }

    let triggered = 0;
    for (const brand of brands) {
      await tasks.trigger("run-monitoring", {
        brandId: brand.id,
        runId: crypto.randomUUID(),
      });
      triggered++;
    }

    return { triggered, pendingApplied: pendingMonitors?.length ?? 0 };
  },
});
