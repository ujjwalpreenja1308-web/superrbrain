import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { createPublisherSchema, updatePublisherSchema } from "@covable/shared";
import { encryptCredentials } from "../services/credentials.service.js";
import { testPublisherConnection } from "../services/publishers/index.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/publishers?brand_id=X
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.query("brand_id");
  if (!brandId) throw new AppError(400, "brand_id is required");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();
  if (!brand) throw new AppError(404, "Brand not found");

  const { data, error } = await supabaseAdmin
    .from("publishers")
    .select("id, brand_id, type, config, is_active, posts_today, last_post_at, created_at, updated_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch publishers");
  return c.json(data ?? []);
});

// POST /api/publishers
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createPublisherSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", parsed.data.brand_id)
    .eq("user_id", userId)
    .single();
  if (!brand) throw new AppError(404, "Brand not found");

  // Encrypt credentials before storing
  const encryptedCredentials = encryptCredentials(JSON.stringify(parsed.data.credentials));

  const defaultConfig = {
    posts_per_day: 2,
    min_interval_hours: 6,
    auto_publish: false,
    ...parsed.data.config,
  };

  const { data, error } = await supabaseAdmin
    .from("publishers")
    .insert({
      brand_id: parsed.data.brand_id,
      type: parsed.data.type,
      credentials_encrypted: { encrypted: encryptedCredentials },
      config: defaultConfig,
      is_active: true,
      posts_today: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, brand_id, type, config, is_active, posts_today, last_post_at, created_at, updated_at")
    .single();

  if (error) throw new AppError(500, `Failed to create publisher: ${error.message}`);
  return c.json(data, 201);
});

// PATCH /api/publishers/:id
app.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const publisherId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updatePublisherSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: existing } = await supabaseAdmin
    .from("publishers")
    .select("id, config, brands!inner(user_id)")
    .eq("id", publisherId)
    .single();

  if (!existing) throw new AppError(404, "Publisher not found");
  if ((existing as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const updatedConfig = parsed.data.config
    ? { ...(existing.config as object), ...parsed.data.config }
    : undefined;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updatedConfig) updatePayload.config = updatedConfig;
  if (parsed.data.is_active !== undefined) updatePayload.is_active = parsed.data.is_active;

  const { data, error } = await supabaseAdmin
    .from("publishers")
    .update(updatePayload)
    .eq("id", publisherId)
    .select("id, brand_id, type, config, is_active, posts_today, last_post_at, created_at, updated_at")
    .single();

  if (error) throw new AppError(500, "Failed to update publisher");
  return c.json(data);
});

// DELETE /api/publishers/:id
app.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const publisherId = c.req.param("id");

  const { data: existing } = await supabaseAdmin
    .from("publishers")
    .select("id, brands!inner(user_id)")
    .eq("id", publisherId)
    .single();

  if (!existing) throw new AppError(404, "Publisher not found");
  if ((existing as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { error } = await supabaseAdmin.from("publishers").delete().eq("id", publisherId);
  if (error) throw new AppError(500, "Failed to delete publisher");

  return c.json({ success: true });
});

// POST /api/publishers/:id/test — validate credentials
app.post("/:id/test", async (c) => {
  const userId = c.get("userId") as string;
  const publisherId = c.req.param("id");

  const { data: publisher } = await supabaseAdmin
    .from("publishers")
    .select("id, type, credentials_encrypted, brands!inner(user_id)")
    .eq("id", publisherId)
    .single();

  if (!publisher) throw new AppError(404, "Publisher not found");
  if ((publisher as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const encryptedCredentials = (publisher.credentials_encrypted as { encrypted: string }).encrypted;

  try {
    await testPublisherConnection(publisher.type, encryptedCredentials);
    return c.json({ success: true });
  } catch (err: any) {
    throw new AppError(422, err.message);
  }
});

export { app as publisherRoutes };
