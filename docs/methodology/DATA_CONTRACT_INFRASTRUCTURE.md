# Контракт данных модуля «Инфраструктура»

## Файл `docs/data/infrastructure/regions_summary.json`

Содержит федеральную, окружную и региональную сводку.

```json
{
  "metadata": {"runtime_external_fetch": false},
  "country": {"population": 147000000, "settlements": 155000, "avg_score": 62.1},
  "federal_districts": [{"name": "...", "population": 0, "settlements": 0, "avg_score": 0}],
  "regions": [{"subject": "...", "region_slug": "...", "population": 0, "settlements": 0, "avg_score": 0}]
}
```

## Файлы `docs/data/infrastructure/by_region/<region_slug>.json`

Файлы разделены по субъектам РФ, чтобы не загружать все 155 тыс. поселений сразу.

Компактные поля поселения:

| Поле | Смысл |
|---|---|
| `i` | идентификатор поселения |
| `n` | название |
| `t` | тип населённого пункта |
| `k` | городской / сельский тип |
| `m` | муниципальное образование |
| `rs` | сельское поселение |
| `lat`, `lon` | координаты |
| `p`, `p10` | население 2020 и 2010 годов |
| `ch` | число детей 2020 года |
| `g` | прирост населения 2010–2020, % |
| `cs` | доля детей, % |
| `s` | общий индекс готовности |
| `e` | инженерная готовность |
| `so` | социальная доступность |
| `dm` | демографическая значимость |
| `q` | показатель достоверности |
| `cc`, `cl` | код и название класса готовности |
| `md` | главный дефицит |
| `c` | массив компонентных баллов |
| `dk` | массив расстояний в километрах до инфраструктурных слоёв |

Порядок массива `c`:

`roads, power, gas, water, sewer, digital, education, medical, services, demographic`.

Порядок массива `dk`:

`roads, power, gas, water, sewer, digital, education, medical, services`.

## Файл `infrastructure_layers_catalog.json`

Содержит каталог слоёв, признаки открытых геоданных и статус достоверности.
