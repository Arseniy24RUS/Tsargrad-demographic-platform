#!/usr/bin/env python3
"""Check that key local data files exist and do not exceed 2050 horizon."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
REQUIRED = [
    "author_tfr_forecast_2050.json",
    "author_population_forecast_2050.json",
    "settlement_tfr_forecast_2050.json",
    "territory_levels.json",
]

def years_from(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "year" and isinstance(v, int):
                yield v
            else:
                yield from years_from(v)
    elif isinstance(obj, list):
        for x in obj:
            yield from years_from(x)

fail = []
for name in REQUIRED:
    path = DATA / name
    if not path.exists():
        fail.append(f"нет файла {path.relative_to(ROOT)}")
        continue
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail.append(f"{path.relative_to(ROOT)} не читается как JSON: {exc}")
        continue
    bad_years = sorted({y for y in years_from(obj) if y > 2050})
    if bad_years:
        fail.append(f"{path.relative_to(ROOT)} содержит годы после 2050: {bad_years[:10]}")
    meta = obj.get("metadata") if isinstance(obj, dict) else None
    if isinstance(meta, dict) and meta.get("runtime_external_fetch") is not False:
        fail.append(f"{path.relative_to(ROOT)} metadata.runtime_external_fetch должен быть false")

if fail:
    print("FAIL: локальный слой данных не готов")
    for x in fail:
        print(" -", x)
    sys.exit(1)
print("OK: локальные прогнозные данные найдены и ограничены 2050 годом")
