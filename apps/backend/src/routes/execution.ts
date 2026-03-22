import { Hono } from "hono";
import { tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { checkPlan } from "../middleware/requirePlan.js";
import { getGapQueue } from "../services/gap-query.service.js";
import { startExecutionSchema, updateContentSchema, deployContentSchema } from "@covable/shared";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

async function verifyBrandOwnership(brandId: string, userId: string) {
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();
  if (!brand) throw new AppError(404, "Brand not found");
  return brand;
}

// GET /:id/gap-queue
app.get("/:id/gap-queue", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  await verifyBrandOwnership(brandId, userId);

  const queue = await getGapQueue(brandId);
  return c.json(queue);
});

// POST /:id/execution — Growth/Scale only
app.post("/:id/execution", async (c) => {
  const user = c.get("user");
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");
  checkPlan(user, "execution");

  await verifyBrandOwnership(brandId, userId);

  const body = await c.req.json();
  const parsed = startExecutionSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { citation_gap_id } = parsed.data;

  // Verify gap belongs to this brand
  const { data: gap } = await supabaseAdmin
    .from("citation_gaps")
    .select("id")
    .eq("id", citation_gap_id)
    .eq("brand_id", brandId)
    .single();

  if (!gap) throw new AppError(404, "Citation gap not found");

  // Check for existing non-failed job to prevent duplicates
  const { data: existingJob } = await supabaseAdmin
    .from("execution_jobs")
    .select("id, status")
    .eq("citation_gap_id", citation_gap_id)
    .in("status", ["pending", "running", "complete"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existingJob) {
    return c.json({ job_id: existingJob.id, status: existingJob.status });
  }

  // Create execution job
  const { data: job, error } = await supabaseAdmin
    .from("execution_jobs")
    .insert({
      brand_id: brandId,
      citation_gap_id,
      status: "pending",
      platform_type: "reddit",
    })
    .select("id")
    .single();

  if (error || !job) throw new AppError(500, "Failed to create execution job");

  // Trigger Trigger.dev job
  await tasks.trigger("generate-content", {
    executionJobId: job.id,
    brandId,
  });

  return c.json({ job_id: job.id, status: "pending" }, 201);
});

// GET /:id/execution/:jobId
app.get("/:id/execution/:jobId", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");
  const jobId = c.req.param("jobId");

  await verifyBrandOwnership(brandId, userId);

  const { data: job } = await supabaseAdmin
    .from("execution_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("brand_id", brandId)
    .single();

  if (!job) throw new AppError(404, "Execution job not found");

  // Include latest content if available
  const { data: content } = await supabaseAdmin
    .from("generated_content")
    .select("*")
    .eq("execution_job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return c.json({ ...job, content: content || null });
});

// GET /:id/content/:contentId
app.get("/:id/content/:contentId", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");
  const contentId = c.req.param("contentId");

  await verifyBrandOwnership(brandId, userId);

  const { data: content } = await supabaseAdmin
    .from("generated_content")
    .select(`
      *,
      execution_jobs!inner(brand_id, citation_gap_id)
    `)
    .eq("id", contentId)
    .eq("execution_jobs.brand_id", brandId)
    .single();

  if (!content) throw new AppError(404, "Content not found");

  return c.json(content);
});

// PUT /:id/content/:contentId — Growth/Scale only
app.put("/:id/content/:contentId", async (c) => {
  const user = c.get("user");
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");
  checkPlan(user, "execution");
  const contentId = c.req.param("contentId");

  await verifyBrandOwnership(brandId, userId);

  const body = await c.req.json();
  const parsed = updateContentSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  // Verify content belongs to this brand
  const { data: existing } = await supabaseAdmin
    .from("generated_content")
    .select("execution_jobs!inner(brand_id)")
    .eq("id", contentId)
    .eq("execution_jobs.brand_id", brandId)
    .single();

  if (!existing) throw new AppError(404, "Content not found");

  const { data: updated, error } = await supabaseAdmin
    .from("generated_content")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", contentId)
    .select()
    .single();

  if (error) throw new AppError(500, "Failed to update content");

  return c.json(updated);
});

// POST /:id/content/:contentId/deploy — Growth/Scale only
app.post("/:id/content/:contentId/deploy", async (c) => {
  const user = c.get("user");
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");
  checkPlan(user, "execution");
  const contentId = c.req.param("contentId");

  await verifyBrandOwnership(brandId, userId);

  const body = await c.req.json();
  const parsed = deployContentSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  // Verify content belongs to this brand
  const { data: existing } = await supabaseAdmin
    .from("generated_content")
    .select("execution_jobs!inner(brand_id)")
    .eq("id", contentId)
    .eq("execution_jobs.brand_id", brandId)
    .single();

  if (!existing) throw new AppError(404, "Content not found");

  const { data: updated, error } = await supabaseAdmin
    .from("generated_content")
    .update({
      status: "deployed",
      deployed_url: parsed.data.deployed_url,
      deployed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contentId)
    .select()
    .single();

  if (error) throw new AppError(500, "Failed to mark content as deployed");

  return c.json(updated);
});

// GET /:id/outcomes
app.get("/:id/outcomes", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  await verifyBrandOwnership(brandId, userId);

  const { data: outcomes, error } = await supabaseAdmin
    .from("gap_outcomes")
    .select(`
      *,
      citation_gaps!inner(brand_id, source_url, competitor_name, source_type),
      generated_content(content_body, deployed_url)
    `)
    .eq("citation_gaps.brand_id", brandId)
    .order("detected_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch outcomes");

  return c.json(outcomes || []);
});

export { app as executionRoutes };
