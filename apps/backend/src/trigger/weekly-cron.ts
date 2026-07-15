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
      .or("pending_keywords.not.is.null,pending_subreddits.not.is.null");

    if (pendingMonitors?.length) {
      for (const monitor of pendingMonitors) {
        await supabaseAdmin
          .from("reddit_monitors")
          .update({
            ...(monitor.pending_keywords
              ? { keywords: monitor.pending_keywords }
              : {}),
            ...(monitor.pending_subreddits
              ? { subreddits: monitor.pending_subreddits }
              : {}),
            pending_keywords: null,
            pending_subreddits: null,
            pending_effective_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", monitor.id);
      }
    }

    // Apply pending prompt changes
    const { data: brandsWithPendingPrompts, error: pendingPromptsError } =
      await supabaseAdmin
        .from("brands")
        .select("id, pending_prompts")
        .not("pending_prompts", "is", null);
    if (pendingPromptsError) throw pendingPromptsError;

    if (brandsWithPendingPrompts?.length) {
      for (const brand of brandsWithPendingPrompts) {
        const pendingPrompts = (
          brand.pending_prompts as {
            id?: string;
            text: string;
            is_active: boolean;
            category: string | null;
          }[]
        ).map((prompt) => ({
          ...prompt,
          id: prompt.id ?? crypto.randomUUID(),
        }));

        // Persist generated IDs first so retries remain idempotent.
        const { error: stabilizeError } = await supabaseAdmin
          .from("brands")
          .update({ pending_prompts: pendingPrompts })
          .eq("id", brand.id);
        if (stabilizeError) throw stabilizeError;

        const { data: existing, error: existingError } = await supabaseAdmin
          .from("prompts")
          .select("id")
          .eq("brand_id", brand.id);
        if (existingError) throw existingError;

        const pendingIds = pendingPrompts.map((prompt) => prompt.id);
        const { data: collidingPrompts, error: collisionError } =
          await supabaseAdmin
            .from("prompts")
            .select("id, brand_id")
            .in("id", pendingIds);
        if (collisionError) throw collisionError;
        if (
          (collidingPrompts ?? []).some(
            (prompt) => prompt.brand_id !== brand.id,
          )
        ) {
          throw new Error(
            `Staged prompts for brand ${brand.id} contain a foreign prompt ID`,
          );
        }

        // Upsert the pending set
        const { error: upsertError } = await supabaseAdmin
          .from("prompts")
          .upsert(
            pendingPrompts.map((p) => ({
              ...(p.id ? { id: p.id } : {}),
              brand_id: brand.id,
              text: p.text,
              is_active: p.is_active,
              category: p.category ?? null,
            })),
            { onConflict: "id" },
          );
        if (upsertError) throw upsertError;

        const pendingIdSet = new Set(pendingIds);
        const omittedIds = (existing ?? [])
          .map((prompt) => prompt.id)
          .filter((id) => !pendingIdSet.has(id));
        if (omittedIds.length) {
          const { error: deactivateError } = await supabaseAdmin
            .from("prompts")
            .update({ is_active: false })
            .in("id", omittedIds);
          if (deactivateError) throw deactivateError;
        }

        // Clear pending
        const { error: clearError } = await supabaseAdmin
          .from("brands")
          .update({ pending_prompts: null, pending_prompts_effective_at: null })
          .eq("id", brand.id);
        if (clearError) throw clearError;
      }
    }

    // Trigger weekly monitoring run for all ready brands
    const { data: brands, error: brandsError } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("status", "ready");
    if (brandsError) throw brandsError;

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
