import { task, logger, tasks } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { publishPage } from "../services/publishers/index.js";

export const publishPageTask = task({
  id: "publish-page",
  run: async (payload: { pageId: string; publisherId: string }) => {
    const { pageId, publisherId } = payload;

    const { data: page } = await supabaseAdmin
      .from("pages")
      .select("id, title, content_html, tldr, status")
      .eq("id", pageId)
      .single();

    if (!page) throw new Error(`Page ${pageId} not found`);

    const { data: publisher } = await supabaseAdmin
      .from("publishers")
      .select("id, brand_id, type, credentials_encrypted, config, is_active, posts_today, last_post_at")
      .eq("id", publisherId)
      .single();

    if (!publisher) throw new Error(`Publisher ${publisherId} not found`);
    if (!publisher.is_active) throw new Error("Publisher is inactive");

    // Rate limit check
    const config = publisher.config as {
      posts_per_day: number;
      min_interval_hours: number;
    };

    if (publisher.posts_today >= config.posts_per_day) {
      logger.warn(`Rate limit hit for publisher ${publisherId} — re-queuing for 1h`);
      tasks
        .trigger("publish-page", payload, { delay: "1h" })
        .catch(console.error);
      return { status: "rate_limited", requeued: true };
    }

    if (publisher.last_post_at) {
      const hoursSinceLast =
        (Date.now() - new Date(publisher.last_post_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < config.min_interval_hours) {
        const waitHours = Math.ceil(config.min_interval_hours - hoursSinceLast);
        logger.warn(`Min interval not met — re-queuing for ${waitHours}h`);
        tasks
          .trigger("publish-page", payload, { delay: `${waitHours}h` })
          .catch(console.error);
        return { status: "interval_not_met", requeued: true };
      }
    }

    // Create publish job row
    const { data: publishJob, error: jobError } = await supabaseAdmin
      .from("publish_jobs")
      .insert({
        page_id: pageId,
        publisher_id: publisherId,
        status: "publishing",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError) throw new Error(`Failed to create publish job: ${jobError.message}`);

    const encryptedCredentials = (
      publisher.credentials_encrypted as { encrypted: string }
    ).encrypted;

    try {
      logger.info(`Publishing page "${page.title}" to ${publisher.type}`);

      const result = await publishPage(publisher.type, encryptedCredentials, {
        title: page.title,
        content_html: page.content_html,
        tldr: page.tldr,
      });

      const now = new Date().toISOString();

      // Update publish job
      await supabaseAdmin
        .from("publish_jobs")
        .update({
          status: "published",
          platform_post_id: result.platform_post_id,
          platform_url: result.platform_url,
          published_at: now,
        })
        .eq("id", publishJob.id);

      // Update page
      await supabaseAdmin
        .from("pages")
        .update({
          status: "published",
          published_url: result.platform_url,
          published_at: now,
          updated_at: now,
        })
        .eq("id", pageId);

      // Update publisher rate limit counters
      await supabaseAdmin
        .from("publishers")
        .update({
          posts_today: publisher.posts_today + 1,
          last_post_at: now,
          updated_at: now,
        })
        .eq("id", publisherId);

      logger.info(`Published: ${result.platform_url}`);

      // Trigger reinforcement after 24h
      tasks
        .trigger("reinforce-page", { pageId }, { delay: "24h" })
        .catch((err) => console.error("Failed to trigger reinforce-page:", err.message));

      return { status: "published", url: result.platform_url };
    } catch (err: any) {
      logger.error(`Publish failed: ${err.message}`);

      await supabaseAdmin
        .from("publish_jobs")
        .update({ status: "failed", error: err.message })
        .eq("id", publishJob.id);

      throw err;
    }
  },
});
