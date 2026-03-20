import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { analyzePlatform } from "../services/platform-analyzer.service.js";
import { getBrandVoice } from "../services/brand-voice.service.js";
import { runContentPipeline } from "../services/content-generator.service.js";
import { getPromptTextForGap } from "../services/gap-query.service.js";
import type { CitationGap } from "@covable/shared";

export const generateContent = task({
  id: "generate-content",
  run: async (payload: { executionJobId: string; brandId: string }) => {
    const { executionJobId, brandId } = payload;

    // Set status to running
    await supabaseAdmin
      .from("execution_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", executionJobId);

    try {
      // Fetch job to get gap id
      const { data: job } = await supabaseAdmin
        .from("execution_jobs")
        .select("citation_gap_id")
        .eq("id", executionJobId)
        .single();

      if (!job) throw new Error("Execution job not found");

      // Fetch gap
      const { data: gap } = await supabaseAdmin
        .from("citation_gaps")
        .select("*")
        .eq("id", job.citation_gap_id)
        .single();

      if (!gap) throw new Error("Citation gap not found");

      // Fetch brand
      const { data: brand } = await supabaseAdmin
        .from("brands")
        .select("name, url")
        .eq("id", brandId)
        .single();

      if (!brand) throw new Error("Brand not found");

      logger.info(`Generating content for gap: ${gap.source_url}`);

      // Stage 1: Analyze platform (cache-aware)
      logger.info("Stage 1: Analyzing platform...");
      const platformProfile = await analyzePlatform(gap.source_url);

      // Stage 2: Get brand voice (lazy-derive)
      logger.info("Stage 2: Getting brand voice...");
      const brandVoice = await getBrandVoice(brandId);

      // Recover prompt text
      logger.info("Recovering prompt text...");
      const promptText = await getPromptTextForGap(gap.id);

      // Stages 3-5: Generate content with quality pipeline
      logger.info("Stages 3-5: Running content pipeline...");
      const result = await runContentPipeline({
        gap: gap as CitationGap,
        brandName: brand.name || brand.url,
        brandVoice,
        platformProfile,
        promptText,
      });

      logger.info(`Content generated in ${result.generation_attempt} attempt(s)`);

      // Get platform_profile_id
      const { data: platformProfileRecord } = await supabaseAdmin
        .from("platform_profiles")
        .select("id")
        .eq("domain", new URL(gap.source_url).hostname.replace(/^www\./, ""))
        .single();

      // Insert generated content
      await supabaseAdmin.from("generated_content").insert({
        execution_job_id: executionJobId,
        content_type: "reddit_comment",
        content_body: result.content_body,
        angle_used: result.angle_used,
        strategy_reasoning: result.strategy_reasoning,
        platform_profile_id: platformProfileRecord?.id || null,
        generation_attempt: result.generation_attempt,
        quality_scores: result.quality_scores,
        status: "draft",
      });

      // Set job complete
      await supabaseAdmin
        .from("execution_jobs")
        .update({ status: "complete", updated_at: new Date().toISOString() })
        .eq("id", executionJobId);

      return { success: true, executionJobId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Content generation failed: ${message}`);

      await supabaseAdmin
        .from("execution_jobs")
        .update({
          status: "failed",
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", executionJobId);

      throw error;
    }
  },
});
