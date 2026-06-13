#!/usr/bin/env python3
"""Build local urban/rural TFR forecasts for the settlement module.

Runtime must not run modelling code or call external services. This script is a
development-time ETL step: it reads local settlement history, fits a compact
Gaussian-process + structural-trend ensemble, and writes a ready-to-use JSON
limited to 2050.
"""
from __future__ import annotations

import json
import math
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import ConstantKernel, RBF, WhiteKernel
from statsmodels.tsa.statespace.structural import UnobservedComponents

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
SETTLEMENT = DATA / "settlement_data.json"
AUTHOR_TFR = DATA / "author_tfr_forecast_2050.json"
OUT = DATA / "settlement_tfr_forecast_2050.json"

START_YEAR = 2026
END_YEAR = 2050
YEARS = list(range(START_YEAR, END_YEAR + 1))
RUSSIA_ID = "terr_rf_bez_novyh_subektov"
FEDERAL_CITY_IDS = {"terr_moskva", "terr_sankt_peterburg", "terr_sevastopol"}
Z80 = 1.2815515655446004
MIN_TFR = 0.45
MAX_TFR = 4.35
MIN_GAP = 0.02
MAX_GAP = 0.95
MIN_GAP_POINTS = 8


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_points(rows: list[dict], key: str) -> list[tuple[int, float]]:
    points = []
    for row in rows:
        value = row.get(key)
        if value is None:
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number) and number > 0:
            points.append((int(row["year"]), number))
    return sorted(points)


def clip_value(value: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, float(value)))


def clip_tfr(value: float) -> float:
    return clip_value(value, MIN_TFR, MAX_TFR)


def clip_gap(value: float) -> float:
    return clip_value(value, MIN_GAP, MAX_GAP)


def forecast_log_series(
    points: list[tuple[int, float]],
    *,
    min_value: float,
    max_value: float,
    min_spread: float = 0.035,
    max_spread: float = 0.22,
) -> tuple[list[dict], dict]:
    if len(points) < 8:
        raise ValueError("need at least 8 historical observations")

    first_year = points[0][0]
    x = np.array([[year - first_year] for year, _ in points], dtype=float)
    y = np.log(np.array([clip_value(value, min_value, max_value) for _, value in points], dtype=float))
    future_x = np.array([[year - first_year] for year in YEARS], dtype=float)

    components: list[tuple[str, np.ndarray, np.ndarray]] = []
    status: dict[str, str] = {}

    try:
        kernel = ConstantKernel(1.0, constant_value_bounds="fixed") * RBF(9.0, length_scale_bounds="fixed") + WhiteKernel(0.015, noise_level_bounds="fixed")
        gp = GaussianProcessRegressor(kernel=kernel, normalize_y=True, optimizer=None, random_state=2050, alpha=1e-6)
        gp.fit(x, y)
        gp_mean, gp_std = gp.predict(future_x, return_std=True)
        components.append(("gaussian_process", gp_mean, np.maximum(gp_std, min_spread)))
        status["gaussian_process"] = "ok"
    except Exception as exc:  # pragma: no cover - defensive numeric path
        status["gaussian_process"] = f"failed: {type(exc).__name__}"

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = UnobservedComponents(y, level="local linear trend")
            result = model.fit(disp=False, maxiter=90)
            forecast = result.get_forecast(steps=len(YEARS))
            ucm_mean = np.asarray(forecast.predicted_mean, dtype=float)
            ucm_std = np.asarray(forecast.se_mean, dtype=float)
        components.append(("unobserved_components", ucm_mean, np.maximum(ucm_std, min_spread)))
        status["unobserved_components"] = "ok"
    except Exception as exc:  # pragma: no cover - defensive numeric path
        status["unobserved_components"] = f"failed: {type(exc).__name__}"

    if not components:
        raise RuntimeError("both forecast components failed")

    means = np.vstack([mean for _, mean, _ in components])
    variances = np.vstack([std ** 2 for _, _, std in components])
    mean_log = means.mean(axis=0)
    spread = np.clip(np.sqrt(variances.mean(axis=0) + means.var(axis=0)), min_spread, max_spread)

    rows = []
    for idx, year in enumerate(YEARS):
        median = clip_value(math.exp(float(mean_log[idx])), min_value, max_value)
        q10 = clip_value(math.exp(float(mean_log[idx] - Z80 * spread[idx])), min_value, max_value)
        q90 = clip_value(math.exp(float(mean_log[idx] + Z80 * spread[idx])), min_value, max_value)
        rows.append({
            "year": year,
            "median": round(median, 6),
            "q10": round(min(q10, median), 6),
            "q90": round(max(q90, median), 6),
        })

    status["component_count"] = len(components)
    return rows, status


def forecast_one(points: list[tuple[int, float]]) -> tuple[list[dict], dict]:
    return forecast_log_series(points, min_value=MIN_TFR, max_value=MAX_TFR)


def forecast_gap(points: list[tuple[int, float]]) -> tuple[list[dict], dict]:
    rows, status = forecast_log_series(
        points,
        min_value=MIN_GAP,
        max_value=MAX_GAP,
        min_spread=0.055,
        max_spread=0.34,
    )
    recent_values = [value for _, value in points[-5:]]
    recent_anchor = clip_gap(float(np.median(recent_values))) if recent_values else 0.18
    gap_cap = min(MAX_GAP, max(MIN_GAP * 1.25, recent_anchor * 1.8))
    stabilized_rows = []
    for row in rows:
        median = clip_gap(min(float(row["median"]), gap_cap))
        q10 = clip_gap(min(float(row["q10"]), median))
        q90 = clip_gap(max(median, min(float(row["q90"]), gap_cap)))
        stabilized_rows.append({
            "year": row["year"],
            "median": round(median, 6),
            "q10": round(q10, 6),
            "q90": round(q90, 6),
        })
    status["positive_gap_floor"] = MIN_GAP
    status["recent_positive_gap_anchor"] = round(recent_anchor, 6)
    status["gap_cap"] = round(gap_cap, 6)
    return stabilized_rows, status


def author_total_rows(author: dict, tid: str) -> dict[int, dict] | None:
    rows = author.get("series", {}).get(tid)
    if not rows:
        return None
    by_year = {}
    for row in rows:
        year = int(row.get("year", 0))
        if START_YEAR <= year <= END_YEAR and row.get("median") is not None:
            median = clip_tfr(float(row["median"]))
            q10 = clip_tfr(float(row.get("q10", median)))
            q90 = clip_tfr(float(row.get("q90", median)))
            by_year[year] = {
                "median": round(median, 6),
                "q10": round(min(q10, median), 6),
                "q90": round(max(q90, median), 6),
            }
    return by_year if len(by_year) == len(YEARS) else None


def existing_share_rows(settlement: dict, tid: str) -> dict[int, float]:
    latest_share = float(settlement.get("latest", {}).get(tid, {}).get("rural_share_2025", 0.25) or 0.0)
    out = {}
    for row in settlement.get("forecast", {}).get(tid, []):
        year = int(row.get("year", 0))
        if START_YEAR <= year <= END_YEAR:
            out[year] = float(row.get("baseline_rural_share", latest_share))
    return {year: min(0.95, max(0.0, out.get(year, latest_share))) for year in YEARS}


def row_by_year(rows: list[dict]) -> dict[int, dict]:
    return {int(row["year"]): row for row in rows}


def finite_gap_rows(rows: list[dict]) -> list[tuple[int, float]]:
    gaps: list[tuple[int, float]] = []
    for row in rows:
        urban = row.get("urban")
        rural = row.get("rural")
        if urban is None or rural is None:
            continue
        try:
            urban_number = float(urban)
            rural_number = float(rural)
        except (TypeError, ValueError):
            continue
        if math.isfinite(urban_number) and math.isfinite(rural_number) and urban_number > 0 and rural_number > 0:
            gaps.append((int(row["year"]), rural_number - urban_number))
    return sorted(gaps)


def clean_gap_points(rows: list[dict]) -> list[tuple[int, float]]:
    return [(year, clip_gap(gap)) for year, gap in finite_gap_rows(rows) if gap > MIN_GAP]


def gap_quality(tid: str, history: list[dict]) -> tuple[list[tuple[int, float]], dict]:
    finite = finite_gap_rows(history)
    positive = clean_gap_points(history)
    recent = finite[-5:]
    recent_positive = sum(1 for _, gap in recent if gap > MIN_GAP)
    reasons = []
    if tid in FEDERAL_CITY_IDS:
        reasons.append("federal_city_counterfactual")
    if len(positive) < MIN_GAP_POINTS:
        reasons.append("insufficient_positive_gap_history")
    if len(recent) >= 4 and recent_positive <= 1:
        reasons.append("recent_gap_anomaly")
    return positive, {
        "finite_gap_observations": len(finite),
        "positive_gap_observations": len(positive),
        "recent_positive_gap_observations": recent_positive,
        "latest_observed_gap": round(finite[-1][1], 6) if finite else None,
        "usable_local_gap": not reasons,
        "counterfactual_reasons": reasons,
    }


def constant_gap_rows(value: float) -> dict[int, dict]:
    gap = clip_gap(value)
    return {
        year: {
            "year": year,
            "median": round(gap, 6),
            "q10": round(max(MIN_GAP, gap * 0.72), 6),
            "q90": round(min(MAX_GAP, gap * 1.28), 6),
        }
        for year in YEARS
    }


def clone_gap_rows(rows: dict[int, dict]) -> dict[int, dict]:
    return {year: dict(row) for year, row in rows.items()}


def resolve_gap_forecast(
    tid: str,
    territories: dict[str, dict],
    local_gap_forecasts: dict[str, dict[int, dict] | None],
    diagnostics: dict[str, dict],
    cache: dict[str, tuple[dict[int, dict], str, bool]],
) -> tuple[dict[int, dict], str, bool]:
    if tid in cache:
        return cache[tid]

    local_rows = local_gap_forecasts.get(tid)
    if local_rows:
        result = (local_rows, "local_positive_gap_gp_ucm", False)
        cache[tid] = result
        return result

    territory = territories.get(tid, {})
    parent = territory.get("federal_district_id")
    if parent and parent != tid and parent in territories:
        parent_rows, _, _ = resolve_gap_forecast(parent, territories, local_gap_forecasts, diagnostics, cache)
        result = (clone_gap_rows(parent_rows), f"counterfactual_from_{parent}", True)
    elif tid != RUSSIA_ID and RUSSIA_ID in territories:
        parent_rows, _, _ = resolve_gap_forecast(RUSSIA_ID, territories, local_gap_forecasts, diagnostics, cache)
        result = (clone_gap_rows(parent_rows), f"counterfactual_from_{RUSSIA_ID}", True)
    else:
        result = (constant_gap_rows(0.18), "constant_positive_gap_fallback", True)

    diagnostics.setdefault(tid, {}).setdefault("gap", {})["resolved_counterfactual_source"] = result[1]
    cache[tid] = result
    return result


def main() -> int:
    settlement = read_json(SETTLEMENT)
    author = read_json(AUTHOR_TFR) if AUTHOR_TFR.exists() else {}
    territories = {t["id"]: t for t in settlement["territories"]}
    total_forecasts: dict[str, dict[int, dict]] = {}
    local_gap_forecasts: dict[str, dict[int, dict] | None] = {}
    diagnostics: dict[str, dict] = {}
    component_counter: Counter[str] = Counter()

    for tid, history in settlement["history"].items():
        diagnostics[tid] = {}
        total_rows, total_status = forecast_one(clean_points(history, "total"))
        total_forecasts[tid] = row_by_year(total_rows)
        diagnostics[tid]["total"] = total_status
        component_counter.update([f"total:{k}:{v}" for k, v in total_status.items() if k != "component_count"])

        gap_points, gap_status = gap_quality(tid, history)
        diagnostics[tid]["gap"] = gap_status
        if gap_status["usable_local_gap"]:
            try:
                gap_rows, status = forecast_gap(gap_points)
                local_gap_forecasts[tid] = row_by_year(gap_rows)
                diagnostics[tid]["gap"].update(status)
                diagnostics[tid]["gap"]["resolved_source"] = "local_positive_gap_gp_ucm"
                component_counter.update([f"gap:{k}:{v}" for k, v in status.items() if k != "component_count"])
            except Exception as exc:  # pragma: no cover - defensive numeric path
                local_gap_forecasts[tid] = None
                diagnostics[tid]["gap"]["usable_local_gap"] = False
                diagnostics[tid]["gap"].setdefault("counterfactual_reasons", []).append(f"gap_model_failed_{type(exc).__name__}")
        else:
            local_gap_forecasts[tid] = None

    series: dict[str, list[dict]] = {}
    territory_meta = []
    max_abs_calibration_error = 0.0
    min_forecast_gap = float("inf")
    negative_gap_count = 0
    gap_source_counter: Counter[str] = Counter()
    gap_cache: dict[str, tuple[dict[int, dict], str, bool]] = {}

    for tid, forecasts in total_forecasts.items():
        shares = existing_share_rows(settlement, tid)
        author_total = author_total_rows(author, tid)
        gaps, gap_source, gap_counterfactual = resolve_gap_forecast(tid, territories, local_gap_forecasts, diagnostics, gap_cache)
        gap_source_counter.update([gap_source])
        rows = []
        for year in YEARS:
            total = author_total[year] if author_total else forecasts[year]
            share = shares[year]
            gap = gaps[year]
            gap_median = clip_gap(gap["median"])
            urban_median = total["median"] - share * gap_median
            rural_median = total["median"] + (1 - share) * gap_median
            calibrated = (1 - share) * urban_median + share * rural_median
            error = calibrated - total["median"]
            current_gap = rural_median - urban_median
            min_forecast_gap = min(min_forecast_gap, current_gap)
            if current_gap <= 0:
                negative_gap_count += 1
            max_abs_calibration_error = max(max_abs_calibration_error, abs(error))
            urban_q10 = clip_tfr(total["q10"] - share * gap["q90"])
            urban_q90 = clip_tfr(total["q90"] - share * gap["q10"])
            rural_q10 = clip_tfr(total["q10"] + (1 - share) * gap["q10"])
            rural_q90 = clip_tfr(total["q90"] + (1 - share) * gap["q90"])
            rows.append({
                "year": year,
                "total_tfr": round(total["median"], 6),
                "total_q10": round(total["q10"], 6),
                "total_q90": round(total["q90"], 6),
                "urban_tfr": round(urban_median, 6),
                "urban_q10": round(min(urban_q10, urban_median), 6),
                "urban_q90": round(max(urban_q90, urban_median), 6),
                "rural_tfr": round(rural_median, 6),
                "rural_q10": round(min(rural_q10, rural_median), 6),
                "rural_q90": round(max(rural_q90, rural_median), 6),
                "baseline_rural_share": round(share, 6),
                "rural_urban_gap": round(current_gap, 6),
                "gap_q10": round(gap["q10"], 6),
                "gap_q90": round(gap["q90"], 6),
                "gap_source": gap_source,
                "calibration_error": round(error, 8),
                "total_source": "author_ml_gp_ucm_local" if author_total else "local_gp_ucm_ensemble",
            })
        series[tid] = rows
        territory = territories.get(tid, {})
        territory_meta.append({
            "territory_id": tid,
            "name": territory.get("name"),
            "short_name": territory.get("short_name"),
            "type": territory.get("type"),
            "federal_district_id": territory.get("federal_district_id"),
            "total_source": "author_ml_gp_ucm_local" if author_total else "local_gp_ucm_ensemble",
            "gap_source": gap_source,
            "rural_counterfactual": gap_counterfactual,
            "component_status": diagnostics[tid],
        })

    write_json(OUT, {
        "metadata": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "runtime_external_fetch": False,
            "horizon_year": END_YEAR,
            "method": "local_gp_ucm_ensemble",
            "components": ["gaussian_process", "unobserved_components"],
            "gap_method": "positive_rural_urban_premium_gp_ucm",
            "gap_floor": MIN_GAP,
            "min_forecast_gap": round(min_forecast_gap, 6),
            "negative_gap_count": negative_gap_count,
            "source_files": [
                "data/settlement_data.json",
                "data/author_tfr_forecast_2050.json",
            ],
            "total_forecast_note": "Where available, total_tfr is anchored to the local author ML/GP/UCM forecast used by the SKR page.",
            "gap_forecast_note": "Urban and rural TFR are reconstructed from total_tfr and a positive rural/suburban premium forecast. The premium may converge but is not allowed to cross below zero, so a higher rural/suburban share cannot reduce scenario TFR.",
            "baseline_share_note": "baseline_rural_share uses the local settlement baseline share trajectory already present in settlement_data.json.",
            "federal_city_counterfactual_ids": sorted(FEDERAL_CITY_IDS),
            "gap_source_counts": dict(gap_source_counter),
            "calibration_tolerance": 0.001,
            "max_abs_calibration_error": round(max_abs_calibration_error, 8),
            "component_status_counts": dict(component_counter),
        },
        "territories": territory_meta,
        "series": series,
    })
    print(f"OK: wrote {OUT.relative_to(ROOT)} for {len(series)} territories; max calibration error {max_abs_calibration_error:.8f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
