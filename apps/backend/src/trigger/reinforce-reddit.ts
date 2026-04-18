import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { openai } from "../lib/openai.js";
import { scrapeRedditKeywords } from "../services/apify.service.js";
import { checkGuardrails } from "../services/reddit-guardrails.service.js";
import { canPostToSubreddit } from "../services/reinforcement.service.js";

export const reinforceReddit = task({
  id: "reinforce-reddit",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;

    // Load the reinforcement job for reddit channel
    const { data: job } = await supabaseAdmin
      .from("reinforcement_jobs")
      .select("id, target_phrase, variant_used, status")
      .eq("page_id", pageId)
      .eq("channel", "reddit")
      .eq("status", "pending")
      .single();

    if (!job) {
      logger.info(`No pending reddit reinforcement job for page ${pageId}`);
      return { skipped: true };
    }

    const { data: page } = await supabaseAdmin
      .from("pages")
      .select("id, brand_id, prompt_id, title, brands!inner(name, competitors)")
      .eq("id", pageId)
      .single();

    if (!page) throw new Error(`Page ${pageId} not found`);

    const brandName = (page as any).brands?.name ?? "";
    const competitors: { name: string }[] = (page as any).brands?.competitors ?? [];

    // Find active reddit monitor for this brand
    const { data: monitor } = await supabaseAdmin
      .from("reddit_monitors")
      .select("id, keywords, subreddits, automode, user_id")
      .eq("brand_id", page.brand_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!monitor) {
      logger.info(`No active Reddit monitor for brand ${page.brand_id} — marking as manual`);
      await supabaseAdmin
        .from("reinforcement_jobs")
        .update({ status: "manual" })
        .eq("id", job.id);
      return { skipped: true, reason: "no_monitor" };
    }

    // Search Reddit for relevant threads
    const keywords = monitor.keywords.slice(0, 3);
    const subreddits = monitor.subreddits.slice(0, 3);

    logger.info(`Searching Reddit for reinforcement threads...`);
    let posts: { id: string; url: string; title: string; body?: string; subreddit: string }[] = [];

    try {
      posts = await scrapeRedditKeywords(keywords, subreddits);
    } catch (err: any) {
      logger.error(`Apify search failed: ${err.message}`);
    }

    if (!posts.length) {
      await supabaseAdmin
        .from("reinforcement_jobs")
        .update({ status: "skipped" })
        .eq("id", job.id);
      return { skipped: true, reason: "no_threads" };
    }

    // Pick a thread that hasn't been replied to recently
    let selectedPost = null;
    for (const post of posts.slice(0, 5)) {
      const subName = post.subreddit.replace(/^r\//, "");
      const canPost = await canPostToSubreddit(page.brand_id, subName);
      if (canPost) {
        selectedPost = post;
        break;
      }
    }

    if (!selectedPost) {
      await supabaseAdmin
        .from("reinforcement_jobs")
        .update({ status: "skipped" })
        .eq("id", job.id);
      return { skipped: true, reason: "subreddit_cooldown" };
    }

    // Generate reply using the phrasing variant
    const variant = job.variant_used ?? job.target_phrase;
    const replyResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You're a knowledgeable Reddit user answering a question about tools in this space.
Write a helpful, natural reply. Naturally include this claim: "${variant}"
Rules:
- Sound like a real person, not a marketer
- Answer the actual question first, then mention the brand
- Max 150 words
- No excessive formatting or bullet points
- Do NOT start with "Great question!" or similar filler`,
        },
        {
          role: "user",
          content: `Post title: "${selectedPost.title}"\nPost content: "${selectedPost.body ?? ""}"\n\nBrand to mention: ${brandName}`,
        },
      ],
    });

    const replyText = replyResponse.choices[0].message.content ?? "";

    // Create reddit_posts row (pending or autopost)
    const subreddit = selectedPost.subreddit.replace(/^r\//, "");
    const guard = await checkGuardrails(page.brand_id, subreddit);

    const { data: redditPost, error: rpError } = await supabaseAdmin
      .from("reddit_posts")
      .insert({
        monitor_id: monitor.id,
        brand_id: page.brand_id,
        post_id: selectedPost.id,
        post_url: selectedPost.url,
        post_title: selectedPost.title,
        post_body: selectedPost.body ?? null,
        subreddit,
        matched_keyword: keywords[0] ?? "",
        ai_reply: replyText,
        reply_status: monitor.automode && guard.allowed ? "approved" : "pending",
        reply_type: "brand_mention",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (rpError || !redditPost) {
      logger.error(`Failed to create reddit_posts row: ${rpError?.message}`);
      return { error: "db_insert_failed" };
    }

    // Link reinforcement job to reddit post
    await supabaseAdmin
      .from("reinforcement_jobs")
      .update({
        reddit_post_id: redditPost.id,
        status: monitor.automode && guard.allowed ? "approved" : "pending",
      })
      .eq("id", job.id);

    // If automode, schedule posting
    if (monitor.automode && guard.allowed) {
      const delayMs = guard.scheduledFor.getTime() - Date.now();
      tasks
        .trigger(
          "reddit-poster",
          { redditPostId: redditPost.id, userId: monitor.user_id },
          { delay: delayMs > 0 ? `${Math.ceil(delayMs / 1000)}s` : "5s" }
        )
        .catch((err) => console.error("Failed to schedule reddit-poster:", err.message));
    }

    logger.info(`Reinforcement reddit post created: ${redditPost.id} (automode: ${monitor.automode})`);
    return { redditPostId: redditPost.id, automode: monitor.automode };
  },
});
