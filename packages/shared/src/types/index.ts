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
