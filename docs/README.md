# Россия 2050

Это публикуемая директория платформы для GitHub Pages. Её можно открыть через локальный сервер:

```bash
python -m http.server 8000 --directory docs
```

Страницы:

- `index.html` — главная
- `skr.html` — `Рождаемость`
- `settlement.html` — `Расселение`
- `infrastructure.html` — `Инфраструктура`
- `estate.html` — `Свой дом`
- `capital.html` — `Маткапитал`
- `mortgage.html` — `Ипотека`
- `payments.html` — `Выплаты`
- `family.html` — `Браки`
- `abortions.html` — `Аборты`

Все runtime-данные лежат в `data/`, библиотеки — в `assets/vendor/`, изображения и стили — в `assets/`. Внешние загрузки при открытии страниц не используются.

## PlaywrightQA перед публикацией

Перед загрузкой на GitHub все обновления проверяются реальным PlaywrightQA:

- `npm run test:smoke` — полный smoke/visual suite;
- `npm run test:responsive` — матрица телефонов, планшетов, laptop и desktop для всех 10 страниц.

Responsive-gate сохраняет first/full/section screenshots, mobile drawer open state и contact sheets, а также проверяет отсутствие горизонтального overflow, клиппинга, одиночных русских буквенных переносов, прозрачного sticky header и проблем с нижней безопасной зоной.
