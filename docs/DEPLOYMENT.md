# Deploying BRONEE HRMS

Everything below runs on Cloudflare's free tier. Budget roughly 20 minutes.

---

## 0. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

You need a Cloudflare account, a GitHub repository, and a Google Cloud project (only for
the Sheets sync — the app runs without it).

---

## 1. Create the D1 database

```bash
cd worker
npx wrangler d1 create bronee-hrms
```

Copy the printed `database_id` into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "bronee-hrms"
database_id = "YOUR_DATABASE_ID_HERE"
migrations_dir = "migrations"
```

Apply the schema:

```bash
npx wrangler d1 migrations apply bronee-hrms
```

This creates 23 tables: people (`employees`, `users`, `sessions`, `otp_codes`,
`signup_applications`), structure (`departments`, `designations`, `company_settings`,
`staffing_rules`), scheduling (`rosters`, `roster_entries`, `roster_change_requests`,
`roster_change_log`), time (`attendance_sessions`, `break_sessions`), work
(`leave_applications`, `overtime_requests`, `tasks`, `task_submissions`), money and
messages (`salary_records`, `announcements`, `announcement_recipients`, `notifications`),
and system (`files`, `audit_logs`, `sync_logs`).

---

## 2. Create the private R2 bucket

```bash
npx wrangler r2 bucket create bronee-hrms-files
```

The bucket stays private — no public access, no `r2.dev` subdomain. Downloads are served
by the API after an authentication and permission check.

---

## 3. Configure secrets

```bash
npx wrangler secret put SESSION_SECRET      # openssl rand -base64 48
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT   # the service account JSON (one line)
```

`SESSION_SECRET` signs session tokens. Changing it invalidates every active session.

`GOOGLE_SERVICE_ACCOUNT` is the **entire JSON key file** of a Google service account,
flattened onto one line:

```bash
cat service-account.json | jq -c . | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT
```

The service account must be shared as **Viewer** on both spreadsheets
(see `docs/google-sheets-setup.md`).

---

## 4. Set plain variables

```bash
npx wrangler secret put APP_ORIGIN    # https://hr.broneeltd.com
```

or edit `worker/wrangler.toml`:

```toml
[vars]
SESSION_SECRET = "dev-only"
TZ = "Asia/Dhaka"
APP_ORIGIN = "http://localhost:5173"
TASK_SPREADSHEET_ID = "1BYeXS8TdZ--0XiSNpagb7h6tE9U6rzZnCRP5Uf5ht-U"
MAIN_SPREADSHEET_ID = "14aH8tlWWGh98tgztao1FHrLZn9DzYNScJXVMNhLfe98"
```

> Never leave the real `SESSION_SECRET` in `wrangler.toml` — use `wrangler secret put`.

---

## 5. Deploy the Worker

```bash
cd worker
npx wrangler deploy
```

The API lives at `https://bronee-hrms-api.<subdomain>.workers.dev`. Verify:

```bash
curl https://<worker>/api/health
# {"ok":true,"service":"bronee-hrms-api",...}
```

The `*/5 * * * *` cron in `wrangler.toml` publishes scheduled rosters and announcements
whose time has come.

---

## 6. Deploy the web app to Cloudflare Pages

The app is a static Vite build.

```bash
cd web
npm run build        # → web/dist
```

Pages project settings:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 |
| Environment variable | `VITE_API_MODE=http` |
| Environment variable | `VITE_API_BASE_URL=https://<worker-url>` |

Connect the GitHub repository and let Pages build on every push.

### Routing fallback

Add a `web/public/_redirects` file:

```
/*  /index.html  200
```

Pages serves `index.html` for every path so client-side routes like
`/employee/roster` and `/hr/payroll` resolve correctly.

---

## 7. First login

The Super Admin is always HR. Create the first account directly in D1:

```bash
cd worker
npx wrangler d1 execute bronee-hrms --command "
INSERT INTO employees (id, employee_id, full_name, mobile, email, designation,
  department_id, joining_date, shift_code, status, portal, role, created_at)
VALUES ('emp-hr-admin','BRN-001','HR Admin','+8801700000000','hr@broneeltd.com',
  'HR Director & Super Admin','', '2026-01-01','MORNING','Active','HR','SUPER_ADMIN',
  datetime('now'));
"
```

Then insert the matching `users` row with a **hashed** password. Generate the hash once
in a Node REPL using the same algorithm the Worker uses:

```js
const { hashPassword } = await import('./shared/crypto.ts');
console.log(await hashPassword('your-password'));
```

Paste the `pbkdf2$100000$<salt>$<hash>` value into the `users` row. Plaintext
credentials never belong in D1, in a spreadsheet, or in git.

---

## 8. Point the Worker at the Pages app

`APP_ORIGIN` is used for CORS. After the app is live, set it to the Pages URL:

```bash
npx wrangler secret put APP_ORIGIN
```

---

## 9. Housekeeping

```bash
# D1 backup
npx wrangler d1 export bronee-hrms --output backup.sql

# Scheduled backups (daily, keep 30 days)
npx wrangler d1 export bronee-hrms --output backup-$(date +%F).sql --remote

# R2 usage
npx wrangler r2 bucket info bronee-hrms-files
```

---

## 10. Rate limiting

Add Cloudflare WAF rate-limit rules on the Worker route in the dashboard, or with the
Terraform provider:

| Path | Limit |
|---|---|
| `/api/auth/login` | 10 requests / minute / IP |
| `/api/auth/signup/otp` | 5 requests / hour / IP |
| `/api/auth/password/forgot` | 5 requests / hour / IP |
| `/api/*` | 300 requests / minute / IP |

---

## 11. Switching the demo build to production

The deployed demo uses the in-browser adapter. To point it at the real API, rebuild the
web app with:

```bash
VITE_API_MODE=http VITE_API_BASE_URL=https://<worker-url> npm run build
```

Nothing in the UI code changes — only the adapter behind `ApiClient` swaps.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Not a registered employee` | The email is not in `employees`/`users` | Insert the account (step 7) |
| Clock-in always fails verification | The office public IP is not configured | Add the office IP under Company Settings → `officePublicIps` |
| GPS always rejected | Device accuracy above 100 m | Outdoors, or raise `MAX_GPS_ACCURACY_M` in `shared/constants.ts` |
| Sheets sync reports `SYNC_FAILED` | Service account missing or not shared | Re-check steps 3 and `docs/google-sheets-setup.md` |
| Sessions drop immediately | `SESSION_SECRET` changed | Expected — users sign in again |
