#!/usr/bin/env python3
"""Run all Python checks and JS syntax check."""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
bash_exe = Path(r"C:\Program Files\Git\bin\bash.exe")
bash_cmd = str(bash_exe) if bash_exe.exists() else "bash"
commands = [
    [sys.executable, "scripts/check_matcapital_module.py"],
    [sys.executable, "scripts/check_family_module.py"],
    [sys.executable, "scripts/check_abortions_module.py"],
    [sys.executable, "scripts/check_infrastructure_module.py"],
    [sys.executable, "scripts/check_settlement_forecast.py"],
    [sys.executable, "scripts/check_json.py"],
    [sys.executable, "scripts/check_no_external_runtime.py"],
    [sys.executable, "scripts/check_russian_ui.py"],
    [sys.executable, "scripts/check_data_locality.py"],
    [sys.executable, "scripts/check_nav_numbering.py"],
    [bash_cmd, "scripts/check_js_syntax.sh"],
]
failed = []
for cmd in commands:
    print("\n$", " ".join(cmd))
    res = subprocess.run(cmd, cwd=ROOT)
    if res.returncode != 0:
        failed.append((cmd, res.returncode))
if failed:
    print("\nFAIL: часть проверок не пройдена")
    for cmd, code in failed:
        print(f" - {' '.join(cmd)} -> {code}")
    sys.exit(1)
print("\nOK: все проверки пройдены")
