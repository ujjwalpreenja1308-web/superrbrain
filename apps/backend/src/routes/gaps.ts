import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/brands/:id/gaps
app.get("/:id/gaps", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  // Get latest run_id
  const { data: latestResponse } = await supabaseAdmin
    .from("ai_responses")
    .select("run_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const runId = latestResponse?.run_id;
  if (!runId) return c.json([]);

  const { data: gaps, error } = await supabaseAdmin
    .from("citation_gaps")
    .select("*")
    .eq("brand_id", brandId)
    .eq("run_id", runId)
    .order("opportunity_score", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch gaps");

  return c.json(gaps);
});

export { app as gapRoutes };
