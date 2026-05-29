import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const defaults = {
  comfyUrl: process.env.COMFYUI_URL || "http://127.0.0.1:8188",
  outputDir: path.join(rootDir, "apps", "landing", "public", "blog", "images"),
  width: Number(process.env.COMFYUI_WIDTH || 1200),
  height: Number(process.env.COMFYUI_HEIGHT || 630),
  steps: Number(process.env.COMFYUI_STEPS || 24),
  cfg: Number(process.env.COMFYUI_CFG || 6.5),
  sampler: process.env.COMFYUI_SAMPLER || "euler",
  scheduler: process.env.COMFYUI_SCHEDULER || "normal",
  negativePrompt:
    process.env.COMFYUI_NEGATIVE_PROMPT ||
    "blurry, low quality, distorted text, watermark, stock photo, cluttered, generic corporate illustration",
};

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.slug || !args.title) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const slug = slugify(args.slug);
const category = args.category || "Covable";
const prompt =
  args.prompt ||
  [
    "Create a premium editorial blog hero image for Covable, an AI citation visibility platform.",
    `Topic: ${args.title}.`,
    `Category: ${category}.`,
    "Style: dark minimal SaaS interface, black background, lime accent, abstract citation graph, answer engine search signals, refined technical composition.",
    "No readable text, no logos, no people, no screenshots, no busy UI.",
  ].join(" ");

const outputDir = args.outputDir ? path.resolve(args.outputDir) : defaults.outputDir;
const outputPath = args.output
  ? path.resolve(args.output)
  : path.join(outputDir, `${slug}.png`);

await mkdir(path.dirname(outputPath), { recursive: true });

const workflow = args.workflow
  ? await loadCustomWorkflow(args.workflow, {
      prompt,
      negativePrompt: args.negative || defaults.negativePrompt,
      width: Number(args.width || defaults.width),
      height: Number(args.height || defaults.height),
      slug,
      title: args.title,
      category,
    })
  : await createDefaultWorkflow({
      comfyUrl: defaults.comfyUrl,
      checkpoint: args.checkpoint || process.env.COMFYUI_CHECKPOINT,
      prompt,
      negativePrompt: args.negative || defaults.negativePrompt,
      width: Number(args.width || defaults.width),
      height: Number(args.height || defaults.height),
      steps: Number(args.steps || defaults.steps),
      cfg: Number(args.cfg || defaults.cfg),
      sampler: args.sampler || defaults.sampler,
      scheduler: args.scheduler || defaults.scheduler,
      seed: args.seed ? Number(args.seed) : randomSeed(),
      filenamePrefix: `covable-blog-${slug}`,
    });

const image = await generateImage({
  comfyUrl: args.comfyUrl || defaults.comfyUrl,
  workflow,
  timeoutMs: Number(args.timeoutMs || 180000),
});

await writeFile(outputPath, image.bytes);
await writeFile(
  outputPath.replace(/\.png$/i, ".json"),
  `${JSON.stringify(
    {
      slug,
      title: args.title,
      category,
      prompt,
      comfyUrl: args.comfyUrl || defaults.comfyUrl,
      image: image.meta,
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
Generate a Covable blog image through a running ComfyUI server.

Usage:
  pnpm blog:image -- --slug answer-engine-optimization --title "What AEO means for SaaS teams" --category AEO

Options:
  --slug             Required. Output filename slug.
  --title            Required. Blog post title used in the image prompt.
  --category         Optional. Blog category label for prompt context.
  --prompt           Optional. Full custom positive prompt.
  --negative         Optional. Custom negative prompt.
  --checkpoint       Optional. ComfyUI checkpoint name. Defaults to first available checkpoint.
  --workflow         Optional. Path to a ComfyUI API workflow JSON with {{PROMPT}} placeholders.
  --output           Optional. Exact output path. Defaults to apps/landing/public/blog/images/<slug>.png.
  --comfyUrl         Optional. Defaults to COMFYUI_URL or http://127.0.0.1:8188.

Start ComfyUI first, usually:
  python main.py --listen 127.0.0.1 --port 8188
`);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSeed() {
  return Math.floor(Math.random() * 999999999999999);
}

async function createDefaultWorkflow(config) {
  const checkpoint = config.checkpoint || (await getFirstCheckpoint(config.comfyUrl));
  if (!checkpoint) {
    throw new Error(
      "No ComfyUI checkpoint found. Install an SD/SDXL checkpoint or pass --workflow with a custom API workflow.",
    );
  }

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: config.seed,
        steps: config.steps,
        cfg: config.cfg,
        sampler_name: config.sampler,
        scheduler: config.scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: checkpoint,
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: config.width,
        height: config.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: config.prompt,
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: config.negativePrompt,
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: config.filenamePrefix,
        images: ["8", 0],
      },
    },
  };
}

async function getFirstCheckpoint(comfyUrl) {
  try {
    const response = await fetch(`${comfyUrl}/object_info/CheckpointLoaderSimple`);
    if (!response.ok) return "";
    const info = await response.json();
    return info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.[0] || "";
  } catch {
    throw new Error(`Could not reach ComfyUI at ${comfyUrl}. Start ComfyUI, then rerun the command.`);
  }
}

async function loadCustomWorkflow(workflowPath, replacements) {
  const file = await readFile(path.resolve(workflowPath), "utf8");
  const replaced = file
    .replaceAll("{{PROMPT}}", jsonStringContent(replacements.prompt))
    .replaceAll("{{NEGATIVE_PROMPT}}", jsonStringContent(replacements.negativePrompt))
    .replaceAll("{{WIDTH}}", String(replacements.width))
    .replaceAll("{{HEIGHT}}", String(replacements.height))
    .replaceAll("{{SLUG}}", jsonStringContent(replacements.slug))
    .replaceAll("{{TITLE}}", jsonStringContent(replacements.title))
    .replaceAll("{{CATEGORY}}", jsonStringContent(replacements.category));

  return JSON.parse(replaced);
}

function jsonStringContent(value) {
  return JSON.stringify(String(value)).slice(1, -1);
}

async function generateImage({ comfyUrl, workflow, timeoutMs }) {
  const clientId = crypto.randomUUID();
  const promptResponse = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, prompt: workflow }),
  });

  if (!promptResponse.ok) {
    const body = await promptResponse.text();
    throw new Error(`ComfyUI rejected the workflow: ${promptResponse.status} ${body}`);
  }

  const { prompt_id: promptId } = await promptResponse.json();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(1000);
    const historyResponse = await fetch(`${comfyUrl}/history/${promptId}`);
    if (!historyResponse.ok) continue;

    const history = await historyResponse.json();
    const entry = history[promptId];
    const image = findFirstImage(entry);
    if (!image) continue;

    const viewUrl = new URL(`${comfyUrl}/view`);
    viewUrl.searchParams.set("filename", image.filename);
    viewUrl.searchParams.set("subfolder", image.subfolder || "");
    viewUrl.searchParams.set("type", image.type || "output");

    const imageResponse = await fetch(viewUrl);
    if (!imageResponse.ok) {
      throw new Error(`Could not download image from ComfyUI: ${imageResponse.status}`);
    }

    return {
      bytes: Buffer.from(await imageResponse.arrayBuffer()),
      meta: image,
    };
  }

  throw new Error(`Timed out waiting for ComfyUI after ${timeoutMs}ms`);
}

function findFirstImage(entry) {
  if (!entry?.outputs) return null;
  for (const output of Object.values(entry.outputs)) {
    if (output?.images?.length) return output.images[0];
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
