# BRONEE HRMS

**BRONEE Limited — Employee & Human Resource Management System**

A fast, secure, fully responsive workforce-management platform: one backend, one
database, two portals (Employee and HR/Admin), installable as a PWA on every device.

| | |
| --- | --- |
| Live | https://bronee-hrms.pages.dev |
| Repository | https://github.com/sahabulalam608-cmd/bronee-hrms |

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Local setup](#local-setup)
- [Cloudflare deployment](#cloudflare-deployment)
- [Google Sheets integration](#google-sheets-integration)
- [Security model](#security-model)
- [Attendance rules engine](#attendance-rules-engine)
- [Scripts](#scripts)
- [Free-tier notes](#free-tier-notes)

---

## What it does

### Employee portal

| Module | Highlights |
| --- | --- |
| Dashboard | Live working timer, today/month summaries, recent duty history, quick access. The attendance bonus **amount** is never shown — only the late-day count. |
| Attendance | Clock in / clock out, office verification, live timer, full duty history. |
| Roster | 7-day overview with shift colour coding, same-day team view, roster change history, unread-update counter. |
| Break Management | Start / resume break, live break timer, today + month totals, break history. |
| My Tasks | Assignment list, status tracking, submission with link and notes, reviewer feedback. |
| Leave Management | Balances, applications, roster-change requests (auto or manual roster update), approval history. |
| Overtime | Request flow; only HR-approved overtime is paid. |
| My Salary | Published payslips with an itemised breakdown. The attendance bonus amount is withheld server-side. |
| Notifications | Full notification centre with read/unread state and email-delivery status. |
| My Profile | Read-only protected fields, correction-request flow, password change. |

### HR & management portal

Employee Management · Signup Approval · Department & Sub-department Management ·
Designation Management · Multiple Shift Management · Roster Management (create, preview,
conflict warnings, publish / schedule, change history) · Attendance Management ·
Attendance Review & Late Login Management · Break Records · Leave Management ·
Overtime Management · Attendance Bonus Calculation · Payroll Management · Task Management
(Smart Dashboard) · Announcements & Notifications · Google Sheets Integration ·
Reports & Export · Company Settings · Audit Logs.

---

## Architecture

```
┌───────────────────────────┐        ┌────────────────────────────┐
│  Cloudflare Pages (SPA)   │        │   Cloudflare Worker (API)  │
│  React + TypeScript + PWA │───────▶│   Hono  ·  Drizzle ORM     │
└───────────────────────────┘  HTTPS └──────────┬─────────────────┘
                                                │  D1 (primary DB)
                                                │  R2 (private files)
                                                ▼
                                   ┌────────────────────────────┐
                                   │  Google Sheets (optional)  │
                                   │  Controlled integration    │
                                   │  layer + reporting only    │
                                   └────────────────────────────┘
```

- **D1 is the single source of truth.** All business data lives in D1.
- **Google Sheets is never the primary database.** It receives a curated export for
  reporting and can feed structured, validated changes back through the API.
- **R2 is a private bucket.** D1 stores only file metadata (key, name, type, size,
  owner, timestamp) — never a public URL and never binary content.
- **The employee portal and the HR portal share one API and one database**, with
  separate navigation and role-based permissions.

---

## Technology

| Layer | Choice |
| --- | --- |
| Frontend | React 18 · TypeScript · Vite · React Router v6 |
| Styling | Tailwind CSS (custom design tokens) · Framer Motion |
| Data | TanStack Query v5 |
| Icons | lucide-react |
| Charts | Hand-built SVG components (no chart library) |
| PWA | vite-plugin-pwa (Workbox) |
| API | Hono (Cloudflare Workers) · Zod validation |
| Database | Cloudflare D1 · Drizzle ORM |
| Storage | Cloudflare R2 (private) |
| Email | Resend free tier (pluggable; `console` provider for local development) |
| Sheets | Google Sheets REST API with a service-account JWT |

Everything is open-source and runs on a free tier.

---

## Repository layout

```
bronee-hrms/
├── packages/
│   ├── shared/          # Domain types, constants, RBAC, Zod schemas, time helpers
│   ├── api/             # Hono Worker: routes, Drizzle schema, migrations, seed
│   └── web/             # React SPA: employee + HR portals, PWA
├── docs/                # Architecture, deployment, frontend contract, Phase 01 reference
└── scripts/             # Build helpers and the deployment script
```

### Relationship to Phase 01

The repository originally carried a Phase 01 frontend-only shell (login, signup, employee
shell, placeholder modules, no backend). That work is preserved in the git history and
archived under [`docs/phase01-reference/`](docs/phase01-reference/ABOUT.md). The parts that
still mattered — the `bronee` brand palette, the `ink` / `surface` scales, the shadows, the
`BrandMark` component and the `.btn-primary` / `.field-input` utility classes — were carried
forward into the finished system, so the live site's existing purple (`#5C2D91`) is unchanged.

---

## Local setup

**Prerequisites:** Node.js 20.10+ and a Cloudflare account (free tier is fine).

```bash
git clone <your-repo> bronee-hrms
cd bronee-hrms
npm install

# 1. Create the local D1 database and apply migrations
cd packages/api
npx wrangler d1 create bronee_hrms          # copy the printed database_id into wrangler.toml
npx wrangler d1 migrations apply bronee_hrms --local
npx wrangler d1 execute bronee_hrms --local --file ./scripts/seed.sql

# 2. Create the first Super Admin (prints a SQL statement)
npx tsx scripts/seed-admin.ts --email hr@bronee.com --password "YourStrongPass1" --name "HR Admin"
#    run the printed SQL against the local database

# 3. Start the API and the web client in two terminals
cd ../.. && npm run dev:api     # http://127.0.0.1:8787
cd ../.. && npm run dev:web     # http://localhost:5173
```

The Vite dev server proxies `/api` to the local Worker, so the browser talks to a single
origin and the session cookie works without CORS complications.

### Environment

`packages/api/.dev.vars` (git-ignored) for local secrets:

```ini
SESSION_SECRET="a-long-random-string"
RESEND_API_KEY=""            # optional locally; the console provider is used instead
GOOGLE_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_PRIVATE_KEY=""
```

`packages/web/.env.local` (optional):

```ini
VITE_API_BASE_URL=/api
VITE_SIGNUP_EMAIL_DOMAIN=gmail.com
```

---

## Cloudflare deployment

### One command

```bash
npx wrangler login     # once
npm run deploy
```

`npm run deploy` creates the D1 database and the R2 bucket, applies the migrations,
seeds the reference data, sets the Worker secrets, deploys the Worker and publishes the
Pages site. Run `npm run deploy -- --help` for the individual steps
(`d1`, `r2`, `migrate`, `secrets`, `worker`, `pages`).

### Manual steps

```bash
cd packages/api
npx wrangler d1 create bronee_hrms           # paste database_id into wrangler.toml
npx wrangler r2 bucket create bronee-files
npx wrangler d1 migrations apply bronee_hrms --remote
npx wrangler d1 execute bronee_hrms --remote --file ./scripts/seed.sql
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY        # needed for signup OTP delivery
npx wrangler deploy
```

Add the Worker URL to `ALLOWED_ORIGINS` (comma-separated) so CORS is pinned in production.

### Pages settings

The repository is a monorepo, so the Pages build must point at the web package:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | `/` |
| Build command | `npm run build:web` |
| Build output directory | `packages/web/dist` |
| Environment variable | `VITE_API_BASE_URL=https://bronee-hrms-api.<your-subdomain>.workers.dev` |

`packages/web/public/_redirects` is included so client-side routing works on refresh:

```
/*  /index.html  200
```

### 4. Scheduled jobs

Add a Cron trigger in `wrangler.toml` so scheduled rosters publish and task reminders fire
on their own:

```toml
[triggers]
crons = ["*/5 * * * *"]
```

Then protect the scheduled endpoints with a `CRON_SECRET` header check, or call them from
an authenticated HR session.

---

## Google Sheets integration

Two spreadsheets are configured by default:

- **Task Management** — `Support`, `Management System`, `Dashboard`, `Roster` tabs
- **Main HRMS** — `Employee`, `Attendance`, `Leave`, `Overtime`, `Payroll`,
  `HR Operations`, `Roster` tabs

To enable live sync:

1. Create a Google Cloud service account and download its JSON key.
2. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` as Worker secrets.
3. Share each spreadsheet with the service-account email (Viewer for export, Editor if
   you want the Sheets side to be editable).

Everything that flows from Sheets is re-validated by the API — role permissions,
duplicate detection and business rules are all applied before D1 is touched. Passwords,
OTPs, tokens and API secrets are never written to a spreadsheet.

---

## Security model

- **Password hashing** — PBKDF2-SHA256, 210 000 iterations, 16-byte random salt, stored
  with the hash. Comparison is constant-time.
- **Sessions** — signed HMAC-SHA256 tokens in an `httpOnly`, `SameSite=Lax`, `Secure`
  cookie, backed by a D1 row so any session can be revoked server-side.
- **RBAC** — a permission catalogue shared by the API guards and the client's navigation
  logic. Every HR route is guarded by an explicit permission, and sensitive routes are
  additionally protected by role.
- **OTP** — 6-digit codes, SHA-256 digests, 10-minute expiry, 5-attempt limit, one
  outstanding code per email and purpose.
- **Rate limiting** — per-isolate token buckets on login and OTP endpoints, plus D1
  attempt counters for verification codes.
- **Audit log** — every sensitive administrative action records the actor, the before and
  after state, the IP, the user agent and the timestamp.
- **Data isolation** — an employee can only ever read their own attendance, leave,
  overtime, salary and task records. Roster team views expose shift information only.
- **File storage** — private R2 bucket, MIME and size allow-list, permission checked on
  every read, no public URLs generated or persisted.
- **Confidential payroll data** — the attendance bonus amount is stripped from the API
  response before it reaches the employee client.

No system can be called "unhackable". Security testing, access control, backups,
monitoring and regular maintenance remain part of the plan.

---

## Attendance rules engine

All of this is decided **server-side** using server-authoritative UTC timestamps,
interpreted in `Asia/Dhaka`.

**Shifts**

| Shift | Start | End | Office verification |
| --- | --- | --- | --- |
| Morning | 09:20 | 18:00 | Required |
| Evening E1 | 13:00 | 21:00 | Required |
| Evening E2 | 14:00 | 22:00 | Required |
| Late Evening (WFH) | 18:00 | 01:00 (+1) | Not required |
| Split Shift | 09:20 | 01:00 (+1) | Office segment only |

**Verification priority**

1. Office public IP (allow-list maintained in Company Settings)
2. GPS geofence — within 50 m of the office and within an acceptable accuracy radius

Either one succeeding is sufficient.

**The one-minute window**

- Shift start → +1 minute is the verification window.
- Verify inside the window ⇒ the working timer starts from the **scheduled shift start**,
  and the employee is **not** late.
- Verify after the window ⇒ the record goes to `pending_review`; HR decides.
- Verification fails ⇒ the working timer does not start at all. HR must approve an
  exception.

**Other rules**

- Pre-clock-in is allowed 10–15 minutes early; the punch is stored but the timer still
  starts at the scheduled shift start.
- A split shift verifies office location once, at 09:20. At 18:00 the system transitions
  automatically to the home segment, and the duty closes at 01:00 the next day.
- Breaks pause the working timer and are never counted as working time.
- At the scheduled end time an active working session closes, an active break is closed,
  and an approved overtime session starts if one exists.
- One active working session per employee, enforced by the database and the API.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev:api` | Run the Worker locally with Wrangler |
| `npm run dev:web` | Run the Vite dev server |
| `npm run build` | Build shared → API → web |
| `npm run typecheck` | Type-check every package |
| `npm run db:migrate` | Apply D1 migrations to the remote database |
| `npm run db:seed` | Seed reference data |
| `node scripts/check-syntax.cjs` | Fast parse check for every TypeScript file |

---

## Free-tier notes

Cloudflare's free allowances for D1, R2, Pages and Workers are generous for an
11–30 person organisation, but they are not guaranteed to stay unchanged. The platform
therefore includes:

- Storage-usage visibility in Company Settings
- A backup and restore path (`wrangler d1 export` → your own storage)
- A clear separation between the primary database and the Sheets reporting layer, so a
  quota change never blocks core operations

Before any paid service is introduced, the change is agreed in advance.

---

© BRONEE Limited. Internal system — not for public distribution.
