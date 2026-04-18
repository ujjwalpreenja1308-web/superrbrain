import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const landingDist = path.join(rootDir, "apps", "landing", "dist");
const frontendDist = path.join(rootDir, "apps", "frontend", "dist");
const outputDist = path.join(rootDir, "dist");
const appShellDir = path.join(outputDist, "__app");

await rm(outputDist, { recursive: true, force: true });
await mkdir(outputDist, { recursive: true });

await cp(landingDist, outputDist, { recursive: true });
await mkdir(appShellDir, { recursive: true });
await cp(path.join(frontendDist, "index.html"), path.join(appShellDir, "index.html"));

for (const entry of await readdir(frontendDist, { withFileTypes: true })) {
  if (entry.name === "index.html") continue;

  const source = path.join(frontendDist, entry.name);
  const destination = path.join(outputDist, entry.name);

  if (
    entry.name === "frontend-assets" ||
    entry.name === "ascii-art.mp4" ||
    entry.name === "favicon.svg" ||
    entry.name === "icons.svg"
  ) {
    await cp(source, destination, { recursive: true });
    continue;
  }

  try {
    await cp(source, destination, { recursive: true, errorOnExist: true });
  } catch {
    // Landing owns the shared root-level files (logo, fonts, etc).
  }
}
