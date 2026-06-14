# Self-review: СКР drag-управление и помесячный прогноз

## Что изменено

- Убрана отдельная золотая ручка `запуск мер`; управление стартом мер перенесено на draggable лаг-зону между двумя пунктирными границами.
- Добавлен локальный помесячный прогноз `docs/data/skr_monthly_forecast_2050.json`, построенный из `tfr_data.json` и `author_tfr_forecast_2050.json`.
- График СКР теперь использует месячный ряд: прогноз начинается сразу после факта, а требуемая траектория стартует в месяце начала эффекта.
- `SkrModule.getState()` расширен проверяемыми полями: `interactionMode`, `lastObservedMonth`, `forecastStartMonth`, `forecastEndMonth`, `forecastMonthsAreContinuous`, `targetTrajectoryStartMonth`.
- Smoke и visual Playwright QA обновлены под новый lag-band interaction.

## Проверки

- `python scripts/check_json.py` — пройдено.
- `python scripts/check_no_external_runtime.py` — пройдено.
- `python scripts/check_russian_ui.py` — пройдено.
- `bash scripts/check_js_syntax.sh` — не запустился в среде из-за отсутствия `/bin/bash`.
- Fallback `node --check` по `docs/assets/js/*.js` и `tests/*.js` — пройдено.
- `npm run test:smoke` — 30 тестов пройдено.
- `python scripts/check_data_locality.py` — пройдено.
- `python scripts/check_nav_numbering.py` — пройдено.
- Ручной Playwright QA `index.html`: лаг-зона перетаскивается к `2030-01`, эффект становится `2030-10`, консоль без ошибок, внешних запросов нет.

## Ограничения

- Browser plugin в этой сессии не был доступен, поэтому визуальная проверка выполнена обычным Playwright.
- Скриншоты ручной проверки сохранены во временной папке пользователя, не в репозитории.
