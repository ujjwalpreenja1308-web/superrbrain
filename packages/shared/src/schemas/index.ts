import { z } from "zod";
import {
  AI_ENGINES,
  BRAND_STATUSES,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  EXECUTION_JOB_STATUSES,
  GAP_STATUSES,
  SOURCE_TYPES,
} from "../constants.js";

// === Brands ===

export const createBrandSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  country: z.string().length(2).optional(),
  city: z.string().optional(),
});

export const brandSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string().url(),
  name: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  competitors: z.array(z.object({ name: z.string(), url: z.string().optional() })),
  status: z.enum(BRAND_STATUSES),
  latest_visibility_score: z.number().nullable(),
  latest_gap_score: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// === Prompts ===

export const promptSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  text: z.string().min(1),
  category: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const updatePromptsSchema = z.object({
  prompts: z.array(
    z.object({
      id: z.string().uuid().optional(),
      text: z.string().min(1),
      is_active: z.boolean(),
    })
  ),
});

// === AI Responses ===

export const aiResponseSchema = z.object({
  id: z.string().uuid(),
  prompt_id: z.string().uuid(),
  brand_id: z.string().uuid(),
  engine: z.enum(AI_ENGINES),
  raw_response: z.string(),
  brand_mentioned: z.boolean(),
  brand_position: z.number().nullable(),
  competitor_mentions: z.array(
    z.object({ name: z.string(), position: z.number().nullable() })
  ),
  run_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

// === Citations ===

export const citationSchema = z.object({
  id: z.string().uuid(),
  ai_response_id: z.string().uuid(),
  brand_id: z.string().uuid(),
  url: z.string(),
  domain: z.string().nullable(),
  source_type: z.enum(SOURCE_TYPES).nullable(),
  title: z.string().nullable(),
  brands_mentioned: z.array(
    z.object({ name: z.string(), frequency: z.number() })
  ),
  content_snippet: z.string().nullable(),
  run_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

// === Citation Gaps ===

export const citationGapSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  competitor_name: z.string(),
  source_url: z.string(),
  source_type: z.enum(SOURCE_TYPES).nullable(),
  prompt_id: z.string().uuid().nullable(),
  engine: z.enum(AI_ENGINES).nullable(),
  opportunity_score: z.number().nullable(),
  status: z.enum(GAP_STATUSES),
  run_id: z.string().uuid().nullable(),
  created_at: z.string(),
});

// === Platform Profiles ===

export const platformProfileSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  platform_type: z.string(),
  subreddit: z.string().nullable(),
  format_rules: z.record(z.unknown()),
  tone_parameters: z.record(z.unknown()),
  content_patterns: z.record(z.unknown()),
  sample_comments: z.array(z.unknown()),
  last_analyzed_at: z.string(),
  created_at: z.string(),
});

// === Execution Jobs ===

export const executionJobSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  citation_gap_id: z.string().uuid(),
  status: z.enum(EXECUTION_JOB_STATUSES),
  platform_type: z.string(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// === Generated Content ===

export const generatedContentSchema = z.object({
  id: z.string().uuid(),
  execution_job_id: z.string().uuid(),
  content_type: z.enum(CONTENT_TYPES),
  content_body: z.string(),
  angle_used: z.string().nullable(),
  strategy_reasoning: z.string().nullable(),
  platform_profile_id: z.string().uuid().nullable(),
  generation_attempt: z.number(),
  quality_scores: z.record(z.number()),
  status: z.enum(CONTENT_STATUSES),
  deployed_at: z.string().nullable(),
  deployed_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// === Gap Outcomes ===

export const gapOutcomeSchema = z.object({
  id: z.string().uuid(),
  citation_gap_id: z.string().uuid(),
  content_id: z.string().uuid().nullable(),
  gap_status_before: z.string(),
  gap_status_after: z.string(),
  detected_at: z.string(),
});

// === Request Schemas ===

export const startExecutionSchema = z.object({
  citation_gap_id: z.string().uuid(),
});

export const updateContentSchema = z.object({
  content_body: z.string().min(1).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
});

export const deployContentSchema = z.object({
  deployed_url: z.string().url(),
});
