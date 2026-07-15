export const GENERATED_PROMPT_CATEGORIES = [
  "best_for",
  "comparison",
  "reviews",
  "price_value",
] as const;

export type GeneratedPromptCategory =
  (typeof GENERATED_PROMPT_CATEGORIES)[number];

export interface QualityPrompt {
  text: string;
  category: GeneratedPromptCategory;
}

interface PromptQualityOptions {
  limit: number;
  brandName: string;
  competitorNames: string[];
}

const FORCED_RECENCY_PATTERN =
  /\b(?:currently|right now|latest|recent|today|this year|as of|20\d{2})\b/i;
const AWKWARD_PHRASES = [
  /\b(?:my|their|your) wallet out\b/i,
  /\bactively ready to (?:buy|purchase)\b/i,
  /\breal experiences\??$/i,
  /\bwhat(?:'s| is) everyone recommending\??$/i,
  /\bactually worth buying right now\b/i,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripOuterQuotes(value: string): string {
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
  };
  const closingQuote = pairs[value[0]];
  return closingQuote && value.endsWith(closingQuote)
    ? value.slice(1, -1).trim()
    : value;
}

export function normalizeHumanQuery(value: unknown): string {
  if (typeof value !== "string") return "";

  let query = value
    .trim()
    .replace(/^(?:(?:prompt|query)\s*:\s*)/i, "")
    .replace(/^(?:\d{1,3}[.)]|[-*•])\s+/, "")
    .trim();

  query = stripOuterQuotes(query)
    .replace(/[—–]+/g, ", ")
    .replace(/\u2026/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,?.!])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*([?.!])/g, "$1")
    .replace(/,+$/g, "")
    .trim();

  return query;
}

function containsTerm(query: string, term: string): boolean {
  const normalizedTerm = term.trim();
  if (normalizedTerm.length < 2) return false;

  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegex(normalizedTerm)}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  ).test(query);
}

function queryWords(query: string): string[] {
  return (
    query.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
  );
}

function comparisonTokens(query: string): Set<string> {
  const ignored = new Set([
    "a",
    "an",
    "are",
    "as",
    "at",
    "can",
    "currently",
    "do",
    "does",
    "for",
    "i",
    "in",
    "is",
    "latest",
    "me",
    "my",
    "now",
    "of",
    "please",
    "recent",
    "right",
    "should",
    "the",
    "this",
    "today",
    "what",
    "which",
    "would",
    "year",
  ]);

  return new Set(
    queryWords(query).filter(
      (word) => !ignored.has(word) && !/^20\d{2}$/.test(word),
    ),
  );
}

function areNearDuplicates(left: string, right: string): boolean {
  const leftTokens = comparisonTokens(left);
  const rightTokens = comparisonTokens(right);
  if (!leftTokens.size || !rightTokens.size) return false;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection++;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union >= 0.82;
}

export function isHumanLikeQuery(
  query: string,
  forbiddenTerms: string[] = [],
): boolean {
  if (!query || query.length > 180 || /[\n\r—–;|]/.test(query)) return false;
  if (/\[[^\]]+\]|\{[^}]+\}/.test(query)) return false;
  if ((query.match(/\?/g) ?? []).length > 1) return false;
  if ((query.match(/,/g) ?? []).length > 2) return false;
  if (AWKWARD_PHRASES.some((pattern) => pattern.test(query))) return false;
  if (forbiddenTerms.some((term) => containsTerm(query, term))) return false;

  const wordCount = queryWords(query).length;
  return wordCount >= 5 && wordCount <= 22;
}

function isCompetitorPrompt(query: string, competitorNames: string[]): boolean {
  return competitorNames.some((name) => containsTerm(query, name));
}

export function curateGeneratedPrompts(
  rawPrompts: unknown,
  options: PromptQualityOptions,
): QualityPrompt[] {
  if (!Array.isArray(rawPrompts)) return [];

  const limit = Math.max(1, Math.floor(options.limit));
  const allowedCategories = new Set<string>(GENERATED_PROMPT_CATEGORIES);
  const forbiddenTerms = [options.brandName, "Reddit"];
  const queues = new Map<GeneratedPromptCategory, QualityPrompt[]>(
    GENERATED_PROMPT_CATEGORIES.map((category) => [category, []]),
  );

  for (const rawPrompt of rawPrompts) {
    if (!rawPrompt || typeof rawPrompt !== "object") continue;

    const candidate = rawPrompt as { text?: unknown; category?: unknown };
    if (
      typeof candidate.category !== "string" ||
      !allowedCategories.has(candidate.category)
    ) {
      continue;
    }
    if (typeof candidate.text !== "string" || /[—–]/.test(candidate.text)) {
      continue;
    }

    const text = normalizeHumanQuery(candidate.text);
    if (!isHumanLikeQuery(text, forbiddenTerms)) continue;

    queues.get(candidate.category as GeneratedPromptCategory)!.push({
      text,
      category: candidate.category as GeneratedPromptCategory,
    });
  }

  const selected: QualityPrompt[] = [];
  const maxRecencyPrompts = Math.max(1, Math.floor(limit * 0.2));
  const maxCompetitorPrompts = Math.max(1, Math.floor(limit * 0.3));
  let recencyPromptCount = 0;
  let competitorPromptCount = 0;
  let madeProgress = true;

  while (selected.length < limit && madeProgress) {
    madeProgress = false;

    for (const category of GENERATED_PROMPT_CATEGORIES) {
      const queue = queues.get(category)!;

      while (queue.length) {
        const candidate = queue.shift()!;
        const hasRecency = FORCED_RECENCY_PATTERN.test(candidate.text);
        const hasCompetitor = isCompetitorPrompt(
          candidate.text,
          options.competitorNames,
        );

        if (hasRecency && recencyPromptCount >= maxRecencyPrompts) continue;
        if (hasCompetitor && competitorPromptCount >= maxCompetitorPrompts) {
          continue;
        }
        if (
          selected.some((prompt) =>
            areNearDuplicates(prompt.text, candidate.text),
          )
        ) {
          continue;
        }

        selected.push(candidate);
        if (hasRecency) recencyPromptCount++;
        if (hasCompetitor) competitorPromptCount++;
        madeProgress = true;
        break;
      }

      if (selected.length >= limit) break;
    }
  }

  return selected;
}

export function curatePromptVariants(
  rawVariants: unknown,
  originalText: string,
  limit = 10,
): string[] {
  if (!Array.isArray(rawVariants)) return [];

  const selected: string[] = [];
  const normalizedOriginal = normalizeHumanQuery(originalText);

  for (const rawVariant of rawVariants) {
    if (typeof rawVariant !== "string" || /[—–]/.test(rawVariant)) continue;
    const candidate = normalizeHumanQuery(rawVariant);
    if (!isHumanLikeQuery(candidate)) continue;
    if (areNearDuplicates(candidate, normalizedOriginal)) continue;
    if (selected.some((variant) => areNearDuplicates(variant, candidate))) {
      continue;
    }

    selected.push(candidate);
    if (selected.length >= Math.max(1, Math.floor(limit))) break;
  }

  return selected;
}
