# Differently-abled student separation — build & hand-off

Strong, logical separation of the **Visual** and **Hearing** tracks from the
normal student experience, within the **single** shared Supabase database.
Backend runs on Railway (Phoenix gateway → Python), frontend on Vercel. Nothing
here changes that topology.

---

## What was built

### 1. Strong post-login separation
- `components/accessibility/StudentTrackGate.tsx` (mounted from the new
  `app/students/layout.tsx`) wraps **every** `/students/**` route:
  - a Visual/Hearing student can't sit on `/students/dashboard`; a normal
    student can't reach a track dashboard;
  - a track student who opens the generic content-library / find-teachers is
    rerouted to their own `…/library` / `…/find-specialist`.
- Persistent **track badge** in the top nav (`TrackBadge.tsx`).
- **Curated track sidebar** (13 focused items) vs the normal 23 → trimmed to 16.

### 2. Tailored track experiences (frontend)
- `components/dashboards/track/TrackStudentDashboard.tsx` — accent **identity
  banner** + real track data (library counts, matched specialists, bookings).
- `TrackLibrary.tsx` + `app/students/{visual,hearing}/library` — audio-first
  (Visual) / captioned·transcript·sign-language (Hearing) library with a
  track-aware player. Media is presigned from R2.
- `FindSpecialist.tsx` + `app/students/{visual,hearing}/find-specialist` —
  track-walled specialist matching + booking.

### 3. Backend (Python, proxied by Phoenix automatically)
`backend/api/v1/endpoints/accessibility_student.py`, mounted under `/students`:
| Route | Purpose |
|---|---|
| `GET /api/v1/students/accessibility/dashboard` | Track-specific extras |
| `GET /api/v1/students/accessibility/library` | Tailored content, R2-presigned |
| `GET /api/v1/students/accessibility/specialists` | Track-matched specialists |
| `POST /api/v1/students/accessibility/specialists/{id}/book` | Book a specialist |
| `GET /api/v1/students/accessibility/bookings` | The student's bookings |

Every endpoint is **walled to the caller's own track** in the application layer
(`services/track_matching.py`) — the authoritative wall, because the Python
service uses the Supabase service-role key which bypasses RLS.

The Phoenix router (`backend_phoenix/lib/skillhub_web/router.ex`) does **not**
match these paths, so its StranglerProxy forwards them to Python — no gateway
change needed.

---

## ⚠️ The one manual step — apply migration 023

The DB is otherwise untouched. Booking a specialist needs one additive,
**idempotent** migration:

**`backend/database/migrations/023_accessibility_separation.sql`**

Run it either way:

**A. Supabase SQL editor** — paste the file's contents and Run.

**B. psql**
```bash
psql "$DATABASE_URL" -f backend/database/migrations/023_accessibility_separation.sql
```

It adds: the `accessibility_specialist_bookings` table (+ RLS), the `audio_url`
content column (and re-asserts the caption/transcript/audio-description/sign
columns), and partial indexes for the track libraries. Safe to re-run.

Until it's applied, everything works **except** the booking write, which returns
a clear `503` ("bookings table may not be migrated yet").

---

## Deploy

- **Railway (backend):** just deploy — `accessibility_student.py` is registered
  in `main.py` and needs no new env vars (reuses the existing R2 + Supabase
  config). Verified: the full app imports with all 5 routes registered.
- **Vercel (frontend):** just deploy — no new env vars.
- Then apply migration 023 (above).

---

## How to verify

Already verified against live Supabase:
- normal student → `/students/dashboard` **200**, track endpoints **403** (wall holds).

To see the happy path, use a **Visual/Hearing** student:
1. Sign up as a student, answer "differently-abled = yes", and pick a visual or
   hearing condition in the assessment (this sets `primary_track`).
2. Log in → you land on `/students/{track}/dashboard` with the identity banner,
   curated sidebar and track badge.
3. Open the library and Find-a-specialist pages.

Populate track media from the teacher side via the existing
`POST /api/v1/teachers/content/{id}/accessibility-tracks` /
`…/accessibility-tracks/upload` endpoints (caption / audio-description /
sign-language, stored as `r2://<key>` and presigned on read).

---

## Nav trim (normal student)

Removed from the sidebar (pages still exist, reachable by URL): **Peer Matches,
Groups, Campaigns, Redeem Code, Forum, Downloads, Wishlist**.

_Note (out of scope, pre-existing):_ the top-nav "Community" dropdown for
students points at `/students/community/*` pages that don't exist in the tree —
dead links worth cleaning up separately.
