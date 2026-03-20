import type { VisibilityReport } from "@superrbrain/shared";
import { supabaseAdmin } from "../lib/supabase.js";

export async function computeReport(
  brandId: string,
  runId: string
): Promise<VisibilityReport> {
  // Fetch all responses for this run
  const { data: responses } = await supabaseAdmin
    .from("ai_responses")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", runId);

  const allResponses = responses || [];
  const totalResponses = allResponses.length;
  const brandMentionedCount = allResponses.filter(
    (r) => r.brand_mentioned
  ).length;

  // Visibility score: percentage of responses where brand appeared
  const visibility_score =
    totalResponses > 0
      ? Math.round((brandMentionedCount / totalResponses) * 100)
      : 0;

  // Engine breakdown
  const engineMap = new Map<
    string,
    { total: number; mentioned: number }
  >();
  for (const r of allResponses) {
    const entry = engineMap.get(r.engine) || { total: 0, mentioned: 0 };
    entry.total++;
    if (r.brand_mentioned) entry.mentioned++;
    engineMap.set(r.engine, entry);
  }

  const engine_breakdown = Array.from(engineMap.entries()).map(
    ([engine, stats]) => ({
      engine,
      total: stats.total,
      mentioned: stats.mentioned,
      score:
        stats.total > 0
          ? Math.round((stats.mentioned / stats.total) * 100)
          : 0,
    })
  );

  // Gap score: count of unique high-impact gaps
  const { data: gaps } = await supabaseAdmin
    .from("citation_gaps")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", runId)
    .order("opportunity_score", { ascending: false });

  const allGaps = gaps || [];
  const gap_score = allGaps.length;

  // Top 3 opportunities
  const top_opportunities = allGaps.slice(0, 3);

  // Get unique prompt count
  const promptIds = new Set(allResponses.map((r) => r.prompt_id));

  // Last run timestamp
  const last_run_at =
    allResponses.length > 0
      ? allResponses[allResponses.length - 1].created_at
      : null;

  // Update brand with latest scores
  await supabaseAdmin
    .from("brands")
    .update({
      latest_visibility_score: visibility_score,
      latest_gap_score: gap_score,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId);

  return {
    visibility_score,
    gap_score,
    total_prompts: promptIds.size,
    total_responses: totalResponses,
    brand_mentioned_count: brandMentionedCount,
    engine_breakdown,
    top_opportunities,
    last_run_at,
  };
}
