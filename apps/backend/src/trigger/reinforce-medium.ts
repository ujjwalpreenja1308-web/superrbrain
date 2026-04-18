import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { openai } from "../lib/openai.js";

export const reinforceMedium = task({
  id: "reinforce-medium",
  run: async (payload: { pageId: string }) => {
    const { pageId } = payload;

    const { data: job } = await supabaseAdmin
      .from("reinforcement_jobs")
      .select("id, target_phrase, variant_used, status")
      .eq("page_id", pageId)
      .eq("channel", "medium")
      .eq("status", "pending")
      .single();

    if (!job) {
      logger.info(`No pending medium reinforcement job for page ${pageId}`);
      return { skipped: true };
    }

    const { data: page } = await supabaseAdmin
      .from("pages")
      .select("id, title, published_url, brands!inner(name, category)")
      .eq("id", pageId)
      .single();

    if (!page) throw new Error(`Page ${pageId} not found`);

    const brandName = (page as any).brands?.name ?? "";
    const category = (page as any).brands?.category ?? "this category";
    const variant = job.variant_used ?? job.target_phrase;

    // Generate a 400-word derivative article
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Write a 400-word blog post for Medium that:
1. Discusses the topic of "${category}"
2. Naturally includes this claim: "${variant}"
3. Includes a backlink like: "For a comprehensive comparison, see: ${page.published_url ?? page.title}"
4. Has high entity density — name 5+ tools in the category
5. Reads like a genuine opinion piece, not a sponsored post
6. Starts with a hook — a specific observation or data point
Do NOT use AI writing tells. Write in first person.`,
        },
        {
          role: "user",
          content: `Brand: ${brandName}\nCategory: ${category}`,
        },
      ],
    });

    const articleContent = response.choices[0].message.content ?? "";
    const articleTitle = `My Take on the Best ${category} Tools Right Now`;

    // Mark as manual — actual Medium posting requires OAuth integration
    // Queue the content for the user to post manually
    await supabaseAdmin
      .from("reinforcement_jobs")
      .update({
        status: "manual",
        variant_used: articleContent, // store generated content in variant_used for display
      })
      .eq("id", job.id);

    logger.info(`Medium article generated for manual posting (${articleContent.length} chars)`);

    return {
      jobId: job.id,
      title: articleTitle,
      content: articleContent,
      status: "manual_required",
      note: "Medium OAuth not integrated — content queued for manual posting",
    };
  },
});
