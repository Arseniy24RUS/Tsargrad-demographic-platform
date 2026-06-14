#!/usr/bin/env python3
"""Validate the Infrastructure module data and runtime contract."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data" / "infrastructure"
REQUIRED = [
    "docs/infrastructure.html",
    "docs/assets/js/infrastructure.js",
    "docs/assets/css/infrastructure.css",
    "docs/data/infrastructure/regions_summary.json",
    "docs/data/infrastructure/infrastructure_subjects.geojson",
    "docs/data/infrastructure/infrastructure_layers_catalog.json",
    "docs/data/infrastructure/infrastructure_data_manifest.json",
    "docs/data/infrastructure/infrastructure_regions_summary.csv",
    "docs/methodology/INFRASTRUCTURE_MODULE.md",
    "docs/methodology/DATA_CONTRACT_INFRASTRUCTURE.md",
    "data_pipeline/infrastructure/02_extract_osm_layers.py",
    "data_pipeline/infrastructure/03_compute_distances.py",
]
LAYERS = ["roads", "power", "gas", "water", "sewer", "digital", "education", "medical", "services"]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    for item in REQUIRED:
        if not (ROOT / item).exists():
            errors.append(f"нет файла: {item}")

    by_region = DATA / "by_region"
    files = sorted(by_region.glob("*.json")) if by_region.exists() else []
    if len(files) != 85:
        errors.append(f"ожидалось 85 региональных JSON, найдено {len(files)}")

    try:
        summary = read_json(DATA / "regions_summary.json")
        meta = summary.get("metadata") or {}
        country = summary.get("country") or {}
        if meta.get("runtime_external_fetch") is not False:
            errors.append("regions_summary.metadata.runtime_external_fetch должен быть false")
        if country.get("settlements") != 155741:
            errors.append(f"ожидалось 155741 поселение, получено {country.get('settlements')}")
        if country.get("regions") != 85:
            errors.append(f"ожидалось 85 регионов, получено {country.get('regions')}")
        feature_counts = meta.get("feature_counts") or {}
        for layer in LAYERS:
            if int(feature_counts.get(layer) or 0) <= 0:
                errors.append(f"слой {layer} не содержит извлечённых объектов")
        if "локально извлеч" not in (meta.get("score_status") or ""):
            errors.append("статус расчёта не подтверждает локально извлечённые инфраструктурные слои")
    except Exception as exc:
        errors.append(f"ошибка чтения regions_summary.json: {exc}")
        summary = {}

    try:
        manifest = read_json(DATA / "infrastructure_data_manifest.json")
        if manifest.get("runtime_external_fetch") is not False:
            errors.append("infrastructure_data_manifest.runtime_external_fetch должен быть false")
        if manifest.get("settlements_count") != 155741:
            errors.append("manifest должен сохранять число поселений 155741")
    except Exception as exc:
        errors.append(f"ошибка чтения infrastructure_data_manifest.json: {exc}")

    try:
        sample_payload = read_json(DATA / "by_region" / "moskovskaya_oblast.json")
        record = sample_payload["settlements"][0]
        for key in ["i", "n", "m", "lat", "lon", "p", "s", "e", "so", "cc", "c", "dk"]:
            if key not in record:
                errors.append(f"в региональном JSON нет поля поселения {key}")
        if len(record.get("c") or []) != 10:
            errors.append("поле c должно содержать 10 компонент индекса")
        if len(record.get("dk") or []) != len(LAYERS):
            errors.append("поле dk должно содержать расстояния по 9 инфраструктурным слоям")
        if not all(value is None or (isinstance(value, (int, float)) and math.isfinite(value)) for value in record.get("dk") or []):
            errors.append("расстояния dk должны быть конечными числами или null")
        if record.get("cc") not in {"A", "B", "C", "D"}:
            errors.append("класс готовности должен быть A/B/C/D")
    except Exception as exc:
        errors.append(f"ошибка чтения sample-региона: {exc}")

    html = (ROOT / "docs" / "infrastructure.html").read_text(encoding="utf-8")
    js = (ROOT / "docs" / "assets" / "js" / "infrastructure.js").read_text(encoding="utf-8")
    if "home.html" in html or ">Главная<" in html:
        errors.append("infrastructure.html не должен возвращать старую навигацию")
    if "assets/vendor/plotly.min.js" in html:
        errors.append("Plotly должен подключаться из assets/vendor/plotly/plotly.min.js")
    if "window.InfrastructureModule" not in js or "getState" not in js:
        errors.append("нет window.InfrastructureModule.getState()")
    for visible_token in ["OSM-ETL", "OSM‑ETL"]:
        if visible_token in html:
            errors.append(f"в видимом HTML остался служебный термин {visible_token}")

    if errors:
        print("FAIL: модуль «Инфраструктура» не прошёл проверку")
        for item in errors:
            print(" -", item)
        return 1
    print("OK: модуль «Инфраструктура» готов: локальные данные, 85 регионов, 155741 поселение, getState()")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
