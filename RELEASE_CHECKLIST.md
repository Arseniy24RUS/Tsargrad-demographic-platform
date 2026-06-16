# Release Checklist

## Структура страниц

- [x] Главная страница первого открытия — `docs/index.html`.
- [x] Публичные URL сохранены: `skr.html`, `estate.html`, `family.html`.
- [x] Видимые названия разделов обновлены: `Рождаемость`, `Свой дом`, `Браки`.
- [x] Навигация не содержит пункт `Главная` и числовые префиксы.
- [x] Логотип и название сайта на всех страницах ведут на `index.html`.
- [x] Мобильная верхняя панель сворачивается в боковое меню с затемнением, Escape/click-outside закрытием и `aria-expanded`.

## Рождаемость

- [x] Runtime-модуль `SkrModule` сохранён.
- [x] Блоки `Режим анализа` и `Состав страницы` перенесены над картой.
- [x] Кнопки `с июня 2026`, `с января 2030`, `только Россия` удалены.
- [x] Старт мер определяется автоматически как следующий календарный месяц от даты браузера.
- [x] Ручной сдвиг лаг-зоны на графике сохранён.
- [x] `SkrModule.getState()` отдаёт автостарт и текущее положение лаг-зоны.
- [x] В блоке `Желаемое — ожидаемое — фактическое` пунктир показывает уровень простого воспроизводства `2,15`.

## Графики и расселение

- [x] Для Plotly-графиков отключены drag zoom/select, scroll zoom и modebar; cartesian-оси зафиксированы.
- [x] В `Расселении` добавлена линейка шкалы `Изменение доли` с отметками `-15`, `0`, `+30 п.п.`.
- [x] Горизонт пользовательских графиков и данных остаётся ограничен 2050 годом.

## Инфраструктура

- [x] Runtime-модуль `InfrastructureModule` сохранён и расширен диагностическим состоянием.
- [x] Территории без инфраструктурных данных отображаются серым: ДНР, ЛНР, Запорожская и Херсонская области.
- [x] Крым и Севастополь сопоставляются с локальной инфраструктурной сводкой при наличии данных.
- [x] Заливка картограммы распределена по фактическому диапазону `avg_score`, а не по почти двухцветному порогу.
- [x] Canvas-карта поддерживает tooltip по субъекту и выбор субъекта кликом с обновлением `Параметры карты`.

## Аборты

- [x] Федеральный ряд за 2018 год восстановлен в `abortions_dashboard.json`: `567 183`.
- [x] Федеральный ряд за 2018 год восстановлен в `abortions.sqlite`.
- [x] Производные показатели 2018 года рассчитаны от локальных знаменателей.
- [x] Региональные строки 2018 года оставлены `null`, пока нет сопоставимой региональной выгрузки.
- [x] Ограничение федерального и регионального слоёв описано в интерфейсе, методике и контрактах данных.

## Данные и runtime

- [x] Все runtime-данные лежат локально в `docs/data/`.
- [x] Авторские прогнозы хранятся локально и ограничены 2050 годом.
- [x] `runtime_external_fetch:false` сохранён для локальных dashboard/data файлов, где это применимо.
- [x] Plotly, Three.js и OrbitControls подключаются локально из `docs/assets/vendor/`.
- [x] В runtime нет CDN, GitHub Raw, удалённых API, удалённых шрифтов и внешних изображений.

## Документация

- [x] `README.md` обновлён.
- [x] `docs/README.md` обновлён.
- [x] `docs/METHODOLOGY.md` обновлён.
- [x] `docs/DATA_MANIFEST.md` обновлён.
- [x] `docs/THIRD_PARTY_NOTICES.md` обновлён.
- [x] `.codex/reviews/self_review.md` обновлён.
- [x] `.codex/reviews/final_self_review.md` обновлён.

## Проверки перед публикацией

- [x] `python scripts/check_json.py`
- [x] `python scripts/check_no_external_runtime.py`
- [x] `python scripts/check_russian_ui.py`
- [x] `python scripts/check_data_locality.py`
- [x] `python scripts/check_nav_numbering.py`
- [x] `python scripts/check_settlement_forecast.py`
- [x] `python scripts/check_infrastructure_module.py`
- [x] `python scripts/check_family_module.py`
- [x] `python scripts/check_abortions_module.py`
- [x] `C:\Program Files\Git\bin\bash.exe scripts/check_js_syntax.sh`
- [x] `npx playwright test tests/smoke.spec.js -g "Инфраструктура: карта"`
- [x] `npx playwright test tests/visual-qa.spec.js -g "картограмма занимает"`
- [x] `npm run test:smoke` — 62 теста.
- [x] Browser sanity desktop/mobile для `index.html`, `skr.html`, `settlement.html`, `infrastructure.html`, `estate.html`, `family.html`, `abortions.html`.
- [x] `python scripts/make_release_zip.py`

## Публикация

- [x] Текущий пакет подготовлен для прямого коммита в `main`.
- [x] Посторонние локальные изменения в `.gitignore`, `data_pipeline/infrastructure/` и `.codex/config.toml` не входят в релизный stage.
- [x] GitHub Pages публикует статическую директорию `docs/`.
