import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { computeCPS } from "../services/cps.service.js";

const CPS_AUTO_PUBLISH_THRESHOLD = 0.85;
const CPS_DRAFT_THRESHOLD = 0.80;
const CPS_REGENERATE_THRESHOLD = 0.65;

export const scorePage = task({
  id: "score-page",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;

    const { data: page } = await supabaseAdmin
      .from("pages")
      .select("id, brand_id, prompt_id, title, content, tldr")
      .eq("id", pageId)
      .single();

    if (!page) throw new Error(`Page ${pageId} not found`);

    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, name, auto_publish")
      .eq("id", page.brand_id)
      .single();

    if (!brand?.name) throw new Error(`Brand not found or missing name`);

    let prompt = { text: "" };
    let promptVariants: string[] = [];

    if (page.prompt_id) {
      const { data: promptRow } = await supabaseAdmin
        .from("prompts_v2")
        .select("text")
        .eq("id", page.prompt_id)
        .single();

      if (promptRow) {
        prompt = promptRow;

        const { data: variants } = await supabaseAdmin
          .from("prompt_variants")
          .select("text")
          .eq("prompt_id", page.prompt_id)
          .limit(10);

        promptVariants = variants?.map((v) => v.text) ?? [];
      }
    }

    logger.info(`Scoring page: ${page.title}`);

    const { score, breakdown } = await computeCPS(
      page,
      prompt,
      brand.name,
      promptVariants
    );

    logger.info(`CPS: ${(score * 100).toFixed(1)}% — entity:${breakdown.entity_score.toFixed(2)} structure:${breakdown.structure_score.toFixed(2)} redundancy:${breakdown.redundancy_score.toFixed(2)}`);

    // Determine action based on score
    let newStatus = "draft";
    let action = "draft";

    if (score >= CPS_AUTO_PUBLISH_THRESHOLD && (brand as any).auto_publish) {
      newStatus = "draft"; // will transition to published after publish job
      action = "auto_publish";
    } else if (score >= CPS_DRAFT_THRESHOLD) {
      newStatus = "draft";
      action = "ready";
    } else if (score >= CPS_REGENERATE_THRESHOLD) {
      newStatus = "draft";
      action = "needs_improvement";
    } else {
      newStatus = "failing";
      action = "failing";
    }

    await supabaseAdmin
      .from("pages")
      .update({
        cps: score,
        cps_breakdown: breakdown,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pageId);

    // Save version snapshot
    await supabaseAdmin.from("page_versions").insert({
      page_id: pageId,
      content: page.content,
      cps: score,
      created_at: new Date().toISOString(),
    });

    if (action === "auto_publish") {
      // Find active publisher for this brand
      const { data: publisher } = await supabaseAdmin
        .from("publishers")
        .select("id")
        .eq("brand_id", page.brand_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (publisher) {
        tasks
          .trigger("publish-page", { pageId, publisherId: publisher.id })
          .catch((err) => console.error("Failed to trigger publish-page:", err.message));
      }
    }

    return { pageId, score, breakdown, action };
  },
});
