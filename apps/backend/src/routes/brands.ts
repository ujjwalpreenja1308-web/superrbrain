import { Hono } from "hono";
import { createBrandSchema } from "@covable/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import { getPlanTier } from "../middleware/requirePlan.js";
import { isLocalDevBypassEnabled } from "../lib/env.js";
import { PLAN_LIMITS } from "@covable/shared";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// POST /api/brands — create brand, trigger onboarding
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createBrandSchema.safeParse(body);
  const isLocalDev = isLocalDevBypassEnabled();

  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }

  // Enforce maxBrands per plan
  if (!isLocalDev) {
    const tier = await getPlanTier(userId);
    const maxBrands = PLAN_LIMITS[tier].maxBrands;
    const { count } = await supabaseAdmin
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= maxBrands) {
      throw new AppError(403, `Your ${PLAN_LIMITS[tier].label} plan allows up to ${maxBrands} brand${maxBrands === 1 ? "" : "s"}.`);
    }
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

// POST /api/brands/:id/ingest — hermes pushes brand metadata + prompts directly (no AI onboarding)
app.post("/:id/ingest", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const body = await c.req.json();
  const { name, category, description, competitors, prompts } = body;

  await supabaseAdmin
    .from("brands")
    .update({
      ...(name && { name }),
      ...(category && { category }),
      ...(description && { description }),
      ...(competitors && { competitors }),
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId);

  if (Array.isArray(prompts) && prompts.length > 0) {
    await supabaseAdmin.from("prompts").delete().eq("brand_id", brandId);
    await supabaseAdmin.from("prompts").insert(
      prompts.map((p: { text: string; category?: string }) => ({
        brand_id: brandId,
        text: p.text,
        category: p.category ?? null,
        is_active: true,
      }))
    );
  }

  return c.json({ success: true, promptCount: prompts?.length ?? 0 });
});

// POST /api/brands/:id/results — hermes pushes query results directly (no AI firing)
app.post("/:id/results", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id, name, competitors")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const body = await c.req.json();
  const { results, run_id } = body;

  if (!Array.isArray(results) || results.length === 0) {
    throw new AppError(400, "results array is required");
  }

  const runId: string = run_id || crypto.randomUUID();
  const brandName: string = (brand.name as string) || "";
  const competitors = ((brand.competitors as { name: string }[]) || []);

  await supabaseAdmin.from("brands").update({ status: "running" }).eq("id", brandId);

  const { enrichCitation, extractBrandsFromResponse } = await import("../services/citation.service.js");
  const { computeReport } = await import("../services/scoring.service.js");

  const urlData = new Map<string, { responseIds: string[]; responseText: string }>();

  await Promise.all(
    results.map(async (r: {
      prompt_id: string;
      engine: string;
      raw_response: string;
      citations: string[];
      brand_mentioned: boolean;
      brand_position: number | null;
      competitor_mentions: { name: string; position: number | null }[];
    }) => {
      const { data: inserted } = await supabaseAdmin
        .from("ai_responses")
        .insert({
          prompt_id: r.prompt_id,
          brand_id: brandId,
          engine: r.engine,
          raw_response: r.raw_response,
          brand_mentioned: r.brand_mentioned,
          brand_position: r.brand_position,
          competitor_mentions: r.competitor_mentions,
          run_id: runId,
        })
        .select("id")
        .single();

      if (inserted?.id) {
        for (const url of r.citations ?? []) {
          const existing = urlData.get(url) || { responseIds: [], responseText: r.raw_response };
          existing.responseIds.push(inserted.id);
          urlData.set(url, existing);
        }
      }
    })
  );

  await Promise.all(
    Array.from(urlData.entries()).map(async ([url, data]) => {
      const frequency = data.responseIds.length;
      const primaryResponseId = data.responseIds[0];

      const analysis = enrichCitation(url, data.responseText, brandName, competitors);
      const extractedBrands = await extractBrandsFromResponse(data.responseText, brandName);
      if (extractedBrands.length > 0) analysis.brands_mentioned = extractedBrands;

      const { data: citation } = await supabaseAdmin
        .from("citations")
        .insert({
          ai_response_id: primaryResponseId,
          brand_id: brandId,
          url: analysis.url,
          domain: analysis.domain,
          source_type: analysis.source_type,
          title: analysis.title,
          brands_mentioned: analysis.brands_mentioned,
          content_snippet: analysis.content_snippet,
          run_id: runId,
        })
        .select("id")
        .single();

      const brandMentioned = analysis.brands_mentioned.some(
        (b) => b.name.toLowerCase() === brandName.toLowerCase()
      );

      if (!brandMentioned && citation?.id) {
        const competitorsMentioned = analysis.brands_mentioned.filter((b) =>
          competitors.some((c) => c.name.toLowerCase() === b.name.toLowerCase())
        );
        if (competitorsMentioned.length > 0) {
          await Promise.all(
            competitorsMentioned.map((comp) =>
              supabaseAdmin.from("citation_gaps").insert({
                brand_id: brandId,
                competitor_name: comp.name,
                source_url: analysis.url,
                source_type: analysis.source_type,
                opportunity_score: frequency * (comp.frequency || 1),
                status: "open",
                run_id: runId,
              })
            )
          );
        } else {
          await supabaseAdmin.from("citation_gaps").insert({
            brand_id: brandId,
            competitor_name: "–",
            source_url: analysis.url,
            source_type: analysis.source_type,
            opportunity_score: frequency,
            status: "open",
            run_id: runId,
          });
        }
      }
    })
  );

  const report = await computeReport(brandId, runId);

  await supabaseAdmin.from("brands").update({ status: "ready" }).eq("id", brandId);

  return c.json({ success: true, run_id: runId, visibility_score: report.visibility_score, gap_score: report.gap_score });
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
