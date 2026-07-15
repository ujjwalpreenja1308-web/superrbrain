# Covable Production Deployment

Covable runs on managed services. ChatGPT answer capture runs through Bright Data, with OpenAI web search as the fallback path in development or non-Bright-Data environments.

## Architecture

```
Vercel
  covable.app        landing
  home.covable.app   dashboard / app

Render
  covable-backend    Hono API

Trigger.dev Cloud
  scheduled and background jobs

External services
  Supabase           auth + database
  Bright Data        ChatGPT answer capture and citations
  OpenAI             prompt generation, scoring, extraction, content generation
  Firecrawl          brand and cited-page scraping
  Apify              Reddit monitoring
  Dodo Payments      checkout and subscription webhooks
  Composio           Reddit account connection/posting
```

## Backend On Render

Use `render.yaml` as the source of truth for the backend service.

Build command:

```bash
pnpm install && pnpm --filter @covable/shared build && pnpm --filter @covable/backend build
```

Start command:

```bash
node apps/backend/dist/index.js
```

Required backend environment variables:

```bash
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://home.covable.app
BACKEND_URL=https://superrbrain.onrender.com

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
BRIGHTDATA_API_KEY=...
APIFY_API_KEY=...

TRIGGER_SECRET_KEY=tr_prod_...
COMPOSIO_API_KEY=...
PUBLISHER_ENCRYPTION_KEY=<64 hex chars>

DODO_PAYMENTS_API_KEY=...
DODO_WEBHOOK_SECRET=...
DODO_PRODUCT_STARTER_MONTHLY=...
DODO_PRODUCT_GROWTH_MONTHLY=...
DODO_PRODUCT_PRO_MONTHLY=...
```

## Trigger.dev Workers

Deploy workers from the backend package:

```bash
cd apps/backend
npx trigger.dev@latest deploy
```

Set Trigger.dev environment variables:

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
BRIGHTDATA_API_KEY=...
APIFY_API_KEY=...
COMPOSIO_API_KEY=...
PUBLISHER_ENCRYPTION_KEY=<64 hex chars>
```

Bright Data is required for production ChatGPT monitoring. Without `BRIGHTDATA_API_KEY`, monitoring falls back to OpenAI web search behavior, which is useful for development but is not the production capture path.

## Frontend On Vercel

Deploy the Vite frontend from `apps/frontend`.

Build command:

```bash
pnpm --filter @covable/shared build && pnpm --filter @covable/frontend build
```

Output directory:

```bash
dist
```

Environment variables:

```bash
VITE_API_URL=https://superrbrain.onrender.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_HOME_URL=https://home.covable.app
VITE_DODO_PRODUCT_STARTER_MONTHLY=...
VITE_DODO_PRODUCT_GROWTH_MONTHLY=...
VITE_DODO_PRODUCT_PRO_MONTHLY=...
```

Point `home.covable.app` to this project.

## Landing Page On Vercel

Deploy the landing site from `apps/landing`.

Build command:

```bash
vite build
```

Output directory:

```bash
dist
```

Point `covable.app` to this project.

## Supabase Auth

In Supabase → Authentication → URL Configuration:

Site URL:

```bash
https://home.covable.app
```

Redirect URLs:

```bash
https://covable.app/**
https://home.covable.app/**
http://localhost:5173/**
```

## Supabase Migrations

Migrations live in `apps/backend/supabase/migrations/`.

Apply new migrations through the Supabase SQL editor or CLI:

```bash
supabase db push --db-url "postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
```

The subscription/runtime state migrations are required for plan routing and billing:

```bash
apps/backend/supabase/migrations/015_add_plan_override.sql
apps/backend/supabase/migrations/016_runtime_state_columns.sql
```

## Health Checks

Backend:

```bash
curl https://superrbrain.onrender.com/health
```

Expected response:

```json
{"status":"ok"}
```

## Update Checklist

1. Push changes to `main`.
2. Confirm Render backend deploy succeeds.
3. Confirm Vercel frontend and landing deploys succeed.
4. If trigger files changed, run:

```bash
cd apps/backend
npx trigger.dev@latest deploy
```

5. Apply any new Supabase migrations.
