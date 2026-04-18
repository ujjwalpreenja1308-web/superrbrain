import { task } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { postRedditComment } from "../services/composio.service.js";
import { checkGuardrails } from "../services/reddit-guardrails.service.js";

/**
 * Executes the actual Reddit comment post for a single reddit_post row.
 * Triggered with a delay calculated by checkGuardrails so the post fires
 * at a randomised human-like time.
 */
export const redditPosterTask = task({
  id: "reddit-poster",
  run: async (payload: { redditPostId: string; userId: string }) => {
    const { redditPostId, userId } = payload;

    // Re-fetch current state — user may have rejected or edited since scheduling
    const { data: post, error } = await supabaseAdmin
      .from("reddit_posts")
      .select("*")
      .eq("id", redditPostId)
      .single();

    if (error || !post) {
      return { skipped: true, reason: "Post not found" };
    }

    if (post.reply_status !== "approved") {
      return { skipped: true, reason: `Status is '${post.reply_status}' — not approved` };
    }

    if (!post.ai_reply) {
      return { skipped: true, reason: "No reply text" };
    }

    // Re-run guardrails at execution time (conditions may have changed since scheduling)
    const guard = await checkGuardrails(post.brand_id, post.subreddit);
    if (!guard.allowed) {
      await supabaseAdmin
        .from("reddit_posts")
        .update({ guardrail_skip_reason: guard.reason })
        .eq("id", redditPostId);
      return { skipped: true, reason: guard.reason };
    }

    // Extract Reddit fullname from post URL: /comments/abc123/ → t3_abc123
    const thingId = extractThingId(post.post_url);
    if (!thingId) {
      await supabaseAdmin
        .from("reddit_posts")
        .update({ guardrail_skip_reason: "Could not extract Reddit post ID from URL" })
        .eq("id", redditPostId);
      return { skipped: true, reason: "Could not extract Reddit post ID" };
    }

    // Post the comment via Composio
    const result = await postRedditComment(userId, thingId, post.ai_reply);

    if (!result.success) {
      await supabaseAdmin
        .from("reddit_posts")
        .update({ guardrail_skip_reason: `Composio error: ${result.error}` })
        .eq("id", redditPostId);
      throw new Error(`Reddit post failed: ${result.error}`);
    }

    // Mark as posted
    await supabaseAdmin
      .from("reddit_posts")
      .update({
        reply_status: "posted",
        posted_url: result.commentUrl ?? null,
        posted_at_reddit: new Date().toISOString(),
      })
      .eq("id", redditPostId);

    return { posted: true, commentUrl: result.commentUrl };
  },
});

function extractThingId(url: string): string | null {
  // Matches /comments/abc123/ in Reddit URLs
  const match = url.match(/\/comments\/([a-z0-9]+)/i);
  if (!match) return null;
  return `t3_${match[1]}`;
}
