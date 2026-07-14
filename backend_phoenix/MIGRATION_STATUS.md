# SkillHub Backend Language Migration — Status & Continuation

**Target:** Migrate the backend core from **Python/FastAPI → Elixir/Phoenix**,
keeping Python as a focused AI/ML service (polyglot). Phoenix owns realtime +
auth + CRUD over the **same** Supabase Postgres (Ecto); the Next.js frontend is
unchanged except for pointing at Phoenix and adopting Phoenix Channels for
realtime.

Full architecture rationale: `~/.claude/plans/now-i-want-to-resilient-turtle.md`.

---

## Phase map

| Phase | Scope | Status |
|---|---|---|
| **0** | Harden Python: async `httpx` data layer, kill N+1, workers, pytest | **Done** (in `../backend`, hot endpoints migrated) |
| **1** | Stand up Phoenix + strangler; realtime notifications Channel | **Code complete & verified (DB-blocked items pending)** |
| 2 | Move realtime-critical paths (meeting signaling, captions, chat, presence) to Channels | Not started |
| 3 | Port remaining CRUD module-by-module; shrink Python to AI/ML only | Not started |
| 4 | LiveView dashboards, observability, load tests | Not started |

---

## Phase 1 — what this app (`backend_phoenix/`) is

A **strangler-fig gateway** that runs on the port the frontend already targets.
It serves the routes it has natively ported and **reverse-proxies everything
else to the Python service** byte-for-byte. Migration proceeds by moving one
module at a time from "proxied" to "native", then deleting the Python route.

### Natively ported (served by Phoenix) — all verified against the live DB
- `GET  /healthz` — liveness
- **Auth (password-less):** `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`
- **Notifications:** `GET /notifications`, `PATCH|POST /notifications/mark-all-read`,
  `PATCH|POST /notifications/:id/read`, `DELETE /notifications/:id`
- **WebSocket** `/socket` → channel `notifications:<user_id>` — realtime push (verified end-to-end)
- **Subjects:** `GET /subjects`, `GET /subjects/categories`
- **Reports:** `POST /students/reports`
- **Impact (public):** `GET /impact`
- **Analytics:** `GET /sponsors/impact-summary`, `GET /teachers/analytics-summary`
- **Peer matching:** `GET /students/peer-matches`
- **Learning groups:** `GET/POST /students/groups`, `GET /students/groups/mine`,
  `GET /students/groups/:id`, `POST /students/groups/:id/join|leave`
- **Language:** `GET /language/supported`, `GET|POST|PATCH /language/preference`,
  `GET /language/user-settings`, `POST /language/quick-change/:code`
- **Users:** `GET|PUT /users/profile`, `GET /users/dashboard-stats`
- **Session enrollment:** `POST /enrollments/sessions/:id/enroll`,
  `GET /enrollments/sessions/:id/enrollments`,
  `PATCH /enrollments/enrollments/:id/respond`, `GET /enrollments/my-enrollments`
  — *ported corrected*: the Python original queried a non-existent table
  (`live_live_session_enrollment_requests`) and mis-compared teacher ids, so
  these routes were broken; the Phoenix port fixes both.

- **Exams/quizzes:** full teacher CRUD (`GET|POST /teachers/exams`,
  `GET|PATCH|DELETE /teachers/exams/:id`, `GET /teachers/exams/:id/submissions`)
  + student flow (`GET /students/exams`, `GET /students/exams/:id`,
  `POST /students/exams/:id/start|submit`, `GET /students/exams/:id/results`)
  with MCQ/true-false auto-grading. Verified create→publish→delete.

> `SkillHub.SQL` gained `json_all/json_one` (`to_jsonb` row fetch — faithful
> `select *` with no per-table schema) and handles non-RETURNING writes. uuid /
> timestamp / jsonb params are passed as strings and cast in SQL
> (`$n::uuid` with auto-dumped binary; `$n::text::timestamp`; `$n::text::jsonb`).

- **Scholarships + access codes:** full sponsor CRUD + application review
  (`/sponsors/scholarships*`, `/sponsors/scholarship-applications/:id`,
  `/sponsors/access-codes*`) and student flow (`/students/scholarships*`,
  `/students/scholarship-applications`, `/students/funding-grants`,
  `/students/redeem-access-code`). Money paths verified end-to-end: grant
  minting on approve (LKR) + access-code redemption + slot accounting.

- **Payments (core):** `POST /payments/sessions/:id/payment` (demo checkout),
  `GET /payments/my-payments`, `POST /payments/scholarship-grant` (grant
  redemption), `GET /payments/sessions/:id/payment-status`. Verified. PayHere
  initiate/notify/status stay proxied (credential-gated + signature webhook).

- **Guardians (dashboard):** `GET /guardians/students`,
  `GET /guardians/students/:id/dashboard`, `PATCH /guardians/students/:id/accessibility`.
  Invite + accept-invite stay proxied (accept-invite creates a user w/ password → bcrypt).
- **Admin:** `GET /admin/dashboard`, teacher verification, report moderation,
  payout queue (create/approve/mark-paid/cancel), `GET /teachers/earnings-summary`.
  Verified with a real admin account. `/admin/send-session-reminders` stays proxied.

> Latent Python bugs fixed while porting: `live_session_payments` real column is
> `payment_status` (not `status`); `reports.status` enum has no `open` (cast to
> text); `teacher_profiles` has no `qualifications`/`bio` (nil-safe via to_jsonb).

- **Accessibility (hot path):** `GET/POST/PATCH /accessibility/preferences`,
  `GET /accessibility/presets`, `GET /accessibility/guardian-links`,
  `GET /accessibility/onboarding-status`, `GET /accessibility/disability-profile`.
  Verified writes persist. Teacher-specialization, disability-profile POST,
  guardian-invite email, and the static disability-types list stay proxied.
  Fixed a pre-existing broken DB trigger (`update_accessibility_prefs_timestamp`
  referenced `NEW.updated_at`; the table only had `last_modified`) via migration
  `20260713000002` — every preference UPDATE was failing before.

- **Sponsors hub (done):** profile/setup, dashboard(+/rest), campaigns
  list/detailed/create/update/delete, events list/get/create/update/delete/launch,
  recent-impact, sponsorship-requests(+/rest)+status. Many of these were no-ops
  in Python (SQLAlchemy shim) — the port makes them actually work. `analytics`
  (+/rest) stays proxied (large `build_sponsor_analytics` aggregation).

- **Students hub (done — 38/39):** dashboard, profile GET/PUT, find-teachers,
  subjects, contact-teacher, campaigns, live-sessions, content-library,
  pre-recorded-lessons, content-categories, content/:id (+progress), conversations
  (list/messages/send/create), enrolled-courses, payment-history, events
  (list/categories/register/bookmark), forum (posts/categories/stats/detail/
  create/vote/replies), session-recordings, join-session, set-reminder, wishlist,
  certificates(list/download), payment-history/:id/receipt, progress-report — all
  native (PDF via headless Chrome, see below). Fixed ~8 more
  latent Python bugs (wrong wishlist/session_participants/reviews columns, missing
  `events.status`/`event_bookmarks`, `forum` column names + `post_category` enum,
  `live_sessions` duration computed from scheduled times, ...).

- **Teachers hub (DONE — ~75/79):** profile(GET/PUT/rest), avatar(proxied),
  subjects(GET/POST/DELETE), courses(GET/rest/list/POST), content(GET) +
  accessibility-tracks(PATCH), sessions(GET/rest/POST/PUT/status/DELETE +
  participants GET/add/remove + recording PUT/DELETE + join/leave + analytics),
  students(GET/rest/add/message/email/report/:id-progress), analytics, earnings,
  payments(GET/rest + payment-history), events(full CRUD + categories + templates +
  from-template + status/archive + registrations + analytics + promo), sponsorship
  (GET/POST/:id GET/PUT/DELETE), notifications(GET/rest/read/mark-all), schedule
  (GET/simple/rest/conflicts/bulk-apply/bulk-reschedule), appointments(POST/PUT/
  DELETE), availability(POST/PUT/DELETE), health.

### Conversion complete — incl. auth + email

**Auth is now fully native.** `bcrypt_elixir` is built with **zig cc** (vendored
in `vendor/bcrypt_elixir`, compiled by `Mix.Tasks.Compile.BcryptZig`) — no MSVC,
no Windows SDK, no admin. Hashes are `$2b$12$…`, byte-for-byte compatible with the
Python passlib hashes, so existing users log in unchanged. Ported natively:
`register`, `login`, `verify-email`, `resend-verification`, `forgot-password`,
`reset-password` (SHA-256 one-time tokens in `SkillHub.Auth.OneTimeTokens`), plus
transactional email via **Swoosh + gen_smtp** (`SkillHub.Emails` / `SkillHub.Mailer`;
Local adapter in dev, real SMTP when `SMTP_HOST`+`SMTP_USER` are set).

**Still proxied to Python — and why:**
- **File uploads** (avatar / content / accessibility-track): Supabase Storage
  needs the *service-role* key, which isn't in the repo (Python uses a local-disk
  fallback). `SkillHub.Storage` + the upload actions in `TeacherController` are
  written and ready — set `SUPABASE_SERVICE_KEY` and wire the 3 routes to go native.
- **Web-push** (pywebpush/VAPID) and **PayHere gateway**: credential-gated, low
  traffic; left in Python.
- **Claude AI chatbot**: Python is the AI/ML service by architectural design.

**PDF generation is now fully native.** Certificates (trilingual en/si/ta,
landscape A4), payment receipts (student + teacher), and accessibility progress
reports are rendered by `SkillHub.PDF` — HTML templates piped through headless
Chrome's one-shot `--print-to-pdf`. Chrome does the font shaping, so Sinhala/Tamil
render correctly (templates declare Noto/Nirmala fallbacks). We shell out directly
rather than over ChromicPDF's CDP remote-debugging pipe, which relies on Unix FD
redirection that breaks on Windows; each render uses a throwaway user-data-dir so
concurrent jobs never collide on Chrome's singleton lock. Controllers:
`CertificateController`, `ReceiptController`, `ProgressReportController`. No Python,
no reportlab, no native-lib build. Verified end-to-end (200 · application/pdf ·
correct MediaBox orientation).

Everything else — every CRUD/dashboard/list/auth route — runs natively on
Elixir/Phoenix. Toolchain: Elixir 1.20 / OTP 29 + zig 0.16, all installed
user-space via scoop (no admin).
Auth login/register/forgot/reset/verify stay proxied until bcrypt (Windows SDK)
+ email (Swoosh) land. Scholarship auto-matcher notifications are a stubbed
no-op in the port (`kick_off_matching/1`) — reinstate when porting the matcher.

### Intentionally kept in Python (per the architecture plan — the AI/ML service)
`chat_ai` (Claude), plus credential-gated integrations: notification push
subroutes (`pywebpush`/VAPID) and the PayHere payment gateway.

> Analytics ports collapse the Python N+1 loops into single SQL aggregates.
> Porting a module = add routes + a controller/context; the proxy auto-detects
> native routes from the router (`Phoenix.Router.route_info/4`).

### Proxied to Python (unchanged behavior)
Everything else, including the password-based auth routes (`/auth/login`,
`/auth/register`, `/auth/forgot-password`, `/auth/reset-password`,
`/auth/verify-email`, `/auth/resend-verification`) and the push-subscription
routes (`/notifications/subscribe`, `/vapid-public-key`, ...), plus all
`students`, `teachers`, `sponsors`, `scholarships`, `meetings`, `payments`, etc.

### Cross-compatibility guarantees (why native + proxied coexist safely)
- **JWT**: HS256 with the **same** `SECRET_KEY` and claim set (`sub`, `exp`) as
  `backend/core/security.py`. A token minted by either backend validates on both.
- **Passwords**: bcrypt, still hashed/verified by Python. Shared `users` table.
- **Cookie**: same name (`skillhub_session`), HttpOnly, `Secure`/`SameSite`
  environment-aware.

### The realtime headline (deletes polling)
`priv/repo/migrations/20260713000001_notification_notify_trigger.exs` installs an
idempotent Postgres trigger that fires `pg_notify('skillhub_new_notification',
<id>)` on every INSERT into `notifications` — **regardless of whether Python or
Phoenix inserted the row.** `SkillHub.Notifications.Listener` holds a session
`LISTEN`, loads the row, and broadcasts it to the user's channel. The listener
self-heals: if the DB session drops, REST keeps working and it retries.

---

## Verified (2026-07-13)

Gateway compiles and boots. With the DB **down**, confirmed live:
- `GET /healthz` → `200 {"status":"ok"}`
- `GET /api/v1/auth/me` (no token) → `401 {"detail":"Not authenticated"}` (matches Python)
- CORS preflight → `204` with correct `Access-Control-*` for `http://localhost:3000`
- Strangler proxy → GET/POST (with body) forwarded to an upstream on `:8001`,
  status/body/method preserved; `login` correctly falls through to Python.
- App stays up and serves requests while the DB is unreachable (listener retries,
  no crash-loop).

---

## ⚠ BLOCKER — the Supabase project is paused/inactive

The project `juwpzzkuyqygcjrubqpt` is not reachable: its API subdomain no longer
resolves, REST/auth return no response, and the pooler reports
`tenant/user postgres.juwpzzkuyqygcjrubqpt not found`. (The existing Python
backend can't reach its data either right now — this is pre-existing, not caused
by the migration.)

**To unblock:** open the Supabase dashboard → this project → **Restore/Resume**
(free-tier projects pause after inactivity). If it was deleted, provide new DB
credentials and update `config/dev.exs` + `backend/config.py`.

Once restored, finish Phase 1 verification:
1. `mix ecto.migrate` — installs the notification trigger (creates
   `schema_migrations` in Supabase; additive + reversible).
2. Log in via the frontend (proxied → Python), then confirm `GET /api/v1/auth/me`
   and `GET /api/v1/notifications` return real data through Phoenix.
3. Insert a test notification row and confirm it pushes over the `/socket`
   channel in < 200 ms (the Phase 1 realtime target).
4. Wire the frontend: point `NEXT_PUBLIC_API_URL` at the gateway and subscribe
   the notifications bell to the `notifications:<user_id>` channel (replaces the
   polling in `hooks/use-realtime-notifications.ts` / `lib/api.ts`).

---

## Toolchain notes (Windows)

- Elixir 1.20.2 / Erlang OTP 29 installed via scoop (user-space, no admin).
- Elixir binaries live in `~/scoop/apps/elixir/current/bin` (on PATH). Erlang
  shims are in `~/scoop/shims`.
- **`bcrypt_elixir` is intentionally NOT a dependency yet.** Its native NIF needs
  the **Windows SDK** (UCRT headers). The VS 2022 Build Tools are installed but
  the SDK component is missing, and the elevated installer needs a UAC approval
  that wasn't granted. Because password hashing stays in Python for Phase 1,
  bcrypt isn't needed yet. To port login/register natively later: add the
  Windows 11 SDK (VS Installer → Build Tools → "Windows 11 SDK" + "MSVC v143"),
  then `cd backend_phoenix && mix deps.get` after re-adding `{:bcrypt_elixir, "~> 3.1"}`.

## Run

```bash
cd backend_phoenix
mix deps.get
mix ecto.migrate            # once the DB is reachable
PORT=8000 mix phx.server    # gateway on :8000
# Python service must run on :8001 (PYTHON_BACKEND_URL); e.g.
#   cd ../backend && uvicorn main:app --port 8001
```

Config knobs (env): `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
`AUTH_COOKIE_NAME`, `PYTHON_BACKEND_URL`, `DB_HOST`/`DB_PORT`/`DB_USER`/
`DB_PASSWORD`/`DB_NAME`, `FRONTEND_URL`/`CORS_ORIGINS`.
