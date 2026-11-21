# ChatApp

Multi-platform chat application — real-time messaging across web, mobile, and desktop clients.

## Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Web | React 18, Vite, Tailwind CSS, Redux Toolkit |
| Backend | Express, MongoDB (Mongoose), Socket.io |
| Mobile | Expo / React Native |
| Desktop | Electron + Vite |
| Services | Supabase (storage), in-memory cache/rate-limit, Resend (email), Sentry, JWT + Google OAuth |
| Package manager | pnpm 8.15.0 (workspaces) |

## Project structure

```
chatapp/
├── apps/
│   ├── web/        React frontend (Vite) — port 3000
│   ├── backend/    Express API + Socket.io — port 4000
│   ├── mobile/     Expo app
│   └── desktop/    Electron app
├── packages/
│   └── shared/     Shared types and utilities
├── scripts/        Cloudflare tunnel, tree generator
└── docs/           Setup guides
```

## Prerequisites

- Node.js 20+
- pnpm 8.15.0 (`npm i -g pnpm@8.15.0` or `corepack enable`)
- MongoDB (cache/rate-limit/sessions are in-memory — no Redis needed)

## Setup

```bash
pnpm install
```

Environment files (copy from `.example` files, never commit real values):

- `apps/backend/.env.development` — backend config (validated by Zod on boot)
- `apps/web/.env.development` — `VITE_*` vars for the frontend
- `.env.local` (root) — optional tunnel email config (`MAIL_*`, see `.env.tunnel.example`)

Key env vars are documented in each app's `.env.example`.

## Development

```bash
pnpm dev            # all workspaces in parallel
pnpm dev:web        # web only → http://localhost:3000
pnpm dev:backend    # API only → http://localhost:4000
pnpm dev:mobile     # Expo
pnpm dev:desktop    # Electron
```

The Vite dev server proxies `/api` and `/socket.io` to the backend, so you only need `dev:web` + `dev:backend` for full-stack work.

### Dev tunnel (test on real devices)

```bash
pnpm tunnel         # Cloudflare Tunnel → localhost:4000, emails you the URL
pnpm tunnel:raw     # same, prints URL only
TUNNEL_PORT=3000 pnpm tunnel   # tunnel a different port
```

Requires `cloudflared` + `nodemailer` (already devDependencies). For email, set `MAIL_USER`, `MAIL_APP_PASSWORD`, `MAIL_TO` in `.env.local` — see `.env.tunnel.example`. Backend CORS and Vite already allow `*.trycloudflare.com`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` across workspaces |
| `pnpm lint` | ESLint (apps that define it) |
| `pnpm -r test` | Jest tests |
| `pnpm build` | Build all workspaces |
| `pnpm tree` | Print workspace tree (`pnpm tree:save` writes `structure.md`) |

## Testing

```bash
cd apps/backend
pnpm test            # all suites
pnpm test:unit       # unit only
pnpm test:integration
pnpm test:coverage
```

Backend tests load `apps/backend/.env.test` (see `.env.test.example`).

## CI / Deploy

- **CI** (`.github/workflows/ci.yml`): on push/PR to `main` — typecheck, lint (when configured), build.
- **Deploy** (`.github/workflows/deploy.yml`): on push to `main` — re-runs checks, deploys web to Vercel.
- Vulnerability scanning is handled by **Dependabot**.

Required GitHub secrets for deploy: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

## Conventions

See `CONVENTIONS.md` (repo root, git-ignored) for project rules: env var naming, `globalThis` usage, bundle chunking, and more.
