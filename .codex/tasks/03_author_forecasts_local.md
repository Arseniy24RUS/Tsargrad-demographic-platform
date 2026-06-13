# 03. Локальный слой авторских прогнозов

## Цель

Дублировать данные из авторского прогноза в текущем проекте, чтобы runtime не обращался к внешнему репозиторию.

## Источники

- `TFR_Russia_subjects_ML_GP_UCM_tidy.csv`
- `POP_wide_male_withMIG.xlsx`
- `POP_wide_female_withMIG.xlsx`
- `POP_wide_male_noMIG.xlsx`
- `POP_wide_female_noMIG.xlsx`

## Действия

1. Найти/скачать источники во время разработки.
2. Преобразовать данные в компактные JSON до 2050 года.
3. Сопоставить территории с текущими `territory_id`.
4. Создать audit-файлы сопоставления.
5. Удалить все runtime-запросы к внешнему репозиторию.
6. Подключить локальный прогноз на страницах СКР и Расселение.

## Выходы

- `docs/data/author_tfr_forecast_2050.json`
- `docs/data/author_population_forecast_2050.json`
- `docs/data/forecast_join_audit.json`
- `docs/data/forecast_join_audit.csv`

