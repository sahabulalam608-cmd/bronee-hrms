# Deployment checklist

Everything needed to take BRONEE HRMS from this repository to a running system.
Two things need your Cloudflare account — the rest is scripted.

---

## Current state

| | |
| --- | --- |
| Source | https://github.com/sahabulalam608-cmd/bronee-hrms (`main`) |
| Pages project | `bronee-hrms` — https://bronee-hrms.pages.dev |
| Pages deployment | **Manual upload, not Git-connected** — pushes do not rebuild it |
| What is live right now | The Phase 01 `index.html`, referencing `/src/main.tsx` |
| Why the site is blank | The raw `.tsx` source was uploaded, so the browser refuses to execute it (`MIME type application/octet-stream`), and there is no `/assets/*` bundle and no `/_redirects` |

---

## One-time setup (about 10 minutes)

### 1. Cloudflare resources

```bash
npx wrangler login
npm run deploy
```

That single command:

1. creates the **D1** database `bronee_hrms` and writes its id into `packages/api/wrangler.toml`
2. creates the **R2** bucket `bronee-files`
3. applies the D1 migrations and seeds the reference data (departments, shifts, designations)
4. sets `SESSION_SECRET` (generates one if you leave it blank) and `RESEND_API_KEY`
5. points the Worker's `APP_URL` at https://bronee-hrms.pages.dev
6. deploys the Worker
7. builds the web client and publishes it to the `bronee-hrms` Pages project

Run `npm run deploy -- --help` for the individual steps.

### 2. Two GitHub secrets (enables automatic deploys from now on)

Repository → **Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | A Cloudflare API token with **Workers Scripts:Edit**, **Pages:Edit**, **D1:Edit** and **R2:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | Your Cloudflare account id (Dashboard → Workers & Pages → Account ID) |

Optional **Variables** (Settings → Secrets and variables → Actions → *Variables* tab):

| Name | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://bronee-hrms-api.<your-subdomain>.workers.dev` |
| `WORKER_SUBDOMAIN` | The same subdomain, used by the API health check |

With those in place, every push to `main` rebuilds and republishes the Pages site.

### 3. Create the first Super Admin

```bash
cd packages/api
npx tsx scripts/seed-admin.ts --email hr@bronee.com --password "YourStrongPass1" --name "HR Admin" --role super_admin
```

That prints a SQL statement. Run it against the live database:

```bash
npx wrangler d1 execute bronee_hrms --remote --command "<paste the statement>"
```

### 4. Point the office verification at the real office

Sign in as the Super Admin → **Company Settings → Office Network**:

- Office GPS latitude / longitude
- Office public IP (the allow-list accepts single addresses and CIDR ranges)
- Geofence radius (default 50 m) and the maximum acceptable GPS accuracy

Without this, every office punch-in fails verification.

---

## After deployment

| Check | How |
| --- | --- |
| The site loads | https://bronee-hrms.pages.dev shows the sign-in screen |
| The API responds | `GET https://bronee-hrms-api.<subdomain>.workers.dev/api/health` returns `{"ok":true,...}` |
| The database is live | Sign in as the Super Admin — the HR dashboard shows real data |
| Signup works | The OTP must actually arrive by email; this needs `RESEND_API_KEY` |
| Deep links work | Open `/app/dashboard` directly — the SPA fallback is in `packages/web/public/_redirects` |

### Deploying the API again after a change

```bash
# locally
npm run deploy -- worker

# or from GitHub: Actions → Deploy API → Run workflow
```

The API workflow is manual on purpose — it can change the production database.

---

## Gotchas

- **The email provider must be configured.** Production sets `EMAIL_PROVIDER = "resend"`.
  Without `RESEND_API_KEY` the OTP is created but never delivered, so nobody can complete
  signup. The API logs every attempt in the `email_log` table.
- **`SIGNUP_EMAIL_DOMAIN` is `gmail.com`.** New employees must register with a Gmail
  address as their official email. Change it in `packages/api/wrangler.toml` if BRONEE
  wants `@bronee.com` addresses.
- **The Pages output directory.** The project is set to `dist` at the repository root and
  the build produces that folder, so no dashboard change is needed. `packages/web/dist`
  also works if you prefer it.
