# Google Sheets setup for BRONEE HRMS

Two spreadsheets are involved. **D1 stays the primary database** — Sheets is a
controlled integration layer for reporting and authorised admin entry.

| Spreadsheet | ID | Tabs |
|---|---|---|
| Task Management | `1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U` | `Support`, `Management System`, `Dashboard`, `Roster` (to be created) |
| Main HRMS | `14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98` | `LeaveApplications`, `HR_Users` |

---

## 1. Create the `Roster` tab

On the Task Management spreadsheet, add a tab named **`Roster`** with these columns in
this order:

| Roster ID | Roster Version | Employee ID | Roster Date | Shift | Changed | Updated At |
|---|---|---|---|---|---|---|

The sync layer appends roster rows here. The newest roster stays at the top and older
rows are kept — nothing is deleted, because the roster history is the audit trail.

### Shift dropdown

Select the `Shift` column → Data → Data validation → List of items:

```
Morning,Evening,Late Evening (LE),Off
```

The platform writes the internal codes `MORNING`, `EVENING_E1`,
`LATE_EVENING`, `OFF`. Either the friendly label or the code is accepted on
read; the sheet dropdown is for HR's convenience when editing by hand.

---

## 2. Create the `Employee Signups` tab

On the **Main HRMS** spreadsheet, add a tab named **`Employee Signups`** with these
columns in this order:

| SL | Application ID | Full Name | Mobile | Employee ID | Designation | Email | Department | Sub-department | Reporting Manager | Joining Date | Submitted At | Status | Review Note | Decided At | Decided By |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Every registration completed in the app is written here automatically, one row per
application. Two rules apply to the numbers:

- **`SL`** is a zero-prefixed serial — `001`, `002`, `003` — so the sheet's own
  numbering always starts with 0.
- **`Mobile`** is stored in the local Bangladesh format: eleven digits beginning
  with 0, for example `01711000016`. The registration field only accepts a number
  that begins with `01` and is exactly eleven digits long; anything else is refused
  as it is typed.

When HR approves or declines an application, the decision is written back to the
same row of this tab:

- **`Status`** becomes `Approved` or `Declined`.
- **`Review Note`** holds the note the reviewer recorded.
- **`Decided At`** and **`Decided By`** record when and by whom the decision was taken.

The tab never receives a password, an OTP or a token. If a sheet is edited by hand
and a credential column is detected, the sync refuses the whole tab.

---

## 3. The `HR_Users` tab — action required

The live `HR_Users` tab currently reads:

| Email | Password |
|---|---|
| hr@bronneltd.com | admin123 |

**This is a plaintext password in a spreadsheet.** It breaks the specification's own
sensitive-data policy (§2: *a password, OTP, authentication token, API secret or any
other sensitive credential must never be stored in Google Sheets*) and it means anyone
with read access to the sheet has HR's credentials.

**Recommended actions**

1. Change the HR password in the app first, then remove the `Password` column from the
   tab entirely.
2. If HR needs a roster of who may sign in, keep only `Email` and `Role` — never a
   password.
3. The sync layer already refuses to read this tab: `assertNoCredentialColumns()`
   detects a `password` column and aborts with an explanatory error, and the refusal is
   recorded in the sync log so it stays visible in the HR Portal.

Until the column is removed, the sheet row is skipped and a warning appears in
**HR Portal → Google Sheets Integration → Error log**.

---

## 4. Share the sheets with a service account

1. Google Cloud Console → create/choose a project → **APIs & Services** → enable
   **Google Sheets API** and **Google Drive API**.
2. **IAM & Admin** → **Service Accounts** → create one, e.g. `bronee-hrms-sync`.
3. Create a JSON key and store it safely:
   ```bash
   cat service-account.json | jq -c . | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
   ```
4. Share **both** spreadsheets with the service account's email
   (`bronee-hrms-sync@<project>.iam.gserviceaccount.com`) as a **Viewer** — or Editor if
   HR needs the sync to write back roster rows.
5. The service account only needs Sheets/Drive scopes; no user token is ever stored.

---

## 5. Tab contracts

### `LeaveApplications` (Main HRMS)

The platform reads and writes exactly these columns:

```
Timestamp, Application ID, Employee ID, Name, Designation, Email, Department,
Reporting Manager, Leave Type, From Date, To Date, Total Days, Reason,
Attachment Link, Submission Date, Approval Status, Review Reason, Email Status,
Approved Date
```

On pull, each row is validated before it reaches D1:

- `Application ID` must be new — duplicates are skipped.
- `Employee ID` must match a registered employee.
- `Email` must match that employee's registered email.

Rows failing validation are skipped and listed in the sync log.

### `Management System` / `Support` (Task Management)

Current columns:

```
Department, Employees, Priority, Task Status, (gap), Pending Days, Buckets
```

`Buckets` holds the pending-age groups used by the HR task dashboard:

```
0 to 5 days | 5 to 10 days | 10 to 15 days | 15 to 20 days | Above 20 days
```

`Task Status` values: `Yet to Start`, `In Progress`, `Pending`, `Complete`.
`Priority` values: `High`, `Medium`, `Low`.

### `Dashboard` (Task Management)

The pivot tab: total assigned tasks, counts and percentages per priority, counts and
percentages per task status, and the date-range header (`8/10/2026 to 17/10/2026`).
The HR Task Dashboard in the portal mirrors this layout and recomputes every figure
from live D1 data rather than reading the pivot.

---

## 6. Sync direction and safety rules

| Direction | When | What happens |
|---|---|---|
| **Pull** | HR clicks *Sync from Sheets*, or on the scheduled run | Sheet rows are validated, duplicate-checked and written into D1 |
| **Push** | HR clicks *Sync to Sheets* | D1 roster rows are appended to the `Roster` tab |

**A change made in a spreadsheet never touches D1 directly.** It is read, validated
against business rules and permissions, and only then applied — with an audit row
recording the actor, the timestamp and the before/after values.

**Credential columns are never synced in either direction.** The guard runs on every
read and every write.

---

## 7. Adding a sheet tab later

Tabs are registered in `shared/constants.ts`:

```ts
export const SHEETS = {
  TASK_SPREADSHEET_ID: '...',
  MAIN_SPREADSHEET_ID: '...',
  TASK_TAB: 'Management System',
  TASK_DASHBOARD_TAB: 'Dashboard',
  TASK_SUPPORT_TAB: 'Support',
  ROSTER_TAB: 'Roster',
  LEAVE_TAB: 'LeaveApplications',
  HR_USERS_TAB: 'HR_Users',
} as const;
```

Add the tab name there and the sync routines in `worker/src/services/sheets.ts`, then
document its columns in this file.
