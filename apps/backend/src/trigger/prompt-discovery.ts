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
  run: async (payload: {
    promptId?: string;
    brandId?: string;
    generateVariants?: boolean;
  }) => {
    const { promptId, brandId, generateVariants } = payload;

    if (promptId) {
      const { data: prompt, error: promptError } = await supabaseAdmin
        .from("prompts_v2")
        .select("id, text, brand_id")
        .eq("id", promptId)
        .single();

      if (promptError || !prompt) {
        throw new Error(
          `Prompt ${promptId} not found: ${promptError?.message ?? "missing"}`,
        );
      }

      if (generateVariants) {
        logger.info(
          `Generating variants for prompt: ${prompt.text.slice(0, 60)}...`,
        );
        const variants = await expandPromptVariants(prompt.text);

        await replacePromptVariants(promptId, variants);

        logger.info(`Created ${variants.length} variants`);
      }

      return { promptId, variantsCreated: generateVariants ? true : false };
    }

    if (brandId) {
      // Seed prompts from existing v1 prompts, then prioritize
      const seeded = await seedPromptsFromBrand(brandId);
      await prioritizePrompts(brandId);

      // Expand variants for top 10 highest-gap prompts
      const { data: topPrompts, error: topPromptsError } = await supabaseAdmin
        .from("prompts_v2")
        .select("id, text")
        .eq("brand_id", brandId)
        .order("gap_score", { ascending: false })
        .limit(10);
      if (topPromptsError) {
        throw new Error(
          `Failed to load prioritized prompts: ${topPromptsError.message}`,
        );
      }

      let variantsCreated = 0;
      for (const prompt of topPrompts ?? []) {
        const variants = await expandPromptVariants(prompt.text);
        await replacePromptVariants(prompt.id, variants);
        variantsCreated += variants.length;
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
    const { data: brands, error: brandsError } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("status", "ready");
    if (brandsError)
      throw new Error(`Failed to load brands: ${brandsError.message}`);

    if (!brands?.length) return { processed: 0 };

    let processed = 0;
    for (const brand of brands) {
      try {
        await tasks.trigger("prompt-discovery", { brandId: brand.id });
        processed++;
      } catch (err) {
        logger.error(`Failed to trigger prompt-discovery for ${brand.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Triggered prompt discovery for ${processed} brands`);
    return { processed };
  },
});

async function replacePromptVariants(
  promptId: string,
  variants: string[],
): Promise<void> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("prompt_variants")
    .select("id")
    .eq("prompt_id", promptId);
  if (existingError)
    throw new Error(`Failed to load prompt variants: ${existingError.message}`);

  let newIds: string[] = [];
  if (variants.length) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("prompt_variants")
      .insert(
        variants.map((text) => ({
          prompt_id: promptId,
          text,
          created_at: new Date().toISOString(),
        })),
      )
      .select("id");
    if (insertError || !inserted) {
      throw new Error(
        `Failed to insert prompt variants: ${insertError?.message ?? "unknown error"}`,
      );
    }
    newIds = inserted.map((variant) => variant.id);
  }

  const oldIds = (existing ?? []).map((variant) => variant.id);
  if (!oldIds.length) return;

  const { error: deleteError } = await supabaseAdmin
    .from("prompt_variants")
    .delete()
    .in("id", oldIds);
  if (deleteError) {
    if (newIds.length)
      await supabaseAdmin.from("prompt_variants").delete().in("id", newIds);
    throw new Error(
      `Failed to remove old prompt variants: ${deleteError.message}`,
    );
  }
}
