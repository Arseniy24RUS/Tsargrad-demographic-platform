#!/usr/bin/env python3
"""Validate JSON files under docs/data and selected root docs."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = []
for base in [ROOT / "docs" / "data", ROOT / "docs"]:
    if base.exists():
        TARGETS.extend(sorted(base.rglob("*.json")))

bad = []
for path in TARGETS:
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        bad.append((path, exc))

if bad:
    print("FAIL: JSON не прошли проверку")
    for path, exc in bad:
        print(f" - {path.relative_to(ROOT)}: {exc}")
    sys.exit(1)
print(f"OK: JSON-файлы корректны ({len(TARGETS)})")
