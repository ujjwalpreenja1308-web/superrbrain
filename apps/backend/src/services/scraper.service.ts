import { firecrawl } from "../lib/firecrawl.js";
import { assertSafePublicUrl } from "./url-safety.service.js";

export interface ScrapeResult {
  markdown: string;
  title: string | null;
  url: string;
}

const MIN_CONTENT_LENGTH = 200;
const MAX_FALLBACK_BYTES = 2_000_000;

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  const safeUrl = (await assertSafePublicUrl(url)).toString();
  try {
    const result = await firecrawl.scrapeUrl(safeUrl, {
      formats: ["markdown"],
      onlyMainContent: true,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Firecrawl scrape failed");
    }

    const markdown = result.markdown ?? "";

    if (markdown.length < MIN_CONTENT_LENGTH) {
      throw new Error(
        `Firecrawl returned too little content (${markdown.length} chars) — likely a bot-wall or 404`,
      );
    }

    return {
      markdown,
      title: result.metadata?.title ?? null,
      url: safeUrl,
    };
  } catch (err) {
    console.warn(`Firecrawl failed for ${safeUrl}, attempting fallback:`, err);
    return await scrapeFallback(safeUrl);
  }
}

async function scrapeFallback(url: string): Promise<ScrapeResult> {
  // Apify fallback — basic fetch with cheerio-like extraction
  // For MVP, use a simple fetch as initial fallback
  let currentUrl = url;
  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    currentUrl = (await assertSafePublicUrl(currentUrl)).toString();
    response = await fetch(currentUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect response had no location");
    if (redirectCount === 5) throw new Error("Too many redirects");
    currentUrl = new URL(location, currentUrl).toString();
  }

  if (!response) throw new Error("Failed to fetch URL");

  if (!response.ok) {
    throw new Error(`Failed to fetch ${currentUrl}: ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FALLBACK_BYTES) {
    throw new Error("Website response is too large to analyze safely");
  }

  const html = await readTextWithLimit(response, MAX_FALLBACK_BYTES);
  // Strip HTML tags for basic markdown approximation
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < MIN_CONTENT_LENGTH) {
    throw new Error(`Website returned too little usable content (${text.length} chars)`);
  }

  return {
    markdown: text.slice(0, 10000),
    title: html.match(/<title>(.*?)<\/title>/i)?.[1] || null,
    url: currentUrl,
  };
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Website response is too large to analyze safely");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
