#!/usr/bin/env python3
"""Extract compact infrastructure feature points from a local OSM PBF file.

The browser never reads the PBF or these intermediate CSV files. They are
development artifacts used by ``03_compute_distances.py`` to rebuild compact
runtime JSON under ``docs/data/infrastructure``.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import osmium


ROAD_HIGHWAYS = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "service",
    "living_street",
}
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


def norm(value: object) -> str:
    return str(value or "").strip().lower()


def has_any(tags: osmium.osm.TagList, key: str, values: set[str]) -> bool:
    return norm(tags.get(key)) in values


def classify(tags: osmium.osm.TagList) -> set[str]:
    amenity = norm(tags.get("amenity"))
    highway = norm(tags.get("highway"))
    power = norm(tags.get("power"))
    man_made = norm(tags.get("man_made"))
    substance = norm(tags.get("substance"))
    pipeline = norm(tags.get("pipeline"))
    telecom = norm(tags.get("telecom"))
    healthcare = norm(tags.get("healthcare"))
    shop = norm(tags.get("shop"))
    building = norm(tags.get("building"))
    waterway = norm(tags.get("waterway"))

    layers: set[str] = set()
    if highway in ROAD_HIGHWAYS:
        layers.add("roads")
    if power in {"line", "minor_line", "substation", "transformer", "tower", "pole"}:
        layers.add("power")
    if man_made == "pipeline" and ("gas" in {substance, pipeline}):
        layers.add("gas")
    if man_made in {"water_tower", "water_works", "water_well"} or waterway:
        layers.add("water")
    if man_made == "pipeline" and substance in {"water", "drinking_water"}:
        layers.add("water")
    if man_made in {"wastewater_plant", "septic_tank"}:
        layers.add("sewer")
    if man_made == "pipeline" and substance in {"sewer", "wastewater", "sewage"}:
        layers.add("sewer")
    if man_made in {"mast", "tower", "communications_tower"} or telecom in {"exchange", "yes"}:
        layers.add("digital")
    if amenity in {"school", "kindergarten", "college", "university"} or building in {"school", "kindergarten"}:
        layers.add("education")
    if amenity in {"hospital", "clinic", "doctors", "pharmacy", "dentist"} or healthcare:
        layers.add("medical")
    if amenity in {"marketplace", "post_office", "bank", "fuel", "community_centre", "townhall"}:
        layers.add("services")
    if shop in {"supermarket", "convenience", "general", "mall", "department_store"}:
        layers.add("services")
    return layers


def valid_lon_lat(lon: float, lat: float) -> bool:
    return math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90


class InfrastructureExtractor(osmium.SimpleHandler):
    def __init__(self, output: Path, max_way_points: int) -> None:
        super().__init__()
        self.output = output
        self.max_way_points = max(2, max_way_points)
        self.files = {}
        self.writers = {}
        self.counts = {layer: 0 for layer in LAYERS}
        self.node_seen = 0
        self.way_seen = 0
        output.mkdir(parents=True, exist_ok=True)
        for layer in LAYERS:
            fh = (output / f"{layer}.csv").open("w", encoding="utf-8", newline="")
            writer = csv.writer(fh)
            writer.writerow(["lon", "lat"])
            self.files[layer] = fh
            self.writers[layer] = writer

    def close(self) -> None:
        for fh in self.files.values():
            fh.close()

    def emit(self, layer: str, lon: float, lat: float) -> None:
        if not valid_lon_lat(lon, lat):
            return
        self.writers[layer].writerow([f"{lon:.7f}", f"{lat:.7f}"])
        self.counts[layer] += 1

    def node(self, n: osmium.osm.Node) -> None:
        self.node_seen += 1
        layers = classify(n.tags)
        if not layers or not n.location.valid():
            return
        lon, lat = float(n.location.lon), float(n.location.lat)
        for layer in layers:
            self.emit(layer, lon, lat)

    def way(self, w: osmium.osm.Way) -> None:
        self.way_seen += 1
        layers = classify(w.tags)
        if not layers:
            return
        coords: list[tuple[float, float]] = []
        for node in w.nodes:
            if node.location.valid():
                coords.append((float(node.location.lon), float(node.location.lat)))
        if not coords:
            return

        if len(coords) <= self.max_way_points:
            sample = coords
        else:
            step = max(1, len(coords) // (self.max_way_points - 1))
            sample = coords[::step][: self.max_way_points - 1]
            sample.append(coords[-1])

        lon = sum(pt[0] for pt in coords) / len(coords)
        lat = sum(pt[1] for pt in coords) / len(coords)
        sample.append((lon, lat))
        for layer in layers:
            for lon, lat in sample:
                self.emit(layer, lon, lat)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pbf", required=True, help="local .osm.pbf extract")
    parser.add_argument("--output", required=True, help="intermediate directory outside docs/")
    parser.add_argument("--max-way-points", type=int, default=10)
    args = parser.parse_args()

    pbf = Path(args.pbf)
    output = Path(args.output)
    if not pbf.exists():
        raise SystemExit(f"Не найден PBF-файл: {pbf}")

    handler = InfrastructureExtractor(output, args.max_way_points)
    try:
        handler.apply_file(str(pbf), locations=True)
    finally:
        handler.close()

    metadata = {
        "source_pbf": str(pbf),
        "layers": handler.counts,
        "node_seen": handler.node_seen,
        "way_seen": handler.way_seen,
        "runtime_external_fetch": False,
    }
    (output / "osm_feature_manifest.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
