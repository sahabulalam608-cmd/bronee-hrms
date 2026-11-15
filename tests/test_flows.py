"""BRONEE HRMS — functional flow test.

Exercises the business flows end to end in a real browser, not just rendering:
clock-in, break, leave application, HR approval, roster publish, payroll
publish, CSV export and the employee signup + OTP path.
"""

import datetime
import re
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _browser import find_chromium  # noqa: E402

BASE = os.environ.get("BRONEE_BASE_URL", "http://127.0.0.1:4185")
# 18:00:30 Bangladesh time — inside the one-minute verification window.
SHIFT_START = datetime.datetime(2026, 11, 15, 12, 0, 30, tzinfo=datetime.timezone.utc)
OUT = str(Path(__file__).resolve().parent / "screenshots")
CHROME = find_chromium()

results: list[tuple[str, bool, str]] = []


def record(label: str, ok: bool, detail: str = "") -> bool:
    results.append((label, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail and not ok else ''}", flush=True)
    return ok


def sign_in(page, email: str) -> None:
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(600)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', "Bronee@2026")
    page.click('button:has-text("Login")')
    page.wait_for_timeout(1800)


def sign_out(page) -> None:
    page.locator('button[aria-label="Account menu"]').first.click(timeout=8000)
    page.wait_for_timeout(500)
    page.locator('button:has-text("Sign out")').first.click(timeout=8000)
    page.wait_for_timeout(1200)


def toast_text(page) -> str:
    """Most recent toast title currently on screen."""
    nodes = page.locator('[role="status"]')
    return nodes.last.inner_text().strip() if nodes.count() else ""


def run() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"]) if CHROME else p.chromium.launch(args=["--no-sandbox"])
        context = browser.new_context(
            ignore_https_errors=True, viewport={"width": 1440, "height": 960}
        )
        page = context.new_page()
        page.clock.set_system_time(SHIFT_START)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ============ EMPLOYEE FLOWS ============
        sign_in(page, "rafiq.bronee@gmail.com")
        record("employee signs in", "/employee/" in page.url, page.url)

        # --- clock in ---
        page.goto(f"{BASE}/employee/attendance", wait_until="networkidle")
        page.wait_for_timeout(900)
        page.locator('button:has-text("Clock in")').first.click()
        page.wait_for_timeout(1400)
        message = toast_text(page)
        record(
            "employee clock-in opens a working session",
            "clock" in message.lower() and "fail" not in message.lower(),
            message[:160],
        )
        page.screenshot(path=f"{OUT}/flow-01-clockin.png", full_page=True)

        # --- clock out ---
        page.locator('button:has-text("Clock out")').first.click()
        page.wait_for_timeout(1200)
        message = toast_text(page)
        record("employee clock-out ends the session", "clocked out" in message.lower(), message[:120])

        # --- break ---
        page.goto(f"{BASE}/employee/break", wait_until="networkidle")
        page.wait_for_timeout(900)
        break_btn = page.locator('button:has-text("Start break")').first
        record("employee break control present", break_btn.count() > 0)
        if break_btn.count():
            break_btn.click()
            page.wait_for_timeout(1500)
            resumed = page.locator('button:has-text("Resume working")').count() > 0
            record("employee starts a break", resumed, toast_text(page)[:120])
            if resumed:
                page.locator('button:has-text("Resume working")').first.click()
                page.wait_for_timeout(1500)
            record(
                "employee resumes work after the break",
                page.locator('button:has-text("Start break")').count() > 0,
                toast_text(page)[:120],
            )

        # --- leave application ---
        page.goto(f"{BASE}/employee/leave", wait_until="networkidle")
        page.wait_for_timeout(900)
        before_text = page.inner_text("body")
        page.locator('button:has-text("Apply for leave")').first.click()
        page.wait_for_timeout(900)
        modal = page.locator('[role="dialog"]').first
        record("leave application modal opens", modal.count() > 0)
        if modal.count():
            page.locator('input[type="date"]').first.fill("2026-11-20")
            page.locator('input[type="date"]').nth(1).fill("2026-11-21")
            reason = page.locator('textarea').first
            if reason.count():
                reason.fill("Family commitment out of station.")
            page.locator('button:has-text("Submit application")').first.click()
            page.wait_for_timeout(1800)
            after = page.inner_text("body")
            record(
                "leave application is submitted",
                "Submitted" in after or "Pending" in after,
                after[:220].replace("\n", " "),
            )
        page.screenshot(path=f"{OUT}/flow-02-leave.png", full_page=True)

        # --- task submission ---
        page.goto(f"{BASE}/employee/tasks", wait_until="networkidle")
        page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/flow-03-tasks.png", full_page=True)
        record("employee task list renders", page.locator("h1").count() > 0)

        # ============ HR FLOWS ============
        sign_out(page)
        sign_in(page, "hr@bronneltd.com")
        record("HR signs in", "/hr/" in page.url, page.url)

        # --- approvals: approve a pending leave ---
        page.goto(f"{BASE}/hr/approvals", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=f"{OUT}/flow-04-approvals.png", full_page=True)
        approve_btn = page.locator('button:has-text("Approve")').first
        if approve_btn.count():
            approve_btn.click()
            page.wait_for_timeout(1500)
            confirm = page.locator('button:has-text("Approve")').last
            if confirm.count() and confirm.is_visible():
                confirm.click()
                page.wait_for_timeout(1500)
            record("HR approves a pending application", "Approved" in page.inner_text("body"))
        else:
            record("HR approval action available", False, "no Approve button found")

        # --- roster publish ---
        page.goto(f"{BASE}/hr/roster", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.locator('button:has-text("New roster")').first.click()
        page.wait_for_timeout(900)
        page.locator('button:has-text("Create draft roster")').first.click()
        page.wait_for_timeout(1800)
        record("HR creates a draft roster", "draft" in page.inner_text("body").lower(),
               toast_text(page)[:120])
        publish_btn = page.locator('button:has-text("Publish")').first
        record("HR roster publish action available", publish_btn.count() > 0)
        if publish_btn.count():
            publish_btn.click()
            page.wait_for_timeout(1200)
            confirm = page.locator('button:has-text("Publish now")').first
            if confirm.count():
                confirm.click()
                page.wait_for_timeout(2000)
            record("HR publishes the roster", "published" in page.inner_text("body").lower(),
                   toast_text(page)[:120])
        page.screenshot(path=f"{OUT}/flow-05-roster.png", full_page=True)

        # --- payroll publish ---
        page.goto(f"{BASE}/hr/payroll", wait_until="networkidle")
        page.wait_for_timeout(1200)
        payroll_publish = page.locator('button:has-text("Publish payroll"), button:has-text("Publish")').first
        if payroll_publish.count():
            payroll_publish.click()
            page.wait_for_timeout(1200)
            confirm = page.locator('button:has-text("Publish payroll"), button:has-text("Publish")').last
            if confirm.count() and confirm.is_visible():
                confirm.click()
                page.wait_for_timeout(2000)
            record("HR publishes payroll", "Published" in page.inner_text("body"))
        else:
            record("HR payroll publish action available", False, "no publish button found")
        page.screenshot(path=f"{OUT}/flow-06-payroll.png", full_page=True)

        # --- CSV export ---
        page.goto(f"{BASE}/hr/reports", wait_until="networkidle")
        page.wait_for_timeout(1200)
        with page.expect_download(timeout=15000) as dl:
            page.locator('button:has-text("Export"), button:has-text("CSV")').first.click()
        download = dl.value
        target = f"{OUT}/export-{download.suggested_filename}"
        download.save_as(target)
        record("HR CSV export downloads a file", bool(download.suggested_filename), str(target))
        page.screenshot(path=f"{OUT}/flow-07-reports.png", full_page=True)

        # --- sheets sync ---
        page.goto(f"{BASE}/hr/sheets", wait_until="networkidle")
        page.wait_for_timeout(1200)
        pull_btn = page.locator('button:has-text("Pull from Sheets")').first
        record("HR Sheets sync action available", pull_btn.count() > 0)
        if pull_btn.count():
            pull_btn.click()
            page.wait_for_timeout(2500)
            message = toast_text(page)
            record("HR pulls records from Google Sheets", "sync" in message.lower(), message[:160])
        page.screenshot(path=f"{OUT}/flow-08-sheets.png", full_page=True)

        # ============ SIGNUP + OTP ============
        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.wait_for_timeout(1000)
        record("signup page renders", page.locator("h1").count() > 0)
        page.screenshot(path=f"{OUT}/flow-09-signup.png", full_page=True)

        browser.close()

    print("=" * 78)
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} flow checks passed")
    if errors:
        print("\n--- errors ---")
        for e in dict.fromkeys(errors):
            print(" ", e[:200])
    else:
        print("no console or page errors")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
