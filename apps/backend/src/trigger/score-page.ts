import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { computeCPS } from "../services/cps.service.js";

const CPS_DRAFT_THRESHOLD = 0.8;
const CPS_REGENERATE_THRESHOLD = 0.65;

export const scorePage = task({
  id: "score-page",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;

    const { data: page, error: pageError } = await supabaseAdmin
      .from("pages")
      .select("id, brand_id, prompt_id, title, content, tldr")
      .eq("id", pageId)
      .single();

    if (pageError || !page)
      throw new Error(
        `Page ${pageId} not found: ${pageError?.message ?? "missing"}`,
      );

    const { data: brand, error: brandError } = await supabaseAdmin
      .from("brands")
      .select("id, name")
      .eq("id", page.brand_id)
      .single();

    if (brandError || !brand?.name) {
      throw new Error(
        `Brand not found or missing name: ${brandError?.message ?? page.brand_id}`,
      );
    }

    let prompt = { text: "" };
    let promptVariants: string[] = [];

    if (page.prompt_id) {
      const { data: promptRow, error: promptError } = await supabaseAdmin
        .from("prompts_v2")
        .select("text")
        .eq("id", page.prompt_id)
        .single();
      if (promptError)
        throw new Error(`Failed to load page prompt: ${promptError.message}`);

      if (promptRow) {
        prompt = promptRow;

        const { data: variants, error: variantsError } = await supabaseAdmin
          .from("prompt_variants")
          .select("text")
          .eq("prompt_id", page.prompt_id)
          .limit(10);
        if (variantsError)
          throw new Error(
            `Failed to load prompt variants: ${variantsError.message}`,
          );

        promptVariants = variants?.map((v) => v.text) ?? [];
      }
    }

    logger.info(`Scoring page: ${page.title}`);

    const { score, breakdown } = await computeCPS(
      page,
      prompt,
      brand.name,
      promptVariants,
    );

    logger.info(
      `CPS: ${(score * 100).toFixed(1)}% — entity:${breakdown.entity_score.toFixed(2)} structure:${breakdown.structure_score.toFixed(2)} redundancy:${breakdown.redundancy_score.toFixed(2)}`,
    );

    // Determine action based on score
    let newStatus = "draft";
    let action = "draft";

    if (score >= CPS_DRAFT_THRESHOLD) {
      newStatus = "draft";
      action = "ready";
    } else if (score >= CPS_REGENERATE_THRESHOLD) {
      newStatus = "draft";
      action = "needs_improvement";
    } else {
      newStatus = "failing";
      action = "failing";
    }

    const { error: pageUpdateError } = await supabaseAdmin
      .from("pages")
      .update({
        cps: score,
        cps_breakdown: breakdown,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pageId);
    if (pageUpdateError)
      throw new Error(`Failed to save page score: ${pageUpdateError.message}`);

    // Save version snapshot
    const { error: versionError } = await supabaseAdmin
      .from("page_versions")
      .insert({
        page_id: pageId,
        content: page.content,
        cps: score,
        created_at: new Date().toISOString(),
      });
    if (versionError)
      throw new Error(`Failed to save page version: ${versionError.message}`);

    return { pageId, score, breakdown, action };
  },
});
