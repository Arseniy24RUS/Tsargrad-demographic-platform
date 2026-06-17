# Self Review

Дата: 2026-06-16.

## Объём изменений

- Проведена системная responsive-полировка 10 runtime-страниц платформы.
- Добавлен общий responsive-контракт в CSS: типографика, карточки, KPI, формы, таблицы, графики, sticky header и bottom safe-area.
- Главная страница получила тот же мобильный drawer, что остальные страницы.
- Header унифицирован: во всех видимых шапках используется `Россия 2050` и `демографическая платформа`.
- Устранены одиночные буквенные переносы и клиппинг русских заголовков/контролов, включая H1 главной и выплат, hero/KPI браков и абортов, карточки инфраструктуры, маткапитала и `Свой дом`.
- Для `Свой дом` мобильные 3D-контролы не закрывают модель; длинный toggle про прародителей не клипуется.
- Для `Рождаемости` исправлен подробный режим: RPN-графики больше не накладывают легенду на заголовки, а компактные подписи осей включаются на tablet/mobile и в узких карточках.
- Добавлен `npm run test:responsive`, `tests/responsive.spec.js` и generator contact sheets.

## QA

- QA Automation Reviewer: блокеров не нашёл; предложенные усиления частично внедрены в responsive spec.
- Visual Reviewer: нашёл sticky-header overlap в section screenshots; исправлено offset-aware capture и `scroll-margin-top`.
- Product/Russian UI Reviewer: нашёл одиночное `и` и клиппинг toggle на `Свой дом`; исправлено и покрыто assertions.
- Release Reviewer: подтвердил необходимость свежих full PlaywrightQA, review docs и release archive.

## Результаты проверок

- `python scripts/check_json.py` — OK.
- `python scripts/check_no_external_runtime.py` — OK.
- `python scripts/check_russian_ui.py` — OK.
- `python scripts/check_data_locality.py` — OK.
- `python scripts/check_nav_numbering.py` — OK.
- `python scripts/check_settlement_forecast.py` — OK.
- `python scripts/check_infrastructure_module.py` — OK.
- `python scripts/check_family_module.py` — OK.
- `python scripts/check_abortions_module.py` — OK.
- `C:\Program Files\Git\bin\bash.exe scripts/check_js_syntax.sh` — OK.
- `npm run test:responsive` — 20/20 passed.
- `npx playwright test tests/responsive.spec.js -g "Рождаемость"` — 2/2 passed.
- `npm run test:smoke` — 63/63 passed.

## Остаточный риск

- Playwright contact sheets хранятся как QA artifact в `artifacts/responsive/`, но не входят в runtime.
- В рабочем дереве есть посторонние локальные изменения `.gitignore`, `data_pipeline/infrastructure/*`, `.codex/config.toml`; они не должны попадать в stage/commit этой задачи.

---

Дата: 2026-06-17.

## Объём изменений

- Применён патч `tsargrad_settlement_article_scenarios_patch.zip` для страницы `Расселение` в режиме совместимости с платформой.
- Новый активный слой `settlement_article_scenarios.js/css` подключён вместо старого `settlement_population_fix`; старый слой не публикуется как runtime-исправление.
- Данные `settlement_article_scenarios_russia.json/csv` адаптированы до горизонта 2050 включительно; `2100` не попадает в runtime/UI.
- Для России график численности показывает три сценария статьи: урбанизационный сценарий, фиксация и ИЖС-сценарий. Все три линии снижаются к 2050, а ИЖС-сценарий показывает уменьшение масштаба депопуляции относительно урбанизационного сценария.
- Переключатель миграционного сценария отсутствует; `window.SettlementModule.getState().populationScenario` сохранён со значением `noMIG`.
- Для ФО и субъектов сохранено поведение базового модуля `Расселение`.
- Чужие изменения в `.gitignore`, `data_pipeline/infrastructure/*`, `payments*`, `skr.html` и `.codex/config.toml` не должны попадать в stage/commit этой задачи.

## QA

- `scripts/check_settlement_article_scenarios.py` проверяет подключение assets, отсутствие `2100`, снижение всех трёх сценариев к 2050 и преимущество ИЖС-сценария над урбанизационным сценарием к 2050.
- Playwright smoke проверяет отсутствие `populationScenarioBtn`, публичный контракт `populationScenario === "noMIG"`, три сценарные линии в `populationTraceChart`, снижение всех трёх линий и работу выбора `фиксация`/`ИЖС-сценарий`.
- Rendered QA desktop/mobile в in-app Browser: новых console error/warn нет, `populationScenarioBtn` отсутствует, график численности показывает три сценария и таблицу до 2050, `фиксация` и `ИЖС-сценарий` меняют активный KPI, выбор Сибирского ФО не ломает базовые графики.

## Результаты проверок

- `python scripts/check_settlement_article_scenarios.py` — OK.
- `python scripts/check_json.py` — OK.
- `python scripts/check_no_external_runtime.py` — OK.
- `python scripts/check_russian_ui.py` — OK.
- `python scripts/check_data_locality.py` — OK.
- `python scripts/check_nav_numbering.py` — OK.
- `python scripts/check_settlement_forecast.py` — OK.
- `C:\Program Files\Git\bin\bash.exe scripts/check_js_syntax.sh` — OK.
- `python scripts/audit_all.py` — OK.
- `npx playwright test tests/smoke.spec.js tests/visual-qa.spec.js -g "Расселение"` — 3/3 passed.
- `npm run test:smoke` — 64/64 passed.

## Остаточный риск

- GitHub Pages может отдать старый кэш сразу после `git push origin main`; опубликованную страницу нужно проверить с cache-busting query после пуша.
- Release zip, README, DATA_MANIFEST, THIRD_PARTY_NOTICES и RELEASE_CHECKLIST не обновлялись по согласованному точечному объёму патча.

---

Дата: 2026-06-17.

## Объём изменений

- На странице `Расселение` слой `settlement_article_scenarios.js` переведён с жёстких линий на управляемую модель, калиброванную по трём рядам статьи.
- По умолчанию выбран `ИЖС-сценарий`; его пресет воспроизводит исходный ряд статьи, включая снижение численности к 2050 году и преимущество над урбанизационной траекторией примерно на 0,34 млн человек.
- Ползунок `delta2050` снова активен и задаёт отклонение доли сельской и пригородной среды к 2050 году от режима фиксации; график доли, график численности, KPI и таблица пересчитываются при вводе.
- График доли больше не называется жёсткими сценариями: он показывает факт, урбанизационную траекторию и выбранные настройки пользователя.
- График численности для России показывает факт, урбанизационную траекторию и выбранный сценарий, а не три фиксированные линии одновременно.
- Для ФО и субъектов сохранено поведение базовой локальной модели; `window.SettlementModule.getState().populationScenario` остаётся `noMIG`.

## QA

- `scripts/check_settlement_article_scenarios.py` расширен: проверяет отсутствие `2100`, отсутствие старого UI жёстких сценариев, калибровочные значения пресетов и интерполяцию ручного ползунка.
- Playwright smoke и visual QA обновлены под новую модель: дефолтный ИЖС, фиксация, ручной ползунок, отсутствие миграционного переключателя и сохранение регионального режима.

## Остаточный риск

- Модель является калиброванной сценарной оценкой, а не компонентным демографическим прогнозом. Для ручных значений между якорями используется линейная интерполяция по годам.
