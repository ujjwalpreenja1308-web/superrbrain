# DigitalOcean Droplet — Chromium Headless Deployment

**Target:** 4 GB RAM / 2 vCPUs, Ubuntu 22.04

---

## 1. Install Chromium + system deps

```bash
apt-get update
apt-get install -y chromium-browser \
  libatk-bridge2.0-0 libgtk-3-0 libx11-xcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 \
  libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatspi2.0-0
```

## 2. Add 2 GB swap (safety net)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Chromium as a systemd service

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

# Verify
curl http://localhost:9222/json/version
```

## 4. Backend env

Add to your `.env` / PM2 env:

```
BROWSER_WS_ENDPOINT=http://localhost:9222
NODE_OPTIONS=--max-old-space-size=1024
```

## 5. Run backend with PM2

```bash
npm install -g pm2
cd /srv/covable/apps/backend
pnpm build
pm2 start dist/index.js --name covable-api \
  --max-memory-restart 1500M \
  --node-args="--max-old-space-size=1024"
pm2 save
pm2 startup
```

## 6. Architecture at runtime

```
4 GB / 2 vCPU droplet
├── chromium-cdp.service  — port 9222 (127.0.0.1 only)
│     ~300 MB baseline + ~80 MB per active tab
│     JS heap capped at 512 MB
│
└── covable-api (Node/Hono)
      ~200 MB idle, capped at 1500 MB before PM2 restarts
      │
      └── getBrowser() — singleton, reconnects on CDP disconnect
            ├── 1 browser context (cookies preserved)
            ├── 5-tab semaphore (CONCURRENCY = 5)
            ├── Resource blocking — fonts/media/analytics aborted
            ├── Per-user prompt quota (default 10/session)
            └── SIGTERM → closeBrowser() graceful shutdown
```

## 7. Memory budget

| Component              | Estimated RAM |
|------------------------|--------------|
| OS + kernel            | ~300 MB       |
| Swap headroom          | 2 GB (disk)   |
| Chromium baseline      | ~300 MB       |
| 5 active Chromium tabs | ~400 MB       |
| Node.js backend        | ~200-400 MB   |
| **Total (peak)**       | **~1.4 GB**   |

Well within 4 GB with ~2.5 GB headroom.

## 8. Health check

```bash
# Backend
curl http://localhost:3001/health

# Chromium CDP
curl http://localhost:9222/json/version
```
