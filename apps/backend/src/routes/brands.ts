import { Hono } from "hono";
import { AI_ENGINES, createBrandSchema } from "@covable/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import { dispatchBrandOnboarding } from "../lib/qstash.js";
import { isBrandOnboardingStale } from "../lib/onboarding-state.js";
import { checkPromptLimit, getPlanTier } from "../middleware/requirePlan.js";
import { isLocalDevBypassEnabled } from "../lib/env.js";
import { PLAN_LIMITS } from "@covable/shared";
import type { AppVariables } from "../types.js";
import { buildCitationRows } from "../services/citation.service.js";
import { z } from "zod";
import { assertSafePublicUrl } from "../services/url-safety.service.js";

const app = new Hono<{ Variables: AppVariables }>();

const ingestBrandSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        url: z.string().url().optional(),
      }),
    )
    .default([]),
  prompts: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        category: z.string().trim().min(1).optional(),
      }),
    )
    .min(1),
});

const ingestResultsSchema = z.object({
  run_id: z.string().uuid().optional(),
  results: z
    .array(
      z.object({
        prompt_id: z.string().uuid(),
        engine: z.enum(AI_ENGINES),
        raw_response: z.string(),
        citations: z.array(z.string().url()).default([]),
        brand_mentioned: z.boolean(),
        brand_position: z.number().int().positive().nullable(),
        competitor_mentions: z
          .array(
            z.object({
              name: z.string().trim().min(1),
              position: z.number().int().positive().nullable(),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

// POST /api/brands — create brand, dispatch durable onboarding workflow
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createBrandSchema.safeParse(body);
  const isLocalDev = isLocalDevBypassEnabled();
  const isSuperAdmin = c.get("isSuperAdmin");

  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }
  try {
    await assertSafePublicUrl(parsed.data.url);
  } catch (error) {
    throw new AppError(
      400,
      error instanceof Error
        ? error.message
        : "Brand URL must use a public host",
    );
  }

  // Enforce maxBrands per plan
  if (!isLocalDev && !isSuperAdmin) {
    const tier = await getPlanTier(userId);
    const maxBrands = PLAN_LIMITS[tier].maxBrands;
    const { count, error: countError } = await supabaseAdmin
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) throw new AppError(500, "Failed to check brand limit");
    if ((count ?? 0) >= maxBrands) {
      throw new AppError(
        403,
        `Your ${PLAN_LIMITS[tier].label} plan allows up to ${maxBrands} brand${maxBrands === 1 ? "" : "s"}.`,
      );
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

  if (error || !brand)
    throw new AppError(
      500,
      `Failed to create brand: ${error?.message ?? "empty result"}`,
    );

  // Do not leave an unusable pending brand if the background job cannot be
  // dispatched. Removing the just-created row lets the user retry cleanly.
  try {
    await dispatchBrandOnboarding(brand.id);
  } catch (err) {
    console.error("Failed to dispatch brand onboarding workflow:", err);
    await supabaseAdmin
      .from("brands")
      .delete()
      .eq("id", brand.id)
      .eq("user_id", userId);
    throw new AppError(
      503,
      "Failed to start brand onboarding. Please try again.",
    );
  }

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

  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (brandError || !brand) throw new AppError(404, "Brand not found");

  // Get latest run_id
  const { data: latest, error: latestError } = await supabaseAdmin
    .from("ai_responses")
    .select("run_id")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new AppError(500, "Failed to load latest report");

  if (!latest?.run_id) return c.json({ engine_breakdown: [] });

  const { data: responses, error: responsesError } = await supabaseAdmin
    .from("ai_responses")
    .select("engine, brand_mentioned, competitor_mentions")
    .eq("brand_id", brandId)
    .eq("run_id", latest.run_id);
  if (responsesError)
    throw new AppError(500, "Failed to load report responses");

  const engineMap = new Map<string, { total: number; mentioned: number }>();
  const competitorMap = new Map<string, number>();
  for (const r of responses ?? []) {
    const entry = engineMap.get(r.engine) || { total: 0, mentioned: 0 };
    entry.total++;
    if (r.brand_mentioned) entry.mentioned++;
    engineMap.set(r.engine, entry);

    const competitors = Array.isArray(r.competitor_mentions)
      ? r.competitor_mentions
      : [];
    for (const competitor of competitors) {
      const name =
        typeof competitor?.name === "string" ? competitor.name.trim() : "";
      if (name) competitorMap.set(name, (competitorMap.get(name) || 0) + 1);
    }
  }

  const engine_breakdown = Array.from(engineMap.entries()).map(
    ([engine, s]) => ({
      engine,
      total: s.total,
      mentioned: s.mentioned,
      score: s.total > 0 ? Math.round((s.mentioned / s.total) * 100) : 0,
    }),
  );

  const competitor_breakdown = Array.from(competitorMap.entries())
    .map(([name, mentioned]) => ({ name, mentioned }))
    .sort((a, b) => b.mentioned - a.mentioned);

  return c.json({ engine_breakdown, competitor_breakdown });
});

// POST /api/brands/:id/ingest — hermes pushes brand metadata + prompts directly (no AI onboarding)
app.post("/:id/ingest", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id, name, category, description, competitors, status")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const body = await c.req.json();
  const parsed = ingestBrandSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { name, category, description, competitors, prompts } = parsed.data;
  await checkPromptLimit(userId, brandId, prompts.length);

  const { data: existingPrompts, error: existingPromptError } =
    await supabaseAdmin.from("prompts").select("id").eq("brand_id", brandId);
  if (existingPromptError)
    throw new AppError(500, "Failed to load existing prompts");

  const { data: insertedPrompts, error: promptInsertError } =
    await supabaseAdmin
      .from("prompts")
      .insert(
        prompts.map((prompt) => ({
          brand_id: brandId,
          text: prompt.text,
          category: prompt.category ?? null,
          is_active: true,
        })),
      )
      .select("id");
  if (promptInsertError || !insertedPrompts) {
    throw new AppError(500, "Failed to save prompts");
  }

  const { error: brandUpdateError } = await supabaseAdmin
    .from("brands")
    .update({
      name,
      category,
      description,
      competitors,
      status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", brandId);
  if (brandUpdateError) {
    await supabaseAdmin
      .from("prompts")
      .delete()
      .in(
        "id",
        insertedPrompts.map((prompt) => prompt.id),
      );
    throw new AppError(500, "Failed to update brand");
  }

  const oldPromptIds = (existingPrompts ?? []).map((prompt) => prompt.id);
  if (oldPromptIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("prompts")
      .delete()
      .in("id", oldPromptIds);
    if (deleteError) {
      const [promptRollback, brandRollback] = await Promise.all([
        supabaseAdmin
          .from("prompts")
          .delete()
          .in(
            "id",
            insertedPrompts.map((prompt) => prompt.id),
          ),
        supabaseAdmin
          .from("brands")
          .update({
            name: brand.name,
            category: brand.category,
            description: brand.description,
            competitors: brand.competitors,
            status: brand.status,
          })
          .eq("id", brandId),
      ]);
      if (promptRollback.error || brandRollback.error) {
        console.error("Failed to fully roll back brand ingest", {
          promptError: promptRollback.error?.message,
          brandError: brandRollback.error?.message,
        });
      }
      throw new AppError(500, "Failed to replace prompts");
    }
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
  const parsed = ingestResultsSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);
  const { results, run_id } = parsed.data;

  const promptIds = [...new Set(results.map((result) => result.prompt_id))];
  const { data: ownedPrompts, error: promptError } = await supabaseAdmin
    .from("prompts")
    .select("id")
    .eq("brand_id", brandId)
    .in("id", promptIds);
  if (promptError) throw new AppError(500, "Failed to validate prompts");
  if ((ownedPrompts ?? []).length !== promptIds.length) {
    throw new AppError(400, "Every result prompt must belong to this brand");
  }

  const runId: string = run_id || crypto.randomUUID();
  const brandName: string = (brand.name as string) || "";
  if (!brandName.trim())
    throw new AppError(409, "Brand onboarding is not complete");
  const competitors = (brand.competitors as { name: string }[]) || [];

  const { enrichCitation, extractBrandsFromResponse, mergeBrandMentions } =
    await import("../services/citation.service.js");
  const { computeReport } = await import("../services/scoring.service.js");

  const urlData = new Map<
    string,
    { responseId: string; responseText: string }[]
  >();

  const responseRecords = results.map((result) => ({
    row: {
      id: crypto.randomUUID(),
      prompt_id: result.prompt_id,
      brand_id: brandId,
      engine: result.engine,
      raw_response: result.raw_response,
      brand_mentioned: result.brand_mentioned,
      brand_position: result.brand_position,
      competitor_mentions: result.competitor_mentions,
      run_id: runId,
    },
    citations: result.citations,
  }));
  const { error: responseError } = await supabaseAdmin
    .from("ai_responses")
    .insert(responseRecords.map((record) => record.row));
  if (responseError) throw new AppError(500, "Failed to save AI responses");

  responseRecords.forEach((record) => {
    for (const url of new Set(record.citations)) {
      const contexts = urlData.get(url) ?? [];
      contexts.push({
        responseId: record.row.id,
        responseText: record.row.raw_response,
      });
      urlData.set(url, contexts);
    }
  });

  const extractedBrandsByResponse = new Map<
    string,
    Promise<{ name: string; frequency: number }[]>
  >();

  await Promise.all(
    Array.from(urlData.entries()).map(async ([url, contexts]) => {
      const frequency = contexts.length;
      const analyses = await Promise.all(
        contexts.map(async (context) => {
          const analysis = enrichCitation(
            url,
            context.responseText,
            brandName,
            competitors,
          );
          let extracted = extractedBrandsByResponse.get(context.responseId);
          if (!extracted) {
            extracted = extractBrandsFromResponse(
              context.responseText,
              brandName,
            );
            extractedBrandsByResponse.set(context.responseId, extracted);
          }
          analysis.brands_mentioned = mergeBrandMentions(
            analysis.brands_mentioned,
            await extracted,
          );
          return analysis;
        }),
      );
      const citationRows = analyses.flatMap((analysis, index) =>
        buildCitationRows(
          [contexts[index].responseId],
          brandId,
          analysis,
          runId,
        ),
      );

      const { data: citations, error: citationError } = await supabaseAdmin
        .from("citations")
        .insert(citationRows)
        .select("id");
      if (citationError) {
        throw new AppError(500, "Failed to save citations");
      }

      const allBrandsMentioned = mergeBrandMentions(
        ...analyses.map((analysis) => analysis.brands_mentioned),
      );
      const brandMentioned = allBrandsMentioned.some(
        (b) => b.name.toLowerCase() === brandName.toLowerCase(),
      );

      if (!brandMentioned && citations?.length) {
        const competitorsMentioned = allBrandsMentioned.filter((b) =>
          competitors.some(
            (c) => c.name.toLowerCase() === b.name.toLowerCase(),
          ),
        );
        if (competitorsMentioned.length > 0) {
          const gapResults = await Promise.all(
            competitorsMentioned.map((comp) =>
              supabaseAdmin.from("citation_gaps").insert({
                brand_id: brandId,
                competitor_name: comp.name,
                source_url: url,
                source_type: analyses[0].source_type,
                opportunity_score: frequency * (comp.frequency || 1),
                status: "open",
                run_id: runId,
              }),
            ),
          );
          const failedGap = gapResults.find((result) => result.error);
          if (failedGap?.error)
            throw new AppError(500, "Failed to save citation gaps");
        } else {
          const { error: gapError } = await supabaseAdmin
            .from("citation_gaps")
            .insert({
              brand_id: brandId,
              competitor_name: "–",
              source_url: url,
              source_type: analyses[0].source_type,
              opportunity_score: frequency,
              status: "open",
              run_id: runId,
            });
          if (gapError) throw new AppError(500, "Failed to save citation gap");
        }
      }
    }),
  );

  const report = await computeReport(brandId, runId);

  return c.json({
    success: true,
    run_id: runId,
    visibility_score: report.visibility_score,
    gap_score: report.gap_score,
  });
});

// POST /api/brands/:id/onboard — retry a failed or stale onboarding job
app.post("/:id/onboard", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand, error } = await supabaseAdmin
    .from("brands")
    .select("id, status, updated_at")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();
  if (error || !brand) throw new AppError(404, "Brand not found");
  if (
    brand.status !== "error" &&
    !isBrandOnboardingStale(brand.status, brand.updated_at)
  ) {
    throw new AppError(409, "Only failed or stalled onboarding can be retried");
  }

  const retryStartedAt = new Date().toISOString();

  const { data: transitioned, error: transitionError } = await supabaseAdmin
    .from("brands")
    .update({ status: "pending", updated_at: retryStartedAt })
    .eq("id", brandId)
    .eq("status", brand.status)
    .select("id")
    .maybeSingle();
  if (transitionError) throw new AppError(500, "Failed to retry onboarding");
  if (!transitioned)
    throw new AppError(409, "Brand state changed; refresh and try again");

  try {
    await dispatchBrandOnboarding(brandId);
  } catch (dispatchError) {
    console.error("Failed to retry brand onboarding workflow:", dispatchError);
    await supabaseAdmin
      .from("brands")
      .update({ status: brand.status, updated_at: brand.updated_at })
      .eq("id", brandId);
    throw new AppError(
      503,
      "Failed to restart brand onboarding. Please try again.",
    );
  }

  return c.json({ status: "pending" });
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

  const { data: transitioned, error: transitionError } = await supabaseAdmin
    .from("brands")
    .update({ status: "running" })
    .eq("id", brandId)
    .eq("status", brand.status)
    .select("id")
    .maybeSingle();
  if (transitionError) throw new AppError(500, "Failed to start monitoring");
  if (!transitioned)
    throw new AppError(409, "A job is already running for this brand");

  const runId = crypto.randomUUID();
  try {
    await tasks.trigger("run-monitoring", { brandId, runId });
  } catch (err) {
    console.error("Failed to trigger run-monitoring job:", err);
    await supabaseAdmin
      .from("brands")
      .update({ status: brand.status })
      .eq("id", brandId);
    throw new AppError(503, "Failed to start monitoring. Please try again.");
  }

  return c.json({ run_id: runId, status: "running" });
});

export { app as brandRoutes };
