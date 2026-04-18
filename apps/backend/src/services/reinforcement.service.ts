import { supabaseAdmin } from "../lib/supabase.js";
import {
  generatePhrasingVariants,
  filterVariantsByCosine,
  extractTargetPhrase,
} from "./phrasing-variants.service.js";
import type { ReinforcementChannel } from "@covable/shared";

const CHANNELS: ReinforcementChannel[] = ["reddit", "medium", "quora"];

export async function planReinforcement(pageId: string): Promise<number> {
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brand_id, content, title, prompt_id, brands!inner(name)")
    .eq("id", pageId)
    .single();

  if (!page) throw new Error(`Page ${pageId} not found`);

  const brandName = (page as any).brands?.name ?? "";
  const targetPhrase = extractTargetPhrase(page.content, brandName);

  // Generate variants and filter by cosine similarity
  const rawVariants = await generatePhrasingVariants(targetPhrase, 12);
  const variants = await filterVariantsByCosine(rawVariants, 0.75);

  // Create one reinforcement job per channel
  const jobs = CHANNELS.map((channel, i) => ({
    page_id: pageId,
    channel,
    target_phrase: targetPhrase,
    variant_used: variants[i] ?? variants[0] ?? targetPhrase,
    status: "pending",
    created_at: new Date().toISOString(),
  }));

  const { data: inserted } = await supabaseAdmin
    .from("reinforcement_jobs")
    .insert(jobs)
    .select("id");

  return inserted?.length ?? 0;
}

export async function canPostToSubreddit(
  brandId: string,
  subreddit: string
): Promise<boolean> {
  // Check existing reddit_posts for this brand+subreddit in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("reddit_posts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("subreddit", subreddit)
    .eq("reply_status", "posted")
    .gte("created_at", since);

  return (count ?? 0) < 1;
}
