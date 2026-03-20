import { task } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { scrapeUrl } from "../services/scraper.service.js";
import {
  extractBrandData,
  generatePrompts,
} from "../services/prompt-generator.service.js";

export const onboardBrand = task({
  id: "onboard-brand",
  run: async (payload: { brandId: string }) => {
    const { brandId } = payload;

    // Update status to onboarding
    await supabaseAdmin
      .from("brands")
      .update({ status: "onboarding" })
      .eq("id", brandId);

    try {
      // 1. Fetch brand URL
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("url")
        .eq("id", brandId)
        .single();

      if (!brand) throw new Error("Brand not found");

      // 2. Scrape the brand website
      const scraped = await scrapeUrl(brand.url);

      // 3. Extract brand data using GPT-4o mini
      const extracted = await extractBrandData(scraped.markdown, brand.url);

      // 4. Update brand with extracted data
      await supabaseAdmin
        .from("brands")
        .update({
          name: extracted.name,
          category: extracted.category,
          description: extracted.description,
          competitors: extracted.competitors,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandId);

      // 5. Generate buyer-intent prompts
      const prompts = await generatePrompts(
        extracted.name,
        extracted.category,
        extracted.description,
        extracted.competitors
      );

      // 6. Insert prompts
      const promptRows = prompts.map((text) => ({
        brand_id: brandId,
        text,
        is_active: true,
      }));

      await supabaseAdmin.from("prompts").insert(promptRows);

      // 7. Mark brand as ready
      await supabaseAdmin
        .from("brands")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", brandId);

      return { success: true, brandName: extracted.name, promptCount: prompts.length };
    } catch (error) {
      await supabaseAdmin
        .from("brands")
        .update({ status: "error" })
        .eq("id", brandId);
      throw error;
    }
  },
});
