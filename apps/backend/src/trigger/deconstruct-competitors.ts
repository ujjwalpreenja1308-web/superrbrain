import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  findCompetitorUrls,
  deconstructUrl,
} from "../services/deconstruction.service.js";

export const deconstructCompetitors = task({
  id: "deconstruct-competitors",
  run: async (payload: { promptId: string; urls?: string[] }) => {
    const { promptId, urls: manualUrls } = payload;

    const { data: prompt } = await supabaseAdmin
      .from("prompts_v2")
      .select("id, text, intent, brands!inner(name, country)")
      .eq("id", promptId)
      .single();

    if (!prompt) throw new Error(`Prompt ${promptId} not found`);

    const country = (prompt as any).brands?.country ?? undefined;

    // Find competitor URLs via Bright Data or use manually provided ones
    let urls = manualUrls ?? [];
    if (!urls.length) {
      logger.info(`Finding competitor URLs for: ${prompt.text.slice(0, 60)}...`);
      urls = await findCompetitorUrls(prompt.text, country);
    }

    if (!urls.length) {
      logger.warn("No competitor URLs found");
      return { promptId, processed: 0 };
    }

    logger.info(`Found ${urls.length} URLs to deconstruct`);

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      try {
        // Upsert competitor_urls row
        const { data: urlRow, error: urlError } = await supabaseAdmin
          .from("competitor_urls")
          .upsert(
            {
              prompt_id: promptId,
              url,
              rank: i + 1,
              last_crawled_at: new Date().toISOString(),
            },
            { onConflict: "prompt_id,url" }
          )
          .select("id")
          .single();

        if (urlError || !urlRow) {
          logger.error(`Failed to upsert competitor_url for ${url}`, { error: urlError?.message });
          failed++;
          continue;
        }

        logger.info(`Deconstructing ${url}...`);
        const blueprint = await deconstructUrl(url, prompt.text, prompt.intent);

        // Upsert blueprint (replace if re-crawled)
        await supabaseAdmin.from("competitor_blueprints").upsert(
          {
            competitor_url_id: urlRow.id,
            schema: blueprint.schema,
            why_winning_signals: blueprint.why_winning_signals,
            raw_markdown: blueprint.raw_markdown,
            crawled_at: new Date().toISOString(),
          },
          { onConflict: "competitor_url_id" }
        );

        processed++;
        logger.info(`Deconstructed ${url} — signals: ${blueprint.why_winning_signals.join(", ")}`);
      } catch (err: any) {
        logger.error(`Failed to deconstruct ${url}`, { error: err.message });
        failed++;
      }
    }

    return { promptId, processed, failed };
  },
});
