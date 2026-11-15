# BRONEE HRMS

Employee & Workforce Management Platform for **BRONEE Limited**.
Employee Portal + HR & Management Portal on one secure backend and one database.

---

## What's in the box

| Part | Stack | Location |
|---|---|---|
| Web app (both portals, installable PWA) | React 18 · TypeScript · Vite · Tailwind · Framer Motion · Recharts | `web/` |
| Backend API | Hono · Drizzle ORM · Cloudflare Workers | `worker/` |
| Primary database | Cloudflare D1 (SQLite) | `worker/migrations/` |
| Private file storage | Cloudflare R2 | `worker/src/services/files.ts` |
| Google Sheets integration | Sheets API v4 (service account) | `worker/src/services/sheets.ts` |
| Shared domain logic | Attendance engine, payroll, bonus, RBAC, crypto | `shared/` |

The web app talks to an `ApiClient` interface. Two interchangeable adapters implement it:

- **local** (default) — a complete in-browser implementation backed by `localStorage`,
  seeded with BRONEE's real people and the live Google Sheets rows. Runs with zero
  setup and is what the deployed demo uses.
- **http** — talks to the Cloudflare Worker (`/api/*`) backed by D1.

Switch with one environment variable: `VITE_API_MODE=http` + `VITE_API_BASE_URL=…`.

---

## Quick start

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

The app opens on the sign-in page. Demo credentials (every seeded account uses the same
password):

| Account | Email | Password | Portal |
|---|---|---|---|
| Super Admin | `hr@bronneltd.com` | `Bronee@2026` | HR & Management |
| Employee | `ismailhossainm712@gmail.com` | `Bronee@2026` | Employee |

Other real BRONEE accounts in the dataset: `chinexbd3@gmail.com` (Mayin Bhuiyan),
`bronneltd@gmail.com` (Sabbir Ahmed), `sanjidaaktersampa005@gmail.com`,
`alashif.official@gmail.com`, `rabbihossain255@gmail.com`.

> The demo password is shown on the sign-in page only while `VITE_API_MODE=local`.
> In `http` mode the app never exposes it.

---

## Repository layout

```
bronee-hrms/
├── shared/            constants · types · attendance engine · crypto
├── web/               React PWA
│   ├── public/        BRONEE mark, logo, PWA icons
│   └── src/
│       ├── components/ui/      design system (Button, Card, Table, Modal, Toast…)
│       ├── components/layout/   shell, collapsible sidebar, top bar, bottom nav
│       ├── features/employee/  Employee Portal — 9 modules
│       ├── features/hr/        HR Portal — 20 modules
│       ├── lib/api/            ApiClient contract + local/http adapters
│       └── data/               seeded BRONEE dataset + credentials
├── worker/            Cloudflare Worker
│   ├── src/db/schema.ts        Drizzle schema (D1)
│   ├── src/routes/             auth · employee · hr
│   ├── src/services/           sheets · email · files · audit
│   └── migrations/             generated D1 migrations
├── tests/              Playwright browser tests (routes · flows · attendance edges)
└── docs/              design document, deployment guide, Sheets guide, roadmap
```

---

## Core behaviours implemented

**Attendance.** Server-authoritative. Punch + GPS fix from the client; shift, working
time and late status decided on the server. Pre-clock-in 10–15 minutes early (punch
recorded, timer not started early). Verification window = first **1 minute** after the
scheduled start. Office **public IP** first, **50 m GPS geofence** as fallback — either
one is enough. Verified inside the window → working time counts from the **scheduled
shift start**. Verified later → **Pending Review** (never auto-late). Verification
failed → timer stays stopped until HR reviews. Split shift transitions automatically
from office to home at 18:00. Breaks pause the timer and are never counted as working.

**Payroll.** Basic + allowances + approved overtime + attendance bonus − deductions.
The bonus *amount* is HR-only; employees see their published net payable and their
monthly late-day count.

**Roster.** Versioned. Publishing compares against the previous published roster and
notifies **only** the employees whose shift or off day actually changed. Per-employee
send is available with a confirmation step. Conflict warnings come from HR-configured
minimum staffing rules — the system never invents a staffing requirement. Off-day and
shift changes can be applied automatically or left as *Manual update required*.

**Structure.** Department and sub-department management with a protected ordering rule:
HR always sits directly above CEO, and both stay last. Changing that requires the
Super Admin permission. A department with employees or history is deactivated, never
deleted.

**Sheets.** Controlled integration layer, never a primary store. Credential columns
(password, OTP, token, secret) are detected and refused. Sheet-sourced changes are
validated, duplicate-checked and audited before they reach D1.

**Isolation.** An employee can never see another employee's private data, attendance
history, salary or task data. Enforced on the server, not just hidden in the UI.

---

## Verification

The production build was driven by a real Chromium browser through Playwright —
**150 checks, all passing, zero console or page errors**, against both the local
preview server and the deployed site:

| Suite | Checks | Covers |
|---|---|---|
| `tests/test_routes.py` | 37 | Sign-in page, all 20 HR routes, all 9 employee routes, session survival across reloads, sign-out, mobile layout |
| `tests/test_flows.py` | 19 | Clock-in/out, break, leave application, HR approval, roster publish, payroll publish, CSV export, Sheets pull |
| `tests/test_attendance_edges.py` | 9 | Clock-in inside the verification window starts the timer; a late clock-in is held for HR review and HR clears it |
| `tests/test_signup.py` | 21 | Auth page copy, one logo per viewport, registration numbered from 01, and a registration written to the Employee Signups sheet |
| `tests/test_round8.py` | 32 | The three brand-panel statements, English-only registration fields, the strict `01` mobile rule, the animated step indicator, the HR decision written back to the sheet, the serial numbering and its switch, and the measured text contrast |
| `tests/test_round9.py` | 32 | The brand-panel statements on both auth pages with no bottom badges, the employee portal without a salary screen, a profile picture change that needs no permission, and every notice banner removed from both portals |

```bash
npm run build
cd web && npx vite preview --port 4184 --host 127.0.0.1 &
BRONEE_BASE_URL=http://127.0.0.1:4184 python3 tests/run_all.py
```

---

## Documentation

| Guide | Covers |
|---|---|
| [`docs/superpowers/specs/2026-11-12-bronee-hrms-design.md`](docs/superpowers/specs/2026-11-12-bronee-hrms-design.md) | Architecture, decisions, attendance rules, security model |
| [`docs/deployment.md`](docs/deployment.md) | D1, R2, Workers, Pages, Google service account, going live |
| [`docs/google-sheets-setup.md`](docs/google-sheets-setup.md) | Sheet structure, tabs, dropdowns, the `HR_Users` credential issue |
| [`docs/roadmap-status.md`](docs/roadmap-status.md) | Phase-by-phase status against the 21-phase roadmap |

---

## Free-tier posture

GitHub (source) · Cloudflare Pages (frontend) · Workers (API) · D1 (database) · R2
(files) · Google Sheets (integration) · open-source libraries · PWA.

Free-tier limits change over time, so usage is monitored for storage, API requests,
database queries and email volume, and any move to a paid plan needs approval first.
