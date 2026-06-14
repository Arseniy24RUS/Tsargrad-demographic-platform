# Release Checklist

## Структура страниц

- [x] Главная страница первого открытия — `docs/index.html`.
- [x] Страница `СКР` сохранена отдельно как `docs/skr.html`.
- [x] Навигация не содержит пункт `Главная`.
- [x] Логотип и название сайта на всех страницах ведут на `index.html`.
- [x] Пункты навигации без числовых префиксов: `СКР`, `Расселение`, `Инфраструктура`, `Усадьба`, `Маткапитал`, `Ипотека`, `Выплаты`, `Семья`, `Аборты`.
- [x] Новые страницы интегрированы выборочно: `infrastructure.html`, `family.html`, `abortions.html`; установщики патчей и `home-link-normalizer.js` не добавлены.

## Защита СКР

- [x] Новый график СКР остался на текущем `docs/assets/js/skr.js`.
- [x] `policyStartDragHandle` отсутствует.
- [x] `policyLagDragBand` остаётся рабочим drag-управлением лаг-зоной.
- [x] Помесячный прогноз `skr_monthly_forecast_2050.json` используется без разрыва после факта.
- [x] Блок ВЦИОМ-2025 добавлен в `skr.html` через явный контейнер `vciom2025Mount`.

## Данные и runtime

- [x] Все новые данные лежат локально в `docs/data/`.
- [x] `docs/data/infrastructure/` содержит 85 региональных JSON, 155 741 поселение и пересчитанные расстояния до инфраструктурных слоёв.
- [x] Инфраструктурные расстояния рассчитаны офлайн из локального `russia-latest.osm.pbf`; PBF и промежуточные CSV не входят в runtime.
- [x] `family_dashboard.json`, `abortions_dashboard.json` и `vciom_reproductive_intentions_2025.json` имеют `runtime_external_fetch:false`.
- [x] Федеральный ряд `Семья` за 2010 год сверен: `639 321` развод, индекс разводимости около `52,6162`.
- [x] Картограммы `Семья` и `Аборты` строятся как локальные SVG из GeoJSON, без внешнего гео-запроса.
- [x] Plotly подключается локально из `assets/vendor/plotly/plotly.min.js`.
- [x] В runtime нет CDN, GitHub Raw, удалённых API, удалённых шрифтов и внешних изображений.

## Документация

- [x] `README.md` обновлён под главную, `skr.html`, `infrastructure.html`, `family.html`, `abortions.html`.
- [x] `docs/README.md` обновлён под структуру GitHub Pages.
- [x] `docs/METHODOLOGY.md` обновлён под ВЦИОМ-2025, `Инфраструктуру`, `Семья`, `Аборты` и `skr.html`.
- [x] `docs/DATA_MANIFEST.md` и `docs/DATA_CONTRACTS.md` описывают новые runtime-слои.
- [x] `docs/THIRD_PARTY_NOTICES.md` отражает отсутствие новых runtime-библиотек.

## Проверки перед публикацией

- [x] `python scripts/check_json.py`
- [x] `python scripts/check_no_external_runtime.py`
- [x] `python scripts/check_russian_ui.py`
- [x] `python scripts/check_nav_numbering.py`
- [x] `python scripts/check_matcapital_module.py`
- [x] `python scripts/check_infrastructure_module.py`
- [x] `python scripts/check_family_module.py`
- [x] `python scripts/check_abortions_module.py`
- [x] `bash scripts/check_js_syntax.sh`
- [x] `npm run test:smoke`
- [x] Playwright проверяет, что hero KPI `Семья` и `Аборты` не дробят крупные числа на строки.
- [x] Full-page Playwright visual QA для всех секций `index.html`, `infrastructure.html`, `family.html`, `abortions.html` и ВЦИОМ-блока на `skr.html`
- [x] `python scripts/make_release_zip.py`

## Публикация

- [x] Коммит `Integrate home family abortions patch`.
- [x] Коммит `Fix full-page visual QA for new pages`.
- [x] Коммит `Fix family hero KPI layout and 2010 divorce data`.
- [x] Коммит `Integrate infrastructure module`.
- [x] Push в `main`.
- [x] GitHub Pages: корень сайта открывает главную, СКР доступен по `/skr.html`.
