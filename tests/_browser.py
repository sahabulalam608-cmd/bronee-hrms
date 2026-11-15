"""Shared Chromium launcher for the BRONEE HRMS browser tests.

Playwright's bundled headless shell is not always present, so fall back to the
full Chromium build that ships with the Playwright cache.
"""

import os
import shutil
from pathlib import Path


def find_chromium() -> str | None:
    """Return a usable Chromium binary, or None to use Playwright's default."""
    explicit = os.environ.get("CHROME_PATH", "").strip()
    if explicit and Path(explicit).exists():
        return explicit

    on_path = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    if on_path:
        return on_path

    roots = [
        Path.home() / ".cache" / "ms-playwright",
        Path("/root/.cache/ms-playwright"),
        Path("/workspace/.home/.cache/ms-playwright"),
    ]
    for root in roots:
        if not root.is_dir():
            continue
        # Newest build first — prefer a full browser over the headless shell.
        for build in sorted(root.glob("chromium-*"), reverse=True):
            for candidate in (
                build / "chrome-linux" / "chrome",
                build / "chrome-linux64" / "chrome",
                build / "chrome-linux" / "headless_shell",
            ):
                if candidate.exists():
                    return str(candidate)
    return None
