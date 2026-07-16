# SkillHub — Full Deployment Guide (Free, No Credit Card)

Deploy the **backend on Render** and the **frontend on Vercel**. Both free, no
card. Your database (Supabase) is already live — you host nothing DB-side.

Follow the parts in order:
- **Part A** — Backend → Render
- **Part B** — Frontend → Vercel
- **Part C** — Connect the two (final step, don't skip)
- **Part D** — (optional) keep the backend awake for free

> **One thing to know:** Render's free service sleeps after ~15 min of no
> traffic and takes ~30–50s to wake on the next request. Notifications are never
> lost (they're saved in Supabase and show on wake/reload). Part D removes the
> sleep for free if it bothers you.

---

## Before you start — accounts & where to get values

Open these and sign up (all free, no card). Keep the tabs open — you'll copy
values from them.

| What | Click here | You'll grab |
|---|---|---|
| GitHub (host your code) | https://github.com/new | — |
| Render (backend) | https://dashboard.render.com/register | — |
| Vercel (frontend) | https://vercel.com/signup | — |
| Supabase API keys | https://supabase.com/dashboard/project/juwpzzkuyqygcjrubqpt/settings/api | `SUPABASE_URL`, anon key, service-role key |
| Supabase DB string | https://supabase.com/dashboard/project/juwpzzkuyqygcjrubqpt/settings/database | `DATABASE_URL` (Session pooler) |
| Anthropic key (AI chat) | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` |
| cron-job.org (Part D) | https://console.cron-job.org/signup | — |

### Generate your two secrets now
You need two random strings. Open PowerShell and run this **twice**:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

- First output → your **`SECRET_KEY`** (the shared JWT key).
- Second output → your **`SECRET_KEY_BASE`** (Phoenix cookie key).

Save both somewhere temporary — you'll paste them into Render in Part A.

### Step 0 — push this repo to GitHub
Render deploys from a Git repo (no CLI needed). In the project folder:

```powershell
git add -A
git commit -m "Add Render + Vercel deploy config"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/skillhub.git   # from the repo you created
git push -u origin main
```

---

## Part A — Backend on Render

### A1. Create the service from the Blueprint
1. Go to **https://dashboard.render.com/blueprints** → **New Blueprint Instance**.
2. Connect your GitHub account and pick the **skillhub** repo.
3. Render detects `render.yaml` and shows a service named **`skillhub-backend`**.
   Click **Apply** / **Create**.

### A2. Fill in the environment variables
Render will prompt for the secret variables (the ones marked below). Enter them
in the service's **Environment** tab. **Required** ones make the core app work;
**optional** ones can be left blank at first and added later — the app degrades
cleanly without them.

#### Backend env vars — REQUIRED

| Variable | Value / where to get it |
|---|---|
| `SECRET_KEY` | your **first** generated string (from Step above) |
| `SECRET_KEY_BASE` | your **second** generated string |
| `DATABASE_URL` | Supabase → Database page → **Connection string → Session pooler** (port **5432**). Convert the `postgresql://` prefix to **`ecto://`** and URL-encode special characters in the password. Example: `ecto://postgres.juwpzzkuyqygcjrubqpt:URLENCODED_PW@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Supabase API page → **Project URL** (`https://juwpzzkuyqygcjrubqpt.supabase.co`) |
| `SUPABASE_KEY` | Supabase API page → **anon / public** key |
| `SUPABASE_SERVICE_KEY` | Supabase API page → **service_role** key (needed for file uploads) |
| `FRONTEND_URL` | leave as a placeholder for now (e.g. `https://example.vercel.app`); you set the real value in **Part C** |
| `CORS_ORIGINS` | same as `FRONTEND_URL` |

> ⚠️ **`DATABASE_URL` must be the Session pooler (5432), not the Transaction
> pooler (6543)** — the realtime notification bell needs a `LISTEN/NOTIFY`
> connection that 6543 drops.

#### Backend env vars — already set for you (in `render.yaml`, no action needed)
`PHX_SERVER`, `MIX_ENV`, `PYTHON_BACKEND_URL`, `POOL_SIZE`, `ALGORITHM`,
`ACCESS_TOKEN_EXPIRE_MINUTES`, `SUPABASE_BUCKET`, `ANTHROPIC_MODEL`,
`PAYHERE_SANDBOX`, `VAPID_SUBJECT`, `EMAILS_FROM_NAME`, `SMTP_PORT`, `PHX_HOST`.

#### Backend env vars — OPTIONAL (add when you need that feature)

| Variable | Enables | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI chat | https://console.anthropic.com/settings/keys |
| `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET` | Payments | https://www.payhere.lk merchant dashboard |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web-push notifications | generate: `python -c "from py_vapid import Vapid01; v=Vapid01(); v.generate_keys(); print(v.public_key_urlsafe_b64, v.private_key_urlsafe_b64)"` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAILS_FROM_EMAIL` | Real email (verify/reset) | your SMTP provider (e.g. Gmail app password, Brevo, Mailtrap) |

### A3. Deploy & verify
1. Click **Create / Deploy**. First build takes a few minutes (it compiles the
   Elixir release and installs Python + Chromium).
2. When live, Render shows your URL, e.g. `https://skillhub-backend.onrender.com`.
3. **Copy that exact URL.** Then set the `PHX_HOST` variable to it (host only, no
   `https://`), e.g. `skillhub-backend.onrender.com`, and let it redeploy.
4. Test it in your browser — open:
   `https://skillhub-backend.onrender.com/healthz` → you should see a small JSON
   health response.

Backend done. **Copy your backend URL** — you need it for Part B.

---

## Part B — Frontend on Vercel

### B1. Import the project
1. Go to **https://vercel.com/new**.
2. Import the same **skillhub** GitHub repo.
3. Vercel auto-detects **Next.js**. The app is at the repo root, so **leave the
   Root Directory as `./`** — no override.

### B2. Add the frontend environment variables
In the import screen (or **Settings → Environment Variables**), add these three:

#### Frontend env vars (all three required)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | your backend URL from Part A, e.g. `https://skillhub-backend.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://juwpzzkuyqygcjrubqpt.supabase.co` (Supabase API page → Project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API page → **anon / public** key (same anon key as the backend's `SUPABASE_KEY`) |

> Don't put the service-role key here — the frontend only ever uses the **anon**
> key. `NEXT_PUBLIC_` variables are visible in the browser.

### B3. Deploy
Click **Deploy**. When it finishes, Vercel gives you a URL like
`https://skillhub.vercel.app`. **Copy it** — you need it for Part C.

---

## Part C — Connect the two (final step)

Right now the backend doesn't yet trust your Vercel origin, so logins/WebSocket
would be blocked by CORS. Fix that:

1. Back in **Render → skillhub-backend → Environment**, set:
   - `FRONTEND_URL` = your exact Vercel URL, e.g. `https://skillhub.vercel.app`
   - `CORS_ORIGINS` = same value
2. Save — Render redeploys automatically.
3. Open your Vercel URL, register/log in, and confirm data loads and the
   notification bell connects.

✅ **You're live.** Frontend on Vercel, backend on Render, database on Supabase —
all reachable from anywhere, nothing running on your machine.

---

## Part D — (optional) Keep the backend awake for free

So the realtime bell never pauses and there are no cold starts:

1. Sign in at **https://console.cron-job.org**.
2. **Create cronjob** →
   - URL: `https://skillhub-backend.onrender.com/healthz`
   - Schedule: **every 10 minutes**
3. Save. This pings your backend so Render keeps it awake. Running warm 24/7 uses
   ~730 of Render's 750 free monthly hours, so it fits within the free budget.

---

## Troubleshooting

- **Build fails on Render** — check the build log. The first build is slow
  (Elixir + Chromium); give it time. Ensure the repo pushed correctly.
- **Login fails / CORS error in the browser console** — `FRONTEND_URL` /
  `CORS_ORIGINS` don't exactly match your Vercel URL (Part C). No trailing slash.
- **Bell won't connect** — same CORS values feed the WebSocket origin check; and
  confirm `DATABASE_URL` is the **5432** session pooler, not 6543.
- **PDF generation fails / service restarts under load** — the free 512MB is
  tight for Chromium. Split into two free services (Phoenix+Chromium separate
  from Python) — ask me and I'll generate the split `render.yaml` + Dockerfiles.
- **Emails not sending** — expected until you set the `SMTP_*` vars (optional).

## Notes
- **Migrations:** the schema already lives in Supabase; nothing runs migrations
  on deploy. Apply new ones yourself.
- **No lock-in:** `Dockerfile.backend` is host-neutral — the same image runs on
  any Docker host if you later move off Render (see `DEPLOY.md` for a VPS path).
