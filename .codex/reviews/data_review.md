# Data Review

Авторские исходники загружены локально в `docs/data/author_forecast_source/`:

- `TFR_Russia_subjects_ML_GP_UCM_tidy.csv`;
- `POP_wide_male_withMIG.xlsx`;
- `POP_wide_female_withMIG.xlsx`;
- `POP_wide_male_noMIG.xlsx`;
- `POP_wide_female_noMIG.xlsx`.

ETL `scripts/build_author_forecasts.py` создаёт:

- `author_tfr_forecast_2050.json`;
- `author_population_forecast_2050.json`;
- `forecast_join_audit.json`;
- `forecast_join_audit.csv`;
- `territory_levels.json`.

Все 96 территориальных рядов сопоставлены. Runtime JSON содержит `runtime_external_fetch:false` и горизонт 2050.

Для страницы `Расселение` добавлен отдельный локальный прогноз:

- `scripts/build_settlement_tfr_forecasts.py` строит прогноз общего, городского и сельского СКР по историческим рядам `settlement_data.json`;
- метод — локальный ансамбль гауссова процесса и структурного тренда;
- общая линия СКР согласована с локальным авторским прогнозом страницы `СКР`;
- городские и сельские ряды откалиброваны так, что при базовой доле среды их взвешенная сумма совпадает с общей линией;
- выход `settlement_tfr_forecast_2050.json` содержит 96 территорий, годы 2026–2050, `runtime_external_fetch:false`;
- `scripts/check_settlement_forecast.py` подтверждает горизонт, отсутствие нечисловых значений и калибровочную ошибку меньше 0,001.
