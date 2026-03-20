import { supabaseAdmin } from "../lib/supabase.js";
import type { GapQueueItem } from "@covable/shared";

export async function getPromptTextForGap(gapId: string): Promise<string | null> {
  // Traverse: citation_gaps → source_url → citations → ai_response_id → ai_responses → prompt_id → prompts
  const { data: gap } = await supabaseAdmin
    .from("citation_gaps")
    .select("source_url, brand_id")
    .eq("id", gapId)
    .single();

  if (!gap) return null;

  // Find a citation matching the source_url for this brand
  const { data: citation } = await supabaseAdmin
    .from("citations")
    .select("ai_response_id")
    .eq("brand_id", gap.brand_id)
    .eq("url", gap.source_url)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!citation) return null;

  // Get the ai_response to find the prompt_id
  const { data: aiResponse } = await supabaseAdmin
    .from("ai_responses")
    .select("prompt_id")
    .eq("id", citation.ai_response_id)
    .single();

  if (!aiResponse?.prompt_id) return null;

  // Get the prompt text
  const { data: prompt } = await supabaseAdmin
    .from("prompts")
    .select("text")
    .eq("id", aiResponse.prompt_id)
    .single();

  return prompt?.text || null;
}

export async function getGapQueue(brandId: string): Promise<GapQueueItem[]> {
  // Get latest run_id
  const { data: latestResponse } = await supabaseAdmin
    .from("ai_responses")
    .select("run_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latestResponse?.run_id) return [];

  // Get Reddit gaps from latest run
  const { data: gaps, error } = await supabaseAdmin
    .from("citation_gaps")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", latestResponse.run_id)
    .eq("source_type", "reddit")
    .order("opportunity_score", { ascending: false });

  if (error || !gaps) return [];

  // For each gap, find the latest execution job and content status
  const results: GapQueueItem[] = await Promise.all(
    gaps.map(async (gap) => {
      const { data: job } = await supabaseAdmin
        .from("execution_jobs")
        .select("id, status")
        .eq("citation_gap_id", gap.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let latestContentStatus: string | null = null;
      let latestContentId: string | null = null;

      if (job) {
        const { data: content } = await supabaseAdmin
          .from("generated_content")
          .select("id, status")
          .eq("execution_job_id", job.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (content) {
          latestContentStatus = content.status;
          latestContentId = content.id;
        }
      }

      return {
        ...gap,
        source_type: gap.source_type as GapQueueItem["source_type"],
        engine: gap.engine as GapQueueItem["engine"],
        status: gap.status as GapQueueItem["status"],
        execution_status: job?.status || null,
        latest_content_status: latestContentStatus,
        latest_content_id: latestContentId,
        execution_job_id: job?.id || null,
      };
    })
  );

  return results;
}
