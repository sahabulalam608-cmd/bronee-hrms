"""BRONEE HRMS — auth page copy and the signup → Google Sheets path.

Covers the six presentation and data requirements for the sign-in and
registration pages:

  1. the BRONEE logo appears exactly once per viewport
  2. the sign-in subtext reads "Use your registered email address and password."
  3. the sign-in email field is labelled "Email", not "Official Email"
  4. the sign-in headline and subtext are the new ones, and the old headline is gone
  5. the registration headline and subtext are the new ones
  6. registration is numbered from 01 and every registration is written to the
     Employee Signups sheet with a serial and a mobile number that both start with 0
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

LOGIN_HEADLINE = "Empowering our team to connect, collaborate, and deliver excellence."
LOGIN_SUBTEXT = "Welcome back to BRONEE Limited Workspace."
SIGNUP_HEADLINE = "We Connect. We Deliver. Every Single Day."
SIGNUP_SUBTEXT = (
    "Complete your registration to begin your journey with BRONEE and access your "
    "personalized employee workspace once approved."
)

results: list[tuple[str, bool, str]] = []


def record(label: str, ok: bool, detail: str = "") -> bool:
    results.append((label, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  — ' + detail) if detail and not ok else ''}", flush=True)
    return ok


def count_visible(page, selector: str) -> int:
    nodes = page.locator(selector)
    return sum(1 for i in range(nodes.count()) if nodes.nth(i).is_visible())


def run() -> int:
    Path(OUT).mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME, args=["--no-sandbox"]
        ) if CHROME else p.chromium.launch(args=["--no-sandbox"])

        errors: list[str] = []

        # ---------------- desktop ----------------
        ctx = browser.new_context(
            ignore_https_errors=True, viewport={"width": 1440, "height": 960}
        )
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(900)

        # (1) exactly one logo on desktop
        desktop_logos = count_visible(page, 'img[alt="BRONEE"]')
        record(
            "desktop: exactly one BRONEE logo is visible",
            desktop_logos == 1,
            f"found {desktop_logos} visible logos",
        )
        # (2) subtext
        record(
            "login: subtext is 'Use your registered email address and password.'",
            page.locator("text=Use your registered email address and password.").count() > 0,
        )
        record(
            "login: the old 'official BRONEE email' wording is gone",
            page.locator("text=Use your official BRONEE email address and password.").count() == 0,
        )
        # (3) field label — the label is a span whose text carries a required marker
        labels = [
            text.replace('*', '').strip()
            for text in page.locator('span.label').all_inner_texts()
        ]
        record("login: the email field is labelled 'Email'", "Email" in labels, str(labels))
        record("login: 'Official Email' is no longer a label", "Official Email" not in labels, str(labels))
        # (4) headline / subtext
        record("login: the new headline is present", page.locator(f"text={LOGIN_HEADLINE}").count() > 0)
        record("login: the new subtext is present", page.locator(f"text={LOGIN_SUBTEXT}").count() > 0)
        record(
            "login: the old headline is gone",
            page.locator("text=One system for attendance, roster, leave, payroll").count() == 0,
        )
        page.screenshot(path=f"{OUT}/copy-01-login-desktop.png", full_page=True)

        # ---------------- mobile ----------------
        mctx = browser.new_context(
            ignore_https_errors=True, viewport={"width": 390, "height": 844}, is_mobile=True
        )
        mobile = mctx.new_page()
        mobile.on("pageerror", lambda e: errors.append(str(e)))
        mobile.goto(f"{BASE}/login", wait_until="networkidle")
        mobile.wait_for_timeout(900)
        mobile_logos = count_visible(mobile, 'img[alt="BRONEE"]')
        record(
            "mobile: exactly one BRONEE logo is visible",
            mobile_logos == 1,
            f"found {mobile_logos} visible logos",
        )
        record(
            "mobile: the headline is still shown",
            mobile.locator(f"text={LOGIN_HEADLINE}").count() > 0,
        )
        mobile.screenshot(path=f"{OUT}/copy-02-login-mobile.png", full_page=True)
        mctx.close()

        # ---------------- signup page ----------------
        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.wait_for_timeout(900)
        record("signup: the new headline is present", page.locator(f"text={SIGNUP_HEADLINE}").count() > 0)
        record("signup: the new subtext is present", page.locator(f"text={SIGNUP_SUBTEXT}").count() > 0)
        record(
            "signup: the step indicator starts at 01",
            page.locator('text=01').count() > 0,
            "no 01 step marker",
        )
        record(
            "signup: the mobile field asks for a 0-prefixed number",
            page.locator('input[placeholder="01XXXXXXXXX"]').count() > 0,
        )
        page.screenshot(path=f"{OUT}/copy-03-signup.png", full_page=True)

        # ---------------- a real registration ----------------
        # The mobile number is only taken when it begins with 01 and is eleven
        # digits long; the international form is refused outright.
        page.locator('input[placeholder="e.g. Md Ismail Hossain"]').fill("Tanvir Hossain")
        mobile_input = page.locator('input[placeholder="01XXXXXXXXX"]')
        mobile_input.fill("+8801711223344")
        page.wait_for_timeout(300)
        record(
            "signup: a number that does not begin with 01 is refused",
            mobile_input.input_value() == "",
            f"field shows {mobile_input.input_value()!r}",
        )
        mobile_input.fill("01711223344")
        page.wait_for_timeout(300)
        record(
            "signup: an 01 number of eleven digits is taken",
            mobile_input.input_value() == "01711223344",
            f"field shows {mobile_input.input_value()!r}",
        )
        page.locator('input[placeholder="e.g. BRN-017"]').fill("BRN-101")
        page.locator('input[placeholder="e.g. Customer Relationship Officer"]').fill("Support Executive")
        page.locator('input[type="email"]').fill("tanvir.test@bronee.com")
        page.locator("select").first.select_option(label="Digital Marketing")
        page.locator('input[type="date"]').fill("2026-11-16")
        page.click('button:has-text("Continue")')
        page.wait_for_timeout(1600)

        code_input = page.locator('input[inputmode="numeric"]')
        if code_input.count():
            code_input.fill(page.locator(".font-mono.font-semibold").first.inner_text().strip())
            page.click('button:has-text("Verify code")')
            page.wait_for_timeout(1600)
        record(
            "signup: the verification step is reached",
            page.locator('input[type="password"]').count() > 0,
        )
        if page.locator('input[type="password"]').count():
            passwords = page.locator('input[type="password"]')
            passwords.nth(0).fill("Bronee@2026")
            passwords.nth(1).fill("Bronee@2026")
            page.click('button:has-text("Submit registration")')
            page.wait_for_timeout(2000)
        record(
            "signup: the registration is submitted",
            page.locator("text=Registration submitted").count() > 0,
        )
        page.screenshot(path=f"{OUT}/copy-04-signup-done.png", full_page=True)

        # ---------------- the row reached the sheet ----------------
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(700)
        page.fill('input[type="email"]', "hr@bronneltd.com")
        page.fill('input[type="password"]', "Bronee@2026")
        page.click('button:has-text("Login")')
        page.wait_for_timeout(2200)
        page.goto(f"{BASE}/hr/sheets", wait_until="networkidle")
        page.wait_for_timeout(1800)

        body = page.inner_text("body")
        record(
            "sheets: the registration is listed in the Employee Signups sheet",
            "Tanvir Hossain" in body,
        )
        record(
            "sheets: the serial starts with 0",
            page.locator("text=001").count() > 0,
        )
        record(
            "sheets: the mobile number starts with 0",
            page.locator("text=01711223344").count() > 0,
        )
        page.screenshot(path=f"{OUT}/copy-05-sheets-signups.png", full_page=True)

        ctx.close()
        browser.close()

    print("=" * 78)
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} copy-and-signup checks passed")
    if errors:
        print("\n--- errors ---")
        for e in dict.fromkeys(errors):
            print(" ", e[:200])
    else:
        print("no console or page errors")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
