export const AI_ENGINES = ["chatgpt"] as const;
export type AiEngine = (typeof AI_ENGINES)[number];

export const SOURCE_TYPES = [
  "blog",
  "listicle",
  "review_site",
  "news",
  "reddit",
  "youtube",
  "marketplace",
  "directory",
  "social",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const BRAND_STATUSES = [
  "pending",
  "onboarding",
  "ready",
  "running",
  "error",
] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export const GAP_STATUSES = ["open", "addressed"] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export const MAX_PROMPTS_PER_BRAND = 25;
export const DEFAULT_PROMPT_COUNT = 18;

export const EXECUTION_JOB_STATUSES = ["pending", "running", "complete", "failed"] as const;
export type ExecutionJobStatus = (typeof EXECUTION_JOB_STATUSES)[number];

export const CONTENT_STATUSES = ["draft", "approved", "deployed", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_TYPES = ["reddit_comment", "reddit_post"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const MAX_GENERATION_ATTEMPTS = 3;

// Comprehensive AI writing tells — sourced from Wikipedia:Signs_of_AI_writing
// Covers GPT-4 era (2023), GPT-4o era (mid-2024), and GPT-5 era (mid-2025+)
export const BANNED_AI_WORDS = [
  // Classic GPT-4 era tells
  "delve", "tapestry", "testament", "meticulous", "meticulously",
  "intricate", "intricacies", "pivotal", "bolstered", "garner",
  "underscore", "interplay", "vibrant", "enduring", "landscape",

  // GPT-4o era tells
  "align with", "fostering", "showcasing", "highlighting",

  // GPT-5 era tells
  "emphasizing", "enhance",

  // Promotional/advertisement language
  "groundbreaking", "renowned", "cutting-edge", "innovative",
  "transformative", "revolutionary", "revolutionize", "game-changer",
  "boasts", "nestled", "rich", "diverse array", "commitment to",
  "paradigm", "synergy", "holistic", "robust", "streamline",
  "empower", "elevate", "unlock", "leverage", "seamless",

  // Significance/legacy puffery
  "stands as", "serves as", "testament to", "indelible mark",
  "deeply rooted", "focal point", "evolving landscape",
  "setting the stage", "key turning point", "broader trends",

  // Vague weasel words
  "valuable insights", "resonates with", "cultivating",
  "encompassing", "ensuring", "reflecting", "symbolizing",
  "contributing to",

  // Superficial analysis openers
  "it is important to note", "it's important to note",
  "worth noting", "it is worth", "crucial to note",

  // Filler openers / collaborative phrases
  "certainly", "absolutely", "of course", "I hope this helps",
  "let me know", "would you like", "here is a", "more detailed",
  "in conclusion", "in summary", "overall",

  // Negative parallelism tells
  "not just", "not only", "but also",

  // Title-case section opener tells
  "additionally",
] as const;
