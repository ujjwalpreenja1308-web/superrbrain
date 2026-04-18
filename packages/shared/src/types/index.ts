import { z } from "zod";
import {
  brandSchema,
  promptSchema,
  aiResponseSchema,
  citationSchema,
  citationGapSchema,
  createBrandSchema,
  updatePromptsSchema,
  platformProfileSchema,
  executionJobSchema,
  generatedContentSchema,
  gapOutcomeSchema,
  startExecutionSchema,
  updateContentSchema,
  deployContentSchema,
  promptV2Schema,
  promptVariantSchema,
  competitorUrlSchema,
  competitorBlueprintSchema,
  pageSchema,
  publisherSchema,
  publishJobSchema,
  reinforcementJobSchema,
  citationRunSchema,
  createPromptV2Schema,
  updatePromptV2Schema,
  createPublisherSchema,
  updatePublisherSchema,
  createReinforcementSchema,
  updateReinforcementSchema,
  seedPromptsV2Schema,
  cpsBreakdownSchema,
} from "../schemas/index.js";

export type Brand = z.infer<typeof brandSchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type Prompt = z.infer<typeof promptSchema>;
export type UpdatePromptsInput = z.infer<typeof updatePromptsSchema>;
export type AiResponse = z.infer<typeof aiResponseSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type CitationGap = z.infer<typeof citationGapSchema>;
export type PlatformProfile = z.infer<typeof platformProfileSchema>;
export type ExecutionJob = z.infer<typeof executionJobSchema>;
export type GeneratedContent = z.infer<typeof generatedContentSchema>;
export type GapOutcome = z.infer<typeof gapOutcomeSchema>;
export type StartExecutionInput = z.infer<typeof startExecutionSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type DeployContentInput = z.infer<typeof deployContentSchema>;

export interface GapQueueItem extends CitationGap {
  execution_status: string | null;
  latest_content_status: string | null;
  latest_content_id: string | null;
  execution_job_id: string | null;
}

// Reddit Keyword Tracker
export interface RedditMonitor {
  id: string;
  brand_id: string;
  user_id: string;
  keywords: string[];
  subreddits: string[];
  is_active: boolean;
  automode: boolean;
  created_at: string;
  updated_at: string;
}

export type RedditReplyStatus = "pending" | "approved" | "posted" | "rejected";

export interface RedditPost {
  id: string;
  monitor_id: string;
  brand_id: string;
  post_id: string;
  post_url: string;
  post_title: string;
  post_body: string | null;
  subreddit: string;
  matched_keyword: string;
  author: string | null;
  upvotes: number | null;
  comment_count: number | null;
  posted_at: string | null;
  ai_reply: string | null;
  reply_status: RedditReplyStatus;
  posted_url: string | null;
  posted_at_reddit: string | null;
  created_at: string;
}

// AEO Content Moat types — inferred from schemas (re-exported via schemas/index.ts → aeo.ts)
// These z.infer aliases live here for grouping; the canonical exports come from schemas/aeo.ts
export type PromptV2 = z.infer<typeof promptV2Schema>;
export type PromptVariant = z.infer<typeof promptVariantSchema>;
export type CompetitorUrl = z.infer<typeof competitorUrlSchema>;
export type CompetitorBlueprint = z.infer<typeof competitorBlueprintSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Publisher = z.infer<typeof publisherSchema>;
export type PublishJob = z.infer<typeof publishJobSchema>;
export type ReinforcementJob = z.infer<typeof reinforcementJobSchema>;
export type CitationRun = z.infer<typeof citationRunSchema>;

export type CreatePromptV2Input = z.infer<typeof createPromptV2Schema>;
export type UpdatePromptV2Input = z.infer<typeof updatePromptV2Schema>;
export type CreatePublisherInput = z.infer<typeof createPublisherSchema>;
export type UpdatePublisherInput = z.infer<typeof updatePublisherSchema>;
export type CreateReinforcementInput = z.infer<typeof createReinforcementSchema>;
export type UpdateReinforcementInput = z.infer<typeof updateReinforcementSchema>;
export type SeedPromptsV2Input = z.infer<typeof seedPromptsV2Schema>;

// Dashboard aggregate types
export interface VisibilityReport {
  visibility_score: number;
  gap_score: number;
  total_prompts: number;
  total_responses: number;
  brand_mentioned_count: number;
  engine_breakdown: {
    engine: string;
    total: number;
    mentioned: number;
    score: number;
  }[];
  top_opportunities: CitationGap[];
  last_run_at: string | null;
}
