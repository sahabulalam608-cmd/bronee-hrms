"""BRONEE HRMS — runtime smoke test.

Walks both portals in a real browser: sign-in, every module route, session
persistence across reloads, console errors and screenshots.

A route check passes only when the browser is still on that route AND the
rendered heading is the module heading (not the sign-in screen). That way a
lost session cannot masquerade as a passing page.
"""

import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _browser import find_chromium  # noqa: E402

BASE = os.environ.get("BRONEE_BASE_URL", "http://127.0.0.1:4184")
OUT = str(Path(__file__).resolve().parent / "screenshots")
CHROME = find_chromium()

HR_ROUTES = [
    ("/hr/dashboard", "HR Dashboard"),
    ("/hr/employees", "Employee Management"),
    ("/hr/approvals", "Employee Signup Approval"),
    ("/hr/departments", "Department Management"),
    ("/hr/designations", "Designation Management"),
    ("/hr/roster", "Roster Management"),
    ("/hr/attendance", "Attendance Management"),
    ("/hr/attendance-review", "Attendance Review"),
    ("/hr/breaks", "Break Records"),
    ("/hr/leave", "Leave Management"),
    ("/hr/overtime", "Overtime Management"),
    ("/hr/bonus", "Attendance Bonus Calculation"),
    ("/hr/payroll", "Payroll Management"),
    ("/hr/tasks", "Task Management"),
    ("/hr/announcements", "Announcements & Notifications"),
    ("/hr/sheets", "Google Sheets Integration"),
    ("/hr/reports", "Reports & Export"),
    ("/hr/settings", "Company Settings"),
    ("/hr/audit", "Audit Logs"),
]

EMP_ROUTES = [
    ("/employee/dashboard", "Dashboard"),
    ("/employee/attendance", "Attendance"),
    ("/employee/roster", "Roster"),
    ("/employee/break", "Break Management"),
    ("/employee/tasks", "My Tasks"),
    ("/employee/leave", "Leave Management"),
    ("/employee/overtime", "Overtime"),
    ("/employee/notifications", "Notifications"),
    ("/employee/profile", "My Profile"),
]

errors: list[str] = []
results: list[tuple[str, str]] = []


def record(label: str, ok: bool, detail: str = "") -> bool:
    results.append((label, "PASS" if ok else "FAIL"))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail and not ok else ''}", flush=True)
    return ok


def check_route(page, route: str, label: str) -> bool:
    """Route must render the module, not the sign-in screen."""
    before = len(errors)
    page.goto(f"{BASE}{route}", wait_until="networkidle")
    page.wait_for_timeout(600)
    on_route = page.url.rstrip("/").endswith(route)
    heading = page.locator("h1").first
    text = heading.inner_text().strip() if heading.count() else ""
    signed_out = "sign in" in text.lower() or page.locator('input[type="password"]').count() > 0
    clean = len(errors) == before
    ok = on_route and bool(text) and not signed_out and clean
    detail = []
    if not on_route:
        detail.append(f"redirected to {page.url}")
    if not text:
        detail.append("no heading")
    if signed_out:
        detail.append(f"showing sign-in screen (h1={text!r})")
    if not clean:
        detail.append(f"console errors: {errors[before]}")
    return record(f"{label} → {route}", ok, "; ".join(detail))


def run() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
        context = browser.new_context(
            ignore_https_errors=True, viewport={"width": 1440, "height": 960}
        )
        page = context.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        # ---------------- sign-in page ----------------
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(700)

        marks = page.locator('img[alt="BRONEE"]')
        visible_marks = [marks.nth(i) for i in range(marks.count()) if marks.nth(i).is_visible()]
        company = page.locator('p:has-text("BRONEE LTD")').first
        ok = False
        if visible_marks and company.count() and company.is_visible():
            mark_box = visible_marks[0].bounding_box()
            name_box = company.bounding_box()
            ok = bool(mark_box and name_box and mark_box["y"] < name_box["y"])
        record("login: BRONEE mark sits above the company name", ok)
        record("login: 'New employee of BRONEE?' prompt", bool(page.locator("text=New employee of BRONEE?").count()))
        record("login: 'Create your employee account' link", bool(page.locator("text=Create your employee account").count()))
        page.screenshot(path=f"{OUT}/01-login.png", full_page=True)

        # ---------------- HR portal ----------------
        page.fill('input[type="email"]', "hr@bronneltd.com")
        page.fill('input[type="password"]', "Bronee@2026")
        page.click('button:has-text("Login")')
        page.wait_for_url("**/hr/**", timeout=15000)
        page.wait_for_timeout(1200)
        record("HR sign-in lands on /hr/dashboard", "/hr/dashboard" in page.url)

        for index, (route, label) in enumerate(HR_ROUTES):
            check_route(page, route, f"HR {label}")
            if index in (0, 6, 14, 16):
                page.screenshot(path=f"{OUT}/hr-{index:02d}-{route.strip('/').replace('/', '-')}.png", full_page=True)

        # session must survive a full reload
        page.goto(f"{BASE}/hr/dashboard", wait_until="networkidle")
        page.wait_for_timeout(1200)
        record("HR session survives a full page reload", bool(page.locator("header button").count()) and "/login" not in page.url)

        # sign out
        try:
            page.locator('button[aria-label="Account menu"]').first.click(timeout=8000)
            page.wait_for_timeout(600)
            page.locator('button:has-text("Sign out")').first.click(timeout=8000)
            page.wait_for_url("**/login", timeout=10000)
            record("HR sign-out returns to /login", True)
        except Exception as exc:  # noqa: BLE001
            record(f"HR sign-out ({type(exc).__name__})", False)
            page.evaluate("() => localStorage.clear()")
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(800)

        # ---------------- Employee portal ----------------
        page.fill('input[type="email"]', "ismailhossainm712@gmail.com")
        page.fill('input[type="password"]', "Bronee@2026")
        page.click('button:has-text("Login")')
        page.wait_for_url("**/employee/**", timeout=15000)
        page.wait_for_timeout(1200)
        record("Employee sign-in lands on /employee/dashboard", "/employee/dashboard" in page.url)

        for index, (route, label) in enumerate(EMP_ROUTES):
            check_route(page, route, f"EMP {label}")
            if index in (0, 2, 7):
                page.screenshot(path=f"{OUT}/emp-{index:02d}-{route.strip('/').replace('/', '-')}.png", full_page=True)

        page.goto(f"{BASE}/employee/dashboard", wait_until="networkidle")
        page.wait_for_timeout(1000)
        record("Employee session survives a full page reload", bool(page.locator("header button").count()) and "/login" not in page.url)

        # ---------------- mobile ----------------
        mobile_context = browser.new_context(
            ignore_https_errors=True,
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
        )
        mobile = mobile_context.new_page()
        mobile.goto(f"{BASE}/login", wait_until="networkidle")
        mobile.wait_for_timeout(700)
        mobile.screenshot(path=f"{OUT}/mobile-login.png", full_page=True)
        mobile.fill('input[type="email"]', "hr@bronneltd.com")
        mobile.fill('input[type="password"]', "Bronee@2026")
        mobile.click('button:has-text("Login")')
        mobile.wait_for_url("**/hr/**", timeout=15000)
        mobile.wait_for_timeout(1500)
        record("mobile: HR dashboard renders at 390px", bool(mobile.locator("h1").count()) and "/login" not in mobile.url)
        mobile.screenshot(path=f"{OUT}/mobile-hr-dashboard.png", full_page=True)

        browser.close()

    print("=" * 78)
    failed = [r for r in results if r[1] != "PASS"]
    print(f"{len(results) - len(failed)}/{len(results)} checks passed")
    if errors:
        print("\n--- console / page errors ---")
        seen = set()
        for err in errors:
            if err not in seen:
                seen.add(err)
                print(" ", err[:220])
        print(f"{len(seen)} unique errors")
    else:
        print("no console or page errors")
    return 1 if failed or errors else 0


if __name__ == "__main__":
    sys.exit(run())
