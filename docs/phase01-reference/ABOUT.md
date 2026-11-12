# Phase 01 reference

This folder is the **original Phase 01 frontend** from the BRONEE HRMS repository,
archived for reference only. It is not part of the application build and is never
imported by the shipped code.

## What it was

A frontend-only React + Vite + Tailwind shell:

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Routes for login / signup / forgot-password and the employee shell. Every module except the dashboard was a `<Placeholder>`. |
| `src/pages/LoginPage.tsx` | Login form with the BRONEE error copy. Stored a fake session in `sessionStorage`. |
| `src/pages/SignupPage.tsx` | Signup with the department tree and an OTP step (the OTP was generated and shown on screen — no email was sent). |
| `src/pages/EmployeeShell.tsx` | Sidebar + mobile bottom navigation. |
| `src/pages/DashboardPage.tsx` | Dashboard layout with attendance controls as a placeholder. |
| `src/components/BrandMark.tsx` | The BRONEE "B" mark. |
| `src/lib/departments.ts` | The department tree from the specification. |
| `src/index.css` | Base styles and the `.btn-primary` / `.btn-ghost` / `.field-input` / `.field-select` classes. |
| `tailwind.config.js` | The `bronee` brand palette, `ink` and `surface` scales, and the `card` / `soft` / `lift` shadows. |

## What was carried forward

The finished system keeps everything here that still had value:

- **The brand palette** — `bronee` / `brand` scales, the `ink` and `surface` neutrals and the
  shadow names are now the canonical tokens in `packages/web/tailwind.config.js`, so the
  live site's existing purple (`#5C2D91`) is unchanged.
- **The `BrandMark` component** — now at `packages/web/src/components/common/BrandMark.tsx`.
- **The utility classes** — `.btn-primary`, `.btn-ghost`, `.field-input` and `.field-select`
  are defined in `packages/web/src/styles/index.css`.

## What was replaced, and why

Phase 01 had no backend. Authentication was a `sessionStorage` write, the OTP was displayed
on screen, and every module was a placeholder. The finished system replaces all of it with a
Cloudflare Worker API, a D1 database, server-side authentication and the full attendance,
roster, leave, overtime, task, payroll and announcement engines.

Its git history is preserved in this repository — see the `Merge Phase 01 shell into the full
BRONEE HRMS` commit.
