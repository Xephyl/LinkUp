# Deployment Guide — Vercel (web) + Render (backend)

Target architecture:

```
Browser ──► Vercel (static React build, apps/web/dist)
    │            VITE_API_URL = https://<backend>.onrender.com
    ├── REST ──► Render web service (Express, apps/backend)
    └── WS  ───► Render web service (Socket.io, same process/port)
                      │
                      ├── MongoDB Atlas (MONGODB_URI)
                      ├── Supabase (storage)
                      ├── Resend (email)
                      └── Sentry
```

The code is already Render-ready: the server reads `process.env.PORT` (Render injects it), exposes `GET /health`, and the web app takes the backend URL from `VITE_API_URL` for both REST (`baseURL`) and Socket.io (`io(SOCKET_URL)`). CORS/socket origins are keyed off `CLIENT_URL` on the backend.

Deploy **backend first** — you need its URL before configuring the frontend.

---

## 1. Prerequisites

- MongoDB Atlas cluster + database user (connection string `mongodb+srv://...`)
- Supabase project (URL, anon/service key per your env schema, bucket name)
- Resend API key + verified sender domain
- Google OAuth client (client ID + secret)
- Render and Vercel accounts; GitHub repo connected

## 2. Backend → Render

1. Render dashboard → **New → Web Service** → connect this repo.
2. Settings:
   - **Root Directory:** leave empty (repo root — pnpm workspace install needs it)
   - **Environment:** Node
   - **Build Command:**
     ```
     corepack enable && pnpm install --frozen-lockfile && pnpm --filter @chatapp/backend build
     ```
   - **Start Command:**
     ```
     node apps/backend/dist/server.js
     ```
   - **Health Check Path:** `/health`
   - **Plan:** Starter (free tier works but sleeps after ~15 min idle — first request/socket reconnect can take ~50 s; the client already retries forever)
3. **Environment variables** (Render → Environment). Names per `.devin/memory/projects/linkup/env-map.md`:
   - `NODE_ENV=production`
   - `PORT` — leave unset; Render injects it
   - `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
   - `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET`
   - `RESEND_API_KEY`, `EMAIL_FROM`
   - `CLIENT_URL=https://<your-app>.vercel.app` ← set after step 3; use the production URL, not a preview URL
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `SENTRY_DSN`, `SENTRY_RELEASE` (optional)
   - Note: `server.ts` loads `.env.production` via dotenv, but dotenv never overrides real env vars — dashboard values win. No env file needed on Render.
4. Deploy. When live, verify `https://<svc>.onrender.com/health` returns `{"success":true,...}`.

### MongoDB Atlas notes

- Network Access: add `0.0.0.0/0` (Render egress IPs aren't static on lower tiers) or Render's static outbound IPs if on a paid plan.
- Use a dedicated DB user; enable "Retry Writes" in the URI.

## 3. Web → Vercel

Two options — pick one:

**Option A: Git integration (simplest)**
1. Vercel → **Add New → Project** → import repo.
2. Framework preset: **Other**. `vercel.json` already sets install/build/output:
   - install: `pnpm install --frozen-lockfile`
   - build: `pnpm --filter @chatapp/web run build`
   - output: `apps/web/dist`
   - SPA rewrite to `index.html` is already configured.
3. Environment variables (Production **and** Preview if you want previews working):
   - `VITE_API_URL=https://<backend>.onrender.com` ← no trailing slash; used for REST **and** sockets
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE`
   - Build-time only (Sentry upload): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB`
4. Deploy.

**Option B: existing GitHub Actions pipeline**
`deploy.yml` already deploys on push to `main` via the Vercel CLI. Repo is linked (`.vercel/project.json` → project `chatapp-web`). Add GitHub secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (values in `.vercel/project.json` + a token from vercel.com/account/tokens). Vercel env vars still must be set in the dashboard — `vercel pull` in CI reads them.

> `VITE_*` values are baked in at **build time**. Changing `VITE_API_URL` requires a redeploy.

## 4. Wire them together

1. Backend live → note `https://<name>.onrender.com`
2. Vercel: set `VITE_API_URL` to that URL → redeploy
3. Render: set `CLIENT_URL=https://<app>.vercel.app` → redeploy backend (CORS + socket origin allowlist + password-reset links all derive from it)

The backend already allows your Vercel project's preview deployments (`*.<clientHost>` subdomain logic in `app.ts`/`server.ts`), so previews work once `CLIENT_URL` is the production domain.

## 5. Post-deploy smoke test

- [ ] `GET https://<backend>.onrender.com/health` → 200
- [ ] Register + log in on the Vercel URL
- [ ] Send a message in a room; confirm real-time delivery (Socket.io connected — check browser console for `🔌 Socket connected`)
- [ ] Typing indicator / presence work
- [ ] Forgot-password email arrives and reset link points at the Vercel domain
- [ ] Avatar/media upload displays (Supabase storage + CORS)

## 6. Gotchas

- **Cold starts:** Render free tier sleeps. First API call or socket connect can take ~30–60 s. Client retries forever; consider a paid always-on instance or a uptime pinger for production.
- **In-memory state:** cache, rate limits, socket adapter are in-memory (Redis removed). Fine for a single instance; do **not** scale to >1 instance without revisiting this.
- **Google OAuth:** add the Vercel domain to the OAuth client's authorized JavaScript origins; the backend callback uses `GOOGLE_CLIENT_SECRET`.
- **Sockets on Render:** WebSockets work on Render web services out of the box — no extra config needed.
- **Secrets:** never put real values in the repo; `.env*` files are git-ignored.

## Rollback

- Web: Vercel → Deployments → promote previous deployment, or revert the merge commit (deploy.yml redeploys `main`).
- Backend: Render → deploys a previous commit, or roll back the env var that broke it.
