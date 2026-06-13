#!/usr/bin/env python3
"""Validate settlement urban/rural TFR forecast contract."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
FORECAST = DATA / "settlement_tfr_forecast_2050.json"
SETTLEMENT = DATA / "settlement_data.json"
YEARS = set(range(2026, 2051))
TOL = 0.001


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and math.isfinite(value)


if not FORECAST.exists():
    fail(f"нет файла {FORECAST.relative_to(ROOT)}")

try:
    obj = json.loads(FORECAST.read_text(encoding="utf-8"))
    settlement = json.loads(SETTLEMENT.read_text(encoding="utf-8"))
except Exception as exc:
    fail(f"JSON не читается: {exc}")

meta = obj.get("metadata") or {}
if meta.get("runtime_external_fetch") is not False:
    fail("metadata.runtime_external_fetch должен быть false")
if meta.get("horizon_year") != 2050:
    fail("metadata.horizon_year должен быть 2050")
if meta.get("method") != "local_gp_ucm_ensemble":
    fail("metadata.method должен быть local_gp_ucm_ensemble")
if meta.get("gap_method") != "positive_rural_urban_premium_gp_ucm":
    fail("metadata.gap_method должен быть positive_rural_urban_premium_gp_ucm")
if not finite_number(meta.get("min_forecast_gap")) or meta["min_forecast_gap"] <= 0:
    fail("metadata.min_forecast_gap должен быть положительным")
if meta.get("negative_gap_count") != 0:
    fail("metadata.negative_gap_count должен быть 0")

expected_territories = set(settlement.get("forecast", {}))
series = obj.get("series") or {}
missing = sorted(expected_territories - set(series))
if missing:
    fail(f"нет прогноза для территорий: {missing[:10]}")

required_fields = [
    "year",
    "total_tfr", "total_q10", "total_q90",
    "urban_tfr", "urban_q10", "urban_q90",
    "rural_tfr", "rural_q10", "rural_q90",
    "baseline_rural_share", "rural_urban_gap", "calibration_error",
]

max_error = 0.0
min_gap = float("inf")
negative_share_effect_rows = 0
for tid in sorted(expected_territories):
    rows = series.get(tid) or []
    row_years = {row.get("year") for row in rows}
    if row_years != YEARS:
        fail(f"{tid}: годы должны быть 2026-2050, получено {sorted(row_years)[:3]}...{sorted(row_years)[-3:] if row_years else []}")
    for row in rows:
        bad = [field for field in required_fields if not finite_number(row.get(field))]
        if bad:
            fail(f"{tid} {row.get('year')}: нечисловые поля {bad}")
        if row["year"] > 2050:
            fail(f"{tid}: найден год после 2050")
        for lo, mid, hi in [
            ("total_q10", "total_tfr", "total_q90"),
            ("urban_q10", "urban_tfr", "urban_q90"),
            ("rural_q10", "rural_tfr", "rural_q90"),
        ]:
            if not (0.3 <= row[lo] <= row[mid] <= row[hi] <= 4.8):
                fail(f"{tid} {row['year']}: нарушен интервал {lo}/{mid}/{hi}")
        share = row["baseline_rural_share"]
        if not (0 <= share <= 0.95):
            fail(f"{tid} {row['year']}: некорректная базовая доля")
        gap = row["rural_tfr"] - row["urban_tfr"]
        min_gap = min(min_gap, gap)
        if gap <= 0:
            fail(f"{tid} {row['year']}: сельский/пригородный СКР не выше городского")
        if abs(gap - row["rural_urban_gap"]) > TOL:
            fail(f"{tid} {row['year']}: rural_urban_gap не совпадает с разностью рядов")
        positive_shift_share = min(0.95, share + 0.12 * (row["year"] - 2025) / 25)
        scenario_tfr = row["total_tfr"] + (positive_shift_share - share) * row["rural_urban_gap"]
        if scenario_tfr + TOL < row["total_tfr"]:
            negative_share_effect_rows += 1
        weighted = (1 - share) * row["urban_tfr"] + share * row["rural_tfr"]
        error = abs(weighted - row["total_tfr"])
        max_error = max(max_error, error)
        if error > TOL:
            fail(f"{tid} {row['year']}: калибровка {error:.6f} > {TOL}")
if negative_share_effect_rows:
    fail("положительный сдвиг доли среды снижает сценарный СКР")

print(f"OK: прогноз СКР расселения готов, min gap {min_gap:.6f}, max calibration error {max_error:.6f}")
