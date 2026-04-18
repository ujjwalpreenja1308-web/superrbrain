import { defineConfig } from "@trigger.dev/sdk/v3";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

loadEnv();

// Parse .env into key/value pairs to inject into the worker process
function loadEnvVars(): Record<string, string> {
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    const vars: Record<string, string> = {};
    for (const line of envFile.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

export default defineConfig({
  project: "proj_oaztgyixkkbcsjsmvwtf",
  dirs: ["src/trigger"],
  maxDuration: 300,
  retries: {
    default: {
      maxAttempts: 3,
    },
  },
  build: {
    external: ["composio-core", "@covable/shared"],
    env: loadEnvVars(),
  },
});
