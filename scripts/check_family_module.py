#!/usr/bin/env python3
from __future__ import annotations
import json, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
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
    geo = json.loads((DOCS / 'data/family_subjects.geojson').read_text(encoding='utf-8'))
    if geo.get('type') != 'FeatureCollection' or not geo.get('features'):
        fail('family_subjects.geojson не является непустым FeatureCollection')
    with sqlite3.connect(DOCS / 'data/family.sqlite') as conn:
        n = conn.execute('select count(*) from family_observations').fetchone()[0]
        if n < 1000:
            fail('family.sqlite содержит слишком мало наблюдений')
    html = (DOCS / 'family.html').read_text(encoding='utf-8')
    for word in ['Семья', 'браков', 'разводов', 'разводов на 100 браков']:
        if word not in html:
            fail(f'в family.html нет обязательной строки: {word}')
    js = (DOCS / 'assets/js/family.js').read_text(encoding='utf-8')
    for token in ['window.FamilyModule', 'getState', 'runtimeExternalFetch', 'renderedCharts']:
        if token not in js:
            fail(f'в family.js нет проверочного контракта {token}')
    print('OK: модуль «Семья» прошёл проверку')

if __name__ == '__main__':
    main()
