# Deployment checklist

Everything needed to take BRONEE HRMS from this repository to a running system.

---

## Current state

| | |
| --- | --- |
| Source | https://github.com/sahabulalam608-cmd/bronee-hrms (`main`) |
| Pages project | `bronee-hrms` — https://bronee-hrms.pages.dev |
| Worker | `bronee-hrms-api` — https://bronee-hrms-api.sahabulalam608.workers.dev |
| D1 database | `bronee_hrms` — `428c2ea1-0768-4ac5-9346-d22d041e82e4` |
| Pages build | `npm run build` → `dist` (repository root) |
| Deployments | Connected to the repository — every push to `main` rebuilds and republishes |

**What is done**

- The Worker, the D1 database and the migrations are deployed.
- The reference data (departments, shifts, designations) is seeded.
- The Pages site builds from the repository and serves the production bundle.
- `SESSION_SECRET` is set as a Worker secret.
- The first Super Admin exists: `hr@bronee.com`.
- 152 end-to-end checks pass against the live system.

**What is left**

| | |
| --- | --- |
| R2 | Enable it once at https://dash.cloudflare.com → R2 → "Enable R2", then run `npm run deploy -- r2`. Until then file uploads answer with a clear message. |
| Email | `RESEND_API_KEY` is not set, so signup OTP codes are never delivered. Add it with `npx wrangler secret put RESEND_API_KEY` (Resend's free tier covers 100 emails a day). |
| Office location | Company Settings → Office Network: enter the real office GPS coordinates and public IP. |
| Signup domain | `SIGNUP_EMAIL_DOMAIN` is `gmail.com`. Change it in `packages/api/wrangler.toml` if BRONEE wants `@bronee.com` addresses. |

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
4. sets the Worker secrets, including `SESSION_SECRET`
5. points the Worker's `APP_URL` at https://bronee-hrms.pages.dev
6. deploys the Worker
7. builds the web client and publishes it to the `bronee-hrms` Pages project

Run `npm run deploy -- --help` for the individual steps
(`d1`, `r2`, `migrate`, `secrets`, `worker`, `pages`).

### 2. Two GitHub secrets (optional — the Pages project already builds from the repository)

Repository → **Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | A Cloudflare API token with **Workers Scripts:Edit**, **Pages:Edit**, **D1:Edit** and **R2:Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Secret | `ef65d314e159ffbaeb998b4f4552a221` |

These only matter if you want the GitHub Actions workflows to deploy as well. The
Cloudflare Pages Git integration already rebuilds on every push.

### 3. Create the first Super Admin

```bash
cd packages/api
npx tsx scripts/seed-admin.ts --email hr@bronee.com --password "YourStrongPass1" --name "HR Admin" --role super_admin
```

That prints a SQL statement. Run it against the live database:

```bash
npx wrangler d1 execute bronee_hrms --remote --command "<paste the statement>"
```

The script verifies its own password hash before printing, so a hash the Worker cannot
verify is never written.

### 4. Point the office verification at the real office

Sign in as the Super Admin → **Company Settings → Office Network**:

- Office GPS latitude / longitude
- Office public IP (the allow-list accepts single addresses and CIDR ranges)
- Geofence radius (default 50 m) and the maximum acceptable GPS accuracy

Without this, office punch-ins fail verification — which is the intended behaviour.

---

## After deployment

| Check | How |
| --- | --- |
| The site loads | https://bronee-hrms.pages.dev shows the sign-in screen |
| The API responds | `GET https://bronee-hrms-api.sahabulalam608.workers.dev/api/health` returns `{"ok":true,...}` |
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
  signup. Every attempt is recorded in the `email_log` table.
- **The session cookie is `SameSite=None`.** The API and the client live on different
  sites, so a `Lax` cookie would never be sent. The attribute is derived from the
  request, so a same-origin setup still uses `Lax`.
- **PBKDF2 is capped at 100 000 iterations.** That is Cloudflare Workers' WebCrypto
  limit; a higher figure makes every sign-in fail with a misleading error.
- **The Pages output directory.** The project is set to `dist` at the repository root and
  the build produces that folder, so no dashboard change is needed. `packages/web/dist`
  also works if you prefer it.
- **The document shell must not be cached.** `packages/web/public/_headers` revalidates
  the HTML on every load while the hashed assets stay immutable for a year — otherwise a
  browser keeps loading the previous bundle after a deployment.
