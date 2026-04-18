import { supabaseAdmin } from "../lib/supabase.js";

const MAX_POSTS_PER_DAY = 4;
const MIN_GAP_BETWEEN_POSTS_MS = 2 * 60 * 60 * 1000; // 2 hours

// Posting window: 9am–10pm in a 24h spread
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 22;

export type GuardrailResult =
  | { allowed: true; scheduledFor: Date }
  | { allowed: false; reason: string };

/**
 * Checks all guardrails and, if allowed, returns the randomised time to post.
 * All times are relative to UTC.
 */
export async function checkGuardrails(
  brandId: string,
  subreddit: string
): Promise<GuardrailResult> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  // 1. Daily cap — count posts already sent today across all monitors for this brand
  const { count } = await supabaseAdmin
    .from("reddit_posts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("reply_status", "posted")
    .gte("posted_at_reddit", startOfDay.toISOString());

  if ((count ?? 0) >= MAX_POSTS_PER_DAY) {
    return { allowed: false, reason: `Daily cap of ${MAX_POSTS_PER_DAY} posts reached` };
  }

  // 2. Minimum gap — when was the last post sent?
  const { data: lastPost } = await supabaseAdmin
    .from("reddit_posts")
    .select("posted_at_reddit")
    .eq("brand_id", brandId)
    .eq("reply_status", "posted")
    .order("posted_at_reddit", { ascending: false })
    .limit(1)
    .single();

  if (lastPost?.posted_at_reddit) {
    const elapsed = now.getTime() - new Date(lastPost.posted_at_reddit).getTime();
    if (elapsed < MIN_GAP_BETWEEN_POSTS_MS) {
      const waitMins = Math.ceil((MIN_GAP_BETWEEN_POSTS_MS - elapsed) / 60_000);
      return { allowed: false, reason: `Minimum 2h gap not met — wait ${waitMins} more minutes` };
    }
  }

  // 3. No back-to-back same subreddit
  const { data: lastSub } = await supabaseAdmin
    .from("reddit_posts")
    .select("subreddit")
    .eq("brand_id", brandId)
    .eq("reply_status", "posted")
    .order("posted_at_reddit", { ascending: false })
    .limit(1)
    .single();

  if (lastSub?.subreddit?.toLowerCase() === subreddit.toLowerCase()) {
    return {
      allowed: false,
      reason: `Last post was also in r/${subreddit} — avoid back-to-back same subreddit`,
    };
  }

  // All checks passed — pick a randomised time within the posting window
  return { allowed: true, scheduledFor: randomPostTime(now) };
}

/**
 * Picks a random time within the posting window, biased away from exact scheduling
 * to avoid bot-pattern detection. Minimum 5 minutes from now.
 */
function randomPostTime(now: Date): Date {
  const candidate = new Date(now);

  // Random offset between 5 minutes and 90 minutes from now
  const offsetMs = (5 + Math.floor(Math.random() * 85)) * 60 * 1000;
  candidate.setTime(candidate.getTime() + offsetMs);

  // Clamp to posting window [WINDOW_START_HOUR, WINDOW_END_HOUR) UTC
  const hour = candidate.getUTCHours();
  if (hour < WINDOW_START_HOUR) {
    candidate.setUTCHours(WINDOW_START_HOUR, Math.floor(Math.random() * 60), 0, 0);
  } else if (hour >= WINDOW_END_HOUR) {
    // Push to next day's window start
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(WINDOW_START_HOUR, Math.floor(Math.random() * 60), 0, 0);
  }

  // Add ±10 min final jitter
  const jitter = (Math.random() * 20 - 10) * 60 * 1000;
  candidate.setTime(candidate.getTime() + jitter);

  return candidate;
}

/**
 * Decides the reply type for this post.
 * 70%: brand-aware reply.
 * 20%: purely helpful advice with no brand mention.
 * 10%: genuine question engaging with the OP.
 */
export function pickReplyType(): "brand_mention" | "helpful" | "question" {
  const r = Math.random();
  if (r < 0.1) return "question";
  if (r < 0.3) return "helpful";
  return "brand_mention";
}
