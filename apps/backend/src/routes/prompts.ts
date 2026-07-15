import { Hono } from "hono";
import { PLAN_LIMITS, updatePromptsSchema } from "@covable/shared";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { checkPromptLimit, getPlanTier } from "../middleware/requirePlan.js";
import { generatePrompts } from "../services/prompt-generator.service.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();
const immediateReplaceSchema = z.object({
  prompts: z
    .array(
      z.object({
        text: z.string().min(1),
        is_active: z.boolean().default(true),
        category: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

function nextMondayAt9UTC(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

// GET /api/brands/:id/prompts
app.get("/:id/prompts", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

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

  const activeCount = parsed.data.prompts.filter((p) => p.is_active).length;
  await checkPromptLimit(userId, brandId, activeCount);

  const suppliedIds = parsed.data.prompts
    .map((prompt) => prompt.id)
    .filter((id): id is string => Boolean(id));
  if (new Set(suppliedIds).size !== suppliedIds.length) {
    throw new AppError(400, "Prompt IDs must be unique");
  }
  if (suppliedIds.length) {
    const { data: ownedPrompts, error: promptOwnershipError } =
      await supabaseAdmin
        .from("prompts")
        .select("id")
        .eq("brand_id", brandId)
        .in("id", suppliedIds);
    if (promptOwnershipError)
      throw new AppError(500, "Failed to validate prompts");
    if ((ownedPrompts ?? []).length !== suppliedIds.length) {
      throw new AppError(400, "Every prompt ID must belong to this brand");
    }
  }

  // Prompt changes are staged as pending — applied next Monday by weekly cron
  const pendingPrompts = parsed.data.prompts.map((p) => ({
    id: p.id ?? crypto.randomUUID(),
    text: p.text,
    is_active: p.is_active,
    category: p.category ?? null,
  }));

  const effectiveAt = nextMondayAt9UTC().toISOString();

  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      pending_prompts: pendingPrompts,
      pending_prompts_effective_at: effectiveAt,
    })
    .eq("id", brandId);

  if (error) throw new AppError(500, "Failed to stage prompt changes");

  return c.json({
    pending: true,
    effective_at: effectiveAt,
    prompts: pendingPrompts,
  });
});

// POST /api/brands/:id/prompts/replace — replace prompts immediately (Hermes intake path)
app.post("/:id/prompts/replace", async (c) => {
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
  const parsed = immediateReplaceSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.errors[0].message);
  }

  const normalizedPrompts = parsed.data.prompts
    .map((p) => ({
      text: p.text.trim(),
      is_active: p.is_active ?? true,
      category: p.category ?? null,
    }))
    .filter((p) => p.text.length > 0);

  if (!normalizedPrompts.length) {
    throw new AppError(400, "At least one prompt is required");
  }

  const activeCount = normalizedPrompts.filter((p) => p.is_active).length;
  await checkPromptLimit(userId, brandId, activeCount);

  const inserts = normalizedPrompts.map((p) => ({
    brand_id: brandId,
    text: p.text,
    category: p.category,
    is_active: p.is_active,
  }));

  const prompts = await replaceBrandPrompts(brandId, inserts, true);

  return c.json({ prompts, count: prompts?.length ?? 0, replaced: true });
});

// POST /api/brands/:id/prompts/regenerate — AI-regenerate prompts for this brand
app.post("/:id/prompts/regenerate", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.param("id");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  if (!brand.name || !brand.category || !brand.description) {
    throw new AppError(
      400,
      "Brand data is incomplete. Please complete onboarding first.",
    );
  }

  // Generate new prompts via AI
  const tier = await getPlanTier(userId);
  const promptLimit = Math.min(PLAN_LIMITS[tier].maxPrompts, 25);
  const generated = await generatePrompts(
    brand.name,
    brand.category,
    brand.description,
    brand.competitors ?? [],
    promptLimit,
  );

  const inserts = generated.map((p) => ({
    brand_id: brandId,
    text: p.text,
    category: p.category,
    is_active: true,
  }));

  if (!inserts.length) {
    throw new AppError(502, "Prompt generation returned no prompts");
  }

  const prompts = await replaceBrandPrompts(brandId, inserts, true);

  return c.json({ prompts, count: prompts?.length ?? 0 });
});

async function replaceBrandPrompts(
  brandId: string,
  inserts: {
    brand_id: string;
    text: string;
    category: string | null;
    is_active: boolean;
  }[],
  clearPending: boolean,
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("prompts")
    .select("id")
    .eq("brand_id", brandId);
  if (existingError) throw new AppError(500, "Failed to load existing prompts");

  const { data: brandState, error: brandStateError } = await supabaseAdmin
    .from("brands")
    .select("pending_prompts, pending_prompts_effective_at")
    .eq("id", brandId)
    .single();
  if (brandStateError || !brandState) {
    throw new AppError(500, "Failed to load staged prompt changes");
  }

  // Insert the replacement first so a transient database failure never destroys
  // the brand's only usable prompt set.
  const { data: prompts, error: insertError } = await supabaseAdmin
    .from("prompts")
    .insert(inserts)
    .select();
  if (insertError || !prompts)
    throw new AppError(500, "Failed to save replacement prompts");

  const newIds = prompts.map((prompt) => prompt.id);
  const rollbackNewPrompts = async () => {
    if (!newIds.length) return;
    const { error } = await supabaseAdmin
      .from("prompts")
      .delete()
      .in("id", newIds);
    if (error)
      console.error("Failed to roll back replacement prompts:", error.message);
  };

  if (clearPending) {
    const { error: pendingError } = await supabaseAdmin
      .from("brands")
      .update({ pending_prompts: null, pending_prompts_effective_at: null })
      .eq("id", brandId);
    if (pendingError) {
      await rollbackNewPrompts();
      throw new AppError(500, "Failed to clear staged prompt changes");
    }
  }

  const oldIds = (existing ?? []).map((prompt) => prompt.id);
  if (oldIds.length) {
    const { error: deleteError } = await supabaseAdmin
      .from("prompts")
      .delete()
      .in("id", oldIds);
    if (deleteError) {
      await rollbackNewPrompts();
      if (clearPending) {
        const { error: restorePendingError } = await supabaseAdmin
          .from("brands")
          .update({
            pending_prompts: brandState.pending_prompts,
            pending_prompts_effective_at:
              brandState.pending_prompts_effective_at,
          })
          .eq("id", brandId);
        if (restorePendingError) {
          console.error(
            "Failed to restore staged prompt changes:",
            restorePendingError.message,
          );
        }
      }
      throw new AppError(500, "Failed to replace existing prompts");
    }
  }

  return prompts;
}

export { app as promptRoutes };
