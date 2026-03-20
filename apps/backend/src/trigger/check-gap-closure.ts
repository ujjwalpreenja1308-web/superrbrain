import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";

export const checkGapClosure = task({
  id: "check-gap-closure",
  run: async (payload: { brandId: string; runId: string }) => {
    const { brandId, runId } = payload;

    logger.info(`Checking gap closure for brand ${brandId}, run ${runId}`);

    // Find deployed content for this brand
    const { data: deployedContent } = await supabaseAdmin
      .from("generated_content")
      .select(`
        id,
        execution_job_id,
        execution_jobs!inner(
          citation_gap_id,
          brand_id
        )
      `)
      .eq("status", "deployed")
      .eq("execution_jobs.brand_id", brandId);

    if (!deployedContent?.length) {
      logger.info("No deployed content found, skipping gap closure check");
      return { checked: 0, closed: 0 };
    }

    let closed = 0;

    for (const content of deployedContent) {
      const job = (content as Record<string, unknown>).execution_jobs as { citation_gap_id: string; brand_id: string };
      const gapId = job?.citation_gap_id;
      if (!gapId) continue;

      // Get gap info
      const { data: gap } = await supabaseAdmin
        .from("citation_gaps")
        .select("source_url, status")
        .eq("id", gapId)
        .single();

      if (!gap || gap.status === "addressed") continue;

      // Check if brand now appears in citations for the same source_url in the new run
      const { data: newCitation } = await supabaseAdmin
        .from("citations")
        .select("brands_mentioned")
        .eq("brand_id", brandId)
        .eq("url", gap.source_url)
        .eq("run_id", runId)
        .single();

      if (!newCitation) continue;

      // Get brand name to check mentions
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("name")
        .eq("id", brandId)
        .single();

      if (!brand?.name) continue;

      const mentioned = (newCitation.brands_mentioned as { name: string }[]).some(
        (b) => b.name.toLowerCase() === brand.name.toLowerCase()
      );

      if (mentioned) {
        logger.info(`Gap closed for ${gap.source_url}`);

        // Insert gap outcome
        await supabaseAdmin.from("gap_outcomes").insert({
          citation_gap_id: gapId,
          content_id: content.id,
          gap_status_before: "open",
          gap_status_after: "addressed",
          detected_at: new Date().toISOString(),
        });

        // Mark gap as addressed
        await supabaseAdmin
          .from("citation_gaps")
          .update({ status: "addressed" })
          .eq("id", gapId);

        closed++;
      }
    }

    logger.info(`Gap closure check complete: ${closed}/${deployedContent.length} closed`);
    return { checked: deployedContent.length, closed };
  },
});
