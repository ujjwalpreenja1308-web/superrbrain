import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_dcbzxfwypzsbnfnsxctk",
  dirs: ["src/trigger"],
  // Reddit publishing is still under development and depends on a legacy
  // Composio package that cannot be indexed by Trigger's ESM worker build.
  ignorePatterns: ["**/reddit-poster.ts"],
  maxDuration: 300,
  retries: {
    default: {
      maxAttempts: 3,
    },
  },
  build: {
    external: ["composio-core"],
  },
});
