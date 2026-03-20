import { firecrawl } from "../lib/firecrawl.js";

export interface ScrapeResult {
  markdown: string;
  title: string | null;
  url: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const result = await firecrawl.scrapeUrl(url, {
      formats: ["markdown"],
    });

    if (result.success) {
      return {
        markdown: result.markdown || "",
        title: result.metadata?.title || null,
        url,
      };
    }
    throw new Error("Firecrawl scrape failed");
  } catch (err) {
    console.warn(`Firecrawl failed for ${url}, attempting fallback:`, err);
    return await scrapeFallback(url);
  }
}

async function scrapeFallback(url: string): Promise<ScrapeResult> {
  // Apify fallback — basic fetch with cheerio-like extraction
  // For MVP, use a simple fetch as initial fallback
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  // Strip HTML tags for basic markdown approximation
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    markdown: text.slice(0, 10000),
    title: html.match(/<title>(.*?)<\/title>/i)?.[1] || null,
    url,
  };
}
