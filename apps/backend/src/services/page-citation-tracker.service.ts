import { supabaseAdmin } from "../lib/supabase.js";
import { firePrompt } from "./ai-engine.service.js";
import { normalizeUrlForComparison } from "./citation.service.js";

export async function trackPageCitations(pageId: string): Promise<void> {
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brand_id, prompt_id, published_url, content, published_at")
    .eq("id", pageId)
    .single();

  if (!page) throw new Error(`Page ${pageId} not found`);
  if (!page.prompt_id)
    throw new Error(`Page ${pageId} has no associated prompt`);

  const { data: prompt } = await supabaseAdmin
    .from("prompts_v2")
    .select("text")
    .eq("id", page.prompt_id)
    .single();

  if (!prompt) throw new Error(`Prompt not found for page ${pageId}`);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name, competitors")
    .eq("id", page.brand_id)
    .single();

  if (!brand?.name) throw new Error(`Brand not found for page ${pageId}`);

  // Run the prompt against ChatGPT
  const result = await firePrompt(
    prompt.text,
    brand.name,
    brand.competitors ?? [],
    "chatgpt",
  );

  const brandCited = result.brand_mentioned;

  // Attribution: was our published_url or an exact phrase from the page cited?
  let attributedToContent = false;
  if (brandCited && page.published_url) {
    const citedUrls = result.citations ?? [];
    const publishedUrl = normalizeUrlForComparison(page.published_url);
    attributedToContent = citedUrls.some(
      (url) => normalizeUrlForComparison(url) === publishedUrl,
    );
  }

  // Insert citation run
  const { error: insertError } = await supabaseAdmin
    .from("citation_runs")
    .insert({
      page_id: pageId,
      prompt_id: page.prompt_id,
      engine: "chatgpt",
      response_text: result.raw_response,
      brand_cited: brandCited,
      brand_position: result.brand_position,
      attributed_to_content: attributedToContent,
      ran_at: new Date().toISOString(),
    });
  if (insertError)
    throw new Error(`Failed to save citation run: ${insertError.message}`);

  // Recalculate citation_rate from all runs for this page
  const { data: runs, error: runsError } = await supabaseAdmin
    .from("citation_runs")
    .select("brand_cited")
    .eq("page_id", pageId);
  if (runsError)
    throw new Error(`Failed to load citation runs: ${runsError.message}`);

  const total = runs?.length ?? 0;
  const cited = runs?.filter((r) => r.brand_cited).length ?? 0;
  const citationRate = total > 0 ? cited / total : 0;

  const { error: updateError } = await supabaseAdmin
    .from("pages")
    .update({
      citation_rate: citationRate,
      last_citation_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId);
  if (updateError)
    throw new Error(`Failed to update citation rate: ${updateError.message}`);
}
