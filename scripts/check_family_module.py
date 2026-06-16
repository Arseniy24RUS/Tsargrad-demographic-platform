#!/usr/bin/env python3
from __future__ import annotations
import json, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
RF_ID = 'terr_rf_bez_novyh_subektov'
RF_2010_DIVORCES = 639321
RF_2010_DIVORCE_INDEX = 52.6162
REQUIRED = [
    DOCS / 'family.html',
    DOCS / 'assets/js/family.js',
    DOCS / 'assets/css/family.css',
    DOCS / 'data/family_dashboard.json',
    DOCS / 'data/family_subjects.geojson',
    DOCS / 'data/family.sqlite',
    DOCS / 'data/family_summary.csv',
    DOCS / 'methodology/FAMILY_MODULE.md',
]

def fail(msg: str) -> None:
    print('ERROR:', msg)
    raise SystemExit(1)

def approx(value: float, expected: float, tolerance: float = 0.001) -> bool:
    return abs(float(value) - expected) <= tolerance

def rf_2010_row(data: dict) -> dict:
    for series in data.get('series', []):
        if series.get('territory_id') != RF_ID:
            continue
        for row in series.get('values', []):
            if row.get('year') == 2010:
                return row
    fail('в family_dashboard.json не найден федеральный ряд за 2010 год')
    return {}

def main() -> None:
    for path in REQUIRED:
        if not path.exists():
            fail(f'не найден файл {path.relative_to(ROOT)}')
    data = json.loads((DOCS / 'data/family_dashboard.json').read_text(encoding='utf-8'))
    if data.get('metadata', {}).get('runtime_external_fetch') is not False:
        fail('family_dashboard.json должен иметь runtime_external_fetch=false')
    if not data.get('series'):
        fail('family_dashboard.json не содержит рядов series')
    national = data.get('national') or {}
    for key in ['marriages_count_latest', 'divorces_count_latest', 'divorces_per_100_marriages_latest']:
        if national.get(key) is None:
            fail(f'в national нет значения {key}')
    row2010 = rf_2010_row(data)
    if int(row2010.get('divorces_count') or 0) != RF_2010_DIVORCES:
        fail('в федеральном ряду 2010 года должно быть 639321 разводов')
    if not approx(row2010.get('divorces_per_100_marriages') or 0, RF_2010_DIVORCE_INDEX):
        fail('индекс разводимости РФ за 2010 год должен быть около 52.6162')
    geo = json.loads((DOCS / 'data/family_subjects.geojson').read_text(encoding='utf-8'))
    if geo.get('type') != 'FeatureCollection' or not geo.get('features'):
        fail('family_subjects.geojson не является непустым FeatureCollection')
    with sqlite3.connect(DOCS / 'data/family.sqlite') as conn:
        n = conn.execute('select count(*) from family_observations').fetchone()[0]
        if n < 1000:
            fail('family.sqlite содержит слишком мало наблюдений')
        sqlite_row = conn.execute(
            'select divorces_count, divorces_per_100_marriages from family_observations where territory_id=? and year=2010',
            (RF_ID,),
        ).fetchone()
        if not sqlite_row:
            fail('в family.sqlite не найден федеральный ряд за 2010 год')
        if int(sqlite_row[0] or 0) != RF_2010_DIVORCES or not approx(sqlite_row[1] or 0, RF_2010_DIVORCE_INDEX):
            fail('family.sqlite содержит неверные федеральные данные о разводах за 2010 год')
    html = (DOCS / 'family.html').read_text(encoding='utf-8')
    for word in ['Браки', 'браков', 'разводов', 'разводов на 100 браков']:
        if word not in html:
            fail(f'в family.html нет обязательной строки: {word}')
    js = (DOCS / 'assets/js/family.js').read_text(encoding='utf-8')
    for token in ['window.FamilyModule', 'getState', 'runtimeExternalFetch', 'renderedCharts', 'mapEngine', 'mapRenderedPaths', 'mapValueCount', 'mapDomain']:
        if token not in js:
            fail(f'в family.js нет проверочного контракта {token}')
    print('OK: модуль «Браки» прошёл проверку')

if __name__ == '__main__':
    main()
