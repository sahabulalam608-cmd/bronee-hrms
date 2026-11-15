"""Run every BRONEE HRMS browser test against a running preview server.

Usage:
    npm --workspace web run build
    npx vite preview --port 4184 --host 127.0.0.1 &
    BRONEE_BASE_URL=http://127.0.0.1:4184 python3 tests/run_all.py

Each script boots its own base URL from BRONEE_BASE_URL, so they can all share
one server. The scripts are independent and can also be run on their own.
"""

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = ["test_routes.py", "test_flows.py", "test_attendance_edges.py", "test_signup.py", "test_round8.py", "test_round9.py"]


def main() -> int:
    base = os.environ.get("BRONEE_BASE_URL")
    if not base:
        print("Set BRONEE_BASE_URL to the running preview server, e.g. http://127.0.0.1:4184")
        return 2

    failures = []
    for script in SCRIPTS:
        print(f"\n=== {script} ===", flush=True)
        env = {**os.environ, "BRONEE_BASE_URL": base}
        result = subprocess.run([sys.executable, str(HERE / script)], env=env, cwd=HERE)
        if result.returncode != 0:
            failures.append(script)

    print("\n" + "=" * 60)
    if failures:
        print("FAILED:", ", ".join(failures))
        return 1
    print(f"All {len(SCRIPTS)} test scripts passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
