import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import {
  createPromptV2Schema,
  updatePromptV2Schema,
  seedPromptsV2Schema,
} from "@covable/shared";
import {
  prioritizePrompts,
  seedPromptsFromBrand,
} from "../services/prompt-intelligence.service.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/prompts-v2?brand_id=X&min_gap_score=0&intent=comparison
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.query("brand_id");
  const minGapScore = parseFloat(c.req.query("min_gap_score") ?? "0");
  const intent = c.req.query("intent");

  if (!brandId) throw new AppError(400, "brand_id is required");

  // Verify brand ownership
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  let query = supabaseAdmin
    .from("prompts_v2")
    .select("*")
    .eq("brand_id", brandId)
    .gte("gap_score", minGapScore)
    .order("priority_score", { ascending: false });

  if (intent) {
    query = query.eq("intent", intent);
  }

  const { data, error } = await query;
  if (error) throw new AppError(500, "Failed to fetch prompts");

  return c.json(data ?? []);
});

// POST /api/prompts-v2
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createPromptV2Schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", parsed.data.brand_id)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const { data, error } = await supabaseAdmin
    .from("prompts_v2")
    .insert({
      ...parsed.data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new AppError(500, `Failed to create prompt: ${error.message}`);

  return c.json(data, 201);
});

// PATCH /api/prompts-v2/:id
app.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const promptId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updatePromptV2Schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  // Verify ownership via brand join
  const { data: existing } = await supabaseAdmin
    .from("prompts_v2")
    .select("id, brand_id, brands!inner(user_id)")
    .eq("id", promptId)
    .single();

  if (!existing) throw new AppError(404, "Prompt not found");
  const brandUserId = (existing as any).brands?.user_id;
  if (brandUserId !== userId) throw new AppError(403, "Forbidden");

  const { data, error } = await supabaseAdmin
    .from("prompts_v2")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", promptId)
    .select()
    .single();

  if (error) throw new AppError(500, `Failed to update prompt: ${error.message}`);

  return c.json(data);
});

// DELETE /api/prompts-v2/:id
app.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const promptId = c.req.param("id");

  const { data: existing } = await supabaseAdmin
    .from("prompts_v2")
    .select("id, brands!inner(user_id)")
    .eq("id", promptId)
    .single();

  if (!existing) throw new AppError(404, "Prompt not found");
  if ((existing as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { error } = await supabaseAdmin.from("prompts_v2").delete().eq("id", promptId);
  if (error) throw new AppError(500, "Failed to delete prompt");

  return c.json({ success: true });
});

// POST /api/prompts-v2/:id/variants/generate
app.post("/:id/variants/generate", async (c) => {
  const userId = c.get("userId") as string;
  const promptId = c.req.param("id");

  const { data: prompt } = await supabaseAdmin
    .from("prompts_v2")
    .select("id, text, brands!inner(user_id)")
    .eq("id", promptId)
    .single();

  if (!prompt) throw new AppError(404, "Prompt not found");
  if ((prompt as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  tasks
    .trigger("prompt-discovery", { promptId, generateVariants: true })
    .catch((err) => console.error("Failed to trigger prompt-discovery:", err.message));

  return c.json({ status: "triggered" });
});

// POST /api/prompts-v2/seed — import from existing prompts_v1 or CSV body
app.post("/seed", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  // If CSV-style array payload
  const csvParsed = seedPromptsV2Schema.safeParse(body);
  if (csvParsed.success) {
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("id", csvParsed.data.brand_id)
      .eq("user_id", userId)
      .single();

    if (!brand) throw new AppError(404, "Brand not found");

    const rows = csvParsed.data.prompts.map((p) => ({
      brand_id: csvParsed.data.brand_id,
      text: p.text,
      intent: p.intent ?? "recommendation",
      vertical: p.vertical ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from("prompts_v2")
      .insert(rows)
      .select("id");

    if (error) throw new AppError(500, `Failed to seed prompts: ${error.message}`);
    return c.json({ inserted: data?.length ?? 0 });
  }

  // Otherwise seed from existing prompts_v1 for a brand
  const brandIdSchema = z.object({ brand_id: z.string().uuid() });
  const brandParsed = brandIdSchema.safeParse(body);
  if (!brandParsed.success) throw new AppError(400, "brand_id is required");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandParsed.data.brand_id)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const inserted = await seedPromptsFromBrand(brandParsed.data.brand_id);
  return c.json({ inserted });
});

// POST /api/prompts-v2/prioritize — recalculate gap scores for all brand prompts
app.post("/prioritize", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = z.object({ brand_id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) throw new AppError(400, "brand_id is required");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", parsed.data.brand_id)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  await prioritizePrompts(parsed.data.brand_id);
  return c.json({ success: true });
});

export { app as promptsV2Routes };
