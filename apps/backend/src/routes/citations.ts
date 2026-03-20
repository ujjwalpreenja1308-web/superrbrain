import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import type { AppVariables } from "../types.js";

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
  const { data: latestResponse } = await supabaseAdmin
    .from("ai_responses")
    .select("run_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const runId = latestResponse?.run_id;
  if (!runId) return c.json([]);

  const { data: citations, error } = await supabaseAdmin
    .from("citations")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", runId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch citations");

  // Compute frequency: count how many times each domain appears
  const domainFrequency = new Map<string, number>();
  for (const c of citations ?? []) {
    const domain = c.domain || new URL(c.url).hostname;
    domainFrequency.set(domain, (domainFrequency.get(domain) || 0) + 1);
  }

  const enriched = (citations ?? []).map((cit) => ({
    ...cit,
    frequency_score: domainFrequency.get(cit.domain || "") || 1,
  }));

  return c.json(enriched);
});

export { app as citationRoutes };
