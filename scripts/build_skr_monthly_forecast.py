#!/usr/bin/env python3
"""Build a local monthly TFR forecast for the main SKR chart.

The runtime chart should not interpolate sparse annual points on the fly. This
development-time ETL step converts the local author annual forecast into monthly
series up to 2050 and keeps the graph continuous after the observed monthly
fact.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
TFR_DATA = DATA / "tfr_data.json"
AUTHOR_TFR = DATA / "author_tfr_forecast_2050.json"
OUT = DATA / "skr_monthly_forecast_2050.json"

MIN_TFR = 0.45
MAX_TFR = 4.35
Z80 = 1.2815515655446004


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def month_index(month: str) -> int:
    year = int(month[:4])
    number = int(month[5:7])
    return year * 12 + number - 1


def month_id(idx: int) -> str:
    year = idx // 12
    number = idx % 12 + 1
    return f"{year:04d}-{number:02d}"


def month_date(idx: int) -> str:
    return f"{month_id(idx)}-01"


def clamp(value: float, lo: float = MIN_TFR, hi: float = MAX_TFR) -> float:
    return min(hi, max(lo, float(value)))


def finite_number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def interpolate(a: dict, b: dict, idx: int, key: str) -> float:
    if a["idx"] == b["idx"]:
        return float(b[key])
    share = (idx - a["idx"]) / (b["idx"] - a["idx"])
    return float(a[key]) + share * (float(b[key]) - float(a[key]))


def clean_observed(rows: list[dict]) -> list[dict]:
    out = []
    for row in rows:
        value = finite_number(row.get("tfr_total"))
        if value is None:
            continue
        out.append({"idx": month_index(row["month"]), "month": row["month"], "mean": clamp(value)})
    return sorted(out, key=lambda x: x["idx"])


def author_anchors(rows: list[dict], last_observed: dict, end_idx: int) -> list[dict]:
    anchors = [{
        "idx": last_observed["idx"],
        "mean": last_observed["mean"],
        "lo": last_observed["mean"],
        "hi": last_observed["mean"],
        "source": "наблюдаемая точка привязки",
    }]
    for row in sorted(rows or [], key=lambda x: int(x.get("year", 0))):
        mean = finite_number(row.get("median"))
        if mean is None:
            continue
        idx = month_index(f"{int(row['year']):04d}-12")
        if idx <= last_observed["idx"] or idx > end_idx:
            continue
        lo = finite_number(row.get("q10"))
        hi = finite_number(row.get("q90"))
        mean = clamp(mean)
        lo = clamp(lo if lo is not None else mean)
        hi = clamp(hi if hi is not None else mean)
        if lo > mean:
            lo = mean
        if hi < mean:
            hi = mean
        anchors.append({
            "idx": idx,
            "mean": mean,
            "lo": lo,
            "hi": hi,
            "source": "авторский годовой прогноз",
        })
    return anchors


def regression_forecast(observed: list[dict], start_idx: int, end_idx: int) -> list[dict]:
    ys = [clamp(row["mean"]) for row in observed]
    if not ys:
        return []
    upper = MAX_TFR

    def logit(value: float) -> float:
        value = min(upper - 1e-5, max(1e-5, value))
        return math.log(value / (upper - value))

    zs = [logit(v) for v in ys]
    n = len(zs)
    xbar = (n - 1) / 2
    ybar = sum(zs) / n
    sxx = sum((i - xbar) ** 2 for i in range(n)) or 1
    slope = sum((i - xbar) * (z - ybar) for i, z in enumerate(zs)) / sxx
    intercept = ybar - slope * xbar
    residuals = [z - (intercept + slope * i) for i, z in enumerate(zs)]
    sigma = math.sqrt(sum(r * r for r in residuals) / max(1, n - 2))
    sigma = max(0.035, min(0.22, sigma))

    def inverse(value: float) -> float:
        return upper / (1 + math.exp(-value))

    rows = []
    first_future_position = n
    for offset, idx in enumerate(range(start_idx, end_idx + 1)):
        x = first_future_position + offset
        mu = intercept + slope * x
        pred_se = sigma * math.sqrt(1 + 1 / n + ((x - xbar) ** 2) / sxx)
        mean = clamp(inverse(mu))
        lo = clamp(inverse(mu - Z80 * pred_se))
        hi = clamp(inverse(mu + Z80 * pred_se))
        rows.append(row_for_month(idx, mean, lo, hi, "локальная месячная экстраполяция"))
    return rows


def row_for_month(idx: int, mean: float, lo: float, hi: float, source: str) -> dict:
    mean = round(clamp(mean), 6)
    lo = round(min(mean, clamp(lo)), 6)
    hi = round(max(mean, clamp(hi)), 6)
    return {
        "date": month_date(idx),
        "month": month_id(idx),
        "mean": mean,
        "lo": lo,
        "hi": hi,
        "source": source,
    }


def monthly_from_author(observed: list[dict], author_rows: list[dict], start_idx: int, end_idx: int) -> list[dict]:
    if not observed:
        return []
    anchors = author_anchors(author_rows, observed[-1], end_idx)
    if len(anchors) < 2:
        return regression_forecast(observed, start_idx, end_idx)

    rows = []
    segment = 0
    for idx in range(start_idx, end_idx + 1):
        while segment < len(anchors) - 2 and idx > anchors[segment + 1]["idx"]:
            segment += 1
        a = anchors[segment]
        b = anchors[min(segment + 1, len(anchors) - 1)]
        mean = interpolate(a, b, idx, "mean")
        lo = interpolate(a, b, idx, "lo")
        hi = interpolate(a, b, idx, "hi")
        rows.append(row_for_month(idx, mean, lo, hi, "локальная помесячная интерполяция авторского прогноза"))
    return rows


def main() -> None:
    tfr = read_json(TFR_DATA)
    author = read_json(AUTHOR_TFR)
    end_month = tfr["metadata"].get("forecast_end_month", "2050-12")
    end_idx = month_index(end_month)
    author_series = author.get("series", {})
    out_series = {}
    fallback_count = 0

    for territory in tfr.get("territories", []):
        tid = territory["id"]
        observed = clean_observed(tfr.get("monthly", {}).get(tid, []))
        if not observed:
            continue
        start_idx = observed[-1]["idx"] + 1
        rows = monthly_from_author(observed, author_series.get(tid, []), start_idx, end_idx)
        if rows and rows[0]["source"] == "локальная месячная экстраполяция":
            fallback_count += 1
        out_series[tid] = rows

    write_json(OUT, {
        "metadata": {
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "runtime_external_fetch": False,
            "horizon_month": end_month,
            "method": "Помесячная интерполяция локального авторского годового прогноза СКР с привязкой к последнему фактическому месяцу.",
            "source_files": [
                "data/tfr_data.json",
                "data/author_tfr_forecast_2050.json",
            ],
            "first_forecast_month": month_id(month_index(tfr["metadata"].get("observed_end_month", "2026-05")) + 1),
            "fallback_series_count": fallback_count,
        },
        "series": out_series,
    })


if __name__ == "__main__":
    main()
