import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import { updateReinforcementSchema } from "@covable/shared";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

// GET /api/reinforcement?page_id=X
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.query("page_id");
  if (!pageId) throw new AppError(400, "page_id is required");

  // Verify ownership
  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  const { data, error } = await supabaseAdmin
    .from("reinforcement_jobs")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch reinforcement jobs");
  return c.json(data ?? []);
});

// POST /api/reinforcement/:id/approve
app.post("/:id/approve", async (c) => {
  const userId = c.get("userId") as string;
  const jobId = c.req.param("id");

  const { data: job } = await supabaseAdmin
    .from("reinforcement_jobs")
    .select("id, page_id, channel, reddit_post_id, status, pages!inner(brand_id, brands!inner(user_id))")
    .eq("id", jobId)
    .single();

  if (!job) throw new AppError(404, "Reinforcement job not found");
  if ((job as any).pages?.brands?.user_id !== userId) throw new AppError(403, "Forbidden");
  if (job.status === "posted") throw new AppError(409, "Already posted");

  await supabaseAdmin
    .from("reinforcement_jobs")
    .update({ status: "approved" })
    .eq("id", jobId);

  // If it's a Reddit job, schedule the post
  if (job.channel === "reddit" && job.reddit_post_id) {
    const brandId = (job as any).pages?.brand_id;
    const { data: redditPost } = await supabaseAdmin
      .from("reddit_posts")
      .select("subreddit, monitor_id, reddit_monitors!inner(user_id)")
      .eq("id", job.reddit_post_id)
      .single();

    if (redditPost) {
      const monitorUserId = (redditPost as any).reddit_monitors?.user_id;

      tasks
        .trigger("reddit-poster", {
          redditPostId: job.reddit_post_id,
          userId: monitorUserId ?? userId,
        })
        .catch((err) => console.error("Failed to trigger reddit-poster:", err.message));
    }
  }

  return c.json({ success: true, jobId });
});

// PATCH /api/reinforcement/:id — edit variant before posting
app.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const jobId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateReinforcementSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: job } = await supabaseAdmin
    .from("reinforcement_jobs")
    .select("id, status, pages!inner(brands!inner(user_id))")
    .eq("id", jobId)
    .single();

  if (!job) throw new AppError(404, "Reinforcement job not found");
  if ((job as any).pages?.brands?.user_id !== userId) throw new AppError(403, "Forbidden");
  if (job.status === "posted") throw new AppError(409, "Cannot edit a posted job");

  const { data, error } = await supabaseAdmin
    .from("reinforcement_jobs")
    .update(parsed.data)
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw new AppError(500, "Failed to update reinforcement job");
  return c.json(data);
});

// POST /api/reinforcement/trigger?page_id=X — manually kick off reinforcement
app.post("/trigger", async (c) => {
  const userId = c.get("userId") as string;
  const pageId = c.req.query("page_id");
  if (!pageId) throw new AppError(400, "page_id is required");

  const { data: page } = await supabaseAdmin
    .from("pages")
    .select("id, status, brands!inner(user_id)")
    .eq("id", pageId)
    .single();

  if (!page) throw new AppError(404, "Page not found");
  if ((page as any).brands?.user_id !== userId) throw new AppError(403, "Forbidden");

  tasks
    .trigger("reinforce-page", { pageId })
    .catch((err) => console.error("Failed to trigger reinforce-page:", err.message));

  return c.json({ status: "triggered" });
});

export { app as reinforcementRoutes };
