import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { AppError } from "../middleware/error.js";
import { tasks } from "@trigger.dev/sdk/v3";
import {
  initiateRedditConnection,
  getRedditConnection,
  disconnectReddit,
  getRedditUsername,
} from "../services/composio.service.js";
import { checkGuardrails } from "../services/reddit-guardrails.service.js";
import { checkRedditLimits } from "../middleware/requirePlan.js";
import type { AppVariables } from "../types.js";

const app = new Hono<{ Variables: AppVariables }>();

function nextMondayAt9UTC(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun,1=Mon,...
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMonday);
  next.setUTCHours(9, 0, 0, 0);
  return next;
}

const MAX_KEYWORDS = 10;
const MAX_SUBREDDITS = 5;

// ─── Reddit Account Connection ───────────────────────────────────────────────

// GET /api/reddit/connect — start OAuth flow, return redirect URL
app.get("/connect", async (c) => {
  const userId = c.get("userId") as string;
  try {
    const url = await initiateRedditConnection(userId);
    return c.json({ url });
  } catch (err: any) {
    throw new AppError(500, err.message ?? "Failed to initiate Reddit OAuth");
  }
});

// GET /api/reddit/connect/status — check if user has an active Reddit connection
app.get("/connect/status", async (c) => {
  const userId = c.get("userId") as string;
  const connection = await getRedditConnection(userId);
  return c.json({ connected: !!connection, username: connection?.userData?.username ?? null });
});

// GET /api/reddit/connect/callback — Composio OAuth callback, upsert connection record
app.get("/connect/callback", async (c) => {
  const userId = c.get("userId") as string;
  const connection = await getRedditConnection(userId);

  if (!connection) {
    return c.redirect(`${process.env.FRONTEND_URL}/gap-queue?error=connection_failed`);
  }

  // Fetch Reddit username and store connection record
  const username = await getRedditUsername(userId);

  await supabaseAdmin
    .from("reddit_connections")
    .upsert(
      {
        user_id: userId,
        composio_entity_id: `covable_${userId}`,
        reddit_username: username,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      },
      { onConflict: "user_id" }
    );

  return c.redirect(`${process.env.FRONTEND_URL}/gap-queue?connected=1`);
});

// DELETE /api/reddit/connect — disconnect Reddit account
app.delete("/connect", async (c) => {
  const userId = c.get("userId") as string;
  await disconnectReddit(userId);
  await supabaseAdmin
    .from("reddit_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("user_id", userId);
  return c.json({ success: true });
});

// ─── Monitors ────────────────────────────────────────────────────────────────

const createMonitorSchema = z.object({
  brand_id: z.string().uuid(),
  keywords: z.array(z.string().min(1)).min(1).max(MAX_KEYWORDS),
  subreddits: z.array(z.string().min(1)).min(1).max(MAX_SUBREDDITS),
  automode: z.boolean().default(false),
});

const updateMonitorSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(MAX_KEYWORDS).optional(),
  subreddits: z.array(z.string().min(1)).min(1).max(MAX_SUBREDDITS).optional(),
  is_active: z.boolean().optional(),
  automode: z.boolean().optional(),
});

app.post("/monitors", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();
  const parsed = createMonitorSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  await checkRedditLimits(userId, parsed.data.keywords, parsed.data.subreddits);

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", parsed.data.brand_id)
    .eq("user_id", userId)
    .single();

  if (!brand) throw new AppError(404, "Brand not found");

  const { data: monitor, error } = await supabaseAdmin
    .from("reddit_monitors")
    .insert({
      brand_id: parsed.data.brand_id,
      user_id: userId,
      keywords: parsed.data.keywords,
      subreddits: parsed.data.subreddits,
      automode: parsed.data.automode,
    })
    .select()
    .single();

  if (error) throw new AppError(500, `Failed to create monitor: ${error.message}`);

  return c.json(monitor, 201);
});

app.get("/monitors", async (c) => {
  const userId = c.get("userId") as string;

  const { data, error } = await supabaseAdmin
    .from("reddit_monitors")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch monitors");

  return c.json(data ?? []);
});

app.patch("/monitors/:id", async (c) => {
  const userId = c.get("userId") as string;
  const monitorId = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateMonitorSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  // keyword/subreddit changes are staged as pending — applied next Monday by weekly cron
  const hasConfigChange = parsed.data.keywords !== undefined || parsed.data.subreddits !== undefined;
  const isImmediateUpdate = !hasConfigChange; // automode / is_active can apply immediately

  let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (hasConfigChange) {
    if (parsed.data.keywords) await checkRedditLimits(userId, parsed.data.keywords, parsed.data.subreddits ?? []);
    if (parsed.data.keywords !== undefined) updatePayload.pending_keywords = parsed.data.keywords;
    if (parsed.data.subreddits !== undefined) updatePayload.pending_subreddits = parsed.data.subreddits;
    updatePayload.pending_effective_at = nextMondayAt9UTC().toISOString();
  }
  if (parsed.data.automode !== undefined) updatePayload.automode = parsed.data.automode;
  if (parsed.data.is_active !== undefined) updatePayload.is_active = parsed.data.is_active;

  const { data, error } = await supabaseAdmin
    .from("reddit_monitors")
    .update(updatePayload)
    .eq("id", monitorId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) throw new AppError(404, "Monitor not found");

  return c.json({ ...data, _pending_config: hasConfigChange });
});

app.delete("/monitors/:id", async (c) => {
  const userId = c.get("userId") as string;
  const monitorId = c.req.param("id");

  const { error } = await supabaseAdmin
    .from("reddit_monitors")
    .delete()
    .eq("id", monitorId)
    .eq("user_id", userId);

  if (error) throw new AppError(500, "Failed to delete monitor");

  return c.json({ success: true });
});

app.post("/monitors/:id/run", async (c) => {
  const userId = c.get("userId") as string;
  const monitorId = c.req.param("id");

  const { data: monitor } = await supabaseAdmin
    .from("reddit_monitors")
    .select("id")
    .eq("id", monitorId)
    .eq("user_id", userId)
    .single();

  if (!monitor) throw new AppError(404, "Monitor not found");

  try {
    await tasks.trigger("reddit-monitor", { monitorId, userId });
  } catch (err: any) {
    console.error("Failed to trigger reddit-monitor job:", err.message);
    throw new AppError(500, "Failed to start Reddit scan. Please try again.");
  }

  return c.json({ status: "triggered" });
});

app.get("/monitors/:id/posts", async (c) => {
  const userId = c.get("userId") as string;
  const monitorId = c.req.param("id");

  const { data: monitor } = await supabaseAdmin
    .from("reddit_monitors")
    .select("id")
    .eq("id", monitorId)
    .eq("user_id", userId)
    .single();

  if (!monitor) throw new AppError(404, "Monitor not found");

  const { data, error } = await supabaseAdmin
    .from("reddit_posts")
    .select("*")
    .eq("monitor_id", monitorId)
    .order("created_at", { ascending: false });

  if (error) throw new AppError(500, "Failed to fetch posts");

  return c.json(data ?? []);
});

// ─── Posts ───────────────────────────────────────────────────────────────────

// PATCH /api/reddit/posts/:id — approve/reject/edit reply
app.patch("/posts/:id", async (c) => {
  const userId = c.get("userId") as string;
  const postId = c.req.param("id");
  const body = await c.req.json();

  const schema = z.object({
    reply_status: z.enum(["approved", "rejected"]).optional(),
    ai_reply: z.string().min(1).optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.errors[0].message);

  const { data: post } = await supabaseAdmin
    .from("reddit_posts")
    .select("id, monitor_id, brand_id, subreddit, reply_status")
    .eq("id", postId)
    .single();

  if (!post) throw new AppError(404, "Post not found");
  if (post.reply_status === "posted") {
    throw new AppError(409, "Reply already posted — cannot modify");
  }

  const { data: monitor } = await supabaseAdmin
    .from("reddit_monitors")
    .select("id")
    .eq("id", post.monitor_id)
    .eq("user_id", userId)
    .single();

  if (!monitor) throw new AppError(403, "Forbidden");

  // If approving, run guardrails and schedule the poster task
  let scheduledFor: string | null = null;
  if (parsed.data.reply_status === "approved") {
    const guard = await checkGuardrails(post.brand_id, post.subreddit);
    if (!guard.allowed) {
      throw new AppError(429, `Cannot post right now: ${guard.reason}`);
    }
    scheduledFor = guard.scheduledFor.toISOString();
  }

  const { data: updated, error } = await supabaseAdmin
    .from("reddit_posts")
    .update({ ...parsed.data, ...(scheduledFor ? { scheduled_for: scheduledFor } : {}) })
    .eq("id", postId)
    .select()
    .single();

  if (error) throw new AppError(500, "Failed to update post");

  // Schedule the actual posting task with delay
  if (parsed.data.reply_status === "approved" && scheduledFor) {
    const delayMs = new Date(scheduledFor).getTime() - Date.now();
    tasks
      .trigger(
        "reddit-poster",
        { redditPostId: postId, userId },
        { delay: delayMs > 0 ? `${Math.ceil(delayMs / 1000)}s` : "5s" }
      )
      .catch((err) =>
        console.error(`Failed to schedule reddit-poster for ${postId}:`, err.message)
      );
  }

  return c.json({ ...updated, scheduled_for: scheduledFor });
});

export { app as redditRoutes };
