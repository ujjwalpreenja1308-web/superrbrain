import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  mergeBlueprints,
  generatePage,
  detectGenericScore,
  pageToMarkdown,
  pageToHtml,
} from "../services/content-generation.service.js";
import type { CompetitorBlueprintShape } from "@covable/shared";

type BlueprintWithSignals = CompetitorBlueprintShape & { why_winning_signals?: string[] };

const MAX_GENERIC_SCORE = 6;
const MAX_REGENERATION_ATTEMPTS = 2;

export const generatePageTask = task({
  id: "generate-page",
  run: async (payload: {
    promptId: string;
    brandId: string;
    regenerate_focus?: string;
    attempt?: number;
  }) => {
    const { promptId, brandId, regenerate_focus, attempt = 1 } = payload;

    // Load prompt + variants
    const { data: prompt } = await supabaseAdmin
      .from("prompts_v2")
      .select("id, text, intent, vertical, modifiers, expected_entities")
      .eq("id", promptId)
      .single();

    if (!prompt) throw new Error(`Prompt ${promptId} not found`);

    const { data: variants } = await supabaseAdmin
      .from("prompt_variants")
      .select("text")
      .eq("prompt_id", promptId)
      .limit(10);

    const promptVariants = variants?.map((v) => v.text) ?? [];

    // Load brand
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, name, description, competitors")
      .eq("id", brandId)
      .single();

    if (!brand) throw new Error(`Brand ${brandId} not found`);
    if (!brand.name) throw new Error(`Brand ${brandId} has no name — run onboarding first`);

    // Load top 3 competitor blueprints for this prompt
    const { data: urlRows } = await supabaseAdmin
      .from("competitor_urls")
      .select("id, rank")
      .eq("prompt_id", promptId)
      .order("rank", { ascending: true })
      .limit(5);

    const blueprints: BlueprintWithSignals[] = [];
    if (urlRows?.length) {
      const { data: bpRows } = await supabaseAdmin
        .from("competitor_blueprints")
        .select("schema, why_winning_signals")
        .in(
          "competitor_url_id",
          urlRows.map((r) => r.id)
        )
        .limit(3);

      for (const row of bpRows ?? []) {
        if (row.schema) {
          blueprints.push({
            ...(row.schema as CompetitorBlueprintShape),
            why_winning_signals: row.why_winning_signals as string[] | undefined,
          });
        }
      }
    }

    const merged = mergeBlueprints(blueprints);

    logger.info(`Generating page for "${prompt.text.slice(0, 60)}..." (attempt ${attempt})`);

    const generated = await generatePage({
      promptText: prompt.text,
      promptVariants,
      brandName: brand.name,
      brandDescription: brand.description ?? "",
      merged,
      currentYear: new Date().getFullYear(),
    });

    // Anti-generic check
    const content = pageToMarkdown(generated);
    const genericScore = await detectGenericScore(content);
    logger.info(`Generic score: ${genericScore}/10`);

    if (genericScore > MAX_GENERIC_SCORE && attempt < MAX_REGENERATION_ATTEMPTS) {
      logger.warn(`Generic score too high (${genericScore}), re-triggering with focus`);
      tasks
        .trigger("generate-page", {
          promptId,
          brandId,
          regenerate_focus: "reduce_generic",
          attempt: attempt + 1,
        })
        .catch(console.error);
      return { status: "retrying", genericScore };
    }

    const contentHtml = pageToHtml(generated);

    // Insert page
    const { data: page, error } = await supabaseAdmin
      .from("pages")
      .insert({
        brand_id: brandId,
        prompt_id: promptId,
        title: generated.title,
        content,
        content_html: contentHtml,
        tldr: generated.tldr,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to insert page: ${error.message}`);

    logger.info(`Page created: ${page.id}`);

    // Trigger scoring
    tasks
      .trigger("score-page", { pageId: page.id })
      .catch((err) => console.error("Failed to trigger score-page:", err.message));

    return { pageId: page.id, genericScore, title: generated.title };
  },
});
