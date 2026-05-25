import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { firePromptBatch } from "../services/ai-engine.service.js";
import { enrichCitation, extractBrandsFromResponse } from "../services/citation.service.js";
import { computeReport } from "../services/scoring.service.js";
import { getPlanTier } from "../middleware/requirePlan.js";
import { PLAN_LIMITS } from "@covable/shared";

export const runMonitoring = task({
  id: "run-monitoring",
  run: async (payload: { brandId: string; runId?: string }) => {
    const { brandId } = payload;
    const runId = payload.runId || crypto.randomUUID();

    await supabaseAdmin
      .from("brands")
      .update({ status: "running" })
      .eq("id", brandId);

    try {
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("*")
        .eq("id", brandId)
        .single();

      if (!brand) throw new Error("Brand not found");

      const tier = await getPlanTier(brand.user_id);
      const maxPrompts = PLAN_LIMITS[tier].maxPrompts;

      const { data: promptRows } = await supabaseAdmin
        .from("prompts")
        .select("*")
        .eq("brand_id", brandId)
        .eq("is_active", true);

      const prompts = (promptRows ?? []).slice(0, maxPrompts);
      if (!prompts.length) throw new Error("No active prompts");

      const competitors = (brand.competitors as { name: string }[]) || [];
      const location = {
        country: (brand as any).country || undefined,
        city: (brand as any).city || undefined,
      };

      logger.info(
        `Firing ${prompts.length} prompts in a single batch call from region: ${location.country || "default"}`
      );

      // url -> { responseIds, responseText } — track per-URL context
      const urlData = new Map<string, { responseIds: string[]; responseText: string }>();

      // Single API call for all prompts — Bright Data processes them in parallel server-side.
      // Result order matches input order.
      const results = await firePromptBatch(
        prompts.map((p) => p.text),
        brand.name || "",
        competitors,
        location
      );

      await Promise.all(
        prompts.map(async (prompt, i) => {
          const result = results[i];
          if (!result) return;

          try {
            const { data: inserted } = await supabaseAdmin
              .from("ai_responses")
              .insert({
                prompt_id: prompt.id,
                brand_id: brandId,
                engine: result.engine,
                raw_response: result.raw_response,
                brand_mentioned: result.brand_mentioned,
                brand_position: result.brand_position,
                competitor_mentions: result.competitor_mentions,
                run_id: runId,
              })
              .select("id")
              .single();

            logger.info(
              `[prompt ${i + 1}/${prompts.length}] brand_mentioned=${result.brand_mentioned}, citations=${result.citations.length}`
            );

            if (inserted?.id) {
              for (const url of result.citations) {
                const existing = urlData.get(url) || {
                  responseIds: [],
                  responseText: result.raw_response,
                };
                existing.responseIds.push(inserted.id);
                urlData.set(url, existing);
              }
            }
          } catch (err) {
            logger.error(`Failed to save result for prompt ${i + 1}`, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );

      // Enrich citations directly from AI response text — no external scraping
      logger.info(`Enriching ${urlData.size} unique citation URLs in parallel`);

      await Promise.all(
        Array.from(urlData.entries()).map(async ([url, data]) => {
          const frequency = data.responseIds.length;
          const primaryResponseId = data.responseIds[0];

          const analysis = enrichCitation(
            url,
            data.responseText,
            brand.name || "",
            competitors
          );

          const extractedBrands = await extractBrandsFromResponse(
            data.responseText,
            brand.name || ""
          );
          if (extractedBrands.length > 0) {
            analysis.brands_mentioned = extractedBrands;
          }

          const { data: citation } = await supabaseAdmin
            .from("citations")
            .insert({
              ai_response_id: primaryResponseId,
              brand_id: brandId,
              url: analysis.url,
              domain: analysis.domain,
              source_type: analysis.source_type,
              title: analysis.title,
              brands_mentioned: analysis.brands_mentioned,
              content_snippet: analysis.content_snippet,
              run_id: runId,
            })
            .select("id")
            .single();

          const brandMentioned = analysis.brands_mentioned.some(
            (b) => b.name.toLowerCase() === (brand.name || "").toLowerCase()
          );

          if (!brandMentioned && citation?.id) {
            const competitorsMentioned = analysis.brands_mentioned.filter((b) =>
              competitors.some((c) => c.name.toLowerCase() === b.name.toLowerCase())
            );

            if (competitorsMentioned.length > 0) {
              await Promise.all(
                competitorsMentioned.map((comp) =>
                  supabaseAdmin.from("citation_gaps").insert({
                    brand_id: brandId,
                    competitor_name: comp.name,
                    source_url: analysis.url,
                    source_type: analysis.source_type,
                    opportunity_score: frequency * (comp.frequency || 1),
                    status: "open",
                    run_id: runId,
                  })
                )
              );
            } else {
              await supabaseAdmin.from("citation_gaps").insert({
                brand_id: brandId,
                competitor_name: "–",
                source_url: analysis.url,
                source_type: analysis.source_type,
                opportunity_score: frequency,
                status: "open",
                run_id: runId,
              });
            }
          }
        })
      );

      const report = await computeReport(brandId, runId);

      tasks.trigger("check-gap-closure", { brandId, runId }).catch((err: Error) => {
        console.error("Failed to trigger check-gap-closure:", err.message);
      });

      logger.info(
        `Done — visibility: ${report.visibility_score}%, gaps: ${report.gap_score}`
      );

      return {
        success: true,
        runId,
        visibility_score: report.visibility_score,
        gap_score: report.gap_score,
      };
    } catch (error) {
      await supabaseAdmin
        .from("brands")
        .update({ status: "error" })
        .eq("id", brandId);
      throw error;
    }
  },
});
