# Россия 2050: расчётная демографическая платформа

Самодостаточная статическая платформа для GitHub Pages и локального показа без внешнего интернета. Runtime читает только файлы из `docs/`: локальные данные, локальный Plotly, локальный Three.js и локальные ассеты.

## Страницы

- `docs/index.html` — главная: рамка платформы, управленческая логика и переходы в разделы.
- `docs/skr.html` — `Рождаемость`: Россия / федеральный округ / субъект РФ, помесячный факт и прогноз СКР до 2050, целевая траектория, краткий и подробный режимы, drag-управление лаг-зоной на графике.
- `docs/settlement.html` — `Расселение`: расселение и ИЖС, рост малоэтажного расселения, локальный прогноз городского/сельского СКР и численности.
- `docs/infrastructure.html` — `Инфраструктура`: готовность поселений к малоэтажному семейному расселению, локальная canvas-карта, расстояния до инфраструктурных слоёв, рейтинг субъектов и паспорт поселения.
- `docs/estate.html` — `Свой дом`: 3D-конструктор многопоколенного дома на локальном Three.js, расчёт площади и стоимости.
- `docs/capital.html` — `Маткапитал`: сценарная модель реформы семейного капитала, зарплатный эквивалент 2007 года, подход по стоимости комфортного жилья и бюджетные обязательства.
- `docs/mortgage.html` — `Ипотека`: аннуитетный расчёт, льготная и рыночная части кредита, бюджетная субсидия.
- `docs/payments.html` — `Выплаты`: сценарий ежемесячных выплат, охват матерей, дополнительные рождения и цена потенциального рождения.
- `docs/family.html` — `Браки`: браки, разводы, коэффициенты на 1000 населения, индекс разводимости, локальная SVG-картограмма субъектов и сценарная оценка семейной устойчивости.
- `docs/abortions.html` — `Аборты`: мониторинг прерываний беременности, показатели на 1000 женщин и на 100 родов, локальная SVG-картограмма субъектов и сценарная оценка сохранённых рождений.

В навигации нет пункта `Главная`; логотип и название сайта на всех страницах ведут на `index.html`.

## Локальный запуск

```bash
python -m http.server 8000 --directory docs
```

Открыть: `http://127.0.0.1:8000/index.html`.

## Данные

Авторские файлы прогноза загружены в `docs/data/author_forecast_source/` и преобразованы в локальные runtime-слои:

- `docs/data/author_tfr_forecast_2050.json`
- `docs/data/skr_monthly_forecast_2050.json`
- `docs/data/author_population_forecast_2050.json`
- `docs/data/settlement_tfr_forecast_2050.json`
- `docs/data/forecast_join_audit.json`
- `docs/data/forecast_join_audit.csv`
- `docs/data/territory_levels.json`
- `docs/data/matcapital_inputs.json`
- `docs/data/infrastructure/regions_summary.json`
- `docs/data/family_dashboard.json`
- `docs/data/abortions_dashboard.json`
- `docs/data/vciom_reproductive_intentions_2025.json`

В runtime нет запросов к GitHub Raw, CDN, удалённым API, внешним шрифтам или внешним изображениям.

## Проверки

```bash
python scripts/check_json.py
python scripts/check_no_external_runtime.py
python scripts/check_russian_ui.py
python scripts/check_data_locality.py
python scripts/check_nav_numbering.py
python scripts/check_settlement_forecast.py
python scripts/check_matcapital_module.py
python scripts/check_infrastructure_module.py
python scripts/check_family_module.py
python scripts/check_abortions_module.py
"C:\Program Files\Git\bin\bash.exe" scripts/check_js_syntax.sh
npm run test:smoke
```

Playwright открывает главную и все девять разделов, блокирует внешние запросы, делает desktop/mobile-скриншоты, проходит ключевые интеракции и full-page visual QA для `index.html`, `infrastructure.html`, `family.html`, `abortions.html` и ВЦИОМ-блока на `skr.html`. СКР проверяется на `skr.html` с drag-лаг-зоной, а не как старая страница на `index.html`.

## Релизный архив

```bash
python scripts/make_release_zip.py
```

Скрипт создаёт архив `tsargrad_demographic_platform_selfcontained_release_github_pages.zip`.
