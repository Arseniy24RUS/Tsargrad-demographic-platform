#!/usr/bin/env python3
from __future__ import annotations
import json, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQ = [
    ROOT/'docs'/'abortions.html',
    ROOT/'docs'/'assets'/'js'/'abortions.js',
    ROOT/'docs'/'data'/'abortions_dashboard.json',
    ROOT/'docs'/'data'/'abortions_subjects.geojson',
    ROOT/'docs'/'data'/'abortions_summary.csv',
    ROOT/'docs'/'data'/'abortions.sqlite',
]

def fail(msg: str) -> None:
    print('ERROR:', msg)
    sys.exit(1)

for p in REQ:
    if not p.exists():
        fail(f'не найден файл {p}')

data = json.loads((ROOT/'docs'/'data'/'abortions_dashboard.json').read_text(encoding='utf-8'))

def flatten(d):
    rows = []
    if isinstance(d.get('annual'), list):
        for r in d['annual']:
            rows.append({
                'territory_id': r.get('territory_id'), 'year': r.get('year'),
                'abortions': r.get('abortions') if r.get('abortions') is not None else r.get('abortions_count'),
                'rate_women': r.get('abortions_per_1000_women_15_49'),
            })
    elif isinstance(d.get('series'), list) and d['series'] and isinstance(d['series'][0].get('values'), list):
        for g in d['series']:
            for v in g.get('values') or []:
                rows.append({
                    'territory_id': g.get('territory_id'), 'year': v.get('year'),
                    'abortions': v.get('abortions') if v.get('abortions') is not None else v.get('abortions_count'),
                    'rate_women': v.get('abortions_per_1000_women_15_49'),
                })
    elif isinstance(d.get('series'), list):
        for r in d['series']:
            rows.append({
                'territory_id': r.get('territory_id'), 'year': r.get('year'),
                'abortions': r.get('abortions') if r.get('abortions') is not None else r.get('abortions_count'),
                'rate_women': r.get('abortions_per_1000_women_15_49'),
            })
    return rows

rows = flatten(data)
if not rows:
    fail('abortions_dashboard.json не содержит временные ряды')
if data.get('metadata', {}).get('runtime_external_fetch') is not False:
    fail('runtime_external_fetch должен быть false')
rf2024 = [r for r in rows if r.get('territory_id') in ('terr_rf_bez_novyh_subektov', 'terr_rossiyskaya_federatsiya') and r.get('year') == 2024]
if not rf2024:
    fail('нет строки России за 2024 год')
if int(rf2024[0].get('abortions') or 0) != 338367:
    fail('ожидалось 338367 прерываний беременности по РФ за 2024 год')
if rf2024[0].get('rate_women') is None:
    fail('для РФ 2024 должен быть рассчитан показатель на 1000 женщин')
rf2018 = [r for r in rows if r.get('territory_id') in ('terr_rf_bez_novyh_subektov', 'terr_rossiyskaya_federatsiya') and r.get('year') == 2018]
if not rf2018:
    fail('нет федеральной строки за 2018 год')
if int(rf2018[0].get('abortions') or 0) != 567183:
    fail('федеральный 2018 год должен быть восстановлен значением 567183')
if rf2018[0].get('rate_women') is None:
    fail('для РФ 2018 должен быть рассчитан показатель на 1000 женщин')
regional2018 = [r for r in rows if r.get('year') == 2018 and r.get('territory_id') not in ('terr_rf_bez_novyh_subektov', 'terr_rossiyskaya_federatsiya')]
if any(r.get('abortions') is not None for r in regional2018):
    fail('региональные значения 2018 года должны оставаться пустыми')
geo = json.loads((ROOT/'docs'/'data'/'abortions_subjects.geojson').read_text(encoding='utf-8'))
if len(geo.get('features') or []) < 80:
    fail('geojson содержит слишком мало субъектов')
js = (ROOT/'docs'/'assets'/'js'/'abortions.js').read_text(encoding='utf-8')
for token in ['window.AbortionsModule', 'getState', 'runtimeExternalFetch', 'renderedCharts', 'mapEngine', 'mapRenderedPaths', 'mapValueCount', 'mapDomain', 'rf2018Abortions']:
    if token not in js:
        fail(f'в abortions.js нет проверочного контракта {token}')
conn = sqlite3.connect(ROOT/'docs'/'data'/'abortions.sqlite')
try:
    tables = {r[0] for r in conn.execute("select name from sqlite_master where type='table'")}
    if 'abortions_metrics' in tables:
        n = conn.execute('select count(*) from abortions_metrics').fetchone()[0]
    elif 'annual_metrics' in tables:
        n = conn.execute('select count(*) from annual_metrics').fetchone()[0]
    elif 'observations' in tables:
        n = conn.execute('select count(*) from observations').fetchone()[0]
        rf2018_sql = conn.execute(
            "select value from observations where indicator_id='abortions_count' and territory_id='terr_rf_bez_novyh_subektov' and year=2018"
        ).fetchone()
        if not rf2018_sql or int(rf2018_sql[0] or 0) != 567183:
            fail('SQLite не содержит восстановленное федеральное значение 2018 года')
    else:
        fail('SQLite не содержит таблицу показателей')
    if n < 1000:
        fail('SQLite содержит слишком мало строк с показателями')
finally:
    conn.close()
print('OK: модуль «Аборты» прошёл проверку')
