import { Hono } from "hono";
import { createBrandSchema } from "@covable/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import { getPlanTier } from "../middleware/requirePlan.js";
import { PLAN_LIMITS } from "@covable/shared";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// POST /api/brands — create brand, trigger onboarding
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createBrandSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }

  // Enforce maxBrands per plan
  const tier = await getPlanTier(userId);
  const maxBrands = PLAN_LIMITS[tier].maxBrands;
  const { count } = await supabaseAdmin
    .from("brands")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) >= maxBrands) {
    throw new AppError(403, `Your ${PLAN_LIMITS[tier].label} plan allows up to ${maxBrands} brand${maxBrands === 1 ? "" : "s"}.`);
  }

  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .insert({
      user_id: userId,
      url: parsed.data.url,
      status: "pending",
      competitors: [],
      ...(parsed.data.country && { country: parsed.data.country }),
      ...(parsed.data.city && { city: parsed.data.city }),
    })
    .select()
    .single();

  if (error) throw new AppError(500, `Failed to create brand: ${error.message}`);

  // Trigger onboarding background job (non-blocking — requires trigger:dev to be running)
  tasks.trigger("onboard-brand", { brandId: brand.id }).catch((err) => {
    console.error("Failed to trigger onboard-brand job:", err.message);
  });

  return c.json(brand, 201);
});

// GET /api/brands — list user's brands
app.get("/", async (c) => {
  const userId = c.get("userId") as string;

  const { data: brands, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch brands");

  return c.json(brands ?? []);
});

// GET /api/brands/:id — fetch brand + latest report
app.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (error || !brand) throw new AppError(404, "Brand not found");

  return c.json(brand);
});

// GET /api/brands/:id/report — engine breakdown from latest run
app.get("/:id/report", async (c) => {
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
  const { data: latest } = await supabaseAdmin
    .from("ai_responses")
    .select("run_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!latest?.run_id) return c.json({ engine_breakdown: [] });

  const { data: responses } = await supabaseAdmin
    .from("ai_responses")
    .select("engine, brand_mentioned")
    .eq("brand_id", brandId)
    .eq("run_id", latest.run_id);

  const engineMap = new Map<string, { total: number; mentioned: number }>();
  for (const r of responses ?? []) {
    const entry = engineMap.get(r.engine) || { total: 0, mentioned: 0 };
    entry.total++;
    if (r.brand_mentioned) entry.mentioned++;
    engineMap.set(r.engine, entry);
  }

  const engine_breakdown = Array.from(engineMap.entries()).map(([engine, s]) => ({
    engine,
    total: s.total,
    mentioned: s.mentioned,
    score: s.total > 0 ? Math.round((s.mentioned / s.total) * 100) : 0,
  }));

  return c.json({ engine_breakdown });
});

// POST /api/brands/:id/run — manually trigger monitoring run
app.post("/:id/run", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .select("id, status")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (error || !brand) throw new AppError(404, "Brand not found");
  if (brand.status === "running" || brand.status === "onboarding") {
    throw new AppError(409, "A job is already running for this brand");
  }

  await supabaseAdmin
    .from("brands")
    .update({ status: "running" })
    .eq("id", brandId);

  const runId = crypto.randomUUID();
  tasks.trigger("run-monitoring", { brandId, runId }).catch((err) => {
    console.error("Failed to trigger run-monitoring job:", err.message);
  });

  return c.json({ run_id: runId, status: "running" });
});

export { app as brandRoutes };
