# Deployment Guide

## Architecture Overview

```
                   ┌─────────────────────┐
                   │   Vercel             │
                   │   (Next.js 16)       │
                   │   Frontend only      │
                   └────────┬────────────┘
                            │ REST  /  Browser
                            │
               ┌────────────▼──────────────┐
               │  Persistent Server         │
               │  (Railway / Render / VPS)  │
               │  Fastify + WebSocket       │
               └────────────┬──────────────┘
                            │ service_role
                            │
               ┌────────────▼──────────────┐
               │  Supabase                  │
               │  (already deployed)        │
               │  Auth + PostgreSQL         │
               └───────────────────────────┘
```

### Why the backend cannot go on Vercel

The Fastify backend **must run on a persistent server**. Three reasons:

1. **WebSockets** — Vercel Serverless functions have a 10-second execution limit and do not support persistent TCP connections. Every bid, timer tick, and live event travels over WebSocket.
2. **In-memory auction state** — The `RoomManager` holds all live auction state in process memory. Serverless would spin up a fresh process per request with no shared state.
3. **File storage** — `STORAGE=file` writes room snapshots to disk. Serverless has no persistent filesystem.

The frontend is a standard Next.js app with no server-side auction logic — it deploys to Vercel normally.

---

## Part 1 — Deploy the Frontend to Vercel

### Prerequisites

- Vercel account at [vercel.com](https://vercel.com)
- Repository pushed to GitHub / GitLab / Bitbucket
- Supabase project already set up (project ref: `dvhzbkehgnkhernboigi`)
- Backend deployed and its public URL known (you'll need this for env vars)

### Step 1 — Import the project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** → select your repo
3. When Vercel detects the monorepo structure, set:
   - **Root Directory** → `frontend`
   - **Framework Preset** → Next.js (auto-detected)
   - **Build Command** → `npm run build` (default)
   - **Output Directory** → `.next` (default)
   - **Install Command** → `npm install` (default)

### Step 2 — Add environment variables

In the Vercel project → **Settings → Environment Variables**, add all of these:

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend-domain.com/api` | Your deployed backend URL |
| `NEXT_PUBLIC_WS_URL` | `wss://your-backend-domain.com/ws` | Same domain, `wss://` not `ws://` |
| `NEXT_PUBLIC_USE_MOCK_DATA` | `false` | Never `true` in production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dvhzbkehgnkhernboigi.supabase.co` | From Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Anon key from Supabase dashboard |

> **Do not add** `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET` to Vercel — those belong on the backend only.

Set the environment for **Production**, **Preview**, and **Development** as appropriate.

### Step 3 — Deploy

Click **Deploy**. Vercel runs `npm run build` and deploys. Your frontend is live at `https://your-project.vercel.app`.

### Step 4 — Update Supabase Auth redirect URLs

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL** → `https://your-project.vercel.app`
- **Redirect URLs** → add `https://your-project.vercel.app/**`

This ensures password reset and email confirmation links redirect back to your Vercel deployment.

### Subsequent deployments

Every push to your main branch triggers an automatic redeploy. No further action needed.

---

## Part 2 — Deploy the Backend

The backend is a long-running Node.js 22 process. Choose one of the options below.

---

### Option A — Railway (Recommended — easiest)

Railway detects Node.js automatically, provides persistent TCP (WebSockets work), and has a free starter tier.

#### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub Repo**
2. Select your repository
3. In the **Root Directory** field set: `backend`
4. Railway detects `package.json` and uses it automatically

#### 2. Configure the start command

Railway uses `npm start` by default. Your `package.json` already has:

```json
"start": "node --env-file-if-exists=.env dist/server.js"
```

Add a **build command** in Railway settings:

```
npm run build
```

Or use a `railway.json` in the `backend/` folder:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

#### 3. Add environment variables

In Railway → your service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `PORT` | `3001` (Railway sets `$PORT` automatically — see note below) |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `FRONTEND_ORIGIN` | `https://your-project.vercel.app` |
| `STORAGE` | `memory` (see note) |
| `AUTH_MODE` | `jwt` |
| `JWT_SECRET` | _(paste from Supabase dashboard → Project Settings → Data API → JWT Secret)_ |
| `JWT_ISSUER` | `https://dvhzbkehgnkhernboigi.supabase.co/auth/v1` |
| `JWT_AUDIENCE` | `authenticated` |
| `SUPABASE_URL` | `https://dvhzbkehgnkhernboigi.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | _(service role key from Supabase dashboard)_ |
| `DATABASE_URL` | _(Supabase → Project Settings → Database → Connection string, Session mode port 5432)_ |

> **`PORT` note:** Railway injects its own `$PORT` env var. Your server reads `process.env.PORT` via the Zod schema which defaults to `3001`. Railway's injected `PORT` will override it automatically — no change needed.

> **`STORAGE=memory` note:** Railway's filesystem is ephemeral across redeploys. Use `memory` so auction state is held in-process. For persistence across restarts, configure an external Redis store or use `DATABASE_URL` only — but for real-time auctions in-memory is fine since a restart means all active auctions reset anyway. Set `STORAGE=file` only if you mount a Railway Volume (see below).

#### 4. (Optional) Mount a Railway Volume for file storage

If you want room state to survive restarts:

1. Railway → your service → **Add Volume** → mount path `/app/data`
2. Set `STORAGE=file` and `DATA_DIR=/app/data`

#### 5. Get your public URL

Railway gives you a domain like `your-service.up.railway.app`. Use this for:
- Vercel env `NEXT_PUBLIC_API_URL=https://your-service.up.railway.app/api`
- Vercel env `NEXT_PUBLIC_WS_URL=wss://your-service.up.railway.app/ws`

---

### Option B — Render

Similar to Railway. Render has a free tier (spins down after 15 min of inactivity — not ideal for auctions) and a paid tier that stays live.

#### 1. Create a Web Service

1. [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Set **Root Directory**: `backend`
4. Set **Build Command**: `npm install && npm run build`
5. Set **Start Command**: `node dist/server.js`
6. Select **Node** environment, version **22**

#### 2. Add environment variables

Same as the Railway table above. In Render → your service → **Environment**.

> Set `HOST=0.0.0.0` — Render requires binding to all interfaces.

#### 3. Get your public URL

Render gives you `https://your-service.onrender.com`. Use the same pattern as Railway for Vercel env vars.

---

### Option C — VPS (DigitalOcean Droplet / Hetzner / Linode)

Best for full control and lowest latency. Use this if you want `STORAGE=file` with a real persistent filesystem.

#### 1. Provision a server

Minimum: 1 vCPU, 1 GB RAM. Ubuntu 24.04 LTS. Node.js 22.

```bash
# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2
```

#### 2. Clone and build

```bash
git clone https://github.com/your-org/your-repo.git /app
cd /app/backend
npm install
npm run build
```

#### 3. Create the env file

```bash
cp .env.example .env
nano .env
# Fill in all values — see backend/.env for the template
```

Set:
- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `STORAGE=file`
- `DATA_DIR=/app/backend/data`
- `FRONTEND_ORIGIN=https://your-project.vercel.app`

#### 4. Start with PM2

```bash
cd /app/backend
pm2 start dist/server.js --name auction-backend
pm2 startup   # enable start on reboot
pm2 save
```

#### 5. Nginx reverse proxy (for HTTPS + WebSocket)

Install Nginx and Certbot:

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

Create `/etc/nginx/sites-available/auction`:

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # WebSocket upgrade headers — critical
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Keep WebSocket connections alive
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/auction /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.yourdomain.com
sudo systemctl reload nginx
```

Your backend is now at `https://api.yourdomain.com` with automatic HTTPS and WebSocket support.

---

## Part 3 — Post-Deployment Checklist

### Backend health check

```
GET https://your-backend-domain.com/api/health
```

Expected response:
```json
{ "status": "ok", "serverTime": 1234567890 }
```

### WebSocket connectivity

Open your browser console on the deployed frontend and check for:
```
[WS] Connection opened
```

If you see `DISCONNECTED` immediately, the most common causes are:
- `FRONTEND_ORIGIN` on the backend doesn't match your Vercel domain exactly (no trailing slash)
- The backend is binding to `127.0.0.1` instead of `0.0.0.0`
- HTTPS/WSS mismatch — backend is HTTP but frontend uses `wss://`

### Supabase CORS

Supabase does not need CORS changes — the frontend talks to it directly from the browser using the anon key, which is intentionally public.

### Backend CORS

The backend `FRONTEND_ORIGIN` env var must match your Vercel URL **exactly**:

```
FRONTEND_ORIGIN=https://your-project.vercel.app
```

No trailing slash. For custom domains, comma-separate:

```
FRONTEND_ORIGIN=https://auctionarena.com,https://www.auctionarena.com
```

---

## Part 4 — Environment Variable Reference

### Frontend (Vercel)

| Variable | Required | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | `https://api.yourdomain.com/api` |
| `NEXT_PUBLIC_WS_URL` | ✅ | `wss://api.yourdomain.com/ws` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://dvhzbkehgnkhernboigi.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `eyJhbGci...` |
| `NEXT_PUBLIC_USE_MOCK_DATA` | ✅ | `false` |

### Backend (Railway / Render / VPS)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | ✅ | `3001` (Railway overrides automatically) |
| `HOST` | ✅ | `0.0.0.0` in production |
| `NODE_ENV` | ✅ | `production` |
| `FRONTEND_ORIGIN` | ✅ | Exact Vercel URL, no trailing slash |
| `AUTH_MODE` | ✅ | `jwt` |
| `JWT_SECRET` | ✅ | Supabase → Project Settings → Data API → JWT Secret |
| `JWT_ISSUER` | ✅ | `https://<ref>.supabase.co/auth/v1` |
| `JWT_AUDIENCE` | ✅ | `authenticated` |
| `SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Project Settings → Data API → service_role |
| `DATABASE_URL` | ✅ | Supabase → Project Settings → Database → Session pooler URI |
| `STORAGE` | ✅ | `memory` (Railway/Render) or `file` (VPS with volume) |
| `DATA_DIR` | if `STORAGE=file` | `/app/data` or your mount path |
| `LOG_LEVEL` | — | `info` |

---

## Part 5 — Updating After Changes

### Frontend (Vercel)

Push to your main branch. Vercel rebuilds and redeploys automatically.

### Backend (Railway)

Push to your main branch. Railway detects the push, rebuilds, and restarts the service.

Active auctions will drop their WebSocket connections on restart. Clients reconnect automatically (the WebSocket service has exponential backoff up to 6 attempts). Room state is reloaded from `STORAGE` on restart — if `memory`, active auctions are lost; if `file`, they resume.

### Backend (VPS)

```bash
cd /app
git pull
cd backend
npm run build
pm2 restart auction-backend
```

---

## Quick Start Summary

```
1. Push repo to GitHub

2. Deploy backend first:
   Railway → New Project → backend/ folder
   Add all env vars → get public URL

3. Deploy frontend:
   Vercel → New Project → frontend/ folder
   Set NEXT_PUBLIC_API_URL + NEXT_PUBLIC_WS_URL to Railway URL
   Set Supabase vars → Deploy

4. Update Supabase Auth redirect URLs to Vercel domain

5. Test: GET /api/health → {"status":"ok"}
         Open app → sign in → create room → verify WebSocket connects
```
