# BRONEE HRMS — Frontend Contract

Every UI page is built against this contract. Do not invent new primitives —
reuse what is exported from `@/components/ui`.

## 1. Stack

- React 18 + TypeScript + Vite + React Router v6 + TanStack Query v5 + Framer Motion + Tailwind CSS.
- Path alias `@/` → `packages/web/src`.
- `@bronee/shared` exposes domain types and helpers (`formatDuration`, `humanDuration`,
  `formatBanglaDate`, `formatDhakaTime`, `dhakaDateKey`, `toBanglaDigits`, `PERMISSIONS`,
  `ATTENDANCE_BONUS_LADDER`, `SHEET_LINKS`, `NOTIFICATION_TYPES`).
- API client: `api.get/post/patch/delete` from `@/lib/api` — always returns `data` or throws
  `ApiError { status, code, message }`.
- Query hooks live in `@/lib/queries` (see §4). Never call `api.*` directly inside a component
  for reads — use the hooks.

## 2. UI primitives — `@/components/ui`

```ts
<Button variant="primary|secondary|soft|outline|ghost|danger" size="xs|sm|md|lg"
        loading icon iconRight block />
<IconButton label="..." size variant />
<FloatingAction label tone="brand|success|danger" onClick>{icon}</FloatingAction>

<Card lift>{children}</Card>
<CardHeader title subtitle action icon />
<CardBody />
<CardFooter />
<SectionTitle>{text}</SectionTitle>

<Input label hint error leading trailing required containerClassName />
<Textarea label hint error />
<Select label hint error options={[{value,label}]} placeholder />
<Checkbox label description />
<Switch checked onChange label />
<Segmented value onChange options={[{value,label}]} size />

<Badge tone="neutral|brand|success|warning|danger|info" dot />
<Avatar name src size="xs|sm|md|lg|xl" ring />
<Spinner label />
<Skeleton className />
<EmptyState title description action icon />
<ProgressBar value max tone showLabel />
<AnimatedNumber value decimals prefix suffix />

<Modal open onClose title description footer size="sm|md|lg|xl">{children}</Modal>
<Drawer open onClose title side="left|right">{children}</Drawer>
<ConfirmDialog open onClose onConfirm title message confirmLabel tone loading />

<Table><THead><TH align>...</TH></THead><TBody><TR><TD align colSpan>...</TD></TR></TBody></Table>
<ListRow title subtitle leading trailing onClick />

useToast() -> { toast, success, error, info, warning }
```

## 3. Layout — `@/components/layout`

- `PageHeader title description action` — the standard page heading.
- `LiveClock` / `HeroClock` — live Asia/Dhaka clock with seconds.
- `AppShell` already provides the sidebar, top bar and mobile bottom nav. Pages only render content.

## 4. Query hooks — `@/lib/queries`

Employee: `useDashboard`, `useAttendanceStatus`, `useAttendanceHistory`, `useMonthlySummary`,
`useBreaks`, `useMyRoster(from?, to?)`, `useTeamRoster(date)`, `useCurrentRoster`,
`useMyLeave(year?)`, `useOffDays`, `useMyOvertime`, `useMyTasks`, `useTask(id)`,
`useMyPayslips`, `useNotifications`, `useProfile`, `useRosterHistory`.

HR: `useHrDashboard`, `useHrEmployees(search?)`, `useHrSignups(status?)`,
`useHrProfileRequests`, `useHrDepartments`, `useHrDesignations`, `useHrShifts`,
`useHrRosters(status?)`, `useHrRoster(id)`, `useHrRosterEmployees`, `useHrRosterHistory(id)`,
`useHrAttendance(date?)`, `useHrAttendanceRecord(id)`, `useHrBreakRecords(date?)`,
`useHrOfficeNetwork`, `useHrLeave(status?)`, `useHrOvertime(status?)`,
`useHrPayroll(year, month)`, `useHrBonus(year, month)`, `useHrTasks(filters?)`,
`useHrTaskSubmissions`, `useHrAnnouncements(status?)`, `useHrAnnouncementHistory`,
`useHrSheetsStatus`, `useHrSyncHistory`, `useHrAudit(entityType?)`, `useHrSettings`,
`useHrStaffingRules`.

Reference: `useDepartments(includeInactive?)`, `useDesignations()`, `useShifts()`,
`useEmployeeDirectory(search?)`.

Mutations: use `useMutation` from `@tanstack/react-query` and `useInvalidate()` from
`@/lib/queries` to refresh affected queries.

## 5. API surface (HR)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/hr/dashboard` | KPI + charts |
| GET | `/api/hr/employees?search=` | Employee list |
| PATCH | `/api/hr/employees/:id` | Update employee |
| POST | `/api/hr/employees/:id/status` | Suspend / reinstate |
| GET | `/api/hr/signups?status=` | Signup approval queue |
| POST | `/api/hr/signups/:id/review` | Approve / decline (+ corrections, salary) |
| GET | `/api/hr/profile-requests` | Profile correction requests |
| POST | `/api/hr/profile-requests/:id/review` | Approve / decline a correction |
| GET/POST/PATCH/DELETE | `/api/hr/departments` | Department tree management |
| GET/POST/PATCH | `/api/hr/designations` | Designations |
| GET/POST/PATCH | `/api/hr/shifts` | Shift configuration |
| GET | `/api/hr/roster?status=` | Roster list |
| GET | `/api/hr/roster/employees/ordered` | Employees in roster order |
| GET | `/api/hr/roster/:id` | Roster preview + conflicts |
| POST | `/api/hr/roster` | Create roster |
| PATCH | `/api/hr/roster/:id/entries` | Update roster cells |
| POST | `/api/hr/roster/:id/publish` | Publish / schedule (`{publishMode, scheduledFor}`) |
| POST | `/api/hr/roster/:id/notify` | Send roster update to one employee |
| GET | `/api/hr/roster/:id/history` | Roster change history |
| GET | `/api/hr/attendance?date=` | Attendance for a date |
| GET | `/api/hr/attendance/:id` | Record + history + breaks |
| POST | `/api/hr/attendance/:id/review` | Review actions (see below) |
| GET | `/api/hr/attendance/breaks/records?date=` | Break records |
| GET/POST | `/api/hr/attendance/office-network` | Office IP allowlist |
| GET | `/api/hr/requests/leave?status=` | Leave requests |
| POST | `/api/hr/requests/leave/:id/review` | `{decision, note, rosterUpdateMode}` |
| POST | `/api/hr/requests/leave/:id/complete-roster-update` | Finish a manual roster swap |
| GET | `/api/hr/requests/overtime?status=` | Overtime requests |
| POST | `/api/hr/requests/overtime/:id/review` | `{decision, approvedStart, approvedEnd, note}` |
| GET | `/api/hr/compensation/payroll?year=&month=` | Payroll run |
| POST | `/api/hr/compensation/payroll/generate` | Generate draft run |
| PATCH | `/api/hr/compensation/payroll/:id` | Adjust a record |
| POST | `/api/hr/compensation/payroll/publish` | Publish the run |
| GET | `/api/hr/compensation/bonus?year=&month=` | Attendance bonus |
| POST | `/api/hr/compensation/bonus/calculate` | Recalculate bonus |
| GET/POST/PATCH/DELETE | `/api/hr/tasks` | Task management |
| GET | `/api/hr/tasks/submissions/pending` | Submissions awaiting review |
| POST | `/api/hr/tasks/:id/review` | `{decision: approve|reject, feedback}` |
| GET/POST/DELETE | `/api/hr/comms` | Announcements |
| POST | `/api/hr/comms/:id/publish` | Publish a draft/scheduled notice |
| POST | `/api/hr/comms/message/:employeeId` | Individual employee message |
| GET | `/api/hr/comms/history` | Notice history with delivery status |
| GET | `/api/hr/sheets/status` | Sheets connection status |
| GET | `/api/hr/sheets/history` | Sync history |
| POST | `/api/hr/sheets/sync` | `{sheet: task|roster|main, tab?}` |
| GET | `/api/hr/system/audit?entityType=` | Audit log |
| GET/POST | `/api/hr/system/settings` | Company settings |
| GET/POST/DELETE | `/api/hr/system/staffing-rules` | Staffing rules |
| GET | `/api/hr/system/reports/:kind` | CSV export — kinds: `attendance`, `leave`, `tasks`, `payroll`, `roster` |

Attendance review actions accepted by `POST /api/hr/attendance/:id/review`:
`verify`, `approve_late`, `excuse_late`, `reject`, `correct`, `clear_issue`,
`manual_attendance`. Optional body fields: `note`, `attendanceStatus`,
`actualWorkingStart`, `clockOutAt`, `workingSeconds`.

## 6. Design rules (non-negotiable)

- Canvas is `bg-canvas`; surfaces are white cards with `border-line` and a soft shadow.
- The lilac brand colour (`brand-600` = `#7A5FE0`) is an **accent only**. Never use it as a
  large fill, never as body text, never on more than one element per screen section.
- Never use heavy glassmorphism or excessive animation. Motion is 150–250 ms and
  purposeful (page entry, list entry, counter tick). `prefers-reduced-motion` is honoured
  by the global stylesheet.
- Body text is `text-ink` / `text-ink-soft` / `text-ink-muted`. Never pure `#000`.
- Typography scale: page title 22–25 px extrabold, section title 15 px bold,
  card title 13–14 px semibold, body 13–14 px, caption 11–12.5 px.
- Tables use the `Table` primitives; numeric columns right-aligned.
- Every table needs an empty state (`EmptyState`) and a loading skeleton.
- Dates are shown in Bangla via `formatBanglaDate(dateKey, { withDay: true })` where the
  date key is `YYYY-MM-DD`. Timestamps use `formatDhakaTime(iso)`.
- Durations use `formatDuration(seconds)` (HH:MM:SS) or `humanDuration(seconds)` (7h 30m).
- Money uses `formatBDT(amount)` → `৳12,000`.
- Status chips reuse `LATE_STATUS_META`, `TASK_STATUS_META`, `PRIORITY_META` and
  `shiftColor(code)` from `@/lib/utils`.
- Responsive: the layout is sidebar-on-desktop / bottom-nav-on-mobile. Page content must
  work from 360 px to 1600 px. Use `grid-cols-1 md:grid-cols-2 xl:grid-cols-4` style grids.
- No placeholder "lorem ipsum" copy and no invented features. Write real, specific copy
  that matches the BRONEE HRMS domain.

## 7. Charts — `@/components/charts`

```ts
<DonutChart data={[{label, value, color?}]} centerLabel centerValue size thickness />
<BarChart data={[{label, value}]} height />
<HorizontalBars data={[{label, value}]} />
<AreaChart points={number[]} labels={string[]} stroke />
<Sparkline points={number[]} />
```

Use them instead of pulling in a charting library.
