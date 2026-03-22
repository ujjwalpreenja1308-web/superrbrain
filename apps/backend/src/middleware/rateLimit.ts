import type { Context, Next } from "hono";

const store = new Map<string, number[]>();

/**
 * Simple in-memory sliding-window rate limiter.
 * @param max     Max requests per window
 * @param windowMs Window size in milliseconds
 */
export function rateLimitMiddleware(max = 120, windowMs = 60_000) {
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (store.get(ip) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= max) {
      return c.json({ error: "Too many requests. Please wait a moment." }, 429);
    }

    timestamps.push(now);
    store.set(ip, timestamps);

    // Prevent unbounded growth — evict stale entries once we hit a large size
    if (store.size > 20_000) {
      for (const [k, v] of store) {
        if (v[v.length - 1] < cutoff) store.delete(k);
      }
    }

    await next();
  };
}

/** Stricter limiter for expensive mutation endpoints (e.g. trigger jobs) */
export function strictRateLimitMiddleware() {
  return rateLimitMiddleware(20, 60_000);
}
