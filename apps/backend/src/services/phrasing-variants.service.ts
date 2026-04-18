import { openai } from "../lib/openai.js";

export async function generatePhrasingVariants(
  phrase: string,
  count: number = 10
): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "phrasing_variants",
        strict: true,
        schema: {
          type: "object",
          properties: {
            variants: { type: "array", items: { type: "string" } },
          },
          required: ["variants"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Generate ${count} phrasing variants of the given claim.
Rules:
- Same semantic meaning — same entities MUST be present
- Vary: sentence structure, active/passive, question/statement, formal/casual
- No two variants can share more than 4 consecutive words
- Keep them natural — as someone would say them in a forum or blog post
- Do NOT use generic openers: "In summary", "Overall", "In conclusion"`,
      },
      {
        role: "user",
        content: `Phrase: "${phrase}"`,
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  const variants: string[] = parsed.variants ?? [];
  return variants.filter((v) => v.toLowerCase() !== phrase.toLowerCase());
}

export async function computeCosineSimilarity(a: string, b: string): Promise<number> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: [a, b],
  });
  const [va, vb] = response.data.map((d) => d.embedding);
  return dotProduct(va, vb) / (magnitude(va) * magnitude(vb));
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

export async function filterVariantsByCosine(
  variants: string[],
  maxSimilarity: number = 0.75
): Promise<string[]> {
  if (variants.length <= 1) return variants;

  const accepted: string[] = [];
  for (const variant of variants) {
    let tooSimilar = false;
    for (const accepted_v of accepted) {
      const similarity = await computeCosineSimilarity(variant, accepted_v);
      if (similarity > maxSimilarity) {
        tooSimilar = true;
        break;
      }
    }
    if (!tooSimilar) accepted.push(variant);
  }
  return accepted;
}

export function extractTargetPhrase(content: string, brandName: string): string {
  // Find the first sentence that contains the brand name in a definitive context
  const sentences = content.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (
      lower.includes(brandName.toLowerCase()) &&
      (lower.includes("best") ||
        lower.includes("top") ||
        lower.includes("recommend") ||
        lower.includes("leading"))
    ) {
      return sentence.trim().slice(0, 200);
    }
  }
  // Fallback: first sentence mentioning the brand
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(brandName.toLowerCase())) {
      return sentence.trim().slice(0, 200);
    }
  }
  return `${brandName} is a top solution in its category`;
}
