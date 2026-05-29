import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadEnvFiles([
  path.join(rootDir, ".env"),
  path.join(rootDir, "apps", "backend", ".env"),
  path.join(rootDir, "apps", "frontend", ".env.local"),
]);

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.slug || !args.title) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const apiKey = process.env.OPENAI_IMAGE_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    "Missing OPENAI_IMAGE_KEY or OPENAI_API_KEY. Add it to .env or apps/backend/.env.",
  );
}

const slug = slugify(args.slug);
const category = args.category || "Covable";
const outputDir = args.outputDir
  ? path.resolve(args.outputDir)
  : path.join(rootDir, "apps", "landing", "public", "blog", "images");
const outputPath = args.output
  ? path.resolve(args.output)
  : path.join(outputDir, `${slug}.png`);

const prompt =
  args.prompt ||
  [
    "Create a premium editorial hero image for a Covable blog article.",
    `Article title: ${args.title}.`,
    `Category: ${category}.`,
    "Brand style: dark black SaaS aesthetic, refined technical composition, lime green accent, subtle grid, abstract citation graph, trusted web sources flowing into AI answer surfaces.",
    "Composition: safe margins, centered subject, no cropped elements, no readable words, no logos, no people, no screenshots, no generic stock illustration.",
    "Use a cinematic but minimal product-marketing look suitable for an SEO/AEO article featured image.",
  ].join(" ");

await mkdir(path.dirname(outputPath), { recursive: true });

const body = {
  model: args.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini",
  prompt,
  size: args.size || process.env.OPENAI_IMAGE_SIZE || "1024x1024",
  quality: args.quality || process.env.OPENAI_IMAGE_QUALITY || "low",
  n: 1,
};

const response = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`OpenAI image generation failed: ${response.status} ${text}`);
}

const result = await response.json();
const image = result.data?.[0];
if (!image) throw new Error("OpenAI image generation returned no image data.");

let bytes;
if (image.b64_json) {
  bytes = Buffer.from(image.b64_json, "base64");
} else if (image.url) {
  const imageResponse = await fetch(image.url);
  if (!imageResponse.ok) {
    throw new Error(`Could not download generated image: ${imageResponse.status}`);
  }
  bytes = Buffer.from(await imageResponse.arrayBuffer());
} else {
  throw new Error("OpenAI image generation returned neither b64_json nor url.");
}

await writeFile(outputPath, bytes);
await writeFile(
  outputPath.replace(/\.(png|jpg|jpeg|webp)$/i, ".json"),
  `${JSON.stringify(
    {
      slug,
      title: args.title,
      category,
      prompt,
      request: { model: body.model, size: body.size, quality: body.quality },
      usage: result.usage || null,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`Saved ${path.relative(rootDir, outputPath)}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
Generate a Covable blog image with OpenAI Images.

Usage:
  pnpm blog:image -- --slug answer-engine-optimization --title "What AEO means for SaaS teams" --category AEO

Options:
  --slug       Required. Output filename slug.
  --title      Required. Blog post title used in the image prompt.
  --category   Optional. Blog category label for prompt context.
  --prompt     Optional. Full custom image prompt.
  --model      Optional. Defaults to OPENAI_IMAGE_MODEL or gpt-image-1-mini.
  --size       Optional. Defaults to OPENAI_IMAGE_SIZE or 1024x1024.
  --quality    Optional. Defaults to OPENAI_IMAGE_QUALITY or low.
  --output     Optional. Exact output path.

Environment:
  OPENAI_IMAGE_KEY or OPENAI_API_KEY in .env or apps/backend/.env.
`);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadEnvFiles(files) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = unquoteEnv(rawValue);
    }
  }
}

function unquoteEnv(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
