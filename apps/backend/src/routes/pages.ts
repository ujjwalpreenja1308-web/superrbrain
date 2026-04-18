import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/pages?brand_id=X&status=draft
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const brandId = c.req.query("brand_id");
  const status = c.req.query("status");

  if (!brandId) throw new AppError(400, "brand_id is required");

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .single();
  if (!brand) throw new AppError(404, "Brand not found");

  let query = supabaseAdmin
    .from("pages")
    .select("id, brand_id, prompt_id, title, tldr, cps, cps_breakdown, status, published_url, published_at, citation_rate, last_citation_check_at, created_at, updated_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new AppError(500, "Failed to fetch pages");
  return c.json(data ?? []);
});

// GET /api/pages/:id
app.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("*, brands!inner(user_id, name)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  return c.json(page);
});

// PATCH /api/pages/:id — manual content edits
app.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");
  const body = await c.req.json();

  const schema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    content_html: z.string().optional(),
    tldr: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { data, error } = await supabaseAdmin
    .from("pages")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .select()
    .single();

  if (error) throw new AppError(500, "Failed to update page");

  // Re-score after manual edit
  tasks
    .trigger("score-page", { pageId })
    .catch((err) => console.error("Failed to trigger score-page:", err.message));

  return c.json(data);
});

// POST /api/pages/generate — trigger page generation for a prompt
app.post("/generate", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const schema = z.object({
    prompt_id: z.string().uuid(),
    brand_id: z.string().uuid(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", parsed.data.brand_id)
    .eq("user_id", userId)
    .single();
  if (!brand) throw new AppError(404, "Brand not found");

  // Trigger generation immediately — it will use any existing blueprints,
  // and deconstruct-competitors runs in parallel to enrich future regenerations
  tasks
    .trigger("generate-page", { promptId: parsed.data.prompt_id, brandId: parsed.data.brand_id })
    .catch((err) => console.error("Failed to trigger generate-page:", err.message));

  tasks
    .trigger("deconstruct-competitors", { promptId: parsed.data.prompt_id })
    .catch((err) => console.error("Failed to trigger deconstruct-competitors:", err.message));

  return c.json({ status: "triggered" });
});

// POST /api/pages/:id/publish — manually publish to a CMS
app.post("/:id/publish", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");
  const body = await c.req.json();
  const schema = z.object({ publisher_id: z.string().uuid() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, cps, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  tasks
    .trigger("publish-page", { pageId, publisherId: parsed.data.publisher_id })
    .catch((err) => console.error("Failed to trigger publish-page:", err.message));

  return c.json({ status: "triggered" });
});

// POST /api/pages/:id/score — re-score a page
app.post("/:id/score", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  tasks
    .trigger("score-page", { pageId })
    .catch((err) => console.error("Failed to trigger score-page:", err.message));

  return c.json({ status: "triggered" });
});

// GET /api/pages/:id/versions — version history
app.get("/:id/versions", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { data } = await supabaseAdmin
    .from("page_versions")
    .select("id, cps, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });

  return c.json(data ?? []);
});

// GET /api/pages/:id/citation-runs
app.get("/:id/citation-runs", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.param("id");

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { data } = await supabaseAdmin
    .from("citation_runs")
    .select("id, engine, brand_cited, brand_position, attributed_to_content, ran_at")
    .eq("page_id", pageId)
    .order("ran_at", { ascending: false })
    .limit(50);

  return c.json(data ?? []);
});

export { app as pagesRoutes };
