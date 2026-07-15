import { openai } from "../lib/openai.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { curatePromptVariants } from "./prompt-quality.service.js";

const INTENT_WEIGHTS: Record<string, number> = {
  comparison: 1.0,
  best_of: 0.9,
  recommendation: 0.8,
  how_to: 0.6,
  definition: 0.4,
};

export async function computeGapScore(promptId: string): Promise<number> {
  const { data: prompt, error: promptError } = await supabaseAdmin
    .from("prompts_v2")
    .select("intent, brand_id, text")
    .eq("id", promptId)
    .single();
  if (promptError || !prompt) {
    throw new Error(
      `Failed to load prompt for scoring: ${promptError?.message ?? promptId}`,
    );
  }

  // Monitoring still writes responses against the v1 prompt IDs. Match seeded
  // v2 prompts back by brand and exact text until the schemas are unified.
  const { data: legacyPrompts, error: legacyPromptError } = await supabaseAdmin
    .from("prompts")
    .select("id")
    .eq("brand_id", prompt.brand_id)
    .eq("text", prompt.text);
  if (legacyPromptError) {
    throw new Error(
      `Failed to match monitoring prompts: ${legacyPromptError.message}`,
    );
  }

  const responsePromptIds = [
    promptId,
    ...(legacyPrompts ?? []).map((row) => row.id),
  ];
  const { data: responses, error: responsesError } = await supabaseAdmin
    .from("ai_responses")
    .select("brand_mentioned, competitor_mentions")
    .eq("brand_id", prompt.brand_id)
    .in("prompt_id", responsePromptIds);
  if (responsesError)
    throw new Error(
      `Failed to load prompt responses: ${responsesError.message}`,
    );
  if (!responses?.length) return 0;

  // Get brand's mention rate for this prompt
  const total = responses.length;
  const brandMentioned = responses.filter((r) => r.brand_mentioned).length;
  const brandRate = total > 0 ? brandMentioned / total : 0;

  const intentWeight = INTENT_WEIGHTS[prompt.intent] ?? 0.8;

  let totalCompetitorMentions = 0;
  let responseCount = 0;
  for (const r of responses) {
    if (r.competitor_mentions?.length > 0) totalCompetitorMentions++;
    responseCount++;
  }
  const competitorRate =
    responseCount > 0 ? totalCompetitorMentions / responseCount : 0;

  // gap_score = (competitor_rate - brand_rate) × intent_weight
  // Clamped to [0, 1]
  const raw = (competitorRate - brandRate) * intentWeight;
  return Math.max(0, Math.min(1, raw));
}

export async function expandPromptVariants(
  promptText: string,
): Promise<string[]> {
  const variantLimit = 10;
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
        content: `Generate 16 candidate rewrites of the given search query. Only the strongest 10 will be stored.
Rules:
- Preserve the exact meaning, intent, entities, and constraints.
- Write how a real person would type or say the query.
- Aim for 5 to 18 words and never exceed 22 words.
- Keep one clear intent. Do not join multiple questions.
- Use ordinary punctuation. Never use an em dash or en dash.
- Do not create deliberately formal, keyword-stuffed, or slang-heavy versions.
- Do not add a year, "latest", "currently", "right now", or any other freshness signal unless it is in the original.
- Do not add brands, products, audiences, prices, or facts that are not in the original.
- Do not use labels, headlines, bracketed placeholders, or more than one question mark.
- Make each candidate meaningfully different in wording, not just a swapped adjective.`,
      },
      {
        role: "user",
        content: `Prompt: "${promptText}"`,
      },
    ],
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Prompt variant generation returned no content");

  const parsed = JSON.parse(content) as { variants?: unknown };
  return curatePromptVariants(parsed.variants, promptText, variantLimit);
}

export async function prioritizePrompts(brandId: string): Promise<void> {
  const { data: prompts, error: promptsError } = await supabaseAdmin
    .from("prompts_v2")
    .select("id, intent")
    .eq("brand_id", brandId);
  if (promptsError)
    throw new Error(
      `Failed to load prompts for prioritization: ${promptsError.message}`,
    );

  if (!prompts?.length) return;

  for (const prompt of prompts) {
    const gapScore = await computeGapScore(prompt.id);
    const intentWeight = INTENT_WEIGHTS[prompt.intent] ?? 0.8;
    // priority_score factors in intent weight so high-intent gaps rank higher
    const priorityScore = gapScore * intentWeight;

    const { error: updateError } = await supabaseAdmin
      .from("prompts_v2")
      .update({
        gap_score: gapScore,
        priority_score: priorityScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prompt.id);
    if (updateError)
      throw new Error(
        `Failed to prioritize prompt ${prompt.id}: ${updateError.message}`,
      );
  }
}

export async function seedPromptsFromBrand(
  brandId: string,
  maxNewRows?: number,
): Promise<number> {
  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("name, category, competitors")
    .eq("id", brandId)
    .single();
  if (brandError)
    throw new Error(`Failed to load brand prompts: ${brandError.message}`);

  if (!brand?.category) return 0;

  // Pull existing prompts_v1 (monitoring prompts) to seed v2
  const { data: existingPrompts, error: existingPromptsError } =
    await supabaseAdmin
      .from("prompts")
      .select("text, category")
      .eq("brand_id", brandId)
      .eq("is_active", true);
  if (existingPromptsError) {
    throw new Error(
      `Failed to load monitoring prompts: ${existingPromptsError.message}`,
    );
  }

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
    expected_entities:
      brand.competitors?.map((c: { name: string }) => c.name) ?? [],
    priority_score: 0,
    gap_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Check which texts already exist to avoid duplicates
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("prompts_v2")
    .select("text")
    .eq("brand_id", brandId);
  if (existingError)
    throw new Error(`Failed to load seeded prompts: ${existingError.message}`);

  const existingTexts = new Set(
    (existing ?? []).map((r) => r.text.toLowerCase()),
  );
  const candidateRows = rows.filter(
    (r) => !existingTexts.has(r.text.toLowerCase()),
  );
  const newRows =
    maxNewRows === undefined
      ? candidateRows
      : candidateRows.slice(0, Math.max(0, maxNewRows));

  if (!newRows.length) return 0;

  const { data: inserted, error } = await supabaseAdmin
    .from("prompts_v2")
    .insert(newRows)
    .select("id");

  if (error) throw new Error(`Failed to seed prompts: ${error.message}`);

  return inserted?.length ?? 0;
}
