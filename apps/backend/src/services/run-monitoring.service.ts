import { PLAN_LIMITS, type AiEngine, type VisibilityReport } from "@covable/shared";
import { requireEnv } from "../lib/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { getPlanTier } from "../middleware/requirePlan.js";
import { firePromptBatch } from "./ai-engine.service.js";
import { parseAiResponse } from "./ai-response-parser.service.js";
import {
  downloadBrightDataSnapshot,
  triggerBrightDataBatch,
} from "./brightdata.service.js";
import {
  buildCitationRows,
  enrichCitation,
  extractBrandsFromResponse,
  mergeBrandMentions,
} from "./citation.service.js";
import { computeReport } from "./scoring.service.js";

interface MonitoringCompetitor {
  name: string;
  url?: string;
}

interface MonitoringPrompt {
  id: string;
  text: string;
}

export interface MonitoringRunContext {
  brandId: string;
  runId: string;
  brandName: string;
  competitors: MonitoringCompetitor[];
  location: { country?: string; city?: string };
  prompts: MonitoringPrompt[];
}

export interface MonitoringQueryResult {
  responseId: string;
  promptId: string;
  engine: AiEngine;
  rawResponse: string;
  citations: string[];
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorMentions: { name: string; position: number | null }[];
}

export async function prepareMonitoringRun(
  brandId: string,
  runId: string,
): Promise<MonitoringRunContext> {
  const { error: runningStatusError } = await supabaseAdmin
    .from("brands")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", brandId);
  if (runningStatusError) {
    throw new Error(
      `Failed to mark monitoring run as started: ${runningStatusError.message}`,
    );
  }

  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .single();
  if (brandError || !brand) {
    throw new Error(`Brand not found: ${brandError?.message ?? brandId}`);
  }

  const brandName = brand.name?.trim();
  if (!brandName) throw new Error("Brand name is required before monitoring");

  const tier = await getPlanTier(brand.user_id);
  const maxPrompts = PLAN_LIMITS[tier].maxPrompts;
  const { data: promptRows, error: promptsError } = await supabaseAdmin
    .from("prompts")
    .select("id, text")
    .eq("brand_id", brandId)
    .eq("is_active", true);
  if (promptsError) {
    throw new Error(`Failed to load prompts: ${promptsError.message}`);
  }

  const prompts = (promptRows ?? []).slice(0, maxPrompts);
  if (!prompts.length) throw new Error("No active prompts");

  return {
    brandId,
    runId,
    brandName,
    competitors: (brand.competitors as MonitoringCompetitor[]) || [],
    location: {
      country: (brand as { country?: string }).country || undefined,
      city: (brand as { city?: string }).city || undefined,
    },
    prompts,
  };
}

export async function runMonitoringQueries(
  run: MonitoringRunContext,
): Promise<MonitoringQueryResult[]> {
  // Monitoring is sold as real AI-search tracking. Never silently replace it
  // with a different provider when production configuration is incomplete.
  requireEnv("BRIGHTDATA_API_KEY");

  console.info("Starting Bright Data monitoring searches", {
    brandId: run.brandId,
    runId: run.runId,
    promptCount: run.prompts.length,
    country: run.location.country ?? "default",
  });

  const results = await firePromptBatch(
    run.prompts.map((prompt) => prompt.text),
    run.brandName,
    run.competitors,
    run.location,
  );

  return mapMonitoringResults(run, results);
}

export async function triggerMonitoringQueries(
  run: MonitoringRunContext,
): Promise<string> {
  requireEnv("BRIGHTDATA_API_KEY");
  return triggerBrightDataBatch(
    run.prompts.map((prompt) => ({
      prompt: prompt.text,
      country: run.location.country,
    })),
  );
}

export async function downloadMonitoringQueries(
  run: MonitoringRunContext,
  snapshotId: string,
): Promise<MonitoringQueryResult[]> {
  const results = (
    await downloadBrightDataSnapshot(snapshotId, run.prompts.length)
  ).map((result) =>
    parseAiResponse(
      result.text,
      run.brandName,
      run.competitors,
      "chatgpt",
      result.citations,
    ),
  );
  return mapMonitoringResults(run, results);
}

function mapMonitoringResults(
  run: MonitoringRunContext,
  results: Awaited<ReturnType<typeof firePromptBatch>>,
): MonitoringQueryResult[] {
  return run.prompts.map((prompt, index) => {
    const result = results[index];
    if (!result) {
      throw new Error(`Bright Data returned no result for prompt ${index + 1}`);
    }
    return {
      responseId: crypto.randomUUID(),
      promptId: prompt.id,
      engine: result.engine,
      rawResponse: result.raw_response,
      citations: result.citations,
      brandMentioned: result.brand_mentioned,
      brandPosition: result.brand_position,
      competitorMentions: result.competitor_mentions,
    };
  });
}

export async function saveMonitoringResponses(
  run: MonitoringRunContext,
  results: MonitoringQueryResult[],
): Promise<number> {
  const rows = results.map((result) => ({
    id: result.responseId,
    prompt_id: result.promptId,
    brand_id: run.brandId,
    engine: result.engine,
    raw_response: result.rawResponse,
    brand_mentioned: result.brandMentioned,
    brand_position: result.brandPosition,
    competitor_mentions: result.competitorMentions,
    run_id: run.runId,
  }));
  const { error } = await supabaseAdmin
    .from("ai_responses")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to save AI responses: ${error.message}`);
  return rows.length;
}

export async function analyzeMonitoringCitations(
  run: MonitoringRunContext,
  results: MonitoringQueryResult[],
): Promise<{ citationCount: number; gapCount: number }> {
  // This step may be retried independently. Clear only this run's derived rows
  // first so a partial attempt cannot create duplicate citations or gaps.
  const { error: gapDeleteError } = await supabaseAdmin
    .from("citation_gaps")
    .delete()
    .eq("brand_id", run.brandId)
    .eq("run_id", run.runId);
  if (gapDeleteError) {
    throw new Error(`Failed to reset citation gaps: ${gapDeleteError.message}`);
  }
  const { error: citationDeleteError } = await supabaseAdmin
    .from("citations")
    .delete()
    .eq("brand_id", run.brandId)
    .eq("run_id", run.runId);
  if (citationDeleteError) {
    throw new Error(`Failed to reset citations: ${citationDeleteError.message}`);
  }

  const urlData = new Map<
    string,
    { responseId: string; responseText: string }[]
  >();
  for (const result of results) {
    for (const url of new Set(result.citations)) {
      const contexts = urlData.get(url) ?? [];
      contexts.push({
        responseId: result.responseId,
        responseText: result.rawResponse,
      });
      urlData.set(url, contexts);
    }
  }

  let citationCount = 0;
  let gapCount = 0;
  const extractedBrandsByResponse = new Map<
    string,
    Promise<{ name: string; frequency: number }[]>
  >();

  await Promise.all(
    Array.from(urlData.entries()).map(async ([url, contexts]) => {
      const analyses = await Promise.all(
        contexts.map(async (context) => {
          const analysis = enrichCitation(
            url,
            context.responseText,
            run.brandName,
            run.competitors,
          );
          let extracted = extractedBrandsByResponse.get(context.responseId);
          if (!extracted) {
            extracted = extractBrandsFromResponse(
              context.responseText,
              run.brandName,
            ).catch((error) => {
              console.warn("Optional brand extraction failed", {
                responseId: context.responseId,
                error: error instanceof Error ? error.message : String(error),
              });
              return [];
            });
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
          run.brandId,
          analysis,
          run.runId,
        ),
      );
      const { data: citations, error: citationError } = await supabaseAdmin
        .from("citations")
        .insert(citationRows)
        .select("id");
      if (citationError) {
        throw new Error(`Failed to save citation: ${citationError.message}`);
      }
      citationCount += citations?.length ?? 0;

      const allBrandsMentioned = mergeBrandMentions(
        ...analyses.map((analysis) => analysis.brands_mentioned),
      );
      const brandMentioned = allBrandsMentioned.some(
        (brand) =>
          brand.name.toLowerCase() === run.brandName.toLowerCase(),
      );
      if (brandMentioned || !citations?.length) return;

      const competitorsMentioned = allBrandsMentioned.filter((brand) =>
        run.competitors.some(
          (competitor) =>
            competitor.name.toLowerCase() === brand.name.toLowerCase(),
        ),
      );
      const gapRows = competitorsMentioned.length
        ? competitorsMentioned.map((competitor) => ({
            brand_id: run.brandId,
            competitor_name: competitor.name,
            source_url: url,
            source_type: analyses[0].source_type,
            opportunity_score:
              contexts.length * Math.max(1, competitor.frequency),
            status: "open",
            run_id: run.runId,
          }))
        : [
            {
              brand_id: run.brandId,
              competitor_name: "Unknown",
              source_url: url,
              source_type: analyses[0].source_type,
              opportunity_score: contexts.length,
              status: "open",
              run_id: run.runId,
            },
          ];
      const { error: gapError } = await supabaseAdmin
        .from("citation_gaps")
        .insert(gapRows);
      if (gapError) {
        throw new Error(`Failed to save citation gap: ${gapError.message}`);
      }
      gapCount += gapRows.length;
    }),
  );

  return { citationCount, gapCount };
}

export async function completeMonitoringRun(
  run: MonitoringRunContext,
): Promise<VisibilityReport> {
  return computeReport(run.brandId, run.runId);
}

export async function markMonitoringRunError(brandId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brands")
    .update({ status: "error", updated_at: new Date().toISOString() })
    .eq("id", brandId);
  if (error) {
    console.error("Failed to mark monitoring run as errored", {
      brandId,
      error: error.message,
    });
  }
}

export async function runMonitoringPipeline(
  brandId: string,
  runId: string = crypto.randomUUID(),
) {
  try {
    const run = await prepareMonitoringRun(brandId, runId);
    const results = await runMonitoringQueries(run);
    await saveMonitoringResponses(run, results);
    await analyzeMonitoringCitations(run, results);
    const report = await completeMonitoringRun(run);
    return { success: true, runId, ...report };
  } catch (error) {
    await markMonitoringRunError(brandId);
    throw error;
  }
}
