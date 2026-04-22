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
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice(7);

  // Decode the JWT to get user ID and expiry — Supabase tokens are RS256/ES256
  // signed by Supabase's auth server, so decoding without verify is safe here
  // since we're trusting the token came from Supabase's infrastructure.
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const exp = payload.exp as number | undefined;
  const sub = payload.sub as string | undefined;
  const role = payload.role as string | undefined;

  // Reject expired tokens
  if (!exp || Date.now() / 1000 > exp) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Must be an authenticated user token (not anon or service role)
  if (!sub || role !== "authenticated") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Create a user-scoped Supabase client to verify the token is still valid
  const userClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
  await next();
}
