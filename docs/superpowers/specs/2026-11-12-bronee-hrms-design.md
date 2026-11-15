# BRONEE HRMS — Design Document

**Project:** BRONEE HRMS — Employee & Workforce Management Platform
**Organization:** BRONEE Limited
**Date:** 2026-11-12
**Status:** Approved for implementation (Employee Portal + HR Portal, Cloudflare Worker + D1 backend, Google Sheets integration layer)

---

## 1. Purpose

BRONEE HRMS replaces the current spreadsheet-driven HR routine with a single internal
platform covering attendance, shifts, rosters, leave, overtime, tasks, payroll,
announcements and notifications. It serves two audiences from one backend and one
database:

| Portal | Audience | Scope |
|---|---|---|
| Employee Portal | Every employee | Own attendance, breaks, roster, tasks, leave, overtime, payslips, notifications, profile |
| HR & Management Portal | HR staff only | Employee records, approvals, structure, shifts, roster publishing, attendance review, payroll, announcements, Sheets integration, reports, settings, audit |

The platform must remain free-tier friendly, must never leak one employee's private data
to another, and must keep every payroll figure derived from an HR-approved record.

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Backend | Cloudflare Workers + Hono | Free tier, fast cold starts, same vendor as Pages/D1/R2 — one account, no cross-vendor egress cost |
| Database | Cloudflare D1 (SQLite) | Free tier, transactional, schema-first; Drizzle keeps migrations reviewable |
| File storage | Private R2 bucket | D1 holds keys/metadata only; no public URLs, signed delivery after a permission check |
| Sheets role | Controlled integration layer | Reports and admin entry surface; never the primary store |
| API style | One REST contract, two adapters | The web app talks to `ApiClient`; the local adapter (demo/offline) and the HTTP adapter (production) are interchangeable |
| Attendance truth | Server-authoritative | The client submits a punch and a GPS fix; the server decides shift, working time and late status |
| Timezone | UTC storage, `Asia/Dhaka` display | Bangladesh is a fixed UTC+6 with no DST, so conversion is exact and auditable |
| Credentials | PBKDF2-SHA256 (Web Crypto) | Identical algorithm in the browser demo adapter and in the Worker; no native dependency |
| UI | React + TypeScript + Tailwind + Framer Motion | Matches the specified stack; restrained violet accent derived from the BRONEE mark |

## 3. Architecture

```
┌──────────────────────────── Browser (PWA) ────────────────────────────┐
│  Employee Portal              HR & Management Portal                 │
│  └────────── shared design system, routing, ApiClient ──────────────┘│
└───────────────┬───────────────────────────────────────┬──────────────┘
                │ VITE_API_MODE=local (demo)            │ VITE_API_MODE=http
                ▼                                       ▼
      in-browser adapter (localStorage)      Cloudflare Worker (Hono)
      seeded with real BRONEE data            ├─ auth / OTP / RBAC
                                               ├─ attendance + break engine
                                               ├─ leave / overtime / payroll
                                               ├─ roster publishing + diffing
                                               └─ Google Sheets sync layer
                                                          │
                        ┌───────────────┬─────────────────┼──────────────┐
                        ▼               ▼                 ▼              ▼
                    D1 (primary)   R2 (private)   Sheets (integration)  Email
```

### 3.1 Repository layout

```
/workspace
├── shared/           domain constants, entity types, attendance/payroll engine, crypto
├── web/              React PWA — both portals
│   └── src/
│       ├── components/ui/     design system primitives
│       ├── components/layout/ shell, sidebar, topbar, bottom nav
│       ├── features/employee/ Employee Portal (10 modules)
│       ├── features/hr/       HR Portal (20 modules)
│       ├── lib/api/           contract + local adapter + http adapter
│       └── data/              seeded BRONEE dataset
├── worker/           Cloudflare Worker (Hono + Drizzle + D1 + R2)
│   ├── src/routes/   auth, employee, hr
│   ├── src/services/ attendance, sheets, email, files, audit
│   └── migrations/   D1 schema migrations
└── docs/             this design document, setup and deployment guides
```

### 3.3 Module isolation

Each portal module owns its route, its data loading and its presentation. Shared
behaviour lives in exactly four places:

1. `shared/constants.ts` — shifts, departments, bonus tiers, roles, permissions, Sheets registry.
2. `shared/types.ts` — entity and payload shapes.
3. `shared/attendance.ts` — the attendance, late, break, bonus and payroll calculations.
4. `shared/crypto.ts` — password hashing and token generation.

Both adapters and the Worker import these directly, so the demo build and the
production build cannot drift apart.

## 4. Attendance engine

This is the highest-risk area, so its rules are stated explicitly.

| Rule | Behaviour |
|---|---|
| Pre-clock-in | Allowed 10–15 minutes before the scheduled start. The punch is recorded, but the working timer does **not** start early. |
| Verification window | The first **1 minute** after the scheduled shift start. |
| Office verification | The office network's **public IP** is checked first, then a **50 m GPS geofence** with an acceptable accuracy radius. Either one succeeds — both are not required. |
| Working time start | When verification succeeds inside the window, working time is counted from the **scheduled shift start**, not from the moment verification completed. |
| Late arrival | Verification after the window leaves the record in **Pending Review**. The system never marks an employee finally late on its own. |
| Failed verification | Recorded as **Verification Failed**; the working timer stays stopped until an HR review or an exception approval. |
| Split shift | One office verification at the start of the first segment. At 18:00 the system transitions automatically to the home segment; no second verification. The duty ends at 01:00 the next day. |
| Overnight shift | Late Evening runs 18:00 → 01:00 (next day) and is stored against the previous work date. |
| Breaks | A break pauses the working timer. Break time is never counted as working time. An open break is closed automatically at shift end. |
| Duplicate sessions | A second clock-in on the same day is rejected. |
| Server authority | The client sends a punch and a GPS fix. Shift, working time, late status and payroll are all computed on the server from stored records. |

### 4.1 Shift registry

| Code | Name | Window | Work location | Office verification |
|---|---|---|---|---|
| `MORNING` | Morning Shift | 09:20–18:00 | Office | Required |
| `EVENING_E1` | Evening Shift E1 | 13:00–21:00 | Office | Required |
| `EVENING_E2` | Evening Shift E2 | 14:00–22:00 | Office | Required |
| `LATE_EVENING` | Late Evening | 18:00–01:00 (+1) | Home | Not required |
| `SPLIT` | Split Shift | 09:20–18:00 office, 18:00–01:00 home | Office + Home | Required once |

## 5. Payroll and the attendance bonus

Bonus policy (§8), computed from **HR-approved** attendance records only:

| Monthly late days | Bonus |
|---|---|
| 0 | BDT 2,000 |
| 1 | BDT 100 |
| 2 | BDT 1,000 |
| 3 or more | BDT 0 |

Monthly payroll = basic + allowances + (approved overtime minutes ÷ 60 × OT rate) +
bonus − deductions.

**Visibility rules:** the bonus *amount* and the payroll total are HR-only. The employee
sees basic salary, allowances, approved overtime payment and the published net payable.
The employee dashboard shows the **monthly late day count** but never the bonus figure.

## 6. Security model

| Concern | Control |
|---|---|
| Passwords | PBKDF2-SHA256, 100 000 iterations, per-user salt, constant-time comparison |
| Sessions | Random 256-bit tokens stored in D1, 12-hour expiry, revocable |
| OTP | 6-digit code, hashed at rest, 10-minute expiry, single use |
| Authorisation | Role → permission matrix in `shared/constants.ts`; enforced per route on the server, not in the UI |
| Data isolation | Every employee query is filtered by the authenticated employee id |
| Files | Private R2 bucket, D1 stores keys only, delivery after an authentication and permission check |
| Audit | Every privileged mutation writes an audit row with actor, role, action, entity, before/after and note |
| Sheets | Credential columns are detected and refused. Sheet-sourced changes are validated and duplicate-checked before they reach D1 |
| Rate limiting | Applied at the Worker edge (Cloudflare WAF rules documented in the deployment guide) |

The Super Admin is always HR — no other account may hold that role. HR and CEO hold
protected display ordering that ordinary HR sorting cannot change.

## 7. Google Sheets integration

D1 is the primary database. Sheets is an integration layer with two tabs on the Task
Management sheet (`Support`, `Management System`, `Dashboard`, plus a new `Roster` tab)
and two on the Main HRMS sheet (`LeaveApplications`, `HR_Users`).

| Direction | Behaviour |
|---|---|
| Pull | Rows are imported into D1 after validating employee identity, dates and duplicates. Rows that fail validation are skipped and reported in the sync log. |
| Push | D1 rows are written back only after the same validation passes. |
| Credentials | `assertNoCredentialColumns()` refuses to sync any sheet containing a password, OTP, token, secret or credential column. |

> **Finding during discovery:** the live `HR_Users` tab contains a plaintext password
> column (`hr@bronneltd.com / admin123`). This directly violates §2 of the
> specification's own sensitive-data policy, so that column is excluded from the sync,
> and credentials are stored hashed in D1 only. The column should be removed from the
> spreadsheet.

## 8. UI direction

Premium enterprise layout with iOS-inspired interaction:

- Light surface, white cards, soft shadows, restrained violet accent taken from the
  BRONEE mark.
- `rounded-2xl` cards, quiet 1px borders, balanced whitespace, no glassmorphism.
- Framer Motion for page transitions, count-ups and micro-interactions; loading
  skeletons instead of spinners; `prefers-reduced-motion` respected.
- Desktop: collapsible sidebar (icons remain visible when collapsed) plus a top bar
  carrying the Bangladesh clock. Mobile: bottom navigation, slide-out drawer.
- The BRONEE mark always sits above the company name on the sign-in page.
- Dense, professional tables — no marketing decoration inside operational screens.

## 9. Data model

| Table | Purpose |
|---|---|
| `employees`, `users`, `sessions`, `otp_codes`, `signup_applications` | People, credentials, sessions, verification, approvals |
| `departments`, `designations`, `company_settings`, `staffing_rules` | Structure and policy |
| `rosters`, `roster_entries`, `roster_change_requests`, `roster_change_log` | Roster versions, assignments, change workflow, history |
| `attendance_sessions`, `break_sessions` | Verified attendance and breaks |
| `leave_applications`, `overtime_requests`, `tasks`, `task_submissions` | Requests and work |
| `salary_records`, `announcements`, `announcement_recipients`, `notifications` | Payroll and communication |
| `files`, `audit_logs`, `sync_logs` | Private files, audit trail, integration history |

## 10. Verification

| Layer | Method |
|---|---|
| Types | `tsc --noEmit` strict across `shared/`, `web/`, `worker/` |
| Build | Production Vite build with PWA manifest and service worker |
| Rules | Shared engine is unit-testable in isolation; the same code runs in both adapters |
| Manual | Each portal module is walked through against a real BRONEE dataset |
| Deploy | `wrangler deploy` + `wrangler d1 migrations apply` documented in the deployment guide |

## 11. Out of scope for this release

- Native mobile applications — the PWA covers mobile.
- Biometric attendance — not specified and it weakens the verification rules.
- Multi-tenant support — BRONEE Limited only.
- Third-party payroll export formats — CSV/Excel only, as specified.
