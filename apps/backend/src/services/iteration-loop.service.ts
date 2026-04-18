import { supabaseAdmin } from "../lib/supabase.js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { PageStatus } from "@covable/shared";

const WINNING_THRESHOLD = 0.70;
const STALE_DROP_RATIO = 0.20; // 20% drop in citation rate
const FAILING_DAYS = 30;
const MAX_UPDATE_ATTEMPTS = 2;

export async function evaluatePageState(pageId: string): Promise<PageStatus> {
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, status, citation_rate, published_at, created_at")
    .eq("id", pageId)
    .single();

  if (!page) throw new Error(`Page ${pageId} not found`);

  // Can't evaluate unpublished pages
  if (page.status === "draft" || !page.published_at) return page.status as PageStatus;
  if (page.status === "archived") return "archived";

  const { data: runs } = await supabaseAdmin
    .from("citation_runs")
    .select("brand_cited, ran_at")
    .eq("page_id", pageId)
    .order("ran_at", { ascending: true });

  if (!runs?.length) {
    // No runs yet — check if page is old enough to be failing
    const daysSincePublish =
      (Date.now() - new Date(page.published_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublish > FAILING_DAYS) return "failing";
    return page.status as PageStatus;
  }

  const now = Date.now();
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  // Recent runs (last 2 weeks)
  const recentRuns = runs.filter((r) => new Date(r.ran_at).getTime() > twoWeeksAgo);
  const recentCitationRate =
    recentRuns.length > 0
      ? recentRuns.filter((r) => r.brand_cited).length / recentRuns.length
      : 0;

  // Older runs (before last 2 weeks)
  const olderRuns = runs.filter((r) => new Date(r.ran_at).getTime() <= twoWeeksAgo);
  const olderCitationRate =
    olderRuns.length > 0
      ? olderRuns.filter((r) => r.brand_cited).length / olderRuns.length
      : null;

  // Winning: citation rate > 70% for 2+ weeks of data
  if (recentRuns.length >= 5 && recentCitationRate >= WINNING_THRESHOLD) {
    return "winning";
  }

  // Stale: citation rate dropped > 20% vs older baseline
  if (olderCitationRate !== null && olderCitationRate > 0) {
    const drop = (olderCitationRate - recentCitationRate) / olderCitationRate;
    if (drop > STALE_DROP_RATIO) return "stale";
  }

  // Failing: never cited after 30 days
  const daysSincePublish =
    (now - new Date(page.published_at).getTime()) / (1000 * 60 * 60 * 24);
  if (
    daysSincePublish > FAILING_DAYS &&
    runs.filter((r) => r.brand_cited).length === 0
  ) {
    // Check how many times we've already tried to update
    const { data: versions } = await supabaseAdmin
      .from("page_versions")
      .select("id")
      .eq("page_id", pageId);

    if ((versions?.length ?? 0) >= MAX_UPDATE_ATTEMPTS + 1) return "archived";
    return "failing";
  }

  return page.status as PageStatus;
}

export async function refreshStalePage(pageId: string): Promise<void> {
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brand_id, prompt_id")
    .eq("id", pageId)
    .single();

  if (!page || !page.prompt_id) return;

  // Re-run competitor deconstruction to get fresh blueprints
  tasks
    .trigger("deconstruct-competitors", { promptId: page.prompt_id })
    .catch(console.error);

  // After deconstruction, regenerate the page
  // Small delay to let deconstruction complete
  tasks
    .trigger("generate-page", { promptId: page.prompt_id, brandId: page.brand_id }, { delay: "10m" })
    .catch(console.error);
}

export async function patchNearWinner(pageId: string): Promise<void> {
  // A near-winner (60-70% citation rate) needs targeted reinforcement
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brand_id")
    .eq("id", pageId)
    .single();

  if (!page) return;

  // Trigger additional reinforcement run
  tasks
    .trigger("reinforce-page", { pageId })
    .catch(console.error);
}

export async function archivePage(pageId: string): Promise<void> {
  await supabaseAdmin
    .from("pages")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", pageId);
}

export async function runIterationLoop(brandId?: string): Promise<{
  evaluated: number;
  updated: number;
  archived: number;
}> {
  let query = supabaseAdmin
    .from("pages")
    .select("id, brand_id, status, citation_rate")
    .in("status", ["published", "winning", "stale", "failing"]);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data: pages } = await query;
  if (!pages?.length) return { evaluated: 0, updated: 0, archived: 0 };

  let evaluated = 0;
  let updated = 0;
  let archived = 0;

  for (const page of pages) {
    const newStatus = await evaluatePageState(page.id);
    evaluated++;

    if (newStatus !== page.status) {
      await supabaseAdmin
        .from("pages")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", page.id);
      updated++;

      if (newStatus === "stale") {
        await refreshStalePage(page.id);
      } else if (newStatus === "archived") {
        archived++;
      } else if (newStatus === "winning" && page.status !== "winning") {
        // Winning page: trigger extra reinforcement to maintain
        tasks
          .trigger("reinforce-page", { pageId: page.id }, { delay: "1h" })
          .catch(console.error);
      }
    }
  }

  return { evaluated, updated, archived };
}
