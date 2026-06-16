# Манифест данных

Все runtime-данные находятся в `docs/data/`. Горизонт прогнозных слоёв — 2050 год включительно.

## Авторский прогноз

- `author_forecast_source/TFR_Russia_subjects_ML_GP_UCM_tidy.csv` — локальная копия исходного файла СКР из авторского GitHub-репозитория.
- `author_forecast_source/POP_wide_male_noMIG.xlsx` — локальная копия исходного файла численности, мужчины, без миграции.
- `author_forecast_source/POP_wide_female_noMIG.xlsx` — локальная копия исходного файла численности, женщины, без миграции.
- `author_forecast_source/POP_wide_male_withMIG.xlsx` — локальная копия исходного файла численности, мужчины, с миграцией.
- `author_forecast_source/POP_wide_female_withMIG.xlsx` — локальная копия исходного файла численности, женщины, с миграцией.
- `author_tfr_forecast_2050.json` — runtime-ряд СКР по территориям, `runtime_external_fetch:false`.
- `skr_monthly_forecast_2050.json` — помесячный runtime-прогноз СКР до `2050-12`, построенный из локального авторского годового прогноза и последнего фактического месяца, `runtime_external_fetch:false`.
- `author_population_forecast_2050.json` — runtime-ряд численности по сценариям `noMIG` и `withMIG`, `runtime_external_fetch:false`.
- `forecast_join_audit.json` и `forecast_join_audit.csv` — аудит сопоставления названий территорий.
- `territory_levels.json` — классификация территорий для режимов Россия / федеральный округ / субъект РФ.

ETL: `scripts/build_author_forecasts.py`, `scripts/build_skr_monthly_forecast.py`.

## Прогноз расселения

- `settlement_tfr_forecast_2050.json` — runtime-прогноз общего, городского и сельского СКР до 2050 года для страницы `Расселение`, `runtime_external_fetch:false`.
- Метод: локальный ансамбль гауссова процесса и структурного тренда; общая линия согласована с авторским прогнозом страницы `СКР`, город/село восстанавливаются через положительную премию сельской/пригородной среды и откалиброваны к общей линии при базовой доле среды.

ETL: `scripts/build_settlement_tfr_forecasts.py`.

## Инфраструктура

- `infrastructure/regions_summary.json` — сводка страны, федеральных округов и субъектов для страницы `Инфраструктура`, `runtime_external_fetch:false`.
- `infrastructure/by_region/*.json` — 85 региональных файлов с 155 741 поселением, координатами, населением, компонентами индекса, классом готовности и расстояниями до инфраструктурных слоёв.
- `infrastructure/infrastructure_subjects.geojson` — локальная геометрия субъектов для canvas-картограммы.
- `infrastructure/infrastructure_layers_catalog.json` — справочник инфраструктурных слоёв и методических ограничений, `runtime_external_fetch:false`.
- `infrastructure/infrastructure_regions_summary.csv` и `infrastructure/infrastructure_data_manifest.json` — воспроизводимая сводка и паспорт набора данных.

ETL: `data_pipeline/infrastructure/02_extract_osm_layers.py` извлекает признаки из локального `russia-latest.osm.pbf`, `data_pipeline/infrastructure/03_compute_distances.py` пересчитывает расстояния и runtime JSON. PBF и промежуточные CSV в runtime не входят.

## Основные runtime-файлы

- `tfr_data.json` — месячные ряды СКР, метаданные целей и справочник территорий.
- `skr_monthly_forecast_2050.json` — месячный прогноз СКР для основного графика страницы `СКР`; нужен, чтобы прогноз и требуемая траектория шли без годовых разрывов.
- `vciom_reproductive_intentions_2025.json` — локальный социологический слой ВЦИОМ-2025 для страницы `СКР`, `runtime_external_fetch:false`.
- `subjects.geojson` — локальная геометрия субъектов для SVG-карты СКР.
- `settlement_data.json` — ряды расселения, городского и сельского СКР.
- `settlement_tfr_forecast_2050.json` — модельный прогноз городского/сельского СКР и базовой общей траектории для сценария расселения.
- `infrastructure/regions_summary.json` и `infrastructure/by_region/*.json` — локальный расчёт инфраструктурной готовности поселений.
- `estate_inputs.json` — параметры усадьбы: состав семьи, этажность, нормы площади, стоимость строительства, участок, отступы, параметры пилота и флаг отдельного дома для прародителей.
- `matcapital_inputs.json` — сценарные параметры Маткапитала: действующие суммы сертификатов, эквивалент 2007 года в средних зарплатах, подход по стоимости комфортного жилья, охват, использование сертификатов и конверсия в потенциальное рождение. Метаданные: `runtime_external_fetch:false`, горизонт 2050.
- `mortgage_inputs.json` — параметры ипотеки.
- `payments_inputs.json` — параметры выплат.
- `family_dashboard.json` — показатели браков, разводов, коэффициентов на 1000 населения и индекса разводимости для страницы `Браки`, `runtime_external_fetch:false`.
- `family_subjects.geojson` — локальная геометрия субъектов для SVG-картограммы страницы `Браки`.
- `family.sqlite`, `family_summary.csv`, `family_join_audit.json`, `family_join_audit.csv`, `family_data_manifest.json` — воспроизводимые локальные слои семейного модуля.
- `abortions_dashboard.json` — показатели прерываний беременности, расчёт на 1000 женщин 15–49 лет и на 100 родов для страницы `Аборты`, `runtime_external_fetch:false`; федеральный 2018 год восстановлен значением `567 183`, региональные строки 2018 года остаются пустыми.
- `abortions_subjects.geojson` — локальная геометрия субъектов для SVG-картограммы страницы `Аборты`.
- `abortions.sqlite`, `abortions_summary.csv`, `abortions_join_audit.json`, `abortions_join_audit.csv`, `abortions_data_manifest.json` — воспроизводимые локальные слои модуля прерываний беременности.
- `rpn2022_fertility_housing_dashboard.json` — федеральный слой РПН-2022.
- `rpn_regional_intentions_2012_2017.json` — региональный слой РПН-2012/2017.
- `sources.json` — описание источников для документации; не используется как runtime-зависимость от сети.

## CSV-слои

CSV-файлы РПН и аудита оставлены как локальные воспроизводимые выгрузки. В пользовательском интерфейсе выгрузка называется `Скачать таблицу`.

## Маткапитал

Runtime-файл `matcapital_inputs.json` не содержит внешних URL. Идентификаторы источников `sfr_current_2026`, `sfr_history`, `tsargrad_presentation` и `rpn_2022_questionnaire` раскрыты в `sources.json`, где допустимо хранить справочные ссылки для документации.

Модуль строит четыре локальных Plotly-графика без внешних запросов: формульную схему аргументов увеличения, выплаты по очередности рождения с итоговыми плашками `Итого за 4 детей`, покрытие стоимости жилья и бюджетные обязательства.

## QA-артефакты

Responsive screenshots и contact sheets создаются только в разработческой директории `artifacts/responsive/` командой `npm run test:responsive`. Они не являются runtime-данными, не загружаются страницами из `docs/` и не входят в контракт локальности данных.
