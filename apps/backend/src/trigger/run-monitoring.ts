import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { firePrompt } from "../services/ai-engine.service.js";
import { enrichCitation, extractBrandsFromResponse } from "../services/citation.service.js";
import { computeReport } from "../services/scoring.service.js";
import { AI_ENGINES } from "@covable/shared";

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

      const { data: prompts } = await supabaseAdmin
        .from("prompts")
        .select("*")
        .eq("brand_id", brandId)
        .eq("is_active", true);

      if (!prompts?.length) throw new Error("No active prompts");

      const competitors = (brand.competitors as { name: string }[]) || [];
      const location = {
        country: (brand as any).country || undefined,
        city: (brand as any).city || undefined,
      };

      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

      const activeEngines = AI_ENGINES;

      logger.info(`Firing ${prompts.length} prompts across: ${activeEngines.join(", ")}`);

      // url -> { responseIds, responseText } — track per-URL context
      const urlData = new Map<string, { responseIds: string[]; responseText: string }>();

      const promptBatchSize = 3;
      for (let i = 0; i < prompts.length; i += promptBatchSize) {
        const batch = prompts.slice(i, i + promptBatchSize);

        const batchTasks = batch.flatMap((prompt) =>
          activeEngines.map(async (engine) => {
            try {
              logger.info(`[${engine}] ${prompt.text.slice(0, 60)}...`);

              const result = await firePrompt(
                prompt.text,
                brand.name || "",
                competitors,
                engine,
                location
              );

              const { data: inserted } = await supabaseAdmin
                .from("ai_responses")
                .insert({
                  prompt_id: prompt.id,
                  brand_id: brandId,
                  engine,
                  raw_response: result.raw_response,
                  brand_mentioned: result.brand_mentioned,
                  brand_position: result.brand_position,
                  competitor_mentions: result.competitor_mentions,
                  run_id: runId,
                })
                .select("id")
                .single();

              logger.info(
                `[${engine}] brand_mentioned=${result.brand_mentioned}, citations=${result.citations.length}`
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
              logger.error(`Failed: ${prompt.text.slice(0, 40)} on ${engine}`, {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })
        );

        await Promise.allSettled(batchTasks);
      }

      // Enrich citations directly from AI response text — no external scraping
      logger.info(`Enriching ${urlData.size} unique citation URLs`);

      for (const [url, data] of urlData.entries()) {
        const frequency = data.responseIds.length;
        const primaryResponseId = data.responseIds[0];

        // Enrich using the response text that cited this URL — grounded, not hallucinated
        const analysis = enrichCitation(
          url,
          data.responseText,
          brand.name || "",
          competitors
        );

        // Override brands_mentioned with GPT-extracted real brand names
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

        // Gap: source cited by AI but brand not mentioned in that response
        const brandMentioned = analysis.brands_mentioned.some(
          (b) => b.name.toLowerCase() === (brand.name || "").toLowerCase()
        );

        if (!brandMentioned && citation?.id) {
          const competitorsMentioned = analysis.brands_mentioned.filter((b) =>
            competitors.some((c) => c.name.toLowerCase() === b.name.toLowerCase())
          );

          if (competitorsMentioned.length > 0) {
            for (const comp of competitorsMentioned) {
              await supabaseAdmin.from("citation_gaps").insert({
                brand_id: brandId,
                competitor_name: comp.name,
                source_url: analysis.url,
                source_type: analysis.source_type,
                opportunity_score: frequency * (comp.frequency || 1),
                status: "open",
                run_id: runId,
              });
            }
          } else {
            // Brand not mentioned and no known competitor — gap with no named competitor
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
      }

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
