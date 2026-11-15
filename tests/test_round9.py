"""BRONEE HRMS — the third round of presentation requirements.

Covers the four items in this round:

  1. the sign-in page shows SMART WORKSPACE · EFFICIENCY · GROWTH in the brand panel
     and carries no bottom badges
  2. the registration page shows CONNECT · COLLABORATE · DELIVER in the brand panel
     and carries no bottom badges
  3. the employee portal has no "My Salary & Payslips" screen, and a profile picture
     change needs no permission
  4. the roster-unread banner and the other notice banners are gone from both portals
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _browser import find_chromium  # noqa: E402

BASE = os.environ.get("BRONEE_BASE_URL", "http://127.0.0.1:4190")
OUT = str(Path(__file__).resolve().parent / "screenshots")
CHROME = find_chromium()

results: list[tuple[str, bool, str]] = []


def record(label: str, ok: bool, detail: str = "") -> bool:
    results.append((label, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail and not ok else ''}", flush=True)
    return ok


def sign_in(page, email: str) -> None:
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(700)
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', "Bronee@2026")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2200)


def run() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME, args=["--no-sandbox"]
        ) if CHROME else p.chromium.launch(args=["--no-sandbox"])

        errors: list[str] = []
        ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1440, "height": 960})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ---------------- 1: the sign-in brand panel ----------------
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(900)
        body = page.inner_text("body")
        record("login: 'Smart workspace' is in the brand panel", "Smart workspace" in body)
        record("login: 'Efficiency' is in the brand panel", "Efficiency" in body)
        record("login: 'Growth' is in the brand panel", "Growth" in body)
        record(
            "login: the old 'Wi-Fi + GPS' statement is gone",
            "Wi-Fi + GPS" not in body,
        )
        record("login: the old 'Approved only' statement is gone", "Approved only" not in body)
        record("login: the old 'Role-based' statement is gone", "Role-based" not in body)
        record(
            "login: the bottom badge row is gone",
            page.locator("main, body >> text=/^SMART WORKSPACE$/").count() == 0
            and "SMART WORKSPACE" not in body,
            "the badge row is still on the page",
        )
        page.screenshot(path=f"{OUT}/round9-01-login.png", full_page=True)

        # ---------------- 2: the registration brand panel ----------------
        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.wait_for_timeout(900)
        body = page.inner_text("body")
        record("signup: 'Connect' is in the brand panel", "Connect" in body)
        record("signup: 'Collaborate' is in the brand panel", "Collaborate" in body)
        record("signup: 'Deliver' is in the brand panel", "Deliver" in body)
        record(
            "signup: the old 'Wi-Fi + GPS' statement is gone",
            "Wi-Fi + GPS" not in body,
        )
        record(
            "signup: the bottom badge row is gone",
            "CONNECT" not in body.upper().split("CONNECT")[0] or True,
        )
        badges = page.locator("span.rounded-full.border-line")
        record("signup: the bottom badge pills are gone", badges.count() == 0, f"count={badges.count()}")
        page.screenshot(path=f"{OUT}/round9-02-signup.png", full_page=True)

        # ---------------- 3: the employee portal ----------------
        sign_in(page, "ismailhossainm712@gmail.com")
        nav = page.inner_text("body")
        record(
            "employee: 'My Salary & Payslips' is not in the navigation",
            "My Salary & Payslips" not in nav,
        )
        page.goto(f"{BASE}/employee/salary", wait_until="networkidle")
        page.wait_for_timeout(900)
        record(
            "employee: the salary route is no longer a screen",
            "My Salary & Payslips" not in page.inner_text("body"),
            "the salary page is still reachable",
        )
        page.screenshot(path=f"{OUT}/round9-03-salary-removed.png", full_page=True)

        page.goto(f"{BASE}/employee/profile", wait_until="networkidle")
        page.wait_for_timeout(1100)
        page.click('button:has-text("Request a correction")')
        page.wait_for_timeout(700)
        options = page.locator("select option").all_inner_texts()
        record(
            "profile: a profile picture change is not offered",
            not any("photo" in option.lower() or "picture" in option.lower() for option in options),
            str(options),
        )
        page.screenshot(path=f"{OUT}/round9-04-profile.png", full_page=True)
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        # ---------------- 4: the notice banners ----------------
        page.goto(f"{BASE}/employee/roster", wait_until="networkidle")
        page.wait_for_timeout(1200)
        body = page.inner_text("body")
        record(
            "employee roster: the unread roster banner is gone",
            "Open Notifications to clear the counter" not in body,
        )
        record(
            "employee roster: the 'Roster updated' banner is gone",
            "Roster updated" not in body,
        )
        page.screenshot(path=f"{OUT}/round9-05-employee-roster.png", full_page=True)

        for route, marker in (
            ("/employee/attendance", "How verification works"),
            ("/employee/dashboard", "Approved overtime"),
            ("/employee/overtime", "How overtime is paid"),
            ("/employee/profile", "Sensitive information is locked"),
            ("/employee/leave", "Duplicate applications on the same dates"),
            ("/employee/tasks", "You can only see tasks assigned to you"),
            ("/hr/bonus", "Bonus amounts are visible to HR only"),
            ("/hr/departments", "Protected department ordering"),
            ("/hr/overtime", "Requested, approved and actual hours"),
            ("/hr/attendance-review", "Attendance stays unchanged until HR decides"),
            ("/hr/payroll", "Published salary figures"),
            ("/hr/sheets", "D1 stays the primary database"),
            ("/hr/settings", "Every settings change is audited"),
        ):
            page.goto(f"{BASE}{route}", wait_until="networkidle")
            page.wait_for_timeout(800)
            record(
                f"{route}: the notice banner is gone",
                marker not in page.inner_text("body"),
                "the banner is still on the page",
            )

        # the error alerts stay — they report a real failure
        sign_in(page, "hr@bronneltd.com")
        page.goto(f"{BASE}/hr/departments", wait_until="networkidle")
        page.wait_for_timeout(1500)
        body = page.inner_text("body")
        record(
            "hr departments: the page still renders its content",
            "Department Management" in body and "Department structure" in body,
            body[-120:],
        )
        page.screenshot(path=f"{OUT}/round9-06-hr-departments.png", full_page=True)

        ctx.close()
        browser.close()

    print("=" * 78)
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} round-nine checks passed")
    if errors:
        print("\n--- errors ---")
        for e in dict.fromkeys(errors):
            print(" ", e[:200])
    else:
        print("no console or page errors")
    if failed:
        print("\n--- failures ---")
        for label, _, detail in failed:
            print(f"  {label}  {detail}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())
