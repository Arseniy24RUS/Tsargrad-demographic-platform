#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
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

    for path in RUNTIME_FILES + ["docs/settlement.html"]:
        text = read(path)
        if "2100" in text:
            fail(f"runtime/UI file contains 2100: {path}")
        if "дезурбанизация" in text.lower() or "дезурб." in text.lower():
            fail(f"visible/runtime wording still contains de-urbanization term: {path}")

    data = json.loads(read("docs/data/settlement_article_scenarios_russia.json"))
    if data.get("metadata", {}).get("dashboard_horizon_year") != 2050:
        fail("dashboard horizon is not 2050")
    if data.get("metadata", {}).get("source_horizon_year"):
        fail("source horizon leaks into runtime metadata")
    if sorted(data.get("scenarios", {})) != sorted(SCENARIOS):
        fail("unexpected scenario keys")

    for key in SCENARIOS:
        rows = data["scenarios"][key]
        years = [int(row["year"]) for row in rows]
        if min(years) < 2024 or max(years) > 2050:
            fail(f"scenario {key} has years outside 2024-2050")
        first = scenario_row(rows, 2024)
        last = scenario_row(rows, 2050)
        if float(last["population_total"]) >= float(first["population_total"]):
            fail(f"scenario {key} does not decline by 2050")

    urban_2050 = float(scenario_row(data["scenarios"]["urbanization"], 2050)["population_total"])
    izhs_2050 = float(scenario_row(data["scenarios"]["deurbanization"], 2050)["population_total"])
    if izhs_2050 <= urban_2050:
        fail("IЖS scenario must be above urbanization scenario by 2050")

    with (ROOT / "docs/data/settlement_article_scenarios_russia.csv").open("r", encoding="utf-8-sig", newline="") as f:
        csv_rows = list(csv.DictReader(f))
    if not csv_rows:
        fail("CSV has no rows")
    years = [int(float(row["year"])) for row in csv_rows]
    if max(years) > 2050:
        fail("CSV contains years after 2050")

    print("OK: settlement article scenarios are local, 2050-limited and connected")


if __name__ == "__main__":
    main()
