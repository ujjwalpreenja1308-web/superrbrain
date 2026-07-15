import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { firePromptBatch } from "../services/ai-engine.service.js";
import {
  buildCitationRows,
  enrichCitation,
  extractBrandsFromResponse,
  mergeBrandMentions,
} from "../services/citation.service.js";
import { computeReport } from "../services/scoring.service.js";
import { getPlanTier } from "../middleware/requirePlan.js";
import { PLAN_LIMITS } from "@covable/shared";

export const runMonitoring = task({
  id: "run-monitoring",
  run: async (payload: { brandId: string; runId?: string }) => {
    const { brandId } = payload;
    const runId = payload.runId || crypto.randomUUID();

    const { error: runningStatusError } = await supabaseAdmin
      .from("brands")
      .update({ status: "running" })
      .eq("id", brandId);
    if (runningStatusError) {
      throw new Error(
        `Failed to mark monitoring run as started: ${runningStatusError.message}`,
      );
    }

    try {
      const { data: brand, error: brandError } = await supabaseAdmin
        .from("brands")
        .select("*")
        .eq("id", brandId)
        .single();

      if (brandError || !brand)
        throw new Error(`Brand not found: ${brandError?.message ?? brandId}`);
      if (!brand.name?.trim())
        throw new Error("Brand name is required before monitoring");

      const tier = await getPlanTier(brand.user_id);
      const maxPrompts = PLAN_LIMITS[tier].maxPrompts;

      const { data: promptRows, error: promptsError } = await supabaseAdmin
        .from("prompts")
        .select("*")
        .eq("brand_id", brandId)
        .eq("is_active", true);
      if (promptsError)
        throw new Error(`Failed to load prompts: ${promptsError.message}`);

      const prompts = (promptRows ?? []).slice(0, maxPrompts);
      if (!prompts.length) throw new Error("No active prompts");

      const competitors = (brand.competitors as { name: string }[]) || [];
      const location = {
        country: (brand as any).country || undefined,
        city: (brand as any).city || undefined,
      };

      logger.info(
        `Firing ${prompts.length} prompts in a single batch call from region: ${location.country || "default"}`,
      );

      // Keep each response's citation context separate so per-response brand
      // frequencies remain accurate when a URL is cited more than once.
      const urlData = new Map<
        string,
        { responseId: string; responseText: string }[]
      >();

      // Single API call for all prompts — Bright Data processes them in parallel server-side.
      // Result order matches input order.
      const results = await firePromptBatch(
        prompts.map((p) => p.text),
        brand.name || "",
        competitors,
        location,
      );

      const responseRecords = prompts.map((prompt, i) => {
        const result = results[i];
        if (!result)
          throw new Error(`AI provider returned no result for prompt ${i + 1}`);
        return {
          row: {
            id: crypto.randomUUID(),
            prompt_id: prompt.id,
            brand_id: brandId,
            engine: result.engine,
            raw_response: result.raw_response,
            brand_mentioned: result.brand_mentioned,
            brand_position: result.brand_position,
            competitor_mentions: result.competitor_mentions,
            run_id: runId,
          },
          citations: result.citations,
        };
      });

      const { error: responseError } = await supabaseAdmin
        .from("ai_responses")
        .insert(responseRecords.map((record) => record.row));
      if (responseError) {
        throw new Error(`Failed to save AI responses: ${responseError.message}`);
      }

      responseRecords.forEach((record, i) => {
        logger.info(
          `[prompt ${i + 1}/${prompts.length}] brand_mentioned=${record.row.brand_mentioned}, citations=${record.citations.length}`,
        );
        for (const url of new Set(record.citations)) {
          const contexts = urlData.get(url) ?? [];
          contexts.push({
            responseId: record.row.id,
            responseText: record.row.raw_response,
          });
          urlData.set(url, contexts);
        }
      });

      // Enrich citations directly from AI response text — no external scraping
      logger.info(`Enriching ${urlData.size} unique citation URLs in parallel`);
      const extractedBrandsByResponse = new Map<
        string,
        Promise<{ name: string; frequency: number }[]>
      >();

      await Promise.all(
        Array.from(urlData.entries()).map(async ([url, contexts]) => {
          const frequency = contexts.length;
          const analyses = await Promise.all(
            contexts.map(async (context) => {
              const analysis = enrichCitation(
                url,
                context.responseText,
                brand.name,
                competitors,
              );
              let extracted = extractedBrandsByResponse.get(context.responseId);
              if (!extracted) {
                extracted = extractBrandsFromResponse(
                  context.responseText,
                  brand.name,
                );
                extractedBrandsByResponse.set(context.responseId, extracted);
              }
              analysis.brands_mentioned = mergeBrandMentions(
                analysis.brands_mentioned,
                await extracted,
              );
              return analysis;
            }),
          );
          const citationRows = analyses.flatMap((analysis, index) =>
            buildCitationRows(
              [contexts[index].responseId],
              brandId,
              analysis,
              runId,
            ),
          );

          const { data: citations, error: citationError } = await supabaseAdmin
            .from("citations")
            .insert(citationRows)
            .select("id");
          if (citationError) {
            throw new Error(
              `Failed to save citation: ${citationError.message}`,
            );
          }

          const allBrandsMentioned = mergeBrandMentions(
            ...analyses.map((analysis) => analysis.brands_mentioned),
          );
          const brandMentioned = allBrandsMentioned.some(
            (b) => b.name.toLowerCase() === brand.name.toLowerCase(),
          );

          if (!brandMentioned && citations?.length) {
            const competitorsMentioned = allBrandsMentioned.filter((b) =>
              competitors.some(
                (c) => c.name.toLowerCase() === b.name.toLowerCase(),
              ),
            );

            if (competitorsMentioned.length > 0) {
              const gapResults = await Promise.all(
                competitorsMentioned.map((comp) =>
                  supabaseAdmin.from("citation_gaps").insert({
                    brand_id: brandId,
                    competitor_name: comp.name,
                    source_url: url,
                    source_type: analyses[0].source_type,
                    opportunity_score: frequency * (comp.frequency || 1),
                    status: "open",
                    run_id: runId,
                  }),
                ),
              );
              const failedGap = gapResults.find((result) => result.error);
              if (failedGap?.error) {
                throw new Error(
                  `Failed to save citation gap: ${failedGap.error.message}`,
                );
              }
            } else {
              const { error: gapError } = await supabaseAdmin
                .from("citation_gaps")
                .insert({
                  brand_id: brandId,
                  competitor_name: "–",
                  source_url: url,
                  source_type: analyses[0].source_type,
                  opportunity_score: frequency,
                  status: "open",
                  run_id: runId,
                });
              if (gapError)
                throw new Error(
                  `Failed to save citation gap: ${gapError.message}`,
                );
            }
          }
        }),
      );

      const report = await computeReport(brandId, runId);

      tasks
        .trigger("check-gap-closure", { brandId, runId })
        .catch((err: Error) => {
          console.error("Failed to trigger check-gap-closure:", err.message);
        });

      logger.info(
        `Done — visibility: ${report.visibility_score}%, gaps: ${report.gap_score}`,
      );

      return {
        success: true,
        runId,
        visibility_score: report.visibility_score,
        gap_score: report.gap_score,
      };
    } catch (error) {
      const { error: errorStatusError } = await supabaseAdmin
        .from("brands")
        .update({ status: "error" })
        .eq("id", brandId);
      if (errorStatusError) {
        logger.error("Failed to mark monitoring run as errored", {
          brandId,
          error: errorStatusError.message,
        });
      }
      throw error;
    }
  },
});
