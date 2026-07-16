# Deploying SkillHub

Two hosts:

- **Frontend (Next.js)** → **Vercel**
- **Backend (Phoenix + Python + Caddy)** → **one VPS** via Docker Compose

```
              ┌─────────────────────── your VPS ───────────────────────┐
 Vercel  ───► │  Caddy :443 ──► phoenix :8000 ──(strangler)──► python  │
 (frontend)   │   (TLS/WSS)        │                             :8001  │
              └────────────────────┼──────────────────────────────────┘
                                   ▼
                       Supabase Postgres (session pooler :5432)
```

Phoenix serves the natively-ported routes and proxies everything else to the
Python service internally, so **only Phoenix is exposed** (through Caddy).

---

## 1. Backend — the VPS

Any small VPS works (Hetzner CX22, DigitalOcean $6, etc.). Ubuntu 22.04+ with
Docker and the Compose plugin installed.

### DNS
Point an A record at the VPS IP:

    api.yourdomain.com  ->  <vps-ip>

### Deploy

```bash
git clone <your-repo> skillhub && cd skillhub

# Env files (never commit the filled-in versions)
cp .env.phoenix.example .env.phoenix   # then edit
cp .env.python.example  .env.python    # then edit

# Caddy needs the public domain at the compose level:
echo "API_DOMAIN=api.yourdomain.com" > .env

docker compose up -d --build
docker compose logs -f phoenix        # watch it boot
```

Caddy fetches a Let's Encrypt cert automatically on first request. Verify:

```bash
curl https://api.yourdomain.com/health   # or any native route
```

### The values that must line up
- `SECRET_KEY` — **identical** in `.env.phoenix` and `.env.python` (shared JWT key).
- `.env.phoenix` `DATABASE_URL` — Supabase **session pooler**, port **5432**,
  user `postgres.<ref>`. Not the 6543 transaction pooler (realtime needs LISTEN/NOTIFY).
- `FRONTEND_URL` — your exact Vercel origin; feeds both CORS and the WebSocket
  origin check.

### Updating

```bash
git pull && docker compose up -d --build
```

---

## 2. Frontend — Vercel

Import the repo. If the Next.js app is at the repo root, no root-directory
override is needed. Set env vars:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| (WS URL, if the client builds one) | `wss://api.yourdomain.com/socket` |

Deploy. Then add the resulting Vercel URL (and any custom domain) to
`FRONTEND_URL` / `CORS_ORIGINS` in `.env.phoenix` and re-run `docker compose up -d`.

---

## Notes
- **PDFs**: the Phoenix image bundles Chromium + Noto fonts, so certificate /
  receipt / progress-report generation works out of the box (`CHROME_BIN` is
  preset). No external service.
- **bcrypt**: the Linux image builds the Hex `bcrypt_elixir` NIF; the vendored
  zig build is Windows-dev-only. Hashes stay `$2b$`-compatible with existing users.
- **Migrations**: the schema already lives in Supabase; nothing runs migrations
  on deploy. Apply new migrations yourself when you add them.
- **Scaling later**: if you outgrow one box, Python and Phoenix are already
  separate containers — move Python to its own host and repoint
  `PYTHON_BACKEND_URL`.
