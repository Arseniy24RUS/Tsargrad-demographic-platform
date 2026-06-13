#!/usr/bin/env python3
"""Download and localize author forecast files for runtime use.

The published site must not load data from GitHub at runtime. This script is a
development-time ETL step: it downloads the original author forecast files into
docs/data/author_forecast_source/ and builds compact JSON files limited to 2050.
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
SOURCE_DIR = DATA / "author_forecast_source"
BASE_URL = "https://raw.githubusercontent.com/Arseniy24RUS/Population-Forecast-Dashboard-of-Russia-2100/main/"
SOURCE_FILES = [
    "TFR_Russia_subjects_ML_GP_UCM_tidy.csv",
    "POP_wide_male_withMIG.xlsx",
    "POP_wide_female_withMIG.xlsx",
    "POP_wide_male_noMIG.xlsx",
    "POP_wide_female_noMIG.xlsx",
]
RUSSIA_ID = "terr_rf_bez_novyh_subektov"


def normalize_name(value: object) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = re.sub(r"[«»\"'`]", "", text)
    text = re.sub(r"\bг\.?\s+", "", text)
    text = re.sub(r"[().,]", " ", text)
    text = text.replace("-", " ")
    text = re.sub(r"\s+", " ", text).strip()
    replacements = {
        "город москва столица российской федерации город федерального значения": "москва",
        "город санкт петербург город федерального значения": "санкт петербург",
        "город федерального значения севастополь": "севастополь",
        "российская федерация": "россия",
        "рф": "россия",
    }
    return replacements.get(text, text)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def download_sources() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    for name in SOURCE_FILES:
        target = SOURCE_DIR / name
        with urllib.request.urlopen(BASE_URL + name, timeout=120) as response:
            target.write_bytes(response.read())


def territory_variants(territory: dict) -> list[str]:
    raw = [
        territory.get("name"),
        territory.get("short_name"),
    ]
    tid = territory.get("id")
    if tid == RUSSIA_ID:
        raw += ["Россия", "Российская Федерация"]
    if tid == "terr_moskva":
        raw += ["Город Москва столица Российской Федерации город федерального значения"]
    if tid == "terr_sankt_peterburg":
        raw += ["Город Санкт-Петербург город федерального значения"]
    if tid == "terr_sevastopol":
        raw += ["Город федерального значения Севастополь"]
    out: list[str] = []
    for value in raw:
        norm = normalize_name(value)
        if norm and norm not in out:
            out.append(norm)
    return out


def make_matcher(territories: list[dict]) -> dict[str, dict]:
    matcher: dict[str, dict] = {}
    for territory in territories:
        for name in territory_variants(territory):
            matcher.setdefault(name, territory)
    return matcher


def load_tfr_rows(territories: list[dict]) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    matcher = make_matcher(territories)
    by_tid: dict[str, list[dict]] = defaultdict(list)
    source_by_tid: dict[str, dict] = {}
    with (SOURCE_DIR / "TFR_Russia_subjects_ML_GP_UCM_tidy.csv").open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            year = int(float(row["Год"]))
            if year > 2050:
                continue
            source_name = row["Территория"]
            territory = matcher.get(normalize_name(source_name))
            if not territory:
                continue
            tid = territory["id"]
            def num(key: str) -> float | None:
                value = row.get(key, "")
                if value == "":
                    return None
                return round(float(str(value).replace(",", ".")), 6)
            median = num("median")
            if median is None:
                continue
            item = {
                "year": year,
                "median": median,
                "status": row.get("Статус", ""),
            }
            for key in ["q10", "q90", "q2_5", "q97_5"]:
                value = num(key)
                if value is not None:
                    item[key] = value
            by_tid[tid].append(item)
            source_by_tid.setdefault(tid, {
                "source_name": source_name,
                "normalized_source_name": normalize_name(source_name),
            })
    for rows in by_tid.values():
        rows.sort(key=lambda x: x["year"])
    return dict(by_tid), source_by_tid


def read_population_sheet(path: Path) -> dict[str, dict[int, float]]:
    sheet = pd.read_excel(path, sheet_name="by_territory")
    year_col = sheet.columns[0]
    out: dict[str, dict[int, float]] = {}
    for _, row in sheet.iterrows():
        if pd.isna(row[year_col]):
            continue
        year = int(row[year_col])
        if year > 2050:
            continue
        for col in sheet.columns[1:]:
            if pd.isna(row[col]):
                continue
            source_name = str(col)
            out.setdefault(source_name, {})[year] = float(row[col])
    return out


def combine_population(scenario: str, territories: list[dict]) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    matcher = make_matcher(territories)
    male = read_population_sheet(SOURCE_DIR / f"POP_wide_male_{scenario}.xlsx")
    female = read_population_sheet(SOURCE_DIR / f"POP_wide_female_{scenario}.xlsx")
    source_names = sorted(set(male) | set(female))
    by_tid: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    source_by_tid: dict[str, dict] = {}
    for source_name in source_names:
        territory = matcher.get(normalize_name(source_name))
        if not territory:
            continue
        tid = territory["id"]
        years = set(male.get(source_name, {})) | set(female.get(source_name, {}))
        for year in years:
            by_tid[tid][year] += male.get(source_name, {}).get(year, 0.0) + female.get(source_name, {}).get(year, 0.0)
        source_by_tid.setdefault(tid, {
            "source_name": source_name,
            "normalized_source_name": normalize_name(source_name),
        })
    series = {
        tid: [{"year": year, "population_total": int(round(value))} for year, value in sorted(years.items())]
        for tid, years in by_tid.items()
    }
    return series, source_by_tid


def add_derived_russia_rows(
    territories: list[dict],
    tfr_series: dict[str, list[dict]],
    pop_series: dict[str, list[dict]],
    tfr_sources: dict[str, dict],
    pop_sources: dict[str, dict],
) -> None:
    fd_ids = [t["id"] for t in territories if t.get("type") == "federal_district"]
    if RUSSIA_ID not in tfr_series:
        tfr_by_fd = {tid: {r["year"]: r for r in tfr_series.get(tid, [])} for tid in fd_ids}
        pop_by_fd = {tid: {r["year"]: r["population_total"] for r in pop_series.get(tid, [])} for tid in fd_ids}
        years = sorted(set.intersection(*[set(rows) for rows in tfr_by_fd.values() if rows]))
        derived = []
        for year in years:
            weights = []
            for tid in fd_ids:
                row = tfr_by_fd.get(tid, {}).get(year)
                weight = pop_by_fd.get(tid, {}).get(year)
                if row and weight:
                    weights.append((row, weight))
            if len(weights) < len(fd_ids):
                continue
            total_weight = sum(weight for _, weight in weights)
            if total_weight <= 0:
                continue
            item = {"year": year, "status": "производный федеральный ряд из авторских рядов ФО"}
            for key in ["median", "q10", "q90", "q2_5", "q97_5"]:
                if any(row.get(key) is None for row, _ in weights):
                    continue
                value = sum(row[key] * weight for row, weight in weights) / total_weight
                item[key] = round(value, 6)
            derived.append(item)
        if derived:
            tfr_series[RUSSIA_ID] = derived
            tfr_sources[RUSSIA_ID] = {
                "source_name": "Россия: взвешено по федеральным округам из локального авторского прогноза",
                "normalized_source_name": "россия федеральные округа",
            }

    if RUSSIA_ID not in pop_series:
        pop_by_fd = {tid: {r["year"]: r["population_total"] for r in pop_series.get(tid, [])} for tid in fd_ids}
        years = sorted(set.union(*[set(rows) for rows in pop_by_fd.values() if rows]))
        derived_pop = []
        for year in years:
            values = [pop_by_fd.get(tid, {}).get(year) for tid in fd_ids]
            if any(v is None for v in values):
                continue
            derived_pop.append({"year": year, "population_total": int(sum(values))})
        if derived_pop:
            pop_series[RUSSIA_ID] = derived_pop
            pop_sources[RUSSIA_ID] = {
                "source_name": "Россия: сумма федеральных округов из локального авторского прогноза",
                "normalized_source_name": "россия федеральные округа",
            }


def write_audit(
    territories: list[dict],
    tfr_sources: dict[str, dict],
    pop_sources: dict[str, dict],
) -> None:
    rows = []
    for t in territories:
        tid = t["id"]
        tfr = tfr_sources.get(tid)
        pop = pop_sources.get(tid)
        status = "matched" if tfr and pop else "partial" if tfr or pop else "unmatched"
        rows.append({
            "territory_id": tid,
            "territory_name": t.get("name", ""),
            "short_name": t.get("short_name", ""),
            "type": t.get("type", ""),
            "federal_district_id": t.get("federal_district_id") or "",
            "federal_district": t.get("federal_district") or "",
            "tfr_source_name": tfr.get("source_name", "") if tfr else "",
            "population_source_name": pop.get("source_name", "") if pop else "",
            "join_status": status,
        })
    write_json(DATA / "forecast_join_audit.json", {
        "metadata": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "runtime_external_fetch": False,
            "horizon_year": 2050,
            "local_source_dir": "data/author_forecast_source",
        },
        "records": rows,
    })
    with (DATA / "forecast_join_audit.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    download_sources()
    tfr_data = read_json(DATA / "tfr_data.json")
    territories = tfr_data["territories"]
    generated_at = datetime.now(timezone.utc).isoformat()

    tfr_series, tfr_sources = load_tfr_rows(territories)
    pop_no_mig, pop_no_mig_sources = combine_population("noMIG", territories)
    pop_with_mig, pop_with_mig_sources = combine_population("withMIG", territories)
    add_derived_russia_rows(territories, tfr_series, pop_no_mig, tfr_sources, pop_no_mig_sources)
    add_derived_russia_rows(territories, tfr_series, pop_with_mig, tfr_sources, pop_with_mig_sources)
    pop_sources = {**pop_no_mig_sources, **pop_with_mig_sources}

    write_json(DATA / "author_tfr_forecast_2050.json", {
        "metadata": {
            "generated_at_utc": generated_at,
            "source_repository": "локальная копия авторского прогноза",
            "local_source_file": "data/author_forecast_source/TFR_Russia_subjects_ML_GP_UCM_tidy.csv",
            "runtime_external_fetch": False,
            "horizon_year": 2050,
            "value_basis": "author forecast median and quantiles as downloaded",
        },
        "territories": [
            {
                "territory_id": t["id"],
                "name": t.get("name"),
                "short_name": t.get("short_name"),
                "type": t.get("type"),
                "source_name": tfr_sources.get(t["id"], {}).get("source_name"),
                "join_status": "matched" if t["id"] in tfr_series else "unmatched",
            }
            for t in territories
        ],
        "series": tfr_series,
    })
    write_json(DATA / "author_population_forecast_2050.json", {
        "metadata": {
            "generated_at_utc": generated_at,
            "source_repository": "локальная копия авторского прогноза",
            "local_source_files": [
                "data/author_forecast_source/POP_wide_male_noMIG.xlsx",
                "data/author_forecast_source/POP_wide_female_noMIG.xlsx",
                "data/author_forecast_source/POP_wide_male_withMIG.xlsx",
                "data/author_forecast_source/POP_wide_female_withMIG.xlsx",
            ],
            "runtime_external_fetch": False,
            "horizon_year": 2050,
            "value_basis": "male and female by_territory totals summed without interpolation",
        },
        "scenarios": {
            "noMIG": pop_no_mig,
            "withMIG": pop_with_mig,
        },
    })
    write_json(DATA / "territory_levels.json", {
        "metadata": {
            "generated_at_utc": generated_at,
            "runtime_external_fetch": False,
            "source_file": "data/tfr_data.json",
        },
        "territories": [
            {
                "territory_id": t["id"],
                "name": t.get("name"),
                "short_name": t.get("short_name"),
                "level": "country" if t["id"] == RUSSIA_ID else "federal_district" if t.get("type") == "federal_district" else "federal_subject",
                "type": t.get("type"),
                "federal_district_id": t.get("federal_district_id"),
                "federal_district": t.get("federal_district"),
            }
            for t in territories
        ],
    })
    write_audit(territories, tfr_sources, pop_sources)
    print(f"OK: localized {len(tfr_series)} TFR territories and {len(pop_no_mig)} population territories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
