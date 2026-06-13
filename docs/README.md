# Россия 2050

Это публикуемая директория платформы. Её можно открыть через локальный сервер или использовать как источник GitHub Pages.

```bash
python -m http.server 8000 --directory docs
```

Страницы:

- `index.html` — `СКР`
- `settlement.html` — `Расселение`
- `estate.html` — `Усадьба`
- `capital.html` — `Маткапитал`
- `mortgage.html` — `Ипотека`
- `payments.html` — `Выплаты`

Все runtime-данные лежат в `data/`, библиотеки — в `assets/vendor/`, изображения и стили — в `assets/`. Внешние загрузки при открытии страниц не используются.
