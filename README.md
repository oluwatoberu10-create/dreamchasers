# Dream Chasers Community

A learning community platform for a weekly, three-month programme: teachers publish a course every week, learners complete assignments and reflect in a journal, teachers grade against configurable pass marks, and super admins run the whole programme.

## What's in it

| Area | Highlights |
|---|---|
| **Accounts** | No public sign-up: only super admins add people (they get a set-password link). Login, logout, profile & password change, admin-issued set-password and reset links, session revocation, rate limiting |
| **Roles** | Learner, Teacher, Super Admin. Super admins teach from the same account. Every check is server-side, re-reading the role from the database on each request |
| **Programme** | Configurable start date, 1–26 weeks (12/13 presets), timezone, week-start day; tracks (subjects) with assigned teachers; one expected course per track per week |
| **Courses** | Track optional (a course without one gets its own); draft → scheduled → published → archived; Markdown lessons (XSS-safe renderer), objectives, evaluation criteria, private file uploads, links/videos, learner preview |
| **Assignments** | Written and/or file submissions, max score, pass mark, deadline, late policy, resubmission policy, attempt cap, rubric |
| **Grading** | Grading queue, workspace with live pass/fail, rubric scoring, feedback, revision requests, regrade audit trail |
| **Keep learning** | Revisions and "repeat this course" never delete anything: every attempt and grade is kept and improvement is shown |
| **Learner** | Dashboard, course library, assignments, to-do list (derived + personal tasks), calendar planner, 3-month progress tracker, weekly evaluation table, weekly journal with autosave |
| **Teacher** | Dashboard, courses, calendar, assignments with missing-work roster, grading, students (filters), learner profiles, weekly checklist, follow-up messages |
| **Admin** | Create & assign courses (title + teacher + week; the teacher builds the rest), metrics overview, users (create/edit/role/deactivate/delete-if-safe/enrol/reset link), teachers, students, all courses + weekly coverage grid, assignments, programme calendar, analytics, activity & audit log, settings |
| **Notifications** | Persistent, deduplicated, created in the same transaction as the event; bell with polling, read/unread, mark all, pagination |
| **Messaging** | One-to-one threads, unread counts, polling; learners can only message staff |
| **Jobs** | Scheduled publishing, in-app teacher course-upload reminders (timezone-aware, deduplicated), due-soon and overdue notifications |

The app needs **no external services or API keys** — just Postgres. There is no email: people who forget their password get a one-time reset link from an admin (*Admin → Users → the person → Create password reset link*).

## Technology

- **Next.js 15 (App Router) + React 19 + TypeScript**, server components and server actions.
- **PostgreSQL** via **Drizzle ORM** with SQL migrations in `drizzle/`. Locally, `npm run dev` boots a real Postgres 18 cluster from the `embedded-postgres` binaries — no Docker or install needed.
- **Tailwind CSS 4** with a small in-house component kit (`src/components/ui`) and server-rendered SVG charts. Light theme only: white content area, navy sidebar.
- **Auth**: own session implementation (scrypt password hashes, opaque session tokens stored hashed, httpOnly cookies).
- **Files**: stored on the server's local disk (`./.uploads`), streamed only after a permission check.
- **Tests**: Vitest unit tests for the rules, plus integration tests against a real Postgres database.

## Running locally

Prerequisites: **Node.js 24** and npm. Nothing else.

```bash
cd dream-tutors
npm install
npm run preview               # fastest: local Postgres + migrations + optimised build on :3000
# or
npm run dev                   # development mode with hot reload (slower: compiles each page on first visit)
```

The database starts **empty** — there is no demo or sample data. To get going:

1. In a second terminal, create your super admin: `npm run admin:create -- --email you@yourdomain.com` (see below).
2. Sign in, then in *Admin → Settings* create the programme, add tracks and assign teachers.
3. Add teachers and learners under *Admin → Users → Add user*, and share each person's set-password link with them.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run preview` | Local Postgres + migrations + production build + `next start` (fast) |
| `npm run dev` | Local Postgres + migrations + Next dev server (hot reload) |
| `npm run db:start` / `db:stop` / `db:status` / `db:destroy` | Manage the local cluster |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (safe in production) |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts` |
| `npm run db:reset` | Wipe the local database back to empty tables (local only) |
| `npm run admin:create -- --email you@example.com` | Create or promote a super admin (see below) |
| `npm run jobs:run` | Run the background jobs once (`-- --at=2026-10-16T09:00:00Z` to simulate a time, local only) |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (creates and rebuilds a `dreamtutors_test` database on the local cluster) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |

## Creating the first super admin safely

There are no default administrator credentials anywhere. In any environment:

```bash
DATABASE_URL=... npm run admin:create -- --email you@yourdomain.com --first Your --last Name
```

- If the account exists (e.g. an admin added it), it is promoted.
- Otherwise it is created with a **random one-time password printed once to your terminal** (never stored in plain text). Sign in and change it under *Profile*.

After that, manage all roles from **Admin → Users**. Accounts an admin creates get a one-time set-password link (valid 7 days) for the admin to share. The database itself refuses to demote or deactivate the last active super admin.

## How progress is calculated

Defined once in `src/lib/progress.ts` and `src/lib/status.ts`, and used by every screen:

1. **Current standing** on an assignment is its **latest graded attempt**. Earlier attempts and their feedback are kept and shown as history (with improvement in points).
2. **Ungraded work is never scored as zero.** It shows as *Awaiting grading*.
3. **Missing work** (deadline passed, nothing handed in) is shown as *outstanding*, never as a zero score.
4. **Average score** = mean of per-assignment percentages over graded assignments, always shown with how many it's based on. With nothing graded there is no average (shown as —).
5. **Pass/fail** compares the score with the pass mark that applied **when it was graded** (snapshotted on the grade), so later pass-mark changes don't rewrite history.
6. **Late joiners**: work is only expected from a learner if its deadline is after they enrolled. Earlier courses remain readable.
7. **Weekly result** distinguishes *Work outstanding* (missing), *Awaiting evaluation* (ungraded), *Keep learning* (graded below the pass mark or revision), and *Passed*.

## Security

- **Authorization lives in one module**, `src/server/policy.ts`, called by every page, server action and API route. IDs are never trusted from the client as proof of anything: the user, their role and their scope come from the database.
- **No public sign-up**: there is no registration page or action. Only a super admin can create accounts, enforced in the service layer (covered by a test).
- **Database-level guards** (`drizzle/0001_guards.sql` plus CHECK constraints): scores within 0..max, pass ≤ max, pass/fail consistent with the score, only active teachers/admins can be recorded as graders, attempts must be submitted before grading, the last super admin can't be removed, one journal entry per learner per week, one submission record per learner per assignment, one active repeat per learner and course, notification deduplication.
- **Row Level Security** is not used. The browser never talks to the database, so every query runs in server code after the policy checks above, and is covered by integration tests for all three roles.
- **Files** are never public. `/api/files/[id]` checks the viewer may see the owning course or submission, returns 404 otherwise, and serves with `nosniff`, a sandboxing CSP, and attachment disposition unless the type is inline-safe. Uploads are checked by extension, size and magic bytes.
- **Rate limits** (Postgres-backed) on login (per IP and per account), password change, messaging and submissions.
- **Other**: Markdown is HTML-escaped before formatting (XSS-tested); server actions get Next's built-in origin check; security headers are set in `next.config.ts`; login takes the same time whether or not the email exists; set-password/reset links are single-use, stored hashed and expire; password changes and resets revoke other sessions; deactivation revokes all sessions immediately; journal text is hidden from admins unless they record a reason, which is audit-logged.

## Background jobs

`runJobs()` (`src/server/services/jobs.ts`) does three idempotent things:

1. **Publishes scheduled courses** whose time has come, and notifies learners.
2. **Teacher course-upload reminders.** For the current programme, it finds weeks that start within *reminder days before* (configurable in Settings, in the **programme's timezone**, from a configurable local hour), finds each track/week slot with no published *or scheduled* course, and sends that track's teachers an **in-app notification**. A unique `(week, track, teacher)` row in `teacher_reminders` guarantees at most one reminder per slot per teacher. Once the course is published or scheduled, no reminder is created.
3. **Deadline notifications**: "due soon" (configurable hours) and "overdue", once per assignment per learner.

**When it runs** (overlapping runs are harmless):

- **Automatically**: signed-in page views trigger a run at most every 15 minutes, using Next's `after()` so it runs after the response is sent and never slows a page down.
- **Manually**: *Admin → Activity → Run jobs now*, or `npm run jobs:run` (e.g. from a server crontab: `0 * * * * cd /srv/dream-tutors && npm run jobs:run`).

## File storage

Uploads are written to `./.uploads` on the server (override with `LOCAL_UPLOAD_DIR`). Back that folder up along with the database. Limits: 25 MB per course file, 10 MB per submission file, 5 files per attempt. For long videos, add a link (YouTube, Vimeo, etc.) instead of uploading.

## Deploying

**On Vercel:**

1. Add a Postgres database: *Project → Storage → Marketplace → Neon* (it sets `DATABASE_URL` for you), or paste any Postgres URL into *Settings → Environment Variables* as `DATABASE_URL`. Use the provider's **pooled** connection string.
2. Redeploy. The build (`vercel-build`) applies the database migrations, then builds the app. Without `DATABASE_URL` it stops with a message saying what to set.
3. From your computer, create the first super admin against that database: `DATABASE_URL="<the same URL>" npm run admin:create -- --email you@…`.
4. In *Admin → Settings*, create the programme.

Vercel's disk is read-only and temporary, so **file uploads are switched off there**. Teachers add videos and documents as links (YouTube, Vimeo, Google Drive, Dropbox), and learners hand in written answers or links.

**On a server with a persistent disk** (a VPS, Railway or Render with a volume, Fly.io with a volume), uploads work and are stored in `./.uploads`:

1. Create a Postgres database and set `DATABASE_URL`.
2. `npm ci && npm run db:deploy && npm run build && npm start`.
3. Run `npm run admin:create -- --email you@…` against the production `DATABASE_URL`.

**Never run `db:reset` against production.** It refuses non-local databases by default.

## Project layout

```
drizzle/                 SQL migrations (schema + guard triggers)
scripts/                 dev/preview launcher, local Postgres, migrate/reset, admin bootstrap, jobs
src/db/                  schema.ts, connection, migrator
src/lib/                 pure rules: dates/timezones, status, progress, markdown, validation (unit-tested)
src/server/auth.ts       sessions, current user, role guards
src/server/policy.ts     every authorization decision
src/server/services/     domain logic: courses, assignments, submissions, learner/teaching read models,
                         notifications, messaging, journal, reminders, jobs, analytics, storage
src/server/actions/      thin server actions (validate → service → feedback)
src/app/(auth)/          login, set/reset password
src/app/(app)/learn      learner area           src/app/(app)/teach   teacher area
src/app/(app)/admin      super admin area       src/app/api           files, notifications, messages
tests/                   integration tests against a real Postgres database
```

## Known limitations

- **No email.** Password resets and new-account links are shared by an admin; reminders and alerts are in-app notifications only.
- **Realtime** uses light polling (notification badge every 60 s while the tab is visible, an open message thread every 10 s), not websockets.
- **Video uploads** are capped at 25 MB per file; larger videos should be linked.
- **Course completion** is self-reported by the learner ("Mark course complete"); there's no per-lesson tracking.
- **Group conversations** and community-wide posts aren't included. Messaging is one-to-one, as the brief prioritised.
- **Learner journal access for teachers** is a platform-wide switch, not per-learner consent.
