# Responsive QA Review

Дата: 2026-06-16.

## Что проверено

- Добавлен обязательный релизный gate `npm run test:responsive`.
- Матрица покрывает 10 runtime-страниц: `index.html`, `skr.html`, `settlement.html`, `infrastructure.html`, `estate.html`, `capital.html`, `mortgage.html`, `payments.html`, `family.html`, `abortions.html`.
- Core viewport: `320x568`, `360x740`, `390x844`, `412x915`, `430x932`, `768x1024`, `834x1194`, `1024x768`, `1180x820`, `1366x768`, `1440x1000`, `1920x1080`.
- Breakpoint sweep: `379/380`, `639/640`, `679/680`, `699/700`, `719/720`, `759/760`, `899/900`, `1099/1100`, `1259/1260`.
- Для каждого core viewport сохраняются first viewport, full-page, section screenshots и mobile menu open state.
- Contact sheets пересобираются командой `python scripts/make_responsive_contact_sheets.py` в `artifacts/responsive/contact-sheets/`.

## Gate

`tests/responsive.spec.js` проверяет:

- отсутствие горизонтального overflow;
- отсутствие клиппинга у `h1/h2/h3`, KPI, карточек, кнопок, select, pills, toggle-текста и ключевых карточек;
- запрет одиночных русских обломков в заголовках;
- непрозрачность sticky header и корректный offset для section screenshots;
- мобильное меню без видимого слова `Меню`, с `aria-expanded`, видимыми ссылками и open-state screenshot;
- единый header contract: `Россия 2050` + `демографическая платформа`;
- подробный режим `skr.html`: раскрываются секции РПН, повторно проверяются Plotly-оси и легенды, сохраняются detail screenshots;
- table overflow только внутри wrappers;
- Plotly-графики без пустых контейнеров и крупных label-overlap;
- canvas/3D элементы имеют стабильные размеры и не перекрываются мобильными overlay-контролами.

## Внешнее QA-ревью

- QA Automation Reviewer: блокеров не нашёл; предложил усилить sticky/header, nested clipping и mobile drawer assertions.
- Visual Reviewer: нашёл перекрытие section screenshots sticky header; исправлено через `scroll-margin-top`, instant offset-scroll в тесте и новый assertion.
- Product/Russian UI Reviewer: нашёл одиночное `и` в H1 главной/выплат и клиппинг `Отдельный дом для прародителей`; исправлено неразрывными связками, page-specific H1 rules, раскладкой `estate-site-card` и проверкой `.toggle-row span`.
- Release Reviewer: подтвердил необходимость обновить reviews/checklist, повторить full PlaywrightQA и собрать архив перед push.

## Итог

- `npm run test:responsive` — 20/20 passed, contact sheets пересобраны.
- `npx playwright test tests/responsive.spec.js -g "Рождаемость"` — 2/2 passed; проверен подробный режим и устранены перекрытия RPN-легенд/осей.
- `npm run test:smoke` — 63/63 passed.
- Известных responsive-блокеров после финального прогона нет.
