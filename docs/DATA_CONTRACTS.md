# Контракты данных

## `docs/data/author_tfr_forecast_2050.json`

```json
{
  "metadata": {
    "title": "Авторский прогноз СКР субъектов РФ до 2050 года",
    "source_repository": "Arseniy24RUS/Population-Forecast-Dashboard-of-Russia-2100",
    "horizon": 2050,
    "runtime_external_fetch": false
  },
  "series": [
    {
      "territory_id": "terr_rossiyskaya_federatsiya",
      "territory_name": "Российская Федерация",
      "level": "federal",
      "federal_district_id": null,
      "year": 2025,
      "tfr_median": 1.36,
      "tfr_q10": null,
      "tfr_q90": null,
      "status": "наблюдение"
    }
  ]
}
```

## `docs/data/author_population_forecast_2050.json`

```json
{
  "metadata": {
    "title": "Авторский прогноз численности населения до 2050 года",
    "source_repository": "Arseniy24RUS/Population-Forecast-Dashboard-of-Russia-2100",
    "horizon": 2050,
    "runtime_external_fetch": false
  },
  "series": [
    {
      "territory_id": "terr_rossiyskaya_federatsiya",
      "territory_name": "Российская Федерация",
      "level": "federal",
      "federal_district_id": null,
      "scenario": "с миграцией",
      "year": 2025,
      "population_total": 146100000,
      "population_male": 68000000,
      "population_female": 78100000,
      "status": "прогноз"
    }
  ]
}
```

## `docs/data/skr_monthly_forecast_2050.json`

```json
{
  "metadata": {
    "runtime_external_fetch": false,
    "horizon_month": "2050-12",
    "first_forecast_month": "2026-06",
    "source_files": [
      "data/tfr_data.json",
      "data/author_tfr_forecast_2050.json"
    ]
  },
  "series": {
    "terr_rf_bez_novyh_subektov": [
      {
        "date": "2026-06-01",
        "month": "2026-06",
        "mean": 1.36,
        "lo": 1.34,
        "hi": 1.37,
        "source": "локальная помесячная интерполяция авторского прогноза"
      }
    ]
  }
}
```

## `docs/data/territory_levels.json`

```json
{
  "territories": [
    {
      "territory_id": "terr_...",
      "territory_name": "...",
      "level": "federal | federal_district | federal_subject",
      "federal_district_id": "terr_...",
      "map_subject_id": "..."
    }
  ]
}
```

## `docs/data/settlement_tfr_forecast_2050.json`

```json
{
  "metadata": {
    "method": "local_gp_ucm_ensemble",
    "horizon_year": 2050,
    "runtime_external_fetch": false
  },
  "series": {
    "terr_rf_bez_novyh_subektov": [
      {
        "year": 2026,
        "total_tfr": 1.40935,
        "total_q10": 1.319905,
        "total_q90": 1.506571,
        "urban_tfr": 1.374796,
        "urban_q10": 1.308694,
        "urban_q90": 1.4444,
        "rural_tfr": 1.512958,
        "rural_q10": 1.427092,
        "rural_q90": 1.60422,
        "baseline_rural_share": 0.2501,
        "calibration_error": 0.0
      }
    ]
  }
}
```

## `docs/data/matcapital_inputs.json`

```json
{
  "metadata": {
    "title": "Конструктор федерального материнского капитала",
    "version": "1.1.0",
    "horizon_year": 2050,
    "runtime_external_fetch": false
  },
  "current_policy_2026": {
    "first_child": 728921.9,
    "second_child_extra_after_first": 234321.27
  },
  "historical_reference": {
    "base_year": 2007,
    "base_capital_rub": 250000,
    "average_wage_2007_rub_per_month": 13593,
    "wage_equivalent_2007_months": 18.3918193188
  },
  "comfortable_housing_model": {
    "price_m2_default": 83500,
    "area_norm_m2_per_person_default": 18,
    "adults_default": 2,
    "children_for_full_housing_default": 4,
    "rates_default": {
      "child1": 0.15,
      "child2": 0.2,
      "child3": 0.3,
      "child4plus": 0.35
    }
  },
  "budget_defaults": {
    "program_coverage_percent": 100,
    "certificate_use_share_percent": 80,
    "conversion_percent": 5
  }
}
```

Полные URL источников для этого runtime-файла хранятся только в `docs/data/sources.json`.

## `docs/data/vciom_reproductive_intentions_2025.json`

```json
{
  "metadata": {
    "title": "Желаемое и ожидаемое число детей: ВЦИОМ, 2025",
    "runtime_external_fetch": false,
    "source_date": "2025-05-12"
  },
  "actual": {
    "year": 2025,
    "tfr_total": 1.361
  },
  "vciom_2025": {
    "all": {
      "expected_children": 2.4,
      "desired_children": 3.2
    }
  }
}
```

## `docs/data/family_dashboard.json`

Подробный контракт: `docs/methodology/DATA_CONTRACT_FAMILY.md`.

Минимальные требования runtime:

```json
{
  "metadata": {
    "runtime_external_fetch": false,
    "horizon": "1990–2023"
  },
  "territories": [],
  "series": [],
  "national": {
    "marriages_count_latest": 0,
    "divorces_count_latest": 0,
    "divorces_per_100_marriages_latest": 0
  }
}
```

Страница `family.html` также использует `family_subjects.geojson`, `family.sqlite`, `family_summary.csv`, `family_join_audit.json` и `family_join_audit.csv`. Карта строится локальным SVG-движком; `FamilyModule.getState()` отдаёт `mapEngine: "svg-geojson"`, число путей, число значений и домен шкалы.

## `docs/data/abortions_dashboard.json`

Подробный контракт: `docs/methodology/DATA_CONTRACT_ABORTIONS.md`.

Минимальные требования runtime:

```json
{
  "metadata": {
    "runtime_external_fetch": false
  },
  "territories": [],
  "series": [],
  "national": {}
}
```

Страница `abortions.html` также использует `abortions_subjects.geojson`, `abortions.sqlite`, `abortions_summary.csv`, `abortions_join_audit.json` и `abortions_join_audit.csv`. Карта строится локальным SVG-движком; `AbortionsModule.getState()` отдаёт `mapEngine: "svg-geojson"`, число путей, число значений и домен шкалы.
