import { openai } from "../lib/openai.js";
import { BANNED_AI_WORDS, MAX_GENERATION_ATTEMPTS } from "@covable/shared";
import type { BrandVoiceProfile } from "./brand-voice.service.js";
import type { PlatformAnalysis } from "./platform-analyzer.service.js";
import type { CitationGap, GeneratedContent } from "@covable/shared";

interface ContentGeneratorInput {
  gap: CitationGap;
  brandName: string;
  brandVoice: BrandVoiceProfile;
  platformProfile: PlatformAnalysis;
  promptText: string | null;
}

export interface ContentStrategyOutput {
  angle: string;
  hook: string;
  key_claims: string[];
  positioning: string;
  reasoning: string;
}

export interface QualityCheckResult {
  passed: boolean;
  scores: {
    human_sounding: number;
    platform_match: number;
    natural_brand_mention: number;
    addresses_query: number;
  };
  feedback: string;
}

export interface GeneratedContentOutput {
  content_body: string;
  angle_used: string;
  strategy_reasoning: string;
  quality_scores: Record<string, number>;
  generation_attempt: number;
}

// Stage 3: Strategy
export async function generateContentStrategy(
  input: ContentGeneratorInput
): Promise<ContentStrategyOutput> {
  const { gap, brandName, brandVoice, platformProfile, promptText } = input;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are planning a Reddit comment strategy. Your goal: help a real person mention a brand naturally in a thread where a competitor is being discussed.

The comment must read like a genuine personal experience, NOT like marketing copy.

Rules for your strategy:
- angle: one specific personal-experience angle (e.g. "tried both, preferred X for Y reason")
- hook: first few words that feel natural, not salesy (e.g. "Switched from X a few months ago")
- key_claims: max 2-3 specific factual points, no superlatives
- positioning: how to frame the brand — as an option, not THE answer
- reasoning: why this angle won't read as promotional

Return JSON only: { angle, hook, key_claims, positioning, reasoning }`,
      },
      {
        role: "user",
        content: `Plan a Reddit comment strategy for ${brandName}:

Context:
- Source URL: ${gap.source_url}
- Competitor mentioned: ${gap.competitor_name}
- Original query that found this: ${promptText || "Not available"}
- Brand tone: ${brandVoice.tone}
- Brand differentiators: ${brandVoice.differentiators.join(", ")}
- Platform vibe: ${JSON.stringify(platformProfile.tone_parameters)}
- What gets upvoted here: ${JSON.stringify((platformProfile.content_patterns as Record<string, unknown>).engagement_triggers || [])}

Design a strategy to mention ${brandName} naturally and helpfully without being promotional.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");
  return {
    angle: raw.angle || "direct comparison",
    hook: raw.hook || "Personal experience",
    key_claims: raw.key_claims || [],
    positioning: raw.positioning || "alternative worth considering",
    reasoning: raw.reasoning || "",
  };
}

// Stage 4: Generate content
export async function generateContent(
  input: ContentGeneratorInput,
  strategy: ContentStrategyOutput,
  attempt: number
): Promise<string> {
  const { gap, brandName, brandVoice, platformProfile, promptText } = input;

  const bannedWords = [...BANNED_AI_WORDS].join(", ");
  const formatRules = platformProfile.format_rules as Record<string, unknown>;
  const contentPatterns = platformProfile.content_patterns as Record<string, unknown>;
  const sampleComments = platformProfile.sample_comments.slice(0, 2);

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are a real person writing a Reddit comment from personal experience. Output ONLY the comment — no intro, no explanation, no preamble.

━━ BANNED WORDS (instant fail if used) ━━
${bannedWords}

━━ AI WRITING PATTERNS TO AVOID ━━
- No em dashes (—) — use commas or just end the sentence
- No "not just X, but also Y" or "not only X, but Y" constructions
- No rule of three (adjective, adjective, adjective)
- No bolded phrases or inline headers with colons
- No emoji
- No "Additionally" at the start of a sentence
- No vague significance claims ("plays a crucial role", "represents a shift")
- No puffery ("boasts", "renowned", "groundbreaking", "vibrant")
- No weasel words ("experts say", "studies show", "many people feel")
- No present-participle tail phrases ("...highlighting its importance", "...reflecting broader trends")
- No closing summaries ("In conclusion", "Overall", "To summarize")
- No collaborative filler ("Hope this helps", "Let me know if you have questions")
- No knowledge cutoff disclaimers ("as of my last update")
- Don't over-vary synonyms — just repeat the brand name naturally
- Don't use title case in any headers

━━ REDDIT VOICE RULES ━━
- Write like you're typing on a phone, casually
- Use "I" — first person, personal experience
- Short sentences. Fragments are fine.
- Mention ${brandName} once, naturally — like you stumbled across it or tried it
- Length: ${formatRules.typical_length || "2-4 sentences"} — don't overwrite
- ${formatRules.uses_markdown ? "Light markdown ok (bold for product name is fine)" : "No markdown"}
- Avoid: ${JSON.stringify(contentPatterns.avoid_patterns || [])}

━━ EXAMPLE COMMENTS FROM THIS COMMUNITY ━━
${sampleComments.map((c) => `"${c}"`).join("\n")}`,
      },
      {
        role: "user",
        content: `Write a Reddit comment for r/${platformProfile.subreddit || "relevant subreddit"}.

Thread topic: ${promptText || gap.source_url}
Competitor being discussed: ${gap.competitor_name}

Your angle: ${strategy.angle}
Hook: ${strategy.hook}
Points to weave in naturally: ${strategy.key_claims.join(", ")}
How to position ${brandName}: ${strategy.positioning}
${attempt > 1 ? `\nAttempt ${attempt} — previous version was too AI-sounding or promotional. Write more casually. Shorter. More like a real person typed it quickly.` : ""}`,
      },
    ],
    temperature: 0.85 + attempt * 0.05,
  });

  return response.choices[0].message.content?.trim() || "";
}

// Stage 5: Quality check
export async function qualityCheck(
  content: string,
  input: ContentGeneratorInput,
  strategy: ContentStrategyOutput
): Promise<QualityCheckResult> {
  const bannedFound = [...BANNED_AI_WORDS].filter((word) =>
    content.toLowerCase().includes(word.toLowerCase())
  );

  // Hard structural checks — instant fail patterns
  const hardFailPatterns = [
    { pattern: /—/, label: "em dash (AI tell)" },
    { pattern: /not (?:just|only).{1,40}but (?:also)?/i, label: "negative parallelism (AI tell)" },
    { pattern: /\*\*[^*]+\*\*.*:/m, label: "bold inline header (AI tell)" },
    { pattern: /in (?:conclusion|summary|closing)/i, label: "closing summary (AI tell)" },
    { pattern: /hope this helps|let me know if|would you like/i, label: "collaborative filler (AI tell)" },
    { pattern: /as of (?:my |the )?(?:last|latest|recent)/i, label: "knowledge cutoff disclaimer (AI tell)" },
    { pattern: /additionally,/i, label: "sentence-starting 'Additionally' (AI tell)" },
    { pattern: /(?:plays a|plays an) (?:crucial|key|vital|important|pivotal) role/i, label: "significance puffery (AI tell)" },
  ];

  const hardFails = hardFailPatterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ label }) => label);

  const response = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You are a Reddit moderator and AI-detection expert. Score this comment strictly on 4 dimensions (1-10).

SCORING GUIDE — be harsh, a 7 means genuinely good:

human_sounding (1-10):
- Penalise: formal vocabulary, em dashes, rule-of-three lists, "not just X but also Y", bolded phrases, emoji as decoration, overly smooth sentences
- Reward: casual tone, short sentences, fragments, slight imperfection, "I" voice

platform_match (1-10):
- Does it sound like a real Reddit comment in this community?
- Penalise: press-release tone, marketing language, excessive length

natural_brand_mention (1-10):
- Is the brand mention something a real person would say? Or does it feel planted?
- Penalise: brand introduced with fanfare, feels like an ad, over-explained

addresses_query (1-10):
- Does it actually answer the thread topic helpfully?
- Penalise: generic advice that could apply to any topic

Return JSON only:
{
  "human_sounding": <1-10>,
  "platform_match": <1-10>,
  "natural_brand_mention": <1-10>,
  "addresses_query": <1-10>,
  "feedback": "one sentence on the biggest issue"
}`,
      },
      {
        role: "user",
        content: `Comment:
"${content}"

Context:
- Brand: ${input.brandName}
- Subreddit: ${input.platformProfile.subreddit ? `r/${input.platformProfile.subreddit}` : "general Reddit"}
- Thread topic: ${input.promptText || input.gap.source_url}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const raw = JSON.parse(response.choices[0].message.content || "{}");
  const scores = {
    human_sounding: raw.human_sounding || 0,
    platform_match: raw.platform_match || 0,
    natural_brand_mention: raw.natural_brand_mention || 0,
    addresses_query: raw.addresses_query || 0,
  };

  const allPass = Object.values(scores).every((s) => s >= 7); // raised from 6 to 7
  const noBannedWords = bannedFound.length === 0;
  const noHardFails = hardFails.length === 0;

  const issues: string[] = [];
  if (bannedFound.length > 0) issues.push(`Banned words: ${bannedFound.join(", ")}`);
  if (hardFails.length > 0) issues.push(`Hard fails: ${hardFails.join(", ")}`);
  if (raw.feedback) issues.push(raw.feedback);

  return {
    passed: allPass && noBannedWords && noHardFails,
    scores,
    feedback: issues.join(" | ") || "ok",
  };
}

// Orchestrator: runs stages 3→4→5 with retry on quality failure
export async function runContentPipeline(
  input: ContentGeneratorInput
): Promise<GeneratedContentOutput> {
  const strategy = await generateContentStrategy(input);

  let lastContent = "";
  let lastQuality: QualityCheckResult | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const content = await generateContent(input, strategy, attempt);
    const quality = await qualityCheck(content, input, strategy);

    lastContent = content;
    lastQuality = quality;

    if (quality.passed) {
      return {
        content_body: content,
        angle_used: strategy.angle,
        strategy_reasoning: strategy.reasoning,
        quality_scores: quality.scores,
        generation_attempt: attempt,
      };
    }
  }

  // Return best attempt even if it didn't fully pass
  return {
    content_body: lastContent,
    angle_used: strategy.angle,
    strategy_reasoning: strategy.reasoning,
    quality_scores: lastQuality?.scores || {},
    generation_attempt: MAX_GENERATION_ATTEMPTS,
  };
}
