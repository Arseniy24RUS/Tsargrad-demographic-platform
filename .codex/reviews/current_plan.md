# Текущий план: responsive-полировка и PlaywrightQA

Дата: 2026-06-16.

## Цель

Довести все 10 runtime-страниц платформы до устойчивого отображения на телефоне, планшете, laptop и desktop, убрать клиппинг русских заголовков/карточек/контролов и сделать PlaywrightQA обязательным gate перед GitHub.

## Выполнено

- В `docs/assets/css/style.css` добавлен общий responsive-контракт для заголовков, карточек, KPI, форм, таблиц, графиков, sticky header, mobile bottom safe-area и мобильного drawer.
- В `docs/index.html` унифицирована мобильная шапка: кнопка-иконка меню есть на главной, слово `Меню` не выводится.
- На всех страницах подзаголовок бренда в шапке приведён к единому виду: `демографическая платформа`.
- Убраны причины разрезания русских слов: отрицательные letter-spacing для заголовков, `overflow-wrap:anywhere` в hero/KPI-зонах, фиксированные высоты карточек.
- Исправлены проблемные H1/H2 и карточки по скриншотам пользователя: главная, рождаемость, инфраструктура, свой дом, маткапитал, выплаты, браки, аборты.
- Для `Свой дом` мобильные 3D-контролы вынесены под canvas, а длинный toggle `Отдельный дом для прародителей` больше не клипуется на tablet/laptop.
- Добавлен `tests/responsive.spec.js` с полной viewport matrix, breakpoint sweep, screenshot capture, section screenshots, mobile menu state и geometry gate.
- Добавлен `scripts/make_responsive_contact_sheets.py`; `npm run test:responsive` запускает Playwright matrix и собирает contact sheets.
- Для `Рождаемости` в responsive-gate добавлено раскрытие `Подробный вид`; исправлены перекрытия легенд и осей на RPN-графиках подробного режима.
- Внешние QA-субагенты проверили automation, visual, Russian UI и release readiness; найденные дефекты закрыты.

## Финальный статус

- `npm run test:responsive` — 20/20 passed.
- `npm run test:smoke` — 63/63 passed.
- Статические проверки и модульные check scripts зелёные.
- Перед push остаётся: обновить release docs, собрать архив, stage только релизные файлы, исключив посторонние локальные изменения.
