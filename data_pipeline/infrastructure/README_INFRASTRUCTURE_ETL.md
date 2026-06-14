# ETL инфраструктурного модуля

Этот каталог предназначен для воспроизводимой офлайн-подготовки данных модуля «Инфраструктура».

## Источники

1. `SettlementsAllData.csv` — координаты, население, типы и муниципальная принадлежность населённых пунктов.
2. Локальная PBF-выгрузка OpenStreetMap по России или федеральным округам.
3. Официальные источники по газификации, связи, воде и водоотведению — по мере доступности.

## Рекомендуемый порядок

```bash
python data_pipeline/infrastructure/01_prepare_settlements.py --input raw/SettlementsAllData.csv --output docs/data/infrastructure
python data_pipeline/infrastructure/02_extract_osm_layers.py --pbf raw/osm/russia-latest.osm.pbf --output artifacts/infrastructure_osm
python data_pipeline/infrastructure/03_compute_distances.py --settlements docs/data/infrastructure --layers artifacts/infrastructure_osm --output docs/data/infrastructure
```

Скрипт `01_prepare_settlements.py` фиксирует исходную подготовку слоя поселений из уже приложенных данных. Скрипт `02` извлекает компактные CSV с признаками инфраструктуры через Python-модуль `osmium`. Скрипт `03` строит деревья ближайших объектов, считает расстояния до поселений и пересобирает runtime JSON.

## Важное правило

Не использовать Overpass API или OSM API из браузера. Для всей России нужна офлайн-обработка PBF-выгрузок и публикация компактных локальных JSON.
