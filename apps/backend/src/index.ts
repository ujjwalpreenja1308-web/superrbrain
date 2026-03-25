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
import blogRoutes from "./routes/blog.js";
import meRoutes from "./routes/me.js";
import webhookRoutes from "./routes/webhooks.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorMiddleware } from "./middleware/error.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
import type { AppVariables } from "./types.js";
import { closeBrowser } from "./services/chatgpt-scraper.service.js";
import { getConfiguredProxies } from "./lib/proxy.js";

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

const REGION_LABELS: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  AU: "Australia",
  SG: "Singapore",
  AE: "UAE",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  JP: "Japan",
};

app.get("/health", (c) => c.json({ status: "ok" }));

// Returns only the regions that have a proxy configured — used to populate onboarding dropdown
app.get("/api/regions", (c) => {
  const configured = getConfiguredProxies().filter((k) => k !== "default");
  const regions = configured.map((code) => ({
    code,
    label: REGION_LABELS[code] ?? code,
  }));
  return c.json({ regions });
});

// Webhooks — no auth middleware, signature verified inside
app.route("/webhooks", webhookRoutes);

app.route("/api/me", meRoutes);
app.route("/api/brands", brandRoutes);
app.route("/api/brands", promptRoutes);
app.route("/api/brands", citationRoutes);
app.route("/api/brands", gapRoutes);
app.route("/api/brands", executionRoutes);
app.route("/api/blog", blogRoutes);

const port = Number(process.env.PORT) || 3001;
console.log(`Server starting on port ${port}`);
serve({ fetch: app.fetch, port });

// Graceful shutdown — release Chromium CDP connection cleanly
async function shutdown(signal: string) {
  console.log(`[Server] ${signal} received — shutting down`);
  await closeBrowser();
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
