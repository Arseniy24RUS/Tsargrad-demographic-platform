#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path.cwd()
RUNTIME_FILES = [
    "docs/data/settlement_article_scenarios_russia.json",
    "docs/data/settlement_article_scenarios_russia.csv",
    "docs/assets/js/settlement_article_scenarios.js",
    "docs/assets/css/settlement_article_scenarios.css",
]
SCENARIOS = ["urbanization", "fixation", "deurbanization"]


def fail(message: str) -> None:
    print(f"ERROR: {message}")
    sys.exit(1)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def scenario_row(rows: list[dict], year: int) -> dict:
    for row in rows:
        if int(row["year"]) == year:
            return row
    fail(f"no row for {year}")


def close(a: float, b: float, eps: float = 1e-6) -> bool:
    return math.isfinite(a) and math.isfinite(b) and abs(a - b) <= eps


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def model_row(data: dict, year: int, delta_points: float) -> dict:
    fix2050 = scenario_row(data["scenarios"]["fixation"], 2050)
    fixation_share = float(fix2050["rural_share"])
    deltas = {
        key: (float(scenario_row(data["scenarios"][key], 2050)["rural_share"]) - fixation_share) * 100
        for key in SCENARIOS
    }
    for key, anchor_delta in deltas.items():
        if close(delta_points, anchor_delta, 1e-6):
            row = scenario_row(data["scenarios"][key], year)
            return {
                "rural_share": float(row["rural_share"]),
                "population_total": float(row["population_total"]),
            }

    urban = scenario_row(data["scenarios"]["urbanization"], year)
    fix = scenario_row(data["scenarios"]["fixation"], year)
    izhs = scenario_row(data["scenarios"]["deurbanization"], year)
    if delta_points <= 0:
        t = delta_points / deltas["urbanization"]
        return {
            "rural_share": mix(float(fix["rural_share"]), float(urban["rural_share"]), t),
            "population_total": mix(float(fix["population_total"]), float(urban["population_total"]), t),
        }
    t = delta_points / deltas["deurbanization"]
    return {
        "rural_share": mix(float(fix["rural_share"]), float(izhs["rural_share"]), t),
        "population_total": mix(float(fix["population_total"]), float(izhs["population_total"]), t),
    }


def main() -> None:
    missing = [path for path in RUNTIME_FILES if not (ROOT / path).exists()]
    if missing:
        fail(f"missing files: {missing}")

    html = read("docs/settlement.html")
    for token in ["settlement_article_scenarios.css", "settlement_article_scenarios.js"]:
        if token not in html:
            fail(f"settlement.html does not include {token}")
    for token in ["settlement_population_fix.css", "settlement_population_fix.js", "populationScenarioBtn"]:
        if token in html:
            fail(f"settlement.html still contains obsolete token: {token}")

    js = read("docs/assets/js/settlement_article_scenarios.js")
    for token in ["modelArticleRow", "setCalibratedPreset", "syncArticleStateRows"]:
        if token not in js:
            fail(f"interactive article model is missing {token}")
    for token in ["USER_SLIDER_MIN = -10", "USER_SLIDER_MAX = 10", 'min="-10"', 'max="10"']:
        if token not in js and token not in html:
            fail(f"slider range token is missing: {token}")
    for token in ["disabled = true", "Ползунок отключён", "Жёсткие сценарии доли сельского населения"]:
        if token in js or token in html:
            fail(f"old fixed-scenario UI token remains: {token}")

    for path in RUNTIME_FILES + ["docs/settlement.html"]:
        text = read(path)
        if "2100" in text:
            fail(f"runtime/UI file contains 2100: {path}")
        lowered = text.lower()
        if "дезурбанизация" in lowered or "дезурб." in lowered:
            fail(f"visible/runtime wording still contains de-urbanization term: {path}")

    data = json.loads(read("docs/data/settlement_article_scenarios_russia.json"))
    if data.get("metadata", {}).get("dashboard_horizon_year") != 2050:
        fail("dashboard horizon is not 2050")
    if data.get("metadata", {}).get("source_horizon_year"):
        fail("source horizon leaks into runtime metadata")
    if sorted(data.get("scenarios", {})) != sorted(SCENARIOS):
        fail("unexpected scenario keys")

    fix2050 = scenario_row(data["scenarios"]["fixation"], 2050)
    fixation_share = float(fix2050["rural_share"])
    preset_deltas = {
        key: (float(scenario_row(data["scenarios"][key], 2050)["rural_share"]) - fixation_share) * 100
        for key in SCENARIOS
    }
    if not (preset_deltas["urbanization"] < -2.0 and close(preset_deltas["fixation"], 0.0) and preset_deltas["deurbanization"] > 1.7):
        fail(f"unexpected preset deltas: {preset_deltas}")

    for key in SCENARIOS:
        rows = data["scenarios"][key]
        years = [int(row["year"]) for row in rows]
        if min(years) < 2024 or max(years) > 2050:
            fail(f"scenario {key} has years outside 2024-2050")
        first = scenario_row(rows, 2024)
        last = scenario_row(rows, 2050)
        if float(last["population_total"]) >= float(first["population_total"]):
            fail(f"scenario {key} does not decline by 2050")

        modeled = model_row(data, 2050, preset_deltas[key])
        source = scenario_row(rows, 2050)
        if not close(modeled["rural_share"], float(source["rural_share"])) or not close(modeled["population_total"], float(source["population_total"])):
            fail(f"model does not reproduce source anchor for {key}")

    urban_2050 = float(scenario_row(data["scenarios"]["urbanization"], 2050)["population_total"])
    fix_2050 = float(scenario_row(data["scenarios"]["fixation"], 2050)["population_total"])
    izhs_2050 = float(scenario_row(data["scenarios"]["deurbanization"], 2050)["population_total"])
    if izhs_2050 <= urban_2050:
        fail("IZHS scenario must be above urbanization scenario by 2050")

    custom_delta = preset_deltas["deurbanization"] / 2
    custom = model_row(data, 2050, custom_delta)
    if not (fix_2050 < custom["population_total"] < izhs_2050):
        fail("custom positive slider value must interpolate population between fixation and IZHS")
    if not (fixation_share < custom["rural_share"] < float(scenario_row(data["scenarios"]["deurbanization"], 2050)["rural_share"])):
        fail("custom positive slider value must interpolate rural share between fixation and IZHS")

    custom_negative = model_row(data, 2050, preset_deltas["urbanization"] / 2)
    if not (urban_2050 < custom_negative["population_total"] < fix_2050):
        fail("custom negative slider value must interpolate population between urbanization and fixation")

    with (ROOT / "docs/data/settlement_article_scenarios_russia.csv").open("r", encoding="utf-8-sig", newline="") as f:
        csv_rows = list(csv.DictReader(f))
    if not csv_rows:
        fail("CSV has no rows")
    years = [int(float(row["year"])) for row in csv_rows]
    if max(years) > 2050:
        fail("CSV contains years after 2050")

    print("OK: settlement article scenario model is local, interactive and 2050-limited")


if __name__ == "__main__":
    main()
