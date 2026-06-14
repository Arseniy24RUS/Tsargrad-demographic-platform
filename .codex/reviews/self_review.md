# Self Review: home, family, abortions integration

## Что изменено

- Главная страница перенесена на `docs/index.html`.
- СКР перенесён на `docs/skr.html` без отката `policyLagDragBand` и помесячного прогноза.
- Добавлены `docs/family.html`, `docs/abortions.html`, локальные данные, CSS и JS из патча.
- Добавлены runtime-контракты `FamilyModule.getState()`, `AbortionsModule.getState()` и `VciomFertilityBlock.getState()`.
- Картограммы `Семья` и `Аборты` переведены на локальные SVG из GeoJSON; контракт `getState()` отдаёт `mapEngine`, число SVG-путей, число значений и домен шкалы.
- Hero KPI на страницах `Семья` и `Аборты` переведены в горизонтальные плашки; крупные числа проверяются на отсутствие переноса.
- Федеральное число разводов за 2010 год в модуле `Семья` исправлено на `639 321` с пересчётом производных показателей в JSON и SQLite.
- Навигация обновлена на 9 страницах без пункта `Главная`.

## Проверки

- Статические проверки и `audit_all.py` пройдены.
- `npm run test:smoke` пройден: 55 тестов.
- Full-page Playwright QA для всех секций `index.html`, `family.html`, `abortions.html` и мобильного ВЦИОМ-блока на `skr.html` пройден.
- Targeted Playwright QA по `family.html` и `abortions.html` на desktop/wide/mobile подтверждает горизонтальные KPI и корректную точку разводов РФ за 2010 год.

## Примечания

- Browser plugin в этой сессии недоступен, поэтому использован обычный Playwright.
- Патч-инсталлятор и `home-link-normalizer.js` не переносились.
