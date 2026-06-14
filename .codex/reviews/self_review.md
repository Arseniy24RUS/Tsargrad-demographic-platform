# Self Review: home, family, abortions integration

## Что изменено

- Главная страница перенесена на `docs/index.html`.
- СКР перенесён на `docs/skr.html` без отката `policyLagDragBand` и помесячного прогноза.
- Добавлены `docs/family.html`, `docs/abortions.html`, локальные данные, CSS и JS из патча.
- Добавлены runtime-контракты `FamilyModule.getState()`, `AbortionsModule.getState()` и `VciomFertilityBlock.getState()`.
- Для новых Plotly-картограмм добавлен локальный `docs/assets/vendor/plotly/world_110m.json`, чтобы исключить запросы к CDN.
- Навигация обновлена на 9 страницах без пункта `Главная`.

## Проверки

- Статические проверки и `audit_all.py` пройдены.
- `npm run test:smoke` пройден: 42 теста.
- Targeted Playwright QA для новых страниц и СКР пройден.

## Примечания

- Browser plugin в этой сессии недоступен, поэтому использован обычный Playwright.
- Патч-инсталлятор и `home-link-normalizer.js` не переносились.
