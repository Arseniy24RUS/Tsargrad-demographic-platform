# Third Party Notices

Платформа хранит runtime-библиотеки локально в `docs/assets/vendor/`.

## Plotly.js

- Файл: `docs/assets/vendor/plotly/plotly.min.js`
- Версия: 3.3.1
- Лицензия: MIT
- Назначение: графики на страницах СКР, расселения, усадьбы, маткапитала, ипотеки и выплат.

## Three.js

- Файлы: `docs/assets/vendor/three/three.module.js`, `docs/assets/vendor/three/OrbitControls.js`
- Версия: r160
- Лицензия: MIT
- Назначение: процедурная трёхмерная сцена усадьбы, проектные размерные линии на земле, линия высоты дома и управление камерой. Внешние 3D-модели и удалённые текстуры не используются.

## Node / Playwright

`@playwright/test` используется только для разработки и QA. В runtime платформы Node и Playwright не загружаются.

## Маткапитал

Страница `Маткапитал` использует уже локально поставляемый Plotly из `docs/assets/vendor/plotly/plotly.min.js`; новых внешних runtime-библиотек и сетевых запросов модуль не добавляет.
