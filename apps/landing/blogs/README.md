# Covable Blog Publishing

Featured images live in:

```text
apps/landing/public/blog/images/
```

Do not publish internal research notes in article bodies. Search intent, opportunity gaps, semantic entities, competitor notes, and keyword research should guide the article or live in private drafting notes. The public article should read like a finished resource, not an SEO brief.

Generate an image with OpenAI Images:

```bash
pnpm blog:image -- --slug answer-engine-optimization --title "What AEO means for SaaS teams" --category AEO
```

The script reads `OPENAI_IMAGE_KEY` first, then `OPENAI_API_KEY`, from `.env`, `apps/backend/.env`, or `apps/frontend/.env.local`.

Default cost-saving settings:

```text
model: gpt-image-1-mini
quality: low
size: 1024x1024
```

The default output is:

```text
apps/landing/public/blog/images/<slug>.png
```

Optional ComfyUI fallback:

```bash
pnpm blog:image:comfy -- --slug answer-engine-optimization --title "What AEO means for SaaS teams" --category AEO
```

The ComfyUI script expects ComfyUI at `http://127.0.0.1:8188` by default. For Flux or another custom ComfyUI graph, export an API workflow JSON and pass:

```bash
pnpm blog:image:comfy -- --workflow ./path/to/workflow.json --slug my-post --title "My post"
```
