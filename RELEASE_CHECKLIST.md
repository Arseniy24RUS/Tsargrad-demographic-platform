# Release Checklist

## Структура страниц

- [x] Главная страница первого открытия — `docs/index.html`.
- [x] Страница `СКР` сохранена отдельно как `docs/skr.html`.
- [x] Навигация не содержит пункт `Главная`.
- [x] Логотип и название сайта на всех страницах ведут на `index.html`.
- [x] Пункты навигации без числовых префиксов: `СКР`, `Расселение`, `Усадьба`, `Маткапитал`, `Ипотека`, `Выплаты`, `Семья`, `Аборты`.
- [x] Новые страницы из патча интегрированы выборочно: `family.html`, `abortions.html`; `home-link-normalizer.js` и установщик патча не добавлены.

## Защита СКР

- [x] Новый график СКР остался на текущем `docs/assets/js/skr.js`.
- [x] `policyStartDragHandle` отсутствует.
- [x] `policyLagDragBand` остаётся рабочим drag-управлением лаг-зоной.
- [x] Помесячный прогноз `skr_monthly_forecast_2050.json` используется без разрыва после факта.
- [x] Блок ВЦИОМ-2025 добавлен в `skr.html` через явный контейнер `vciom2025Mount`.

## Данные и runtime

- [x] Все новые данные лежат локально в `docs/data/`.
- [x] `family_dashboard.json`, `abortions_dashboard.json` и `vciom_reproductive_intentions_2025.json` имеют `runtime_external_fetch:false`.
- [x] Plotly подключается локально из `assets/vendor/plotly/plotly.min.js`.
- [x] В runtime нет CDN, GitHub Raw, удалённых API, удалённых шрифтов и внешних изображений.

## Документация

- [x] `README.md` обновлён под главную, `skr.html`, `family.html`, `abortions.html`.
- [x] `docs/README.md` обновлён под структуру GitHub Pages.
- [x] `docs/METHODOLOGY.md` обновлён под ВЦИОМ-2025, `Семья`, `Аборты` и `skr.html`.
- [x] `docs/DATA_MANIFEST.md` и `docs/DATA_CONTRACTS.md` описывают новые runtime-слои.
- [x] `docs/THIRD_PARTY_NOTICES.md` отражает отсутствие новых runtime-библиотек.

## Проверки перед публикацией

- [x] `python scripts/check_json.py`
- [x] `python scripts/check_no_external_runtime.py`
- [x] `python scripts/check_russian_ui.py`
- [x] `python scripts/check_nav_numbering.py`
- [x] `python scripts/check_matcapital_module.py`
- [x] `python scripts/check_family_module.py`
- [x] `python scripts/check_abortions_module.py`
- [x] `bash scripts/check_js_syntax.sh`
- [x] `npm run test:smoke`
- [x] Targeted Playwright QA для `index.html`, `skr.html`, `family.html`, `abortions.html`
- [x] `python scripts/make_release_zip.py`

## Публикация

- [x] Коммит `Integrate home family abortions patch`.
- [x] Push в `main`.
- [x] GitHub Pages: корень сайта открывает главную, СКР доступен по `/skr.html`.
