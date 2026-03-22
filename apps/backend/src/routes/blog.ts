import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { checkPlan } from "../middleware/requirePlan.js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// POST /api/blog/:brandId/generate — trigger blog generation job (Scale only)
app.post("/:brandId/generate", async (c) => {
  const user = c.get("user");
  const brandId = c.req.param("brandId");
  const userId = c.get("userId") as string;
  const body = await c.req.json().catch(() => ({}));

  checkPlan(user, "blog");

  // Verify brand belongs to user
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id, status")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");
  if (brand.status !== "ready") throw new AppError(400, "Brand must be in ready state (run monitoring first)");

  const handle = await tasks.trigger("generate-blog", {
    brandId,
    targetQueries: body.targetQueries || [],
  });

  return c.json({ success: true, runId: handle.id });
});

// GET /api/blog/:brandId — list blog posts for a brand
app.get("/:brandId", async (c) => {
  const brandId = c.req.param("brandId");
  const userId = c.get("userId") as string;

  // Verify ownership
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const { data: posts } = await supabaseAdmin
    .from("blog_posts")
    .select("id, title, slug, meta_description, word_count, status, target_queries, visual_directives, aeo_patterns, source_urls, source_titles, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  return c.json({ posts: posts || [] });
});

// GET /api/blog/:brandId/:postId — get single blog post with full content
app.get("/:brandId/:postId", async (c) => {
  const brandId = c.req.param("brandId");
  const postId = c.req.param("postId");
  const userId = c.get("userId") as string;

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const { data: post } = await supabaseAdmin
    .from("blog_posts")
    .select("*")
    .eq("id", postId)
    .eq("brand_id", brandId)
    .single();

  if (!post) throw new AppError(404, "Blog post not found");

  return c.json({ post });
});

// PATCH /api/blog/:brandId/:postId — update status or content (Scale only)
app.patch("/:brandId/:postId", async (c) => {
  const user = c.get("user");
  const brandId = c.req.param("brandId");
  const postId = c.req.param("postId");
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  checkPlan(user, "blog");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const allowed = ["status", "content_markdown", "title", "meta_description"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data: post } = await supabaseAdmin
    .from("blog_posts")
    .update(updates)
    .eq("id", postId)
    .eq("brand_id", brandId)
    .select("id, status, title")
    .single();

  return c.json({ post });
});

export default app;
