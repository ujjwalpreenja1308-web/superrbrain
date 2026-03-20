import { Hono } from "hono";
import { updatePromptsSchema } from "@superrbrain/shared";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/brands/:id/prompts
app.get("/:id/prompts", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  // Verify ownership
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const { data: prompts, error } = await supabaseAdmin
    .from("prompts")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true });

  if (error) throw new AppError(500, "Failed to fetch prompts");

  return c.json(prompts);
});

// PUT /api/brands/:id/prompts — bulk upsert prompts
app.put("/:id/prompts", async (c) => {
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
  const parsed = updatePromptsSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }

  // Deactivate all existing prompts first
  await supabaseAdmin
    .from("prompts")
    .update({ is_active: false })
    .eq("brand_id", brandId);

  const upserts = parsed.data.prompts.map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    brand_id: brandId,
    text: p.text,
    is_active: p.is_active,
  }));

  const { data: prompts, error } = await supabaseAdmin
    .from("prompts")
    .upsert(upserts, { onConflict: "id" })
    .select();

  if (error) throw new AppError(500, "Failed to update prompts");

  return c.json(prompts);
});

export { app as promptRoutes };
