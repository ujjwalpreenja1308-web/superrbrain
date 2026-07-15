import type { AiEngine } from "@covable/shared";

export interface AiQueryResult {
  engine: AiEngine;
  raw_response: string;
  citations: string[];
  brand_mentioned: boolean;
  brand_position: number | null;
  competitor_mentions: { name: string; position: number | null }[];
}

export function parseAiResponse(
  text: string,
  brandName: string,
  competitors: { name: string }[],
  engine: AiEngine,
  citations: string[],
): AiQueryResult {
  const lowerText = text.toLowerCase();
  const normalizedBrand = brandName.trim();
  const brandIndex = normalizedBrand
    ? lowerText.indexOf(normalizedBrand.toLowerCase())
    : -1;
  const brandMentioned = brandIndex !== -1;
  const validCompetitors = competitors
    .map((competitor) => ({ name: competitor.name.trim() }))
    .filter((competitor) => competitor.name.length > 0);

  let brandPosition: number | null = null;
  if (brandMentioned) {
    const allMentions: { isBrand: boolean; index: number }[] = [
      { isBrand: true, index: brandIndex },
    ];

    for (const competitor of validCompetitors) {
      const competitorIndex = lowerText.indexOf(competitor.name.toLowerCase());
      if (competitorIndex !== -1) {
        allMentions.push({ isBrand: false, index: competitorIndex });
      }
    }

    allMentions.sort((a, b) => a.index - b.index);
    const position = allMentions.findIndex((mention) => mention.isBrand);
    brandPosition = position === -1 ? null : position + 1;
  }

  const competitorMentions = validCompetitors
    .filter((competitor) => lowerText.includes(competitor.name.toLowerCase()))
    .map((competitor) => ({ name: competitor.name, position: null }));

  return {
    engine,
    raw_response: text,
    citations,
    brand_mentioned: brandMentioned,
    brand_position: brandPosition,
    competitor_mentions: competitorMentions,
  };
}
