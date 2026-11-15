"""Visual check for this round: badges, serial numbering, contrast."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright

from _browser import find_chromium

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
SHOTS = Path("/workspace/shots")
SHOTS.mkdir(exist_ok=True)

failures: list[str] = []
checks = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if condition:
        print(f"  ok   {label}")
    else:
        failures.append(f"{label} — {detail}")
        print(f"  FAIL {label} — {detail}")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=find_chromium(), args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 950})
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---------------- login badges ----------------
    page.goto(f"{BASE}/login", wait_until="networkidle")
    body = page.inner_text("body").lower()
    for badge in ("smart workspace", "efficiency", "growth"):
        check(f"login badge '{badge}'", badge in body, "not found on the login page")
    page.screenshot(path=str(SHOTS / "login-badges.png"), full_page=True)

    # ---------------- signup badges ----------------
    page.goto(f"{BASE}/signup", wait_until="networkidle")
    body = page.inner_text("body").lower()
    for badge in ("connect", "collaborate", "deliver"):
        check(f"signup badge '{badge}'", badge in body, "not found on the signup page")
    page.screenshot(path=str(SHOTS / "signup-badges.png"), full_page=True)

    # ---------------- strict mobile entry ----------------
    mobile = page.locator('input[name="mobile"]')
    mobile.fill("01711000016")
    check("valid mobile accepted", mobile.input_value() == "01711000016", mobile.input_value())

    mobile.fill("")
    mobile.type("01711000016", delay=30)
    check("typed mobile kept", mobile.input_value() == "01711000016", mobile.input_value())

    mobile.fill("")
    page.keyboard.type("9", delay=30)
    check("number not starting with 0 rejected", mobile.input_value() == "", mobile.input_value())

    mobile.fill("")
    mobile.type("05", delay=30)
    check("second digit other than 1 rejected", mobile.input_value() == "0", mobile.input_value())

    mobile.fill("")
    mobile.type("0171100001699", delay=20)
    check("more than 11 digits cut off", mobile.input_value() == "01711000016", mobile.input_value())

    # ---------------- English only ----------------
    name = page.locator('input[name="fullName"]')
    name.fill("Karim")
    name.type("カナ", delay=30)
    value = name.input_value()
    check("non-latin rejected in the name field", "カ" not in value and "ナ" not in value, value)
    check("latin kept in the name field", "Karim" in value, value)

    # ---------------- stepper ----------------
    stepper = page.locator('ol[aria-label="Registration progress"]')
    check("stepper present", stepper.count() == 1, f"count={stepper.count()}")
    steps = stepper.locator("li")
    check("four steps", steps.count() == 4, f"count={steps.count()}")
    stepper.screenshot(path=str(SHOTS / "signup-stepper.png"))

    page.screenshot(path=str(SHOTS / "signup-mobile.png"), full_page=True)

    # ---------------- HR portal: serial numbering ----------------
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[name="email"]', "hr@bronneltd.com")
    page.fill('input[name="password"]', "Bronee@2026")
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "/login" not in url, timeout=15000)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(SHOTS / "hr-dashboard.png"), full_page=True)

    page.goto(f"{BASE}/hr/employees", wait_until="networkidle")
    page.wait_for_timeout(800)
    headers = page.locator("table thead th")
    header_texts = [headers.nth(i).inner_text().strip() for i in range(headers.count())]
    check("S/N column present", any("S/N" in h for h in header_texts), str(header_texts[:6]))
    first_row = page.locator("table tbody tr").first.inner_text()
    check("row numbered 1.", "1." in first_row, first_row[:60])
    page.screenshot(path=str(SHOTS / "hr-employees-sn.png"), full_page=True)

    # the toggle turns the numbering off
    toggle = page.get_by_role("switch", name="S/N")
    check("numbering toggle present", toggle.count() >= 1, f"count={toggle.count()}")
    toggle.first.click()
    page.wait_for_timeout(400)
    header_texts = [headers.nth(i).inner_text().strip() for i in range(headers.count())]
    check("S/N column hidden after the toggle", not any("S/N" in h for h in header_texts), str(header_texts[:6]))
    page.screenshot(path=str(SHOTS / "hr-employees-no-sn.png"), full_page=True)
    toggle.first.click()
    page.wait_for_timeout(300)

    # ---------------- a list that is not a table ----------------
    page.goto(f"{BASE}/hr/tasks", wait_until="networkidle")
    page.wait_for_timeout(900)
    items = page.locator("ul.serial-list > li")
    check("serial list found", items.count() > 0, f"count={items.count()}")
    if items.count():
        markers = page.evaluate(
            """() => Array.from(document.querySelectorAll('ul.serial-list > li')).slice(0, 3)
                 .map((li) => getComputedStyle(li, '::before').content)"""
        )
        check("list items carry a serial number", all('1.' in m or '2.' in m or '3.' in m for m in markers), str(markers))
    page.locator("ul.serial-list").first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    page.screenshot(path=str(SHOTS / "hr-tasks-list.png"), full_page=True)

    print("\nconsole errors:", errors[:5] if errors else "none")
    browser.close()

print(f"\n{checks - len(failures)}/{checks} checks passed")
if failures:
    print("FAILURES:")
    for item in failures:
        print(" -", item)
    sys.exit(1)
