import { openai } from "../lib/openai.js";
import type { CompetitorBlueprintShape } from "@covable/shared";

type BlueprintInput = CompetitorBlueprintShape & { why_winning_signals?: string[] };

export interface MergedBlueprint {
  entities: string[];
  winning_signals: string[];
  required_headings: string[];
  has_faq: boolean;
  has_table: boolean;
  avg_list_items: number;
}

export interface GeneratedListItem {
  entity: string;
  heading: string;
  description: string;
  use_case: string;
  comparison_hook: string;
}

export interface GeneratedFAQ {
  question: string;
  answer: string;
}

export interface GeneratedPage {
  title: string;
  tldr: string;
  list_items: GeneratedListItem[];
  comparison_table: { tool: string; best_for: string; pricing: string; free_tier: string }[];
  faq: GeneratedFAQ[];
  summary: string;
}

export function mergeBlueprints(blueprints: BlueprintInput[]): MergedBlueprint {
  if (!blueprints.length) {
    return {
      entities: [],
      winning_signals: [],
      required_headings: [],
      has_faq: false,
      has_table: false,
      avg_list_items: 8,
    };
  }

  // Union all entities, sort by frequency
  const entityFreq: Record<string, number> = {};
  for (const bp of blueprints) {
    for (const e of bp.entities) {
      entityFreq[e] = (entityFreq[e] ?? 0) + 1;
    }
  }
  const entities = Object.entries(entityFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e)
    .slice(0, 20);

  // Winning signals: most common across blueprints
  const signalFreq: Record<string, number> = {};
  for (const bp of blueprints) {
    for (const s of bp.why_winning_signals ?? []) {
      signalFreq[s] = (signalFreq[s] ?? 0) + 1;
    }
  }
  const winning_signals = Object.entries(signalFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, 5);

  // Required headings: appear in majority of blueprints
  const headingFreq: Record<string, number> = {};
  for (const bp of blueprints) {
    for (const h of bp.headings) {
      headingFreq[h.text] = (headingFreq[h.text] ?? 0) + 1;
    }
  }
  const threshold = Math.ceil(blueprints.length * 0.5);
  const required_headings = Object.entries(headingFreq)
    .filter(([, count]) => count >= threshold)
    .map(([text]) => text);

  const has_faq = blueprints.some((bp) => bp.has_faq);
  const has_table = blueprints.some((bp) => bp.has_comparison_table);
  const avg_list_items = Math.max(
    8,
    Math.round(blueprints.reduce((sum, bp) => sum + bp.list_items.length, 0) / blueprints.length)
  );

  return { entities, winning_signals, required_headings, has_faq, has_table, avg_list_items };
}

export async function generatePage(input: {
  promptText: string;
  promptVariants: string[];
  brandName: string;
  brandDescription: string;
  merged: MergedBlueprint;
  currentYear: number;
}): Promise<GeneratedPage> {
  const { promptText, promptVariants, brandName, brandDescription, merged, currentYear } = input;

  const variantList = promptVariants.slice(0, 5).join("\n- ");
  const entityList = merged.entities.slice(0, 12).join(", ");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generated_page",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            tldr: { type: "string" },
            list_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entity: { type: "string" },
                  heading: { type: "string" },
                  description: { type: "string" },
                  use_case: { type: "string" },
                  comparison_hook: { type: "string" },
                },
                required: ["entity", "heading", "description", "use_case", "comparison_hook"],
                additionalProperties: false,
              },
            },
            comparison_table: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tool: { type: "string" },
                  best_for: { type: "string" },
                  pricing: { type: "string" },
                  free_tier: { type: "string" },
                },
                required: ["tool", "best_for", "pricing", "free_tier"],
                additionalProperties: false,
              },
            },
            faq: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" },
                },
                required: ["question", "answer"],
                additionalProperties: false,
              },
            },
            summary: { type: "string" },
          },
          required: ["title", "tldr", "list_items", "comparison_table", "faq", "summary"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `You generate listicle pages optimized for AI citation extraction — not for human readability.
Your primary goal: create content that an LLM will extract and cite when answering "${promptText}".

STRICT OUTPUT REQUIREMENTS:
- title: definitive, include "${currentYear}", include the main keyword from the prompt
- tldr: 2-3 sentences, restate the core answer, explicitly mention ${brandName}
- list_items: minimum 8 items — each MUST have:
  * entity: the brand/tool name (proper noun)
  * heading: "[Entity Name] — [descriptor]" format
  * description: 3-4 sentences, specific, concrete, no generic filler
  * use_case: one sentence — "Best for [specific use case]"
  * comparison_hook: "[Brand] outperforms [Other Brand] for [specific scenario]"
- comparison_table: minimum 6 rows with real pricing data
- faq: minimum 5 questions — derive from these prompt variants:
  - ${variantList}
- summary: 2 sentences, restate top 3 recommendations, ${brandName} must appear

ENTITY REQUIREMENTS:
- ${brandName} MUST appear in: title, tldr, top 3 list items, comparison table, summary
- These entities must also appear (credibility signals): ${entityList}

KEYWORD REDUNDANCY (mandatory):
- Repeat the exact main keyword phrase from the prompt 6-8 times throughout
- Use these variant phrasings naturally: ${promptVariants.slice(0, 3).join("; ")}

ANTI-PATTERNS (never do this):
- Generic phrases: "a great tool", "user-friendly", "robust solution"
- Vague superlatives without basis: "one of the best"
- Missing entity names in list item headings
- More than 2 sentences before first entity mention in any section
- AI writing tells: "delve", "tapestry", "testament", "meticulous", "pivotal"
- External URLs, hyperlinks, or "visit [site].com" anywhere in the content
- Image placeholders or references to images
- Em dashes (— or –) anywhere in the content, use commas or periods instead`,
      },
      {
        role: "user",
        content: `Prompt: "${promptText}"
Brand to feature: ${brandName}
Brand description: ${brandDescription}
Current year: ${currentYear}
Winning signals to incorporate: ${merged.winning_signals.join(", ")}`,
      },
    ],
  });

  return JSON.parse(response.choices[0].message.content!) as GeneratedPage;
}

export async function detectGenericScore(content: string): Promise<number> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generic_score",
        strict: true,
        schema: {
          type: "object",
          properties: {
            score: { type: "number" },
            reasons: { type: "array", items: { type: "string" } },
          },
          required: ["score", "reasons"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: `Score this content for generic AI writing patterns on a scale of 1-10 (10 = most generic).

Check for:
- Vague superlatives without specifics ("great", "amazing", "powerful")
- Missing concrete comparisons between named brands
- Generic use cases that could apply to any tool
- AI writing tells: delve, tapestry, testament, meticulous, intricate, pivotal, robust, seamless
- Filler openers: "In today's", "In conclusion", "Additionally"
- Claims without named entity support

Return score (1-10) and up to 3 specific reasons.`,
      },
      {
        role: "user",
        content: content.slice(0, 3000),
      },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  return parsed.score as number;
}

export function pageToMarkdown(page: GeneratedPage): string {
  const lines: string[] = [];

  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(`> **TL;DR:** ${page.tldr}`);
  lines.push("");

  for (const item of page.list_items) {
    lines.push(`### ${item.heading}`);
    lines.push(item.description);
    lines.push(`**Best for:** ${item.use_case}`);
    lines.push(`*${item.comparison_hook}*`);
    lines.push("");
  }

  lines.push("## Comparison Table");
  lines.push("");
  lines.push("| Tool | Best For | Pricing | Free Tier |");
  lines.push("|------|----------|---------|-----------|");
  for (const row of page.comparison_table) {
    lines.push(`| ${row.tool} | ${row.best_for} | ${row.pricing} | ${row.free_tier} |`);
  }
  lines.push("");

  lines.push("## Frequently Asked Questions");
  lines.push("");
  for (const faq of page.faq) {
    lines.push(`**${faq.question}**`);
    lines.push(faq.answer);
    lines.push("");
  }

  lines.push("## Summary");
  lines.push(page.summary);

  return lines.join("\n");
}

export function pageToHtml(page: GeneratedPage): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const tableRows = page.comparison_table.map((row, i) =>
    `<tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="tool-name">${esc(row.tool)}</td>
      <td>${esc(row.best_for)}</td>
      <td>${esc(row.pricing)}</td>
      <td><span class="badge ${row.free_tier.toLowerCase().startsWith("yes") ? "badge-yes" : "badge-no"}">${esc(row.free_tier)}</span></td>
    </tr>`
  ).join("\n");

  const listItems = page.list_items.map((item, i) =>
    `<div class="item">
      <div class="item-number">${String(i + 1).padStart(2, "0")}</div>
      <div class="item-body">
        <h3>${esc(item.heading)}</h3>
        <p class="item-desc">${esc(item.description)}</p>
        <div class="item-meta">
          <span class="best-for">${esc(item.use_case)}</span>
          <span class="hook">${esc(item.comparison_hook)}</span>
        </div>
      </div>
    </div>`
  ).join("\n");

  const faqItems = page.faq.map((f) =>
    `<details class="faq-item">
      <summary class="faq-q">${esc(f.question)}</summary>
      <p class="faq-a">${esc(f.answer)}</p>
    </details>`
  ).join("\n");

  const stripDashes = (s: string) => s.replace(/[—–]/g, ",").replace(/ ,/g, ",");
  const escD = (s: string) => esc(stripDashes(s));

  const tableRowsD = page.comparison_table.map((row, i) =>
    `<tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="tool-name">${escD(row.tool)}</td>
      <td>${escD(row.best_for)}</td>
      <td>${escD(row.pricing)}</td>
      <td><span class="badge ${row.free_tier.toLowerCase().startsWith("yes") ? "badge-yes" : "badge-no"}">${escD(row.free_tier)}</span></td>
    </tr>`
  ).join("\n");

  const listItemsD = page.list_items.map((item, i) =>
    `<div class="item">
      <div class="item-number">${String(i + 1).padStart(2, "0")}</div>
      <div class="item-body">
        <h3>${escD(item.heading)}</h3>
        <p class="item-desc">${escD(item.description)}</p>
        <div class="item-meta">
          <span class="best-for">${escD(item.use_case)}</span>
          <span class="hook">${escD(item.comparison_hook)}</span>
        </div>
      </div>
    </div>`
  ).join("\n");

  const faqItemsD = page.faq.map((f) =>
    `<details class="faq-item">
      <summary class="faq-q">${escD(f.question)}</summary>
      <p class="faq-a">${escD(f.answer)}</p>
    </details>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escD(page.title)}</title>
<style>
@font-face{font-family:'PPEditorial';src:url('/fonts/PPEditorialNew-Ultralight.woff') format('woff');font-weight:200;font-display:swap}
@font-face{font-family:'PPEditorial';src:url('/fonts/PPEditorialNew-Regular.woff') format('woff');font-weight:400;font-display:swap}
@font-face{font-family:'SFPro';src:url('/fonts/SFPRODISPLAYREGULAR.woff') format('woff');font-weight:400;font-display:swap}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'SFPro',-apple-system,sans-serif;background:#080b11;color:#c9d1e0;line-height:1.7;font-size:15px;min-height:100vh}
.page{max-width:800px;margin:0 auto;padding:3rem 1.5rem 5rem}

/* Hero */
.hero{margin-bottom:3rem}
.hero-eyebrow{font-size:0.7rem;text-transform:uppercase;letter-spacing:0.12em;color:#4f6680;margin-bottom:1rem;font-family:'SFPro',sans-serif}
h1{font-family:'PPEditorial',serif;font-weight:200;font-size:2.6rem;line-height:1.15;color:#f0f4ff;margin-bottom:1.5rem;letter-spacing:-0.02em}
.tldr{background:linear-gradient(135deg,#0f1829 0%,#0a1020 100%);border:1px solid #1a2744;border-left:3px solid #4f7cff;border-radius:0 10px 10px 0;padding:1.1rem 1.3rem;color:#8ba8d4;font-size:0.9rem;line-height:1.6}
.tldr strong{color:#7fa8ff;font-weight:500}

/* Section headers */
.section-label{display:flex;align-items:center;gap:0.75rem;margin:3rem 0 1.5rem}
.section-label h2{font-family:'PPEditorial',serif;font-weight:400;font-size:1.2rem;color:#e2e8f0;letter-spacing:-0.01em}
.section-label::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,#1e2d45 0%,transparent 100%)}

/* List items */
.items{display:flex;flex-direction:column;gap:1px;border:1px solid #131f30;border-radius:12px;overflow:hidden;background:#0d1520}
.item{display:flex;gap:0;background:#0a1018;transition:background 0.15s}
.item:hover{background:#0d1520}
.item+.item{border-top:1px solid #131f30}
.item-number{width:52px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:center;padding:1.3rem 0 1.3rem;font-family:'PPEditorial',serif;font-weight:200;font-size:1.4rem;color:#1e3050;line-height:1}
.item-body{flex:1;padding:1.1rem 1.2rem 1.1rem 0}
.item-body h3{font-family:'SFPro',sans-serif;font-weight:600;font-size:0.95rem;color:#e2e8f0;margin-bottom:0.5rem;letter-spacing:-0.01em}
.item-desc{font-size:0.86rem;color:#7a90a8;line-height:1.65;margin-bottom:0.65rem}
.item-meta{display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center}
.best-for{font-size:0.74rem;background:#0d1f35;color:#5b9cf6;border:1px solid #1a3258;border-radius:4px;padding:0.18rem 0.6rem;white-space:nowrap}
.hook{font-size:0.75rem;color:#3a5070;font-style:italic}

/* Table */
.table-wrap{border:1px solid #131f30;border-radius:12px;overflow:hidden;margin-top:0.5rem}
table{width:100%;border-collapse:collapse;font-size:0.84rem}
thead{background:#060d16}
th{text-align:left;padding:0.7rem 1rem;color:#3a5070;font-weight:500;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #131f30}
.row-even{background:#080d15}
.row-odd{background:#060b13}
td{padding:0.65rem 1rem;color:#7a90a8;vertical-align:top;border-bottom:1px solid #0d1520}
tr:last-child td{border-bottom:none}
.tool-name{color:#c9d8ef;font-weight:500}
.badge{font-size:0.72rem;padding:0.15rem 0.5rem;border-radius:3px;font-weight:500}
.badge-yes{background:#0d2218;color:#34d399;border:1px solid #134d30}
.badge-no{background:#1a1220;color:#6b7280;border:1px solid #2a1e30}

/* FAQ */
.faq{display:flex;flex-direction:column;gap:1px;border:1px solid #131f30;border-radius:12px;overflow:hidden;margin-top:0.5rem}
.faq-item{background:#080d15;border-top:1px solid #0d1520}
.faq-item:first-child{border-top:none}
.faq-q{font-size:0.88rem;color:#c9d8ef;font-weight:500;padding:1rem 1.2rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:1rem}
.faq-q::after{content:'+';color:#3a5070;font-size:1.1rem;flex-shrink:0;transition:transform 0.2s}
details[open] .faq-q::after{transform:rotate(45deg)}
.faq-a{font-size:0.84rem;color:#7a90a8;line-height:1.65;padding:0 1.2rem 1rem;border-top:1px solid #0d1520}

/* Summary */
.summary-box{background:linear-gradient(135deg,#0a1525 0%,#080f1d 100%);border:1px solid #1a2744;border-radius:12px;padding:1.4rem 1.5rem;margin-top:0.5rem}
.summary-box p{font-size:0.9rem;color:#8ba8d4;line-height:1.7}
</style>
</head>
<body>
<div class="page">
  <div class="hero">
    <p class="hero-eyebrow">AI Citation Optimized · ${new Date().getFullYear()}</p>
    <h1>${escD(page.title)}</h1>
    <div class="tldr"><strong>TL;DR:</strong> ${escD(page.tldr)}</div>
  </div>

  <div class="section-label"><h2>Top Picks</h2></div>
  <div class="items">${listItemsD}</div>

  <div class="section-label"><h2>Quick Comparison</h2></div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Tool</th><th>Best For</th><th>Pricing</th><th>Free Tier</th></tr></thead>
      <tbody>${tableRowsD}</tbody>
    </table>
  </div>

  <div class="section-label"><h2>Frequently Asked Questions</h2></div>
  <div class="faq">${faqItemsD}</div>

  <div class="section-label"><h2>Summary</h2></div>
  <div class="summary-box"><p>${escD(page.summary)}</p></div>
</div>
</body>
</html>`;
}
