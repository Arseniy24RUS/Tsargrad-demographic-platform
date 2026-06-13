from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
required = [
    'docs/capital.html',
    'docs/assets/js/capital.js',
    'docs/assets/css/capital.css',
    'docs/data/matcapital_inputs.json',
    'docs/methodology/DATA_CONTRACT_MATCAPITAL.md',
]
missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    raise SystemExit('Нет обязательных файлов модуля: ' + ', '.join(missing))

data = json.loads((ROOT / 'docs/data/matcapital_inputs.json').read_text(encoding='utf-8'))
assert data['metadata']['horizon_year'] == 2050, 'горизонт должен быть 2050'
assert data['metadata']['runtime_external_fetch'] is False, 'runtime_external_fetch должен быть false'
assert data['current_policy_2026']['second_child_extra_after_first'] > 0
assert data['metadata']['version'] == '1.1.0', 'ожидается версия структуры 1.1.0'
assert 'comfortable_housing_model' in data, 'нет ключа comfortable_housing_model'
assert 'tsargrad_housing_model' not in data, 'runtime JSON должен использовать смысловой ключ comfortable_housing_model'
assert data['comfortable_housing_model']['rates_default']['child2'] > data['comfortable_housing_model']['rates_default']['child1']
data_text = (ROOT / 'docs/data/matcapital_inputs.json').read_text(encoding='utf-8')
if 'http://' in data_text or 'https://' in data_text:
    raise SystemExit('Runtime JSON Маткапитала не должен содержать внешние URL')

html = (ROOT / 'docs/capital.html').read_text(encoding='utf-8').lower()
js = (ROOT / 'docs/assets/js/capital.js').read_text(encoding='utf-8').lower()
probe = html + '\n' + js
for forbidden in ['https://', 'http://', 'cdn.', 'raw.githubusercontent.com', 'three.js']:
    if forbidden in probe:
        raise SystemExit(f'Найдена запрещённая внешняя или лишняя зависимость: {forbidden}')

if 'assets/vendor/plotly/plotly.min.js' not in html:
    raise SystemExit('Страница Маткапитала должна подключать локальный Plotly для графиков')

if 'модель царьграда' in html:
    raise SystemExit('В HTML Маткапитала осталась устаревшая видимая формулировка: модель Царьграда')

for text in ['маткапитал', 'эквивалент 2007 года', 'по стоимости комфортного жилья', 'итого за 4 детей', 'скачать таблицу']:
    if text not in html:
        raise SystemExit(f'В HTML не найден ключевой текст: {text}')

for label in ['01 скр', '02 расселение', '03 усадьба', '04 маткапитал', '05 ипотека', '06 выплаты']:
    if label in html:
        raise SystemExit(f'Найден числовой префикс в навигации: {label}')

for text in ['window.capitalmodule', 'getstate', 'runtimeexternalfetch', 'ordertotals', 'housingcoverage', 'chartlabels', 'tabletotals']:
    if text not in js:
        raise SystemExit(f'В JS не найден QA-контракт: {text}')

print('OK: модуль Маткапитал интегрирован локально')
