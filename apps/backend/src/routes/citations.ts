import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import type { AppVariables } from "../types.js";
import {
  normalizeUrlForComparison,
  shouldIncludeCitationMapSource,
} from "../services/citation.service.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/brands/:id/citations
app.get("/:id/citations", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  // Get the latest run_id
  const { data: latestResponse, error: latestResponseError } =
    await supabaseAdmin
      .from("ai_responses")
      .select("run_id")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  if (latestResponseError)
    throw new AppError(500, "Failed to load latest monitoring run");

  const runId = latestResponse?.run_id;
  if (!runId) return c.json([]);

  const { data: citations, error } = await supabaseAdmin
    .from("citations")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", runId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch citations");

  // Collapse repeat citations by URL. "Appeared in" should mean how many AI
  // responses cited this exact source, not how often the whole domain appeared.
  const citationsByUrl = new Map<string, typeof citations>();
  for (const cit of citations ?? []) {
    const key = normalizeUrlForComparison(cit.url);
    const existing = citationsByUrl.get(key) ?? [];
    existing.push(cit);
    citationsByUrl.set(key, existing);
  }

  const enriched = Array.from(citationsByUrl.values()).flatMap((group) => {
    const [first] = group;
    const brands = new Map<string, { name: string; frequency: number }>();
    for (const cit of group) {
      const mentioned = Array.isArray(cit.brands_mentioned)
        ? cit.brands_mentioned
        : [];
      for (const brand of mentioned) {
        if (typeof brand?.name !== "string") continue;
        const key = brand.name.toLowerCase();
        const existing = brands.get(key);
        brands.set(key, {
          name: existing?.name ?? brand.name,
          frequency:
            (existing?.frequency ?? 0) +
            (typeof brand.frequency === "number" ? brand.frequency : 1),
        });
      }
    }

    const brandsMentioned = Array.from(brands.values());
    if (!shouldIncludeCitationMapSource(first.source_type, brandsMentioned)) {
      return [];
    }

    return [
      {
        ...first,
        brands_mentioned: brandsMentioned,
        frequency_score: new Set(
          group.map((citation) => citation.ai_response_id),
        ).size,
      },
    ];
  });

  return c.json(enriched);
});

export { app as citationRoutes };
