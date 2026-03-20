import { task, logger } from "@trigger.dev/sdk/v3";
import { supabaseAdmin } from "../lib/supabase.js";
import { runBlogGeneratorPipeline } from "../services/blog-generator.service.js";

export const generateBlog = task({
  id: "generate-blog",
  // Longer timeout — crawling 3 articles + GPT analysis + generation
  queue: { concurrencyLimit: 3 },

  run: async (payload: { brandId: string; targetQueries?: string[] }) => {
    const { brandId, targetQueries } = payload;

    // Fetch brand
    const { data: brand, error } = await supabaseAdmin
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .single();

    if (error || !brand) throw new Error(`Brand not found: ${brandId}`);

    // Derive target queries: use provided ones or fall back to active prompts
    let queries = targetQueries || [];
    if (!queries.length) {
      const { data: prompts } = await supabaseAdmin
        .from("prompts")
        .select("text")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .limit(10);
      queries = prompts?.map((p) => p.text) || [];
    }

    if (!queries.length) throw new Error("No target queries available");

    logger.info(`Generating blog for ${brand.name}`, {
      brandId,
      queries: queries.length,
    });

    // Derive industry from brand website/name (use prompts as proxy)
    const industry = (brand as any).industry || brand.name || "general";

    // Run the pipeline
    const result = await runBlogGeneratorPipeline(
      brandId,
      brand.name || "",
      brand.website || "",
      industry,
      queries
    );

    // Save to blog_posts table
    const { data: post, error: insertError } = await supabaseAdmin
      .from("blog_posts")
      .insert({
        brand_id: brandId,
        source_urls: result.source_urls,
        source_titles: result.source_titles,
        aeo_patterns: result.aeo_patterns,
        title: result.title,
        slug: result.slug,
        meta_description: result.meta_description,
        content_markdown: result.content_markdown,
        target_queries: result.target_queries,
        visual_directives: result.visual_directives,
        word_count: result.word_count,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError) throw new Error(`Failed to save blog post: ${insertError.message}`);

    logger.info(`Blog post generated`, {
      postId: post?.id,
      title: result.title,
      wordCount: result.word_count,
      sourcesUsed: result.source_urls.length,
      visualDirectives: result.visual_directives.length,
    });

    return {
      success: true,
      postId: post?.id,
      title: result.title,
      wordCount: result.word_count,
    };
  },
});
