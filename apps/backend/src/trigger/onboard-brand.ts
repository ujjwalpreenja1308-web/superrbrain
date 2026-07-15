import { task } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { scrapeUrl } from "../services/scraper.service.js";
import {
  extractBrandData,
  generatePrompts,
} from "../services/prompt-generator.service.js";
import { getPlanTier } from "../middleware/requirePlan.js";
import { PLAN_LIMITS } from "@covable/shared";

export const onboardBrand = task({
  id: "onboard-brand",
  run: async (payload: { brandId: string }) => {
    const { brandId } = payload;

    // Update status to onboarding
    const { error: onboardingStatusError } = await supabaseAdmin
      .from("brands")
      .update({ status: "onboarding" })
      .eq("id", brandId);
    if (onboardingStatusError) {
      throw new Error(
        `Failed to start brand onboarding: ${onboardingStatusError.message}`,
      );
    }

    try {
      // 1. Fetch brand URL
      const { data: brand, error: brandError } = await supabaseAdmin
        .from("brands")
        .select("url, user_id")
        .eq("id", brandId)
        .single();

      if (brandError || !brand)
        throw new Error(`Brand not found: ${brandError?.message ?? brandId}`);
      const tier = await getPlanTier(brand.user_id);
      const promptLimit = Math.min(PLAN_LIMITS[tier].maxPrompts, 25);

      // 2. Scrape the brand website
      const scraped = await scrapeUrl(brand.url);

      // 3. Extract brand data using GPT-4o mini
      const extracted = await extractBrandData(scraped.markdown, brand.url);

      // 4. Update brand with extracted data
      const { error: brandUpdateError } = await supabaseAdmin
        .from("brands")
        .update({
          name: extracted.name,
          category: extracted.category,
          description: extracted.description,
          competitors: extracted.competitors,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandId);
      if (brandUpdateError) {
        throw new Error(
          `Failed to save extracted brand data: ${brandUpdateError.message}`,
        );
      }

      // 5. Generate buyer-intent prompts
      const prompts = await generatePrompts(
        extracted.name,
        extracted.category,
        extracted.description,
        extracted.competitors,
        promptLimit,
      );
      if (!prompts.length)
        throw new Error("Prompt generation returned no prompts");

      // 6. Insert prompts with category
      const { data: existingPrompts, error: existingPromptsError } =
        await supabaseAdmin
          .from("prompts")
          .select("text")
          .eq("brand_id", brandId);
      if (existingPromptsError) {
        throw new Error(
          `Failed to check existing prompts: ${existingPromptsError.message}`,
        );
      }
      const existingTexts = new Set(
        (existingPrompts ?? []).map((prompt) =>
          prompt.text.trim().toLowerCase(),
        ),
      );
      const promptRows = prompts
        .filter(
          (prompt) => !existingTexts.has(prompt.text.trim().toLowerCase()),
        )
        .map((p) => ({
          brand_id: brandId,
          text: p.text,
          category: p.category,
          is_active: true,
        }));

      if (promptRows.length) {
        const { error: promptInsertError } = await supabaseAdmin
          .from("prompts")
          .insert(promptRows);
        if (promptInsertError) {
          throw new Error(
            `Failed to save prompts: ${promptInsertError.message}`,
          );
        }
      }

      // 7. Mark brand as ready
      const { error: readyStatusError } = await supabaseAdmin
        .from("brands")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", brandId);
      if (readyStatusError) {
        throw new Error(
          `Failed to complete brand onboarding: ${readyStatusError.message}`,
        );
      }

      return {
        success: true,
        brandName: extracted.name,
        promptCount: prompts.length,
      };
    } catch (error) {
      const { error: errorStatusError } = await supabaseAdmin
        .from("brands")
        .update({ status: "error" })
        .eq("id", brandId);
      if (errorStatusError) {
        console.error(
          `Failed to mark brand ${brandId} as errored:`,
          errorStatusError.message,
        );
      }
      throw error;
    }
  },
});
