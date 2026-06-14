#!/usr/bin/env python3
"""Recalculate infrastructure readiness from extracted local OSM feature points."""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree


EARTH_KM = 6371.0088
LAYERS = [
    "roads",
    "power",
    "gas",
    "water",
    "sewer",
    "digital",
    "education",
    "medical",
    "services",
]
COMPONENT_LABELS = {
    "roads": "дороги",
    "power": "электроснабжение",
    "gas": "газификация",
    "water": "водоснабжение",
    "sewer": "водоотведение",
    "digital": "связь",
    "education": "образование",
    "medical": "медицина",
    "services": "сервисы",
    "demographic": "демография",
}
THRESHOLDS_KM = {
    "roads": (1.0, 4.0, 12.0),
    "power": (2.0, 8.0, 22.0),
    "gas": (3.0, 12.0, 35.0),
    "water": (2.0, 8.0, 24.0),
    "sewer": (3.0, 12.0, 35.0),
    "digital": (3.0, 10.0, 26.0),
    "education": (2.0, 7.0, 20.0),
    "medical": (5.0, 16.0, 42.0),
    "services": (3.0, 10.0, 26.0),
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def lonlat_to_unit(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    lon_rad = np.radians(lon.astype(float))
    lat_rad = np.radians(lat.astype(float))
    cos_lat = np.cos(lat_rad)
    return np.column_stack((cos_lat * np.cos(lon_rad), cos_lat * np.sin(lon_rad), np.sin(lat_rad)))


def chord_to_km(chord: np.ndarray) -> np.ndarray:
    chord = np.clip(chord, 0, 2)
    return 2 * np.arcsin(chord / 2) * EARTH_KM


def load_feature_points(path: Path) -> np.ndarray:
    if not path.exists() or path.stat().st_size < 16:
        return np.empty((0, 2), dtype=float)
    rows = np.loadtxt(path, delimiter=",", skiprows=1, dtype=float)
    if rows.size == 0:
        return np.empty((0, 2), dtype=float)
    if rows.ndim == 1:
        rows = rows.reshape(1, 2)
    rows = rows[np.isfinite(rows).all(axis=1)]
    return rows


def distance_score(distance_km: float, layer: str) -> float:
    if not math.isfinite(distance_km):
        return 0.0
    good, acceptable, poor = THRESHOLDS_KM[layer]
    if distance_km <= good:
        return 100.0
    if distance_km <= acceptable:
        ratio = (distance_km - good) / (acceptable - good)
        return 100.0 - ratio * 28.0
    if distance_km <= poor:
        ratio = (distance_km - acceptable) / (poor - acceptable)
        return 72.0 - ratio * 42.0
    ratio = min(1.0, (distance_km - poor) / max(poor, 1))
    return max(4.0, 30.0 - ratio * 26.0)


def demographic_score(record: dict) -> float:
    if isinstance(record.get("c"), list) and len(record["c"]) >= 10:
        return float(record["c"][9])
    growth = float(record.get("g") or 0)
    child_share = float(record.get("cs") or 0)
    center_bonus = 8 if record.get("rc") else 0
    return max(0.0, min(100.0, 50 + growth * 2.0 + (child_share - 16) * 1.4 + center_bonus))


def class_for(score: float) -> tuple[str, str]:
    if score >= 80:
        return "A", "готово к семейному расселению"
    if score >= 65:
        return "B", "быстрая достройка"
    if score >= 50:
        return "C", "инженерный дефицит"
    return "D", "низкая готовность"


def weighted(records: list[dict], key: str) -> float:
    sw = 0.0
    sv = 0.0
    for rec in records:
        w = float(rec.get("p") or 0) + 1.0
        sw += w
        sv += float(rec.get(key) or 0) * w
    return round(sv / sw, 1) if sw else 0.0


def aggregate_summary(base: dict, records: list[dict]) -> dict:
    class_population = {k: 0 for k in ["A", "B", "C", "D"]}
    class_count = {k: 0 for k in ["A", "B", "C", "D"]}
    deficits: Counter[str] = Counter()
    for rec in records:
        code = rec.get("cc") or "D"
        class_population[code] += int(rec.get("p") or 0)
        class_count[code] += 1
        deficits[rec.get("md") or "нет данных"] += 1
    return {
        **{k: base.get(k) for k in ["subject", "region_slug", "federal_district"] if k in base},
        "settlements": len(records),
        "municipalities": len({rec.get("m") for rec in records if rec.get("m")}),
        "population": int(sum(int(rec.get("p") or 0) for rec in records)),
        "children": int(sum(int(rec.get("ch") or 0) for rec in records)),
        "urban_population": int(sum(int(rec.get("p") or 0) for rec in records if rec.get("k") == "городское")),
        "rural_population": int(sum(int(rec.get("p") or 0) for rec in records if rec.get("k") != "городское")),
        "avg_score": weighted(records, "s"),
        "engineering_score": weighted(records, "e"),
        "social_score": weighted(records, "so"),
        "class_population": class_population,
        "class_count": class_count,
        "top_deficits": dict(deficits.most_common(6)),
        "data_confidence_note": "расчёт по локальной PBF-выгрузке открытых геоданных; внешних runtime-запросов нет",
    }


def municipality_summaries(records: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for rec in records:
        groups[rec.get("m") or "Не указано"].append(rec)
    out = []
    for name, items in groups.items():
        cl = Counter(rec.get("cc") or "D" for rec in items)
        out.append(
            {
                "n": name,
                "st": len(items),
                "p": int(sum(int(rec.get("p") or 0) for rec in items)),
                "s": weighted(items, "s"),
                "e": weighted(items, "e"),
                "so": weighted(items, "so"),
                "cl": dict(cl),
            }
        )
    return sorted(out, key=lambda item: (-item["s"], item["n"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--settlements", required=True, help="docs/data/infrastructure")
    parser.add_argument("--layers", required=True, help="directory produced by 02_extract_osm_layers.py")
    parser.add_argument("--output", required=True, help="docs/data/infrastructure")
    args = parser.parse_args()

    data_dir = Path(args.settlements)
    layers_dir = Path(args.layers)
    output_dir = Path(args.output)
    by_region = data_dir / "by_region"

    region_files = sorted(by_region.glob("*.json"))
    all_records: list[dict] = []
    region_payloads: list[tuple[Path, dict]] = []
    for path in region_files:
        payload = load_json(path)
        region_payloads.append((path, payload))
        all_records.extend(payload.get("settlements") or [])

    settlement_xyz = lonlat_to_unit(
        np.array([float(rec.get("lon") or 0) for rec in all_records]),
        np.array([float(rec.get("lat") or 0) for rec in all_records]),
    )

    distances: dict[str, np.ndarray] = {}
    feature_counts: dict[str, int] = {}
    for layer in LAYERS:
        points = load_feature_points(layers_dir / f"{layer}.csv")
        feature_counts[layer] = int(len(points))
        if len(points) == 0:
            distances[layer] = np.full(len(all_records), math.inf)
            continue
        tree = cKDTree(lonlat_to_unit(points[:, 0], points[:, 1]))
        chord, _ = tree.query(settlement_xyz, k=1, workers=-1)
        distances[layer] = chord_to_km(chord)

    for idx, rec in enumerate(all_records):
        scores = {layer: distance_score(float(distances[layer][idx]), layer) for layer in LAYERS}
        demographic = demographic_score(rec)
        engineering = (
            scores["roads"] * 0.22
            + scores["power"] * 0.18
            + scores["gas"] * 0.13
            + scores["water"] * 0.17
            + scores["sewer"] * 0.13
            + scores["digital"] * 0.17
        )
        social = scores["education"] * 0.42 + scores["medical"] * 0.38 + scores["services"] * 0.20
        total = engineering * 0.50 + social * 0.35 + demographic * 0.15
        components = [scores[layer] for layer in LAYERS] + [demographic]
        code, label = class_for(total)
        deficit_layers = sorted(LAYERS, key=lambda layer: scores[layer])[:2]
        rec["c"] = [round(v, 1) for v in components]
        rec["e"] = round(engineering, 1)
        rec["so"] = round(social, 1)
        rec["s"] = round(total, 1)
        rec["q"] = round(sum(1 for layer in LAYERS if feature_counts[layer] > 0) / len(LAYERS), 2)
        rec["cc"] = code
        rec["cl"] = label
        rec["md"] = " и ".join(COMPONENT_LABELS[layer] for layer in deficit_layers)
        rec["dk"] = [
            None if not math.isfinite(float(distances[layer][idx])) else round(float(distances[layer][idx]), 2)
            for layer in LAYERS
        ]

    offset = 0
    region_summaries = []
    for path, payload in region_payloads:
        count = len(payload.get("settlements") or [])
        records = all_records[offset : offset + count]
        offset += count
        base = payload.get("summary") or {}
        payload["settlements"] = records
        payload["municipalities"] = municipality_summaries(records)
        payload["summary"] = aggregate_summary(base, records)
        payload["meta"] = {
            **(payload.get("meta") or {}),
            "score_status": "расчёт по локально извлечённым инфраструктурным слоям",
            "feature_counts": feature_counts,
            "runtime_external_fetch": False,
        }
        region_summaries.append(payload["summary"])
        dump_json(output_dir / "by_region" / path.name, payload)

    def country_or_fd_summary(name: str, records: list[dict], regions: list[dict] | None = None) -> dict:
        base = {"subject": name, "region_slug": "", "federal_district": ""}
        summary = aggregate_summary(base, records)
        summary["name"] = name
        summary["regions"] = len(regions or [])
        return summary

    summary = load_json(data_dir / "regions_summary.json")
    summary["metadata"] = {
        **(summary.get("metadata") or {}),
        "score_status": "расчёт по локально извлечённым инфраструктурным слоям",
        "feature_counts": feature_counts,
        "runtime_external_fetch": False,
    }
    country = country_or_fd_summary("Российская Федерация", all_records, region_summaries)
    summary["country"] = {
        "name": "Российская Федерация",
        "regions": len(region_summaries),
        "population": country["population"],
        "settlements": country["settlements"],
        "municipalities": country["municipalities"],
        "avg_score": country["avg_score"],
        "engineering_score": country["engineering_score"],
        "social_score": country["social_score"],
    }
    fd_groups: dict[str, list[dict]] = defaultdict(list)
    for rec in all_records:
        slug = rec["i"].split("_", 1)[0] if "_" in rec.get("i", "") else ""
        # The summary is authoritative for district names; use the region payload base.
    region_by_slug = {item["region_slug"]: item for item in region_summaries}
    for payload in region_summaries:
        fd_groups[payload["federal_district"]].append(payload)
    fd_settlement_groups: dict[str, list[dict]] = defaultdict(list)
    for _path, payload in region_payloads:
        fd = payload["summary"]["federal_district"]
        fd_settlement_groups[fd].extend(payload["settlements"])
    summary["federal_districts"] = []
    for fd, regions in sorted(fd_groups.items()):
        fd_records = fd_settlement_groups[fd]
        fd_summary = country_or_fd_summary(fd, fd_records, regions)
        summary["federal_districts"].append(
            {
                "name": fd,
                "regions": len(regions),
                "population": fd_summary["population"],
                "settlements": fd_summary["settlements"],
                "avg_score": fd_summary["avg_score"],
                "engineering_score": fd_summary["engineering_score"],
                "social_score": fd_summary["social_score"],
            }
        )
    summary["regions"] = sorted(region_summaries, key=lambda item: item["subject"])
    dump_json(output_dir / "regions_summary.json", summary)

    geo_path = output_dir / "infrastructure_subjects.geojson"
    if geo_path.exists():
        geo = load_json(geo_path)
        for feature in geo.get("features") or []:
            props = feature.get("properties") or {}
            slug = props.get("region_slug")
            region = region_by_slug.get(slug)
            if region:
                props["infrastructure_score"] = region["avg_score"]
                props["engineering_score"] = region["engineering_score"]
                props["social_score"] = region["social_score"]
        dump_json(geo_path, geo)

    csv_path = output_dir / "infrastructure_regions_summary.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        fieldnames = [
            "subject",
            "region_slug",
            "federal_district",
            "settlements",
            "municipalities",
            "population",
            "children",
            "urban_population",
            "rural_population",
            "avg_score",
            "engineering_score",
            "social_score",
            "data_confidence_note",
        ]
        writer = csv.DictWriter(fh, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        for region in summary["regions"]:
            writer.writerow({key: region.get(key, "") for key in fieldnames})

    manifest_path = output_dir / "infrastructure_data_manifest.json"
    manifest = load_json(manifest_path)
    manifest.update(
        {
            "score_status": "расчёт по локально извлечённым инфраструктурным слоям",
            "feature_counts": feature_counts,
            "runtime_external_fetch": False,
        }
    )
    dump_json(manifest_path, manifest)
    print(json.dumps({"settlements": len(all_records), "regions": len(region_summaries), "feature_counts": feature_counts}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
