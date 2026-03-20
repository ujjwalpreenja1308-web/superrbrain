import type { Context, Next } from "hono";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function authMiddleware(c: Context, next: Next) {
  c.set("userId", DEV_USER_ID);
  await next();
}
