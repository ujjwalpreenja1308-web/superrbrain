import type { Context, Next } from "hono";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      return c.json({ error: err.message }, err.statusCode as any);
    }
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
}
