# Контракт данных модуля «Семья»

## `docs/data/family_dashboard.json`

```json
{
  "metadata": {
    "title": "Семья: браки, разводы и семейная устойчивость",
    "horizon": "1990–2023",
    "runtime_external_fetch": false
  },
  "indicators": [],
  "territories": [],
  "series": [],
  "latest": [],
  "rankings": {},
  "national": {}
}
```

### Основные показатели в `series.values`

- `marriages_count` — число браков;
- `divorces_count` — число разводов;
- `marriage_rate_per_1000` — число браков на 1000 населения;
- `divorce_rate_per_1000` — число разводов на 1000 населения;
- `divorces_per_100_marriages` — число разводов на 100 браков;
- `marriage_divorce_balance_count` — браки минус разводы, абсолютное значение;
- `marriage_divorce_balance_per_1000` — коэффициент брачности минус коэффициент разводимости;
- `family_stability_index_0_100` — вспомогательный индекс семейной устойчивости.

## `docs/data/family_subjects.geojson`

GeoJSON субъектов РФ с добавленными последними значениями показателей модуля «Семья». Используется только для картограммы субъектов.

## `docs/data/family.sqlite`

SQLite-база содержит таблицы:

- `indicators`;
- `territories`;
- `family_observations`;
- `source_files`;
- представление `v_family_latest`.
