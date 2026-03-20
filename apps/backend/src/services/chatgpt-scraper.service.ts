/**
 * ChatGPT UI scraper — self-hosted Chromium via Playwright
 *
 * Architecture:
 *   - 1 persistent browser (singleton, never closed between requests)
 *   - 1 browser context (shared, cookies + session preserved)
 *   - 5 concurrent tabs max (CONCURRENCY cap)
 *   - User quota enforced via promptQuota map (reset per browser session)
 *
 * DigitalOcean 4 GB / 2 vCPU setup:
 *   chromium --headless=new --no-sandbox --disable-dev-shm-usage \
 *            --remote-debugging-port=9222 \
 *            --disable-gpu --disable-extensions --no-first-run \
 *            --memory-pressure-off --js-flags="--max-old-space-size=512"
 *   BROWSER_WS_ENDPOINT=http://localhost:9222
 *
 * Selectors (confirmed 2026-03-19):
 *   Input:   div#prompt-textarea[contenteditable="true"]
 *   Done:    button:has-text("Sources") appears = response complete
 *   Sources: right-side panel after clicking Sources button
 *   Links:   <a href> inside sources panel
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatGPTScrapeResult {
  prompt: string;
  text: string;
  citations: string[];
}

export interface ScraperOptions {
  /** Hard cap on prompts per userId per browser session. Default: 10 */
  quotaPerUser?: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const CONCURRENCY = 5;           // max simultaneous tabs
const NAV_TIMEOUT = 60_000;      // page.goto timeout
const EDITOR_TIMEOUT = 20_000;   // wait for ProseMirror to mount
const SOURCES_TIMEOUT = 90_000;  // wait for "Sources" button (response done)
const STOP_TIMEOUT = 120_000;    // fallback: wait for stop button to vanish
const PANEL_TIMEOUT = 8_000;     // wait for sources panel to open
const SEMAPHORE_POLL = 50;       // ms between semaphore re-checks

const SKIP_DOMAINS = ["openai.com", "chatgpt.com", "help.openai.com"];

// ── Singleton browser state ────────────────────────────────────────────────────

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _connecting = false;
let _connectPromise: Promise<{ browser: Browser; context: BrowserContext }> | null = null;

/** Active tab count — used as a counting semaphore */
let _activeTabs = 0;

/** Per-user prompt quota tracking (resets when browser restarts) */
const _quotaMap = new Map<string, number>();

// ── Semaphore helpers ──────────────────────────────────────────────────────────

async function acquireTab(): Promise<void> {
  while (_activeTabs >= CONCURRENCY) {
    await new Promise((r) => setTimeout(r, SEMAPHORE_POLL));
  }
  _activeTabs++;
}

function releaseTab(): void {
  _activeTabs = Math.max(0, _activeTabs - 1);
}

// ── URL helpers ────────────────────────────────────────────────────────────────

function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    return u.toString();
  } catch {
    return raw;
  }
}

function isExternalCitation(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return !SKIP_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

// ── Browser lifecycle (singleton) ──────────────────────────────────────────────

/**
 * Get (or lazily create) the singleton browser + context.
 * Safe to call concurrently — only one connection attempt runs at a time.
 */
export async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  // Already healthy
  if (_browser && _context && _browser.isConnected()) {
    return { browser: _browser, context: _context };
  }

  // Another call is already connecting — wait for it
  if (_connecting && _connectPromise) {
    return _connectPromise;
  }

  _connecting = true;
  _connectPromise = (async () => {
    try {
      // Clean up stale instances
      await _context?.close().catch(() => {});
      await _browser?.close().catch(() => {});
      _browser = null;
      _context = null;
      _quotaMap.clear();

      const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;

      if (wsEndpoint) {
        console.log(`[ChatGPT] Connecting to Chromium via CDP: ${wsEndpoint}`);
        _browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 60_000 });
      } else {
        console.log("[ChatGPT] Dev mode — launching local Chromium");
        _browser = await chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--no-first-run",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
          ],
        });
      }

      // Attach disconnect handler to allow reconnection
      _browser.on("disconnected", () => {
        console.warn("[ChatGPT] Browser disconnected — will reconnect on next request");
        _browser = null;
        _context = null;
        _connecting = false;
        _connectPromise = null;
        _activeTabs = 0;
        _quotaMap.clear();
      });

      const proxyServer = process.env.PROXY_SERVER;
      const proxyConfig = proxyServer
        ? {
            server: proxyServer,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD,
          }
        : undefined;

      if (proxyConfig) {
        console.log(`[ChatGPT] Using proxy: ${proxyConfig.server}`);
      }

      // Always create a fresh context so proxy + UA settings are applied cleanly
      // (reusing contexts[0] from CDP would skip proxy)
      _context = await _browser.newContext({
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ...(proxyConfig && { proxy: proxyConfig }),
      });

      console.log("[ChatGPT] Browser ready");
      return { browser: _browser, context: _context };
    } finally {
      _connecting = false;
    }
  })();

  return _connectPromise;
}

/** Explicitly close the browser (e.g., on server shutdown) */
export async function closeBrowser(): Promise<void> {
  await _context?.close().catch(() => {});
  await _browser?.close().catch(() => {});
  _browser = null;
  _context = null;
  _connecting = false;
  _connectPromise = null;
  _activeTabs = 0;
  _quotaMap.clear();
}

// ── Resource-blocking route handler ───────────────────────────────────────────

async function blockHeavyResources(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    // Block media, fonts (use system fonts), and analytics/ads
    if (["media", "font", "websocket"].includes(type)) {
      return route.abort();
    }
    const url = route.request().url();
    if (
      url.includes("analytics") ||
      url.includes("amplitude") ||
      url.includes("segment.io") ||
      url.includes("sentry.io") ||
      url.includes("googletagmanager") ||
      url.includes("intercom")
    ) {
      return route.abort();
    }
    return route.continue();
  });
}

// ── Single tab scraper ─────────────────────────────────────────────────────────

async function scrapeOneTab(
  context: BrowserContext,
  prompt: string,
  tabIndex: number
): Promise<ChatGPTScrapeResult> {
  await acquireTab();
  const page = await context.newPage();

  try {
    // Block heavy/unnecessary resources to reduce memory pressure
    await blockHeavyResources(page);

    // ── 1. Navigate ──────────────────────────────────────────────────────────
    await page.goto("https://chatgpt.com", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });

    // Dismiss cookie banner if present (blocks interaction on first visit)
    await page.locator('button:has-text("Accept all")').click({ timeout: 5_000 }).catch(() => {});

    await page.waitForSelector('div#prompt-textarea[contenteditable="true"]', {
      timeout: EDITOR_TIMEOUT,
    });

    // Brief stabilisation
    await page.waitForTimeout(800);

    // ── 2. Type prompt ───────────────────────────────────────────────────────
    const editor = page.locator('div#prompt-textarea[contenteditable="true"]');
    await editor.click();
    await page.waitForTimeout(150);
    await page.keyboard.type(prompt, { delay: 15 });
    await page.waitForTimeout(200);

    // ── 3. Submit ────────────────────────────────────────────────────────────
    await page.keyboard.press("Enter");

    // ── 4. Wait for response completion ─────────────────────────────────────
    try {
      // Primary: Sources button appears → search completed
      await page.locator('button:has-text("Sources")').waitFor({ timeout: SOURCES_TIMEOUT });
    } catch {
      // Fallback: stop/generating button disappears
      await page.waitForFunction(
        () => {
          const btns = Array.from(document.querySelectorAll("button"));
          return !btns.some((b) => {
            const label = (b.getAttribute("aria-label") ?? "").toLowerCase();
            const testId = (b.getAttribute("data-testid") ?? "").toLowerCase();
            return label.includes("stop") || label.includes("generating") || testId.includes("stop");
          });
        },
        { timeout: STOP_TIMEOUT, polling: 1500 }
      );
    }

    // Final DOM settle
    await page.waitForTimeout(600);

    // ── 5. Extract response text ─────────────────────────────────────────────
    const text = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1] as HTMLElement | null;
      return last?.innerText?.trim() ?? "";
    });

    // ── 6. Inline citation links from response body ──────────────────────────
    const inlineUrls: string[] = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      const last = msgs[msgs.length - 1];
      if (!last) return [];
      return Array.from(last.querySelectorAll("a[href]")).map(
        (a) => (a as HTMLAnchorElement).href
      );
    });

    // ── 7. Sources panel links ───────────────────────────────────────────────
    const panelUrls: string[] = [];

    const sourcesBtn = page.locator('button:has-text("Sources")').last();
    const hasSources = await sourcesBtn.isVisible().catch(() => false);

    if (hasSources) {
      await sourcesBtn.click();

      await page.waitForSelector('h2:has-text("Sources"), [class*="source"] a[href]', {
        timeout: PANEL_TIMEOUT,
      });
      await page.waitForTimeout(400);

      // Scroll panel to load all lazy entries
      await page.evaluate(() => {
        const panel =
          document.querySelector('[class*="source-panel"], [class*="sources-panel"]') ??
          document.querySelector('[data-testid*="source"]') ??
          Array.from(document.querySelectorAll("h2")).find(
            (h) => h.textContent?.trim() === "Sources"
          )?.closest("aside, section, [class*='panel']");
        if (panel) (panel as HTMLElement).scrollTop = (panel as HTMLElement).scrollHeight;
      });
      await page.waitForTimeout(350);

      panelUrls.push(
        ...(await page.evaluate(() => {
          let panel: Element | null = null;
          document.querySelectorAll("h2").forEach((h2) => {
            if (h2.textContent?.trim() === "Sources") {
              panel =
                h2.closest("aside, section, div[class*='panel'], div[class*='source']") ??
                h2.parentElement;
            }
          });
          const container = panel ?? document.body;
          return Array.from(container.querySelectorAll("a[href]"))
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((h) => h.startsWith("http"));
        }))
      );
    }

    // ── 8. Deduplicate + clean + filter ─────────────────────────────────────
    const seen = new Set<string>();
    const citations: string[] = [];
    for (const raw of [...inlineUrls, ...panelUrls]) {
      const url = cleanUrl(raw);
      if (!seen.has(url) && isExternalCitation(url)) {
        seen.add(url);
        citations.push(url);
      }
    }

    console.log(
      `[ChatGPT tab ${tabIndex}] ✓ "${prompt.slice(0, 45)}…" → ${citations.length} citations`
    );
    return { prompt, text, citations };

  } catch (err) {
    console.error(
      `[ChatGPT tab ${tabIndex}] ✗ "${prompt.slice(0, 45)}…" → ${(err as Error).message}`
    );
    return { prompt, text: "", citations: [] };

  } finally {
    // Always close the page to release memory
    await page.close().catch(() => {});
    releaseTab();
  }
}

// ── Quota enforcement ──────────────────────────────────────────────────────────

/**
 * Check and deduct quota for a user.
 * Returns how many prompts are allowed from the requested set.
 */
function enforceQuota(
  userId: string,
  requested: number,
  limit: number
): { allowed: number; remaining: number } {
  const used = _quotaMap.get(userId) ?? 0;
  const available = Math.max(0, limit - used);
  const allowed = Math.min(requested, available);
  if (allowed > 0) _quotaMap.set(userId, used + allowed);
  return { allowed, remaining: Math.max(0, limit - used - allowed) };
}

// ── Batch scraper ──────────────────────────────────────────────────────────────

/**
 * Run multiple prompts through ChatGPT with up to CONCURRENCY parallel tabs.
 *
 * @param prompts   Array of search prompts (max 10 recommended)
 * @param userId    Optional user ID for quota tracking
 * @param options   { quotaPerUser: number } — default 10
 */
export async function scrapeChatGPTBatch(
  prompts: string[],
  userId = "anonymous",
  options: ScraperOptions = {}
): Promise<ChatGPTScrapeResult[]> {
  if (prompts.length === 0) return [];

  const quota = options.quotaPerUser ?? 10;
  const { allowed, remaining } = enforceQuota(userId, prompts.length, quota);

  if (allowed === 0) {
    console.warn(`[ChatGPT] User "${userId}" quota exhausted (limit: ${quota})`);
    return prompts.map((p) => ({ prompt: p, text: "", citations: [] }));
  }

  if (allowed < prompts.length) {
    console.warn(
      `[ChatGPT] User "${userId}" quota limited: ${allowed}/${prompts.length} prompts allowed (${remaining} remaining after)`
    );
  }

  const allowedPrompts = prompts.slice(0, allowed);
  const skipped = prompts.slice(allowed).map((p) => ({ prompt: p, text: "", citations: [] }));

  const { context } = await getBrowser();

  // Process in chunks of CONCURRENCY (semaphore handles actual parallelism)
  const results: ChatGPTScrapeResult[] = [];
  const totalRounds = Math.ceil(allowedPrompts.length / CONCURRENCY);

  for (let i = 0; i < allowedPrompts.length; i += CONCURRENCY) {
    const batch = allowedPrompts.slice(i, i + CONCURRENCY);
    const round = Math.floor(i / CONCURRENCY) + 1;
    console.log(`[ChatGPT] User "${userId}" round ${round}/${totalRounds} — ${batch.length} tab(s)`);

    const t0 = Date.now();
    const settled = await Promise.allSettled(
      batch.map((p, j) => scrapeOneTab(context, p, i + j + 1))
    );
    console.log(`[ChatGPT] Round ${round} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    for (let k = 0; k < settled.length; k++) {
      const r = settled[k];
      results.push(
        r.status === "fulfilled" ? r.value : { prompt: batch[k], text: "", citations: [] }
      );
    }
  }

  return [...results, ...skipped];
}

// ── Single prompt convenience wrapper ─────────────────────────────────────────

export async function scrapeChatGPT(
  prompt: string,
  userId = "anonymous"
): Promise<{ text: string; citations: string[] }> {
  const [result] = await scrapeChatGPTBatch([prompt], userId);
  return { text: result.text, citations: result.citations };
}

// ── Quota inspection helpers ───────────────────────────────────────────────────

export function getUserQuotaUsed(userId: string): number {
  return _quotaMap.get(userId) ?? 0;
}

export function resetUserQuota(userId: string): void {
  _quotaMap.delete(userId);
}

export function resetAllQuotas(): void {
  _quotaMap.clear();
}

// ── Health check ───────────────────────────────────────────────────────────────

export function getBrowserHealth(): {
  connected: boolean;
  activeTabs: number;
  quotaEntries: number;
} {
  return {
    connected: !!_browser?.isConnected(),
    activeTabs: _activeTabs,
    quotaEntries: _quotaMap.size,
  };
}
