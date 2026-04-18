import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { brandRoutes } from "./routes/brands.js";
import { promptRoutes } from "./routes/prompts.js";
import { citationRoutes } from "./routes/citations.js";
import { gapRoutes } from "./routes/gaps.js";
import { executionRoutes } from "./routes/execution.js";
import meRoutes from "./routes/me.js";
import webhookRoutes from "./routes/webhooks.js";
import { redditRoutes } from "./routes/reddit.js";
import { promptsV2Routes } from "./routes/prompts-v2.js";
import { pagesRoutes } from "./routes/pages.js";
import { publisherRoutes } from "./routes/publishers.js";
import { reinforcementRoutes } from "./routes/reinforcement.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorMiddleware, AppError } from "./middleware/error.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import type { AppVariables } from "./types.js";
const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());
app.use("*", rateLimitMiddleware());

if (!process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL environment variable is required");
}
const allowedOrigins = process.env.FRONTEND_URL.split(",").map((u) => u.trim());

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  })
);
app.use("*", errorMiddleware);
app.use("/api/*", authMiddleware);

const REGIONS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "UAE" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "JP", label: "Japan" },
];

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as any);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: err.message || "Internal server error" }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/api/regions", (c) => c.json({ regions: REGIONS }));

// Webhooks — no auth middleware, signature verified inside
app.route("/webhooks", webhookRoutes);

app.route("/api/me", meRoutes);
app.route("/api/brands", brandRoutes);
app.route("/api/brands", promptRoutes);
app.route("/api/brands", citationRoutes);
app.route("/api/brands", gapRoutes);
app.route("/api/brands", executionRoutes);
app.route("/api/reddit", redditRoutes);
app.route("/api/prompts-v2", promptsV2Routes);
app.route("/api/pages", pagesRoutes);
app.route("/api/publishers", publisherRoutes);
app.route("/api/reinforcement", reinforcementRoutes);

const port = Number(process.env.PORT) || 3001;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

async function shutdown(signal: string) {
  console.log(`[Server] ${signal} received — shutting down`);
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled promise rejection:", reason);
});
