import { openai } from "../lib/openai.js";
import { supabaseAdmin } from "../lib/supabase.js";

const INTENT_WEIGHTS: Record<string, number> = {
  comparison: 1.0,
  best_of: 0.9,
  recommendation: 0.8,
  how_to: 0.6,
  definition: 0.4,
};

export async function computeGapScore(promptId: string): Promise<number> {
  // Pull citation rates from existing ai_responses table
  const { data: responses } = await supabaseAdmin
    .from("ai_responses")
    .select("brand_mentioned, brand_id")
    .eq("prompt_id", promptId);

  if (!responses?.length) return 0;

  const brandId = responses[0].brand_id;

  // Get brand's mention rate for this prompt
  const total = responses.length;
  const brandMentioned = responses.filter((r) => r.brand_mentioned).length;
  const brandRate = total > 0 ? brandMentioned / total : 0;

  // Get prompt to determine intent weight
  const { data: prompt } = await supabaseAdmin
    .from("prompts_v2")
    .select("intent")
    .eq("id", promptId)
    .single();

  const intentWeight = prompt ? (INTENT_WEIGHTS[prompt.intent] ?? 0.8) : 0.8;

  // Get competitor citation rate from ai_responses competitor_mentions
  const { data: allResponses } = await supabaseAdmin
    .from("ai_responses")
    .select("competitor_mentions")
    .eq("brand_id", brandId)
    .eq("prompt_id", promptId);

  let totalCompetitorMentions = 0;
  let responseCount = 0;
  for (const r of allResponses ?? []) {
    if (r.competitor_mentions?.length > 0) totalCompetitorMentions++;
    responseCount++;
  }
  const competitorRate = responseCount > 0 ? totalCompetitorMentions / responseCount : 0;

  // gap_score = (competitor_rate - brand_rate) × intent_weight
  // Clamped to [0, 1]
  const raw = (competitorRate - brandRate) * intentWeight;
  return Math.max(0, Math.min(1, raw));
}

export async function expandPromptVariants(promptText: string): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "prompt_variants",
        strict: true,
        schema: {
          type: "object",
          properties: {
            variants: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["variants"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Generate 20 semantic variants of the given search prompt.
Rules:
- Same semantic meaning and intent
- Vary sentence structure, wording, perspective
- No two variants can share more than 4 consecutive words
- Keep them natural — how a real person would type them
- Vary: question vs statement, formal vs casual, specific vs general`,
      },
      {
        role: "user",
        content: `Prompt: "${promptText}"`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  const variants: string[] = parsed.variants ?? [];

  // Dedupe: remove variants too similar to the original
  return variants.filter((v) => v.toLowerCase() !== promptText.toLowerCase());
}

export async function prioritizePrompts(brandId: string): Promise<void> {
  const { data: prompts } = await supabaseAdmin
    .from("prompts_v2")
    .select("id, intent")
    .eq("brand_id", brandId);

  if (!prompts?.length) return;

  for (const prompt of prompts) {
    const gapScore = await computeGapScore(prompt.id);
    const intentWeight = INTENT_WEIGHTS[prompt.intent] ?? 0.8;
    // priority_score factors in intent weight so high-intent gaps rank higher
    const priorityScore = gapScore * intentWeight;

    await supabaseAdmin
      .from("prompts_v2")
      .update({
        gap_score: gapScore,
        priority_score: priorityScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prompt.id);
  }
}

export async function seedPromptsFromBrand(brandId: string): Promise<number> {
  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name, category, competitors")
    .eq("id", brandId)
    .single();

  if (!brand?.category) return 0;

  // Pull existing prompts_v1 (monitoring prompts) to seed v2
  const { data: existingPrompts } = await supabaseAdmin
    .from("prompts")
    .select("text, category")
    .eq("brand_id", brandId)
    .eq("is_active", true);

  if (!existingPrompts?.length) return 0;

  // Map category to intent
  const categoryToIntent: Record<string, string> = {
    best_for: "best_of",
    comparison: "comparison",
    reviews: "recommendation",
    reddit_community: "recommendation",
    price_value: "comparison",
  };

  const rows = existingPrompts.map((p) => ({
    brand_id: brandId,
    text: p.text,
    intent: categoryToIntent[p.category ?? ""] ?? "recommendation",
    vertical: brand.category,
    modifiers: [],
    expected_entities: brand.competitors?.map((c: { name: string }) => c.name) ?? [],
    priority_score: 0,
    gap_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Check which texts already exist to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from("prompts_v2")
    .select("text")
    .eq("brand_id", brandId);

  const existingTexts = new Set((existing ?? []).map((r) => r.text.toLowerCase()));
  const newRows = rows.filter((r) => !existingTexts.has(r.text.toLowerCase()));

  if (!newRows.length) return 0;

  const { data: inserted, error } = await supabaseAdmin
    .from("prompts_v2")
    .insert(newRows)
    .select("id");

  if (error) throw new Error(`Failed to seed prompts: ${error.message}`);

  return inserted?.length ?? 0;
}
