import type { Context, Next } from "hono";
import { createClient } from "@supabase/supabase-js";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

// Decode JWT payload without verifying signature — used to extract sub/exp
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  // In dev, skip auth and inject a fixed user ID so all routes work without a session
  if (process.env.FRONTEND_URL?.includes("localhost")) {
    c.set("userId", DEV_USER_ID);
    await next();
    return;
  }

  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    console.error("[auth] No Bearer token");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice(7);

  const payload = decodeJwtPayload(token);
  if (!payload) {
    console.error("[auth] Failed to decode JWT");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const exp = payload.exp as number | undefined;
  const sub = payload.sub as string | undefined;
  const role = payload.role as string | undefined;

  if (!exp || Date.now() / 1000 > exp) {
    console.error("[auth] Token expired", { exp, now: Date.now() / 1000, sub });
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!sub || role !== "authenticated") {
    console.error("[auth] Bad role or missing sub", { role, sub });
    return c.json({ error: "Unauthorized" }, 401);
  }

  const anonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!anonKey || !supabaseUrl) {
    console.error("[auth] Missing SUPABASE_URL or SUPABASE_ANON_KEY", { supabaseUrl: !!supabaseUrl, anonKey: !!anonKey });
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    console.error("[auth] getUser failed", { error: error?.message, hasUser: !!user, sub });
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
  await next();
}
