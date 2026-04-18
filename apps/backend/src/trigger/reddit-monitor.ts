import { task, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { scrapeRedditKeywords } from "../services/apify.service.js";
import { checkGuardrails, pickReplyType } from "../services/reddit-guardrails.service.js";
import { openai } from "../lib/openai.js";

export const redditMonitorTask = task({
  id: "reddit-monitor",
  run: async (payload: { monitorId: string; userId: string }) => {
    const { monitorId, userId } = payload;

    const { data: monitor, error } = await supabaseAdmin
      .from("reddit_monitors")
      .select("*, brands(name, description, country)")
      .eq("id", monitorId)
      .eq("is_active", true)
      .single();

    if (error || !monitor) {
      throw new Error(`Monitor ${monitorId} not found or inactive`);
    }

    const brand = (monitor as any).brands as {
      name: string;
      description: string | null;
      country: string | null;
    };

    const posts = await scrapeRedditKeywords(
      monitor.keywords,
      monitor.subreddits,
      brand.country ?? undefined
    );

    if (posts.length === 0) return { inserted: 0, scheduled: 0 };

    // Dedup against already-seen post IDs this run
    const scrapedIds = posts.map((p) => p.id);
    const { data: existing } = await supabaseAdmin
      .from("reddit_posts")
      .select("post_id")
      .eq("monitor_id", monitorId)
      .in("post_id", scrapedIds);

    const existingIds = new Set((existing ?? []).map((r: any) => r.post_id));
    const newPosts = posts.filter((p) => !existingIds.has(p.id));

    if (newPosts.length === 0) return { inserted: 0, scheduled: 0 };

    let scheduled = 0;

    const rows = await Promise.all(
      newPosts.map(async (post) => {
        const matchedKeyword = findMatchedKeyword(post, monitor.keywords);
        const replyType = pickReplyType();
        let aiReply: string | null = null;

        try {
          aiReply = await generateReply(post, brand, matchedKeyword, replyType);
        } catch (err) {
          console.error(`Reply generation failed for post ${post.id}:`, err);
        }

        // In automode, check guardrails and schedule posting with delay
        let replyStatus = "pending";
        let scheduledFor: string | null = null;
        let guardrailSkipReason: string | null = null;

        if (monitor.automode && aiReply) {
          const guard = await checkGuardrails(monitor.brand_id, post.subreddit);
          if (guard.allowed) {
            replyStatus = "approved";
            scheduledFor = guard.scheduledFor.toISOString();
          } else {
            guardrailSkipReason = guard.reason;
          }
        }

        return {
          monitor_id: monitorId,
          brand_id: monitor.brand_id,
          post_id: post.id,
          post_url: post.url,
          post_title: post.title,
          post_body: post.body ?? null,
          subreddit: post.subreddit,
          matched_keyword: matchedKeyword,
          author: post.author ?? null,
          upvotes: post.upvotes ?? null,
          comment_count: post.numberOfComments ?? null,
          posted_at: post.createdAt ?? null,
          ai_reply: aiReply,
          reply_type: replyType,
          reply_status: replyStatus,
          scheduled_for: scheduledFor,
          guardrail_skip_reason: guardrailSkipReason,
          _shouldSchedule: replyStatus === "approved" && scheduledFor !== null,
        };
      })
    );

    // Strip internal flag before insert
    const insertRows = rows.map(({ _shouldSchedule: _, ...row }) => row);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("reddit_posts")
      .upsert(insertRows, { onConflict: "monitor_id,post_id", ignoreDuplicates: true })
      .select("id, post_id, scheduled_for, reply_status");

    if (insertError) {
      throw new Error(`Failed to insert reddit posts: ${insertError.message}`);
    }

    // Schedule poster tasks for automode-approved rows
    // Match inserted rows back to the source rows by post_id (positional index is unreliable after upsert dedup)
    const insertedByPostId = new Map((inserted ?? []).map((r: any) => [r.post_id, r]));

    for (const row of rows) {
      if (!row._shouldSchedule) continue;
      const insertedRow = insertedByPostId.get(row.post_id);
      if (!insertedRow?.id) continue;

      const delayMs = new Date(row.scheduled_for!).getTime() - Date.now();

      tasks
        .trigger(
          "reddit-poster",
          { redditPostId: insertedRow.id, userId },
          { delay: delayMs > 0 ? `${Math.ceil(delayMs / 1000)}s` : "5s" }
        )
        .catch((err) =>
          console.error(`Failed to schedule reddit-poster for ${insertedRow.id}:`, err.message)
        );

      scheduled++;
    }

    return { inserted: rows.length, scheduled };
  },
});

function findMatchedKeyword(post: { title: string; body?: string }, keywords: string[]): string {
  const text = `${post.title} ${post.body ?? ""}`.toLowerCase();
  return keywords.find((k) => text.includes(k.toLowerCase())) ?? keywords[0];
}

async function generateReply(
  post: { title: string; body?: string; subreddit: string },
  brand: { name: string; description: string | null },
  keyword: string,
  replyType: "brand_mention" | "helpful" | "question"
): Promise<string> {
  const context = `Post title: ${post.title}
${post.body ? `Post body: ${post.body}` : ""}
Subreddit: r/${post.subreddit}`;

  const useEmoji = Math.random() < 0.05;

  let prompt: string;

  if (replyType === "helpful") {
    prompt = `Reply to this Reddit post with useful advice. No brand mentions.

${context}

Short, casual, like a real person. under 60 words. no sign-offs.${useEmoji ? " 1 emoji max." : ""}`;
  } else if (replyType === "question") {
    prompt = `Reply to this Reddit post with one genuine follow-up question.

${context}

Casual, curious, under 30 words. no brand mentions.`;
  } else {
    prompt = `Reply to this Reddit post. Mention ${brand.name} only if it naturally fits.

${context}

About ${brand.name}: ${brand.description ?? "relevant brand"}

Short and casual, under 60 words. sound like a person not a marketer.${useEmoji ? " 1 emoji max." : ""}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 250,
    temperature: 0.9,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
