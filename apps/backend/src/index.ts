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
import { authMiddleware } from "./middleware/auth.js";
import { errorMiddleware } from "./middleware/error.js";
import type { AppVariables } from "./types.js";
import { closeBrowser } from "./services/chatgpt-scraper.service.js";

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use("*", errorMiddleware);
app.use("/api/*", authMiddleware);

app.get("/health", (c) => c.json({ status: "ok" }));

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
