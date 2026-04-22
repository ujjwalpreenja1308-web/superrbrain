import type { Context, Next } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

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
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const keyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20);
    console.error("[auth] getUser failed:", { error: error?.message, user, supabaseUrl, keyPrefix });
    return c.json({ error: "Unauthorized", debug: { error: error?.message ?? null, supabaseUrl, keyPrefix } }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
  await next();
}
