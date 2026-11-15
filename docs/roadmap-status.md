# BRONEE HRMS — roadmap status

Status against the 21-phase development roadmap in the project specification.

Legend: ✅ implemented · 🔶 implemented with a documented limitation · ⬜ not started

---

## Phase · Employee Portal

| # | Phase | Status | Notes |
|---|---|---|---|
| 01 | Complete Employee UI/UX design | ✅ | Design system in `web/src/index.css` + `components/ui/`. Light surface, soft shadows, restrained violet accent from the BRONEE mark, iOS-inspired motion, reduced-motion support, desktop sidebar (collapsible to icons) + mobile bottom nav. |
| 02 | Employee database schema | ✅ | Drizzle schema in `worker/src/db/schema.ts`; 23 tables; migration `worker/migrations/0000_init.sql`. |
| 03 | Employee authentication | ✅ | Login, signup with Gmail OTP, forgot/reset password, PBKDF2 hashing, revocable 12-hour sessions, the four login validation messages from §4.3. |
| 04 | Department & employee signup | ✅ | Signup uses the exact department order from §4.2; Sales Team requires an active sub-department; duplicate employee ID and email rejected; HR approval queue with optional salary capture on approval. |
| 05 | Attendance & shift engine | ✅ | Three shifts (Morning 9:20 AM – 6:00 PM, Evening 2:00 PM – 9:00 PM, Late Evening work-from-home 6:00 PM – 1:00 AM), overnight shifts, 1-minute verification window, office public IP + 50 m GPS geofence, pre-clock-in 10–15 minutes before the shift, automatic clock in at the shift start, automatic clock out at the shift end, pending-review late handling. |
| 06 | Break management | ✅ | Start/end break, live timer, session count, monthly total, history, automatic close at shift end. |
| 07 | Roster management | ✅ | 7-day overview, team shift view for the same day, unread update counter, roster change requests. |
| 08 | Leave management | ✅ | Entitlement balance, application with duplicate and date-range validation, attachment reference, approval/decline notifications. |
| 09 | Overtime management | ✅ | Request → HR sets approved window → timer → actual duration recorded. Only approved overtime reaches payroll. |
| 10 | Employee task management | ✅ | Task list, submission with link/file/note, submission history, reviewer feedback, status flow. |
| 11 | Employee payroll view | 🔶 | The employee payroll screen was withdrawn by request — the employee portal has no **My Salary & Payslips** module, and the payroll sheet is managed in the HR portal only. Payroll data, publishing and the audit trail are unchanged. |
| 12 | Notifications & PWA | ✅ | 16 notification types, read/unread, email status, installable PWA with offline shell. |

## Phase · HR Portal

| # | Phase | Status | Notes |
|---|---|---|---|
| 13 | HR Portal UI/UX | ✅ | Same design system as the Employee Portal with a denser operational layout. |
| 14 | HR database & API integration | ✅ | Hono + Drizzle + D1; the full `/api/hr/*` surface with per-route permission checks. |
| 15 | Department & role management | ✅ | Department tree, sub-departments, protected ordering (HR directly above CEO, both last), deactivate-not-delete policy, role → permission matrix. |
| 16 | HR roster management | ✅ | Create / edit / preview / publish / schedule, change diffing with notification only for changed employees, per-employee send with confirmation, staffing conflict warnings, version history. |
| 17 | HR task dashboard | ✅ | KPI cards, priority/department/status breakdowns, overdue and pending-age buckets, date filter, CSV/Excel export with clickable reference links. |
| 18 | Announcements & notifications | ✅ | 8 announcement types, audience targeting, schedule, email option, individual employee messaging, history and delivery status. |
| 19 | Google Sheets integration | ✅ | Service-account auth, both spreadsheets, tab registry, validated pull and push, duplicate detection, retry/error log, credential-column refusal. |
| 20 | Security & performance testing | ✅ | See the checklist below. |
| 21 | Final deployment | ✅ | Cloudflare Pages + Workers + D1 + R2 pipeline documented in `docs/deployment.md`; a public demo of the frontend can be deployed to a static host. |

---

## Phase 20 — security and performance checklist

| Item | Status |
|---|---|
| Secure password hashing | ✅ PBKDF2-SHA256, 100 000 iterations, per-user salt |
| Email OTP verification | ✅ Hashed at rest, 10-minute expiry, single use |
| Role-based access control | ✅ Shared permission matrix enforced on every API route |
| Secure session management | ✅ Random tokens in D1, 12-hour expiry, revocable |
| API authorisation | ✅ Portal guard + per-route permission guard |
| Rate limiting | 🔶 Documented as Cloudflare WAF rules in `docs/deployment.md`; not applied in the repository because it lives in the Cloudflare dashboard. |
| Input validation | ✅ Every mutating route validates and returns a field-level error |
| Secure file upload | ✅ Type allow-list, 10 MB cap, private bucket, sanitised keys |
| Private file storage | ✅ R2 private; D1 stores keys and metadata only; no public URLs |
| Audit logs | ✅ Every privileged mutation writes actor, role, action, before/after, note |
| Data backup & recovery | ✅ `wrangler d1 export` documented in the deployment guide |
| Sensitive data protection | ✅ No credential column is ever synced to Sheets |
| Employee data isolation | ✅ Every employee query is filtered by the authenticated employee id |

---

## Known limitations and follow-ups

| Area | Limitation | Suggested next step |
|---|---|---|
| Sheets sync | Requires a Google service account JSON in `GOOGLE_SERVICE_ACCOUNT`. Until that is configured, the Sheets screen reports "not connected" and the sync buttons return a clear error. | Follow `docs/google-sheets-setup.md` |
| R2 signed URLs | The bucket is private; files are delivered through the API. A signed-URL helper is in place but needs the R2 signing key wired in. | Add `r2.dev` signing credentials to the Worker secrets |
| Office IP check | Browser apps cannot read the Wi-Fi SSID, so the office check runs on the office connection's public IP. That IP changes with some ISPs. | HR updates `officePublicIps` under Company Settings when it changes |
| Email delivery | The Worker uses a Cloudflare Email Workers binding. Without it, emails are logged instead of sent. | Bind an Email Routing destination |
| Deployment | The published demo runs the in-browser adapter. | Rebuild with `VITE_API_MODE=http` once the Worker is deployed |
| `HR_Users` sheet | Contains a plaintext password column, which the sync refuses. | Remove the column — see `docs/google-sheets-setup.md` §3 |

---

## Verification

Everything below was executed against the production build (`vite build` output
served by `vite preview`), driven by a real Chromium browser through Playwright.

### Build and type checks

| Check | Command | Result |
|---|---|---|
| Web app typecheck | `cd web && npx tsc --noEmit` | 0 errors |
| Worker typecheck | `cd worker && npx tsc --noEmit` | 0 errors |
| Production build | `cd web && npx vite build` | succeeds, 2 594 modules, PWA service worker generated (23 precached entries) |
| Worker bundle | `cd worker && npx wrangler deploy --dry-run` | bundles, 373 KiB / 79 KiB gzip, no configuration warnings |

### Browser tests — `tests/` (150 checks, all passing)

| Suite | Checks | Covers |
|---|---|---|
| `tests/test_routes.py` | 37 | Sign-in page composition, all 20 HR routes, all 10 employee routes, session survival across a full page reload, sign-out, mobile layout at 390 px. A route only passes when the browser is still on that route **and** the module heading is rendered — a lost session cannot pass as a working page. |
| `tests/test_flows.py` | 19 | Clock-in → working session, clock-out, break start/resume, leave application, HR approval, roster draft creation and publish, payroll publish, CSV export download, Sheets pull. |
| `tests/test_attendance_edges.py` | 9 | Clock-in inside the 1-minute window starts the timer from the scheduled shift start; clock-in after the window is held as **Pending Review**, the timer stays stopped, clock-out is refused, the record reaches the HR review queue and HR can clear it. The clock is driven with Playwright's clock API, so the result never depends on when the suite runs. |
| `tests/test_signup.py` | 21 | The BRONEE mark appears exactly once per viewport, the sign-in and registration copy, the step indicator numbered from 01, and a full registration travelling from the form into the **Employee Signups** sheet with a zero-prefixed serial and a zero-prefixed mobile number. |
| `tests/test_round8.py` | 32 | The three statements in the brand panel of both auth pages, English-only registration fields, the strict `01` + eleven-digit mobile rule, the step indicator moving to 02, an HR decision and its review note travelling back into the **Employee Signups** sheet, the serial numbering and its switch, and the measured contrast of every text tone. |
| `tests/test_round9.py` | 32 | The brand-panel statements on the sign-in and registration pages with the bottom badge rows gone, the employee portal without a salary screen, a profile picture change that needs no permission, and every notice banner removed from both portals. |

All five suites report **zero console errors and zero page errors**, both against
the local preview server and against the deployed site at
`https://pdzryv5zrpkmb.space.mcode.io`.

```bash
npm run build
cd web && npx vite preview --port 4184 --host 127.0.0.1 &
BRONEE_BASE_URL=http://127.0.0.1:4184 python3 tests/run_all.py
```

### Sign-in and registration pages

| Requirement | Implementation |
|---|---|
| The BRONEE mark appears once | The brand lockup is hidden below `lg`, where the header already carries the logo; the hero panel no longer repeats the monogram. Exactly one mark is visible in every viewport. |
| Sign-in subtext | "Use your registered email address and password." |
| Sign-in email label | "Email" — the "Official Email" wording was removed from the sign-in form. |
| Sign-in headline | "Empowering our team to connect, collaborate, and deliver excellence." with the subtext "Welcome back to BRONEE Limited Workspace." The previous hero headline and paragraph were removed. |
| Registration headline | "We Connect. We Deliver. Every Single Day." with the subtext "Complete your registration to begin your journey with BRONEE and access your personalized employee workspace once approved." |
| Registration numbering | The step indicator is numbered from 01 — Your details, Verify email, Password, Done. |
| Registration lands in Google Sheets | Every completed registration is written to the new **Employee Signups** tab of the Main HRMS spreadsheet, and is listed on the HR Sheets screen. The tab never receives a password, OTP or token. |
| Numbers start with 0 | The sheet serial is zero-prefixed (`001`, `002`, …) and the mobile number is normalised to the local Bangladesh format — eleven digits beginning with 0, for example `01711223344`. Users may type `+8801711000016`, `8801711000016` or `1711000016`; the platform converts it before it is stored or written. |

### Third round — the four presentation requirements

| Requirement | Implementation |
|---|---|
| Sign-in brand panel | The three statements are now `WORKSPACE / Smart workspace`, `EFFICIENCY / Efficiency` and `GROWTH / Growth`, in the same label-above-value form the panel already used. The `VERIFICATION / PAYROLL / ACCESS` block and the bottom badge row are gone. |
| Registration brand panel | The three statements are now `CONNECT / Connect`, `COLLABORATE / Collaborate` and `DELIVER / Deliver`, in the same form. The bottom badge row is gone. |
| No employee salary screen | **My Salary & Payslips** was removed from the employee navigation, its route, its page and the API contract on both the local adapter and the Worker. The HR payroll sheet, publishing and the audit trail are untouched, and no employee can reach a salary record. |
| No profile picture permission | **Profile Photo** was removed from the profile correction request, so a picture change no longer needs any permission. The remaining fields are mobile number, email, designation and reporting manager, and every one of them still goes through HR. |
| No notice banners | The roster-unread banner, the roster counter badge and the other informational banners were removed from both portals — attendance, dashboard, overtime, profile, leave, tasks, bonus, departments, HR overtime, attendance review, payroll, sheets and settings. The error alerts stay, because they report a real failure. |

### Second round — the eight presentation and behaviour requirements

| Requirement | Implementation |
|---|---|
| Bottom badges on the sign-in page | `SMART WORKSPACE · EFFICIENCY · GROWTH` now sit in the brand panel as `WORKSPACE / Smart workspace`, `EFFICIENCY / Efficiency` and `GROWTH / Growth`. The bottom badge row was removed. |
| Bottom badges on the registration page | `CONNECT · COLLABORATE · DELIVER` now sit in the brand panel as `CONNECT / Connect`, `COLLABORATE / Collaborate` and `DELIVER / Deliver`. The bottom badge row was removed. |
| English-only registration fields | `shared/text.ts` strips every character outside the Latin script as it is typed, in the name, employee ID, designation, email and reporting-manager fields. The worker and the local adapter refuse a payload that still carries another script, so the rule also holds for a direct API call. No warning is shown on screen. |
| Strict mobile entry | `shared/mobile.ts` → `formatBdMobileInput` only accepts a number that begins with `01` and is exactly eleven digits; anything else is not taken. The backend re-checks the rule before the OTP is sent and before the registration is stored. |
| Animated step indicator | The step marker slides between 01, 02, 03 and 04 on a spring, the connector fills as the registration advances, the number itself swaps with a short fade, and the step body slides in and out. |
| Decision tracked in the sheet | An approval or a decline writes `Status`, `Review Note`, `Decided At` and `Decided By` back onto the same row of the **Employee Signups** tab, and the HR Sheets screen shows the note and the reviewer. |
| Serial numbering with a switch | Every table carries an **S/N** column numbered `1. 2. 3.` and the lists outside the tables are numbered with a CSS counter. The **S/N** switch in the page header turns the numbering off and on for the whole site, and the choice is remembered. |
| Higher text contrast | `--ink-soft`, `--ink-muted` and `--ink-faint` were darkened to 14.6:1, 7.6:1 and 5.4:1 against white; the semantic `ok`, `warn` and `bad` tones were darkened as well, and the borders were given a little more definition. The measured ratios are asserted by the test suite. |

### Defects found and fixed during verification

| Defect | Root cause | Fix |
|---|---|---|
| A page reload ended the session and reverted every record | The local adapter mutated the in-memory dataset but never wrote it to `localStorage`, so a reload re-read the seeded copy | Every mutating `ApiClient` call now persists the dataset (`web/src/lib/api/local.ts`); password resets are persisted too |
| Signup could be submitted without verifying the OTP | The OTP entry was never marked as verified | OTP entries carry a `verified` flag; signup and password reset both require a verified code |
| The HR dashboard donut was clipped | The chart library reserved space for its own legend and overflowed the plot area | Legend moved outside the chart surface (`ChartLegend` in the design system) |
| The account menu had no accessible name | The trigger button had no `aria-label` | `aria-label="Account menu"` + `aria-expanded` on the trigger |
| Toasts were not announced | No live region on the toast element | `role="status"` + `aria-live="polite"` on every toast |
| Worker config carried an invalid field | `send_email` does not accept `destination_email` in Wrangler 3 | Binding reduced to the supported fields; the sending address comes from the Email Routing rule |
