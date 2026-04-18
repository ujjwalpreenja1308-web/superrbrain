import { z } from "zod";

// ─── Enums ─────────────────────────────────────────────────────────────────

export const PROMPT_INTENTS = [
  "comparison",
  "best_of",
  "how_to",
  "definition",
  "recommendation",
] as const;
export type PromptIntent = (typeof PROMPT_INTENTS)[number];

export const PAGE_STATUSES = [
  "draft",
  "published",
  "winning",
  "stale",
  "failing",
  "archived",
] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const PUBLISHER_TYPES = ["wordpress", "shopify", "webflow"] as const;
export type PublisherType = (typeof PUBLISHER_TYPES)[number];

export const REINFORCEMENT_CHANNELS = ["reddit", "medium", "quora"] as const;
export type ReinforcementChannel = (typeof REINFORCEMENT_CHANNELS)[number];

export const REINFORCEMENT_STATUSES = [
  "pending",
  "approved",
  "posted",
  "failed",
  "manual",
  "skipped",
] as const;
export type ReinforcementStatus = (typeof REINFORCEMENT_STATUSES)[number];

export const PUBLISH_JOB_STATUSES = [
  "queued",
  "publishing",
  "published",
  "failed",
] as const;
export type PublishJobStatus = (typeof PUBLISH_JOB_STATUSES)[number];

// ─── CompetitorBlueprint schema (stored as JSONB) ──────────────────────────

export const competitorBlueprintSchemaShape = z.object({
  headings: z.array(z.object({ level: z.number(), text: z.string() })),
  list_items: z.array(z.string()),
  entities: z.array(z.string()),
  repeated_phrases: z.array(z.string()),
  has_comparison_table: z.boolean(),
  has_faq: z.boolean(),
  has_tldr: z.boolean(),
  word_count: z.number(),
  citation_density: z.number(),
  citation_position: z.object({
    in_title: z.boolean(),
    in_h2: z.boolean(),
    in_top_3_items: z.boolean(),
    in_table: z.boolean(),
  }),
});

export type CompetitorBlueprintShape = z.infer<typeof competitorBlueprintSchemaShape>;

// ─── CPS Breakdown schema (stored as JSONB) ────────────────────────────────

export const cpsBreakdownSchema = z.object({
  entity_score: z.number(),
  structure_score: z.number(),
  redundancy_score: z.number(),
  intent_coverage_score: z.number(),
  freshness_score: z.number(),
  anti_generic_score: z.number(),
  total: z.number(),
});

export type CPSBreakdown = z.infer<typeof cpsBreakdownSchema>;

// ─── Publisher config schema (stored as JSONB) ─────────────────────────────

export const publisherConfigSchema = z.object({
  posts_per_day: z.number().min(1).max(10).default(2),
  min_interval_hours: z.number().min(1).max(48).default(6),
  auto_publish: z.boolean().default(false),
  // WordPress-specific
  wp_blog_id: z.number().optional(),
  // Shopify-specific
  shopify_blog_id: z.string().optional(),
  // Webflow-specific
  webflow_collection_id: z.string().optional(),
});

export type PublisherConfig = z.infer<typeof publisherConfigSchema>;

// ─── DB entity schemas ─────────────────────────────────────────────────────

export const promptV2Schema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  text: z.string().min(1),
  intent: z.enum(PROMPT_INTENTS),
  vertical: z.string().nullable(),
  modifiers: z.array(z.string()),
  expected_entities: z.array(z.string()),
  priority_score: z.number(),
  gap_score: z.number(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const promptVariantSchema = z.object({
  id: z.string().uuid(),
  prompt_id: z.string().uuid(),
  text: z.string().min(1),
  created_at: z.string(),
});

export const competitorUrlSchema = z.object({
  id: z.string().uuid(),
  prompt_id: z.string().uuid(),
  url: z.string().url(),
  rank: z.number(),
  domain_authority: z.number().nullable(),
  last_crawled_at: z.string().nullable(),
  created_at: z.string(),
});

export const competitorBlueprintSchema = z.object({
  id: z.string().uuid(),
  competitor_url_id: z.string().uuid(),
  schema: competitorBlueprintSchemaShape,
  why_winning_signals: z.array(z.string()),
  raw_markdown: z.string().nullable(),
  crawled_at: z.string(),
});

export const pageSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  prompt_id: z.string().uuid().nullable(),
  title: z.string(),
  content: z.string(),
  content_html: z.string(),
  tldr: z.string(),
  cps: z.number().nullable(),
  cps_breakdown: cpsBreakdownSchema.nullable(),
  status: z.enum(PAGE_STATUSES),
  published_url: z.string().nullable(),
  published_at: z.string().nullable(),
  last_citation_check_at: z.string().nullable(),
  citation_rate: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const publisherSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  type: z.enum(PUBLISHER_TYPES),
  config: publisherConfigSchema,
  is_active: z.boolean(),
  posts_today: z.number(),
  last_post_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // credentials_encrypted intentionally omitted from public schema
});

export const publishJobSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().uuid(),
  publisher_id: z.string().uuid(),
  status: z.enum(PUBLISH_JOB_STATUSES),
  platform_post_id: z.string().nullable(),
  platform_url: z.string().nullable(),
  error: z.string().nullable(),
  published_at: z.string().nullable(),
  created_at: z.string(),
});

export const reinforcementJobSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().uuid(),
  channel: z.enum(REINFORCEMENT_CHANNELS),
  target_phrase: z.string(),
  variant_used: z.string().nullable(),
  status: z.enum(REINFORCEMENT_STATUSES),
  external_url: z.string().nullable(),
  reddit_post_id: z.string().uuid().nullable(),
  posted_at: z.string().nullable(),
  created_at: z.string(),
});

export const citationRunSchema = z.object({
  id: z.string().uuid(),
  page_id: z.string().uuid(),
  prompt_id: z.string().uuid().nullable(),
  engine: z.string(),
  response_text: z.string().nullable(),
  brand_cited: z.boolean(),
  brand_position: z.number().nullable(),
  attributed_to_content: z.boolean(),
  ran_at: z.string(),
});

// ─── Input schemas ─────────────────────────────────────────────────────────

export const createPromptV2Schema = z.object({
  brand_id: z.string().uuid(),
  text: z.string().min(1).max(500),
  intent: z.enum(PROMPT_INTENTS).default("recommendation"),
  vertical: z.string().optional(),
  modifiers: z.array(z.string()).default([]),
  expected_entities: z.array(z.string()).default([]),
});

export const updatePromptV2Schema = z.object({
  text: z.string().min(1).max(500).optional(),
  intent: z.enum(PROMPT_INTENTS).optional(),
  vertical: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  expected_entities: z.array(z.string()).optional(),
});

export const createPublisherSchema = z.object({
  brand_id: z.string().uuid(),
  type: z.enum(PUBLISHER_TYPES),
  credentials: z.record(z.string()), // plaintext, encrypted server-side before storage
  config: publisherConfigSchema.partial().optional(),
});

export const updatePublisherSchema = z.object({
  config: publisherConfigSchema.partial().optional(),
  is_active: z.boolean().optional(),
});

export const createReinforcementSchema = z.object({
  page_id: z.string().uuid(),
  channel: z.enum(REINFORCEMENT_CHANNELS),
});

export const updateReinforcementSchema = z.object({
  variant_used: z.string().optional(),
  status: z.enum(REINFORCEMENT_STATUSES).optional(),
});

export const seedPromptsV2Schema = z.object({
  brand_id: z.string().uuid(),
  prompts: z.array(z.object({
    text: z.string().min(1),
    intent: z.enum(PROMPT_INTENTS).optional(),
    vertical: z.string().optional(),
  })).min(1).max(100),
});
