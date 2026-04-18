import { task, schedules, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  expandPromptVariants,
  prioritizePrompts,
  seedPromptsFromBrand,
} from "../services/prompt-intelligence.service.js";

// One-off task: generate variants for a single prompt
export const promptDiscovery = task({
  id: "prompt-discovery",
  run: async (payload: { promptId?: string; brandId?: string; generateVariants?: boolean }) => {
    const { promptId, brandId, generateVariants } = payload;

    if (promptId) {
      const { data: prompt } = await supabaseAdmin
        .from("prompts_v2")
        .select("id, text, brand_id")
        .eq("id", promptId)
        .single();

      if (!prompt) throw new Error(`Prompt ${promptId} not found`);

      if (generateVariants) {
        logger.info(`Generating variants for prompt: ${prompt.text.slice(0, 60)}...`);
        const variants = await expandPromptVariants(prompt.text);

        // Delete old variants first
        await supabaseAdmin.from("prompt_variants").delete().eq("prompt_id", promptId);

        if (variants.length > 0) {
          await supabaseAdmin.from("prompt_variants").insert(
            variants.map((text) => ({
              prompt_id: promptId,
              text,
              created_at: new Date().toISOString(),
            }))
          );
        }

        logger.info(`Created ${variants.length} variants`);
      }

      return { promptId, variantsCreated: generateVariants ? true : false };
    }

    if (brandId) {
      // Seed prompts from existing v1 prompts, then prioritize
      const seeded = await seedPromptsFromBrand(brandId);
      await prioritizePrompts(brandId);

      // Expand variants for top 10 highest-gap prompts
      const { data: topPrompts } = await supabaseAdmin
        .from("prompts_v2")
        .select("id, text")
        .eq("brand_id", brandId)
        .order("gap_score", { ascending: false })
        .limit(10);

      let variantsCreated = 0;
      for (const prompt of topPrompts ?? []) {
        const variants = await expandPromptVariants(prompt.text);
        await supabaseAdmin.from("prompt_variants").delete().eq("prompt_id", prompt.id);
        if (variants.length > 0) {
          await supabaseAdmin.from("prompt_variants").insert(
            variants.map((text) => ({
              prompt_id: prompt.id,
              text,
              created_at: new Date().toISOString(),
            }))
          );
          variantsCreated += variants.length;
        }
      }

      return { brandId, seeded, variantsCreated };
    }

    throw new Error("Either promptId or brandId must be provided");
  },
});

// Daily cron: re-prioritize all brands and expand top prompts
export const promptDiscoveryCron = schedules.task({
  id: "prompt-discovery-cron",
  cron: "0 3 * * *", // 3 AM UTC daily
  run: async () => {
    const { data: brands } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("status", "ready");

    if (!brands?.length) return { processed: 0 };

    let processed = 0;
    for (const brand of brands) {
      tasks
        .trigger("prompt-discovery", { brandId: brand.id })
        .catch((err) => console.error(`Failed to trigger prompt-discovery for ${brand.id}:`, err.message));
      processed++;
    }

    logger.info(`Triggered prompt discovery for ${processed} brands`);
    return { processed };
  },
});
