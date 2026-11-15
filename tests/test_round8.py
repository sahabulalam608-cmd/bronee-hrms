"""BRONEE HRMS — the second round of presentation and behaviour requirements.

Covers the eight items in this round:

  1. the sign-in page carries the SMART WORKSPACE · EFFICIENCY · GROWTH statements
  2. the registration page carries the CONNECT · COLLABORATE · DELIVER statements
  3. registration only takes English characters
  4. the mobile number must begin with 01 and be exactly eleven digits
  5. the registration step indicator animates as the steps advance
  6. an HR decision and its review note are written back to the Employee Signups sheet
  7. every list is numbered serially and the switch turns the numbering off
  8. the text of the whole site has a higher contrast than before
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


def sign_in(page, email: str, password: str) -> None:
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(700)
    page.fill('input[name="email"]', email)
    page.fill('input[name="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_timeout(2200)


def register(page, full_name: str, mobile: str, employee_id: str, email: str) -> bool:
    page.goto(f"{BASE}/signup", wait_until="networkidle")
    page.wait_for_timeout(800)
    page.locator('input[placeholder="e.g. Md Ismail Hossain"]').fill(full_name)
    page.locator('input[placeholder="01XXXXXXXXX"]').fill(mobile)
    page.locator('input[placeholder="e.g. BRN-017"]').fill(employee_id)
    page.locator('input[placeholder="e.g. Customer Relationship Officer"]').fill("Support Executive")
    page.locator('input[type="email"]').fill(email)
    page.locator("select").first.select_option(label="Digital Marketing")
    page.locator('input[type="date"]').fill("2026-11-16")
    page.click('button:has-text("Continue")')
    page.wait_for_timeout(1600)

    code_input = page.locator('input[inputmode="numeric"]')
    if code_input.count():
        code_input.fill(page.locator(".font-mono.font-semibold").first.inner_text().strip())
        page.click('button:has-text("Verify code")')
        page.wait_for_timeout(1600)
    if not page.locator('input[type="password"]').count():
        return False
    passwords = page.locator('input[type="password"]')
    passwords.nth(0).fill("Bronee@2026")
    passwords.nth(1).fill("Bronee@2026")
    page.click('button:has-text("Submit registration")')
    page.wait_for_timeout(2000)
    return page.locator("text=Registration submitted").count() > 0


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

        # ---------------- 1 + 2: the three statements ----------------
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(800)
        body = page.inner_text("body").lower()
        for badge in ("smart workspace", "efficiency", "growth"):
            record(f"login: the '{badge}' statement is shown", badge in body)
        record(
            "login: the old verification, payroll and access statements are gone",
            "wi-fi + gps" not in body and "approved only" not in body and "role-based" not in body,
        )
        page.screenshot(path=f"{OUT}/round8-01-login.png", full_page=True)

        page.goto(f"{BASE}/signup", wait_until="networkidle")
        page.wait_for_timeout(800)
        body = page.inner_text("body").lower()
        for badge in ("connect", "collaborate", "deliver"):
            record(f"signup: the '{badge}' statement is shown", badge in body)
        page.screenshot(path=f"{OUT}/round8-02-signup.png", full_page=True)

        # ---------------- 3: English only ----------------
        name = page.locator('input[name="fullName"]')
        name.fill("Karim")
        name.type("カナ", delay=40)
        value = name.input_value()
        record(
            "signup: characters outside the Latin script are not taken",
            all(ord(ch) < 0x024f or ch in " -,./&'" for ch in value),
            f"field shows {value!r}",
        )
        record("signup: the Latin characters are kept", "Karim" in value, f"field shows {value!r}")

        designation = page.locator('input[name="designation"]')
        designation.fill("Officer")
        designation.type("معاون", delay=40)
        record(
            "signup: the designation field is English only",
            "معاون" not in designation.input_value(),
            f"field shows {designation.input_value()!r}",
        )

        # ---------------- 4: the strict mobile number ----------------
        mobile = page.locator('input[name="mobile"]')
        mobile.fill("01711000016")
        record("signup: an 01 number of eleven digits is taken", mobile.input_value() == "01711000016", mobile.input_value())

        mobile.fill("")
        page.keyboard.type("9", delay=40)
        record("signup: a number that does not start with 0 is refused", mobile.input_value() == "", mobile.input_value())

        mobile.fill("")
        page.keyboard.type("05", delay=40)
        record("signup: a second digit other than 1 is refused", mobile.input_value() == "0", mobile.input_value())

        mobile.fill("")
        page.keyboard.type("0171100001699", delay=15)
        record(
            "signup: more than eleven digits is refused",
            mobile.input_value() == "01711000016",
            mobile.input_value(),
        )

        mobile.fill("0171100001")
        record("signup: ten digits are not a complete number", mobile.input_value() == "0171100001", mobile.input_value())

        # ---------------- 5: the step indicator ----------------
        steps = page.locator('ol[aria-label="Registration progress"] li')
        record("signup: the step indicator has four steps", steps.count() == 4, f"count={steps.count()}")
        current = page.locator('ol[aria-label="Registration progress"] [aria-current="step"]')
        record("signup: step 01 is the active one", current.count() == 1 and "01" in current.inner_text(), current.inner_text() if current.count() else "none")
        page.screenshot(path=f"{OUT}/round8-03-stepper-01.png")

        # fill the form and move to the next step
        page.locator('input[name="fullName"]').fill("Karim Hossain")
        mobile.fill("01711000016")
        page.locator('input[name="employeeId"]').fill("BRN-777")
        page.locator('input[name="designation"]').fill("Support Executive")
        page.locator('input[type="email"]').fill("karim.round8@bronee.com")
        page.locator("select").first.select_option(label="Digital Marketing")
        page.locator('input[type="date"]').fill("2026-11-16")
        page.click('button:has-text("Continue")')
        page.wait_for_timeout(1200)
        current = page.locator('ol[aria-label="Registration progress"] [aria-current="step"]')
        record(
            "signup: the active step moves to 02",
            current.count() == 1 and "02" in current.inner_text(),
            current.inner_text() if current.count() else "none",
        )
        page.screenshot(path=f"{OUT}/round8-04-stepper-02.png")

        # finish the registration so the application reaches the HR queue
        code_input = page.locator('input[inputmode="numeric"]')
        if code_input.count():
            code_input.fill(page.locator(".font-mono.font-semibold").first.inner_text().strip())
            page.click('button:has-text("Verify code")')
            page.wait_for_timeout(1400)
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

        # ---------------- 6: the decision reaches the sheet ----------------
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.wait_for_timeout(700)
        page.fill('input[name="email"]', "hr@bronneltd.com")
        page.fill('input[name="password"]', "Bronee@2026")
        page.click('button[type="submit"]')
        page.wait_for_timeout(2200)

        page.goto(f"{BASE}/hr/approvals", wait_until="networkidle")
        page.wait_for_timeout(1600)
        row = page.locator("table tbody tr", has_text="Karim Hossain")
        record("approvals: the registration is queued", row.count() > 0, "no row for the new application")
        if row.count():
            row.first.locator('button:has-text("Review")').click()
            page.wait_for_timeout(800)
            note = page.locator("textarea").first
            note.fill("Documents verified. Approved for the evening shift.")
            page.screenshot(path=f"{OUT}/round8-05-review-modal.png")
            review_dialog = page.get_by_role("dialog").filter(has_text="Review signup application")
            review_dialog.locator('button:has-text("Approve")').click()
            page.wait_for_timeout(800)
            dialog = page.get_by_role("dialog").filter(has_text="Approve this signup?")
            dialog.locator('button:has-text("Approve")').click()
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{OUT}/round8-06-approved.png", full_page=True)

        page.goto(f"{BASE}/hr/sheets", wait_until="networkidle")
        page.wait_for_timeout(1800)
        sheet_body = page.inner_text("body")
        record(
            "sheets: the decision is written back to the Employee Signups sheet",
            "Approved" in sheet_body and "Karim Hossain" in sheet_body,
            "the sheet does not show the approved application",
        )
        record(
            "sheets: the review note is kept on the same row",
            "Documents verified" in sheet_body,
            "the review note is missing",
        )
        record(
            "sheets: the decision is attributed to the reviewer",
            "Sabrina Rahman" in sheet_body,
            "the reviewer is missing",
        )
        page.screenshot(path=f"{OUT}/round8-07-sheets.png", full_page=True)

        # ---------------- 7: serial numbering ----------------
        page.goto(f"{BASE}/hr/employees", wait_until="networkidle")
        page.wait_for_timeout(1200)
        headers = [page.locator("table thead th").nth(i).inner_text().strip() for i in range(page.locator("table thead th").count())]
        record("lists: the S/N column is present", any("S/N" in h for h in headers), str(headers[:5]))
        first_row = page.locator("table tbody tr").first.inner_text()
        record("lists: the first row is numbered 1.", "1." in first_row, first_row[:40])

        toggle = page.locator('button[role="switch"]')
        record("lists: the numbering switch is there", toggle.count() >= 1)
        record(
            "lists: the numbering switch shows an icon only",
            toggle.count() > 0 and toggle.first.inner_text().strip() == "",
            toggle.first.inner_text().strip()[:40] if toggle.count() else "",
        )
        toggle.first.click()
        page.wait_for_timeout(500)
        headers = [page.locator("table thead th").nth(i).inner_text().strip() for i in range(page.locator("table thead th").count())]
        record("lists: the switch turns the numbering off", not any("S/N" in h for h in headers), str(headers[:5]))
        page.screenshot(path=f"{OUT}/round8-08-numbering-off.png", full_page=True)
        toggle.first.click()
        page.wait_for_timeout(400)

        page.goto(f"{BASE}/hr/tasks", wait_until="networkidle")
        page.wait_for_timeout(1200)
        markers = page.evaluate(
            """() => Array.from(document.querySelectorAll('ul.serial-list > li')).slice(0, 3)
                 .map((li) => getComputedStyle(li, '::before').content)"""
        )
        record(
            "lists: the lists outside the tables are numbered as well",
            bool(markers) and all("counter(" in m for m in markers),
            str(markers),
        )
        page.screenshot(path=f"{OUT}/round8-09-list.png", full_page=True)

        # ---------------- 8: contrast ----------------
        page.goto(f"{BASE}/hr/employees", wait_until="networkidle")
        page.wait_for_timeout(1000)
        colours = page.evaluate(
            """() => {
                const pick = (sel) => {
                    const el = document.querySelector(sel);
                    return el ? getComputedStyle(el).color : null;
                };
                return {
                    faint: pick('.text-ink-faint'),
                    muted: pick('.text-ink-muted'),
                    soft: pick('.text-ink-soft'),
                };
            }"""
        )
        record("contrast: the faint text is a real colour", colours["faint"] is not None, str(colours))

        def luminance(rgb: str) -> float:
            parts = [float(x) / 255 for x in rgb.replace("rgba(", "").replace("rgb(", "").rstrip(")").split(",")[:3]]
            adjusted = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in parts]
            return 0.2126 * adjusted[0] + 0.7152 * adjusted[1] + 0.0722 * adjusted[2]

        def ratio(rgb: str, other: str = "rgb(255, 255, 255)") -> float:
            a, b = luminance(rgb), luminance(other)
            hi, lo = max(a, b), min(a, b)
            return (hi + 0.05) / (lo + 0.05)

        for key, minimum in (("faint", 4.5), ("muted", 7.0), ("soft", 12.0)):
            value = colours[key]
            if not value:
                continue
            measured = ratio(value)
            record(
                f"contrast: the {key} text reaches {minimum}:1",
                measured >= minimum,
                f"{value} measures {measured:.2f}:1",
            )

        ctx.close()
        browser.close()

    print("=" * 78)
    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)}/{len(results)} round-eight checks passed")
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
