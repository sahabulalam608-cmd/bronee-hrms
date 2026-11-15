"""BRONEE HRMS — attendance verification edge cases.

The spec fixes two behaviours around the verification window (the first minute
after the scheduled shift start):

  * verified inside the window   → the working timer starts at the shift start
  * verified after the window    → Pending Review, the timer stays stopped,
                                   clock-out is refused, HR clears the record

The clock is driven explicitly with Playwright's clock API so the result does
not depend on when the suite runs. MD Ismail Hossain works EVENING_E1, which
starts at 14:00 Bangladesh time (08:00 UTC).
"""

import datetime
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _browser import find_chromium  # noqa: E402

BASE = os.environ.get("BRONEE_BASE_URL", "http://127.0.0.1:4186")
OUT = str(Path(__file__).resolve().parent / "screenshots")
CHROME = find_chromium()

# 14:00:30 Bangladesh time — inside the one-minute verification window.
INSIDE_WINDOW = datetime.datetime(2026, 11, 13, 8, 0, 30, tzinfo=datetime.timezone.utc)
# 14:05:00 Bangladesh time — after the window.
AFTER_WINDOW = datetime.datetime(2026, 11, 13, 8, 5, 0, tzinfo=datetime.timezone.utc)

EMPLOYEE = "ismailhossainm712@gmail.com"
HR = "hr@bronneltd.com"

results: list[tuple[str, bool, str]] = []


def record(label: str, ok: bool, detail: str = "") -> bool:
    results.append((label, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail and not ok else ''}", flush=True)
    return ok


def sign_in(page, email: str) -> None:
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(700)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', "Bronee@2026")
    page.click('button:has-text("Login")')
    page.wait_for_timeout(2000)


def toast_text(page) -> str:
    nodes = page.locator('[role="status"]')
    return nodes.last.inner_text().strip() if nodes.count() else ""


def sign_out(page) -> None:
    page.locator('button[aria-label="Account menu"]').first.click(timeout=8000)
    page.wait_for_timeout(600)
    page.locator('button:has-text("Sign out")').first.click(timeout=8000)
    page.wait_for_timeout(1400)


def run() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME, args=["--no-sandbox"]
        ) if CHROME else p.chromium.launch(args=["--no-sandbox"])

        # ---------- case 1: clock-in inside the verification window ----------
        ctx = browser.new_context(
            ignore_https_errors=True, viewport={"width": 1440, "height": 960}
        )
        page = ctx.new_page()
        page.clock.set_system_time(INSIDE_WINDOW)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        sign_in(page, EMPLOYEE)
        page.goto(f"{BASE}/employee/attendance", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.locator('button:has-text("Clock in")').first.click()
        page.wait_for_timeout(1800)
        message = toast_text(page)
        record(
            "clock-in inside the window starts the working timer",
            "scheduled shift start" in message.lower(),
            message[:200],
        )
        record(
            "clock-in inside the window is not sent for review",
            "review" not in message.lower(),
            message[:200],
        )
        page.screenshot(path=f"{OUT}/edge-00-inside-window.png", full_page=True)

        # the timer now runs, so clock-out is accepted
        page.locator('button:has-text("Clock out")').first.click()
        page.wait_for_timeout(1600)
        out_message = toast_text(page)
        record(
            "clock-out is accepted while the timer runs",
            "clocked out" in out_message.lower() and "failed" not in out_message.lower(),
            out_message[:200],
        )
        ctx.close()

        # ---------- case 2: clock-in after the verification window ----------
        ctx = browser.new_context(
            ignore_https_errors=True, viewport={"width": 1440, "height": 960}
        )
        page = ctx.new_page()
        page.clock.set_system_time(AFTER_WINDOW)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        sign_in(page, EMPLOYEE)
        page.goto(f"{BASE}/employee/attendance", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.locator('button:has-text("Clock in")').first.click()
        page.wait_for_timeout(1800)
        message = toast_text(page)
        record(
            "late clock-in is held for HR review",
            "review" in message.lower(),
            message[:200],
        )
        body = page.inner_text("body")
        record(
            "late clock-in shows the Pending Review status",
            "Pending Review" in body,
            "no Pending Review badge on the attendance page",
        )
        page.screenshot(path=f"{OUT}/edge-01-pending-review.png", full_page=True)

        page.locator('button:has-text("Clock out")').first.click()
        page.wait_for_timeout(1600)
        out_message = toast_text(page)
        record(
            "clock-out is refused while the timer is stopped",
            "no active working session" in out_message.lower(),
            out_message[:200],
        )

        # ---------- HR reviews the held record ----------
        sign_out(page)
        sign_in(page, HR)
        page.goto(f"{BASE}/hr/attendance-review", wait_until="networkidle")
        page.wait_for_timeout(1600)
        review_body = page.inner_text("body")
        record(
            "the held record reaches the HR review queue",
            "Pending Review" in review_body,
            "held record not listed for review",
        )
        page.screenshot(path=f"{OUT}/edge-02-review-queue.png", full_page=True)

        approve = page.locator('button:has-text("Review")').first
        record("HR review action available", approve.count() > 0)
        if approve.count():
            approve.click()
            page.wait_for_timeout(1400)
            apply = page.locator('button:has-text("Apply action")').first
            if apply.count():
                apply.click()
                page.wait_for_timeout(2000)
            record("HR clears the held attendance record", True, toast_text(page)[:160])

        ctx.close()
        browser.close()

    print("=" * 78)
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} edge-case checks passed")
    if errors:
        print("\n--- errors ---")
        for e in dict.fromkeys(errors):
            print(" ", e[:200])
    else:
        print("no console or page errors")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
