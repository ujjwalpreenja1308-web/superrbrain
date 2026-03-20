# Covable — Production Deployment Runbook

Complete guide to deploying Covable on the DigitalOcean droplet with all services running reliably.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  DigitalOcean Droplet (4 GB / 2 vCPU, Ubuntu 22.04)        │
│                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │ chromium-cdp.service     │  │ covable-api (PM2)        │ │
│  │ port 9222 (127.0.0.1)   │  │ port 3001                │ │
│  │ headless Chromium        │  │ Node.js / Hono           │ │
│  │ 5-tab concurrency cap   │◄─│ Playwright CDP connect   │ │
│  └──────────────────────────┘  └──────────┬───────────────┘ │
│                                            │                 │
│                                   ┌────────┴────────┐       │
│                                   │ trigger.dev     │       │
│                                   │ cloud workers   │       │
│                                   │ (runs tasks)    │       │
│                                   └─────────────────┘       │
└─────────────────────────────────────────────────────────────┘

External:
  Supabase (DB + Auth) ← both backend & frontend
  OpenAI API           ← backend (prompt gen, content gen, scoring)
  Firecrawl API        ← backend (URL scraping on onboard)
  Trigger.dev Cloud    ← runs background tasks (monitoring, content gen)
  Vercel               ← frontend (app.covable.app) + landing (covable.app)
```

---

## 1. Server Setup (First Time Only)

### 1.1 System deps + Chromium

```bash
apt-get update && apt-get upgrade -y
apt-get install -y chromium-browser \
  libatk-bridge2.0-0 libgtk-3-0 libx11-xcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 \
  libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatspi2.0-0
```

### 1.2 Node.js + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pnpm pm2
```

### 1.3 Swap (safety net for memory spikes)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 1.4 Chromium as systemd service

Create `/etc/systemd/system/chromium-cdp.service`:

```ini
[Unit]
Description=Chromium Headless CDP
After=network.target

[Service]
Type=simple
User=www-data
ExecStart=/usr/bin/chromium-browser \
  --headless=new \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-extensions \
  --no-first-run \
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --js-flags="--max-old-space-size=512" \
  --memory-pressure-off \
  about:blank
Restart=always
RestartSec=5
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable chromium-cdp
systemctl start chromium-cdp
```

---

## 2. Deploy Backend (Every Update)

### 2.1 Pull code

```bash
cd /srv/covable
git pull origin main
```

### 2.2 Install + build

```bash
pnpm install --frozen-lockfile
pnpm --filter @covable/shared build
pnpm --filter @covable/backend build
```

### 2.3 Environment variables

Create `/srv/covable/apps/backend/.env`:

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI
OPENAI_API_KEY=sk-...

# Scraping
FIRECRAWL_API_KEY=fc-...

# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_...

# Server
FRONTEND_URL=https://app.covable.app
PORT=3001

# Chromium CDP (DO droplet)
BROWSER_WS_ENDPOINT=http://localhost:9222
NODE_OPTIONS=--max-old-space-size=1024
```

### 2.4 Start / restart with PM2

```bash
cd /srv/covable/apps/backend

# First time:
pm2 start dist/index.js --name covable-api \
  --max-memory-restart 1500M \
  --node-args="--max-old-space-size=1024"
pm2 save
pm2 startup

# On updates:
pm2 restart covable-api
```

---

## 3. Deploy Trigger.dev Workers

Trigger.dev runs tasks in the cloud (their infrastructure), but workers must be deployed from the codebase.

### 3.1 Deploy workers

```bash
cd /srv/covable/apps/backend
npx trigger.dev@latest deploy
```

This deploys all tasks in `src/trigger/`:
- `onboard-brand` — scrapes URL, extracts brand data, generates prompts
- `run-monitoring` — sends prompts to ChatGPT, records responses + citations
- `generate-content` — creates Reddit/blog content for citation gaps
- `generate-blog` — generates full blog posts for AEO
- `check-gap-closure` — re-checks if deployed content closed gaps
- `weekly-cron` — scheduled weekly monitoring scan

### 3.2 Verify deployment

```bash
npx trigger.dev@latest deploy --list
```

Or check the Trigger.dev dashboard at https://cloud.trigger.dev

### 3.3 Set Trigger.dev environment variables

In the Trigger.dev dashboard (Project → Environment Variables), set:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
FIRECRAWL_API_KEY=fc-...
BROWSER_WS_ENDPOINT=http://<DROPLET_IP>:9222
```

> **IMPORTANT**: The Trigger.dev cloud workers need to reach the Chromium CDP on the droplet. Either:
> a) Expose port 9222 via nginx with IP allowlist from Trigger.dev
> b) Use a reverse tunnel (e.g. cloudflared)
> c) Run Trigger.dev tasks that need ChatGPT scraping via the API instead

---

## 4. Deploy Frontend (Vercel)

The frontend is a single Vite app deployed to **two Vercel projects** (same code, different domains).
`isAuthDomain()` / `isHomeDomain()` in the app detect which subdomain is active and serve the
appropriate UI.

### 4.1 Vercel project 1 — auth subdomain

- **Project name**: `covable-auth`
- **Root Directory**: `apps/frontend`
- **Build Command**: `pnpm --filter @covable/shared build && pnpm --filter @covable/frontend build`
- **Output Directory**: `dist`
- **Install Command**: `pnpm install`

Environment variables:
```
VITE_API_URL=https://api.covable.app
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_AUTH_URL=https://auth.covable.app
VITE_HOME_URL=https://home.covable.app
```

Point `auth.covable.app` → this Vercel project.

### 4.2 Vercel project 2 — home subdomain

- **Project name**: `covable-home`
- Same settings as above (same repo, same root directory)
- Same environment variables

Point `home.covable.app` → this Vercel project.

### 4.3 Supabase — cross-subdomain session sharing

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://home.covable.app`
- **Redirect URLs** (add all):
  ```
  https://auth.covable.app/**
  https://home.covable.app/**
  http://localhost:5173/**
  ```

The session cookie is set on `.covable.app` (Supabase default for `*.covable.app` subdomains),
so both `auth.covable.app` and `home.covable.app` share the same auth session automatically.

### 4.4 Backend CORS

In the backend `.env`:
```
FRONTEND_URL=https://auth.covable.app,https://home.covable.app
```

---

## 5. Deploy Landing Page (Vercel)

### 5.1 Vercel project settings

- **Root Directory**: `apps/landing`
- **Build Command**: `vite build`
- **Output Directory**: `dist`

### 5.2 Domain

Point `covable.app` → Vercel project

---

## 6. Nginx Reverse Proxy (DO Droplet)

Set up nginx to expose the API on port 443:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/covable-api`:

```nginx
server {
    listen 80;
    server_name api.covable.app;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/covable-api /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.covable.app
```

---

## 7. DNS Records

| Record | Type | Value |
|--------|------|-------|
| `covable.app` | A / CNAME | Vercel (landing) |
| `auth.covable.app` | A / CNAME | Vercel (frontend — auth subdomain) |
| `home.covable.app` | A / CNAME | Vercel (frontend — dashboard subdomain) |
| `api.covable.app` | A | Droplet IP |

---

## 8. Health Checks

```bash
# Backend API
curl https://api.covable.app/health
# → {"status":"ok"}

# Chromium CDP (from droplet only)
curl http://localhost:9222/json/version
# → {"Browser":"...","Protocol-Version":"..."}

# PM2 status
pm2 status
pm2 logs covable-api --lines 50

# Memory usage
free -h
pm2 monit
```

---

## 9. Monitoring & Alerts

### PM2 log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

### Cron: auto-restart Chromium if unresponsive

Create `/etc/cron.d/chromium-health`:

```
*/5 * * * * root curl -sf http://localhost:9222/json/version > /dev/null || systemctl restart chromium-cdp
```

---

## 10. Memory Budget

| Component | Estimated RAM |
|-----------|--------------|
| OS + kernel | ~300 MB |
| Swap headroom | 2 GB (disk) |
| Chromium baseline | ~300 MB |
| 5 active tabs (peak) | ~400 MB |
| Node.js backend | ~200-400 MB |
| **Total (peak)** | **~1.4 GB** |

Well within 4 GB with ~2.5 GB headroom.

---

## 11. Quick Update Checklist

Every time you push new code:

```bash
# On the droplet:
cd /srv/covable
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @covable/shared build
pnpm --filter @covable/backend build
pm2 restart covable-api

# If trigger tasks changed:
cd apps/backend
npx trigger.dev@latest deploy
```

Frontend + landing auto-deploy on push to `main` via Vercel.

---

## 12. Rollback

```bash
# Find the last working commit
git log --oneline -10

# Roll back
git checkout <commit-hash> -- apps/backend
pnpm --filter @covable/shared build
pnpm --filter @covable/backend build
pm2 restart covable-api
```

---

## 13. Supabase Migrations

Migrations live in `apps/backend/supabase/migrations/`. To apply a new migration:

```bash
# On the Supabase dashboard → SQL Editor → paste the migration file
# Or using the Supabase CLI:
supabase db push --db-url "postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
```

Current migrations:
1. `001_create_brands.sql` — brands table + RLS
2. `002_create_prompts.sql` — prompts table + RLS
3. `003_create_ai_responses.sql` — AI response storage
4. `004_create_citations.sql` — citation tracking
5. `005_create_citation_gaps.sql` — gap detection + execution tables
