import { describe, expect, it } from "vitest";
import {
  curateGeneratedPrompts,
  curatePromptVariants,
  isHumanLikeQuery,
  normalizeHumanQuery,
} from "./prompt-quality.service.js";

describe("prompt quality", () => {
  it("removes list prefixes, outer quotes, and long dashes", () => {
    expect(
      normalizeHumanQuery(
        "1. “Which CRM—HubSpot or Zoho–is easier for a small team?”",
      ),
    ).toBe("Which CRM, HubSpot or Zoho, is easier for a small team?");
  });

  it("rejects placeholders, compound questions, and robotic phrasing", () => {
    expect(isHumanLikeQuery("What is best for [buyer type]?")).toBe(false);
    expect(isHumanLikeQuery("Is it affordable? Is it reliable?")).toBe(false);
    expect(
      isHumanLikeQuery("Which option suits someone with their wallet out?"),
    ).toBe(false);
  });

  it("filters brand leakage, Reddit queries, duplicates, and excess recency", () => {
    const prompts = curateGeneratedPrompts(
      [
        {
          text: "What is the best CRM for a five person sales team?",
          category: "best_for",
        },
        {
          text: "Which CRM is best for a five person sales team in 2026?",
          category: "best_for",
        },
        {
          text: "Is Superbrain the best CRM for a small sales team?",
          category: "comparison",
        },
        {
          text: "What does Reddit recommend for a small sales team?",
          category: "reviews",
        },
        {
          text: "HubSpot—Zoho, which one is easier to set up?",
          category: "comparison",
        },
        {
          text: "Is HubSpot or Zoho easier for a small team to set up?",
          category: "comparison",
        },
        {
          text: "What do small teams dislike about modern CRM tools?",
          category: "reviews",
        },
        {
          text: "How much should a small team budget for CRM software?",
          category: "price_value",
        },
        {
          text: "Which CRM tools have changed their pricing recently?",
          category: "price_value",
        },
        {
          text: "What CRM has the latest features for sales teams?",
          category: "best_for",
        },
      ],
      {
        limit: 5,
        brandName: "Superbrain",
        competitorNames: ["HubSpot", "Zoho"],
      },
    );

    expect(prompts).toHaveLength(5);
    expect(prompts.some((prompt) => /[—–]/.test(prompt.text))).toBe(false);
    expect(prompts.some((prompt) => /superbrain|reddit/i.test(prompt.text))).toBe(
      false,
    );
    expect(
      prompts.filter((prompt) =>
        /\b(?:recently|latest|currently|right now|20\d{2})\b/i.test(prompt.text),
      ),
    ).toHaveLength(1);
  });

  it("keeps only distinct, natural variants", () => {
    const variants = curatePromptVariants(
      [
        "Which CRM is best for a small sales team?",
        "What CRM would suit a growing sales department?",
        "Best CRM | small sales team",
        "What CRM—works well for a compact sales team?",
        "Which customer management tool works well for a compact sales team?",
        "What CRM would suit a growing sales department?",
      ],
      "What is the best CRM for a small sales team?",
      10,
    );

    expect(variants).toEqual([
      "What CRM would suit a growing sales department?",
      "Which customer management tool works well for a compact sales team?",
    ]);
  });
});
