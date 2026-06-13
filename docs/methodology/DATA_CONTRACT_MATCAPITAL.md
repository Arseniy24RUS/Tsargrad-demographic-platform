# Контракт данных `matcapital_inputs.json`

Файл: `docs/data/matcapital_inputs.json`

## `metadata`

- `title` — название модуля;
- `version` — версия структуры, сейчас `1.1.0`;
- `horizon_year` — горизонт платформы, должен быть 2050;
- `runtime_external_fetch` — должно быть `false`.

## `current_policy_2026`

Официальная действующая модель материнского капитала.

- `first_child` — размер капитала на первого ребёнка;
- `second_child_extra_after_first` — доплата за второго ребёнка после получения капитала на первого;
- `second_child_full_if_no_prior_right` — полный размер для второго ребёнка, если право ранее не возникло;
- `incremental_schedule_for_family_with_first_right` — маржинальная траектория семьи, у которой право возникло на первого ребёнка.

## `historical_reference`

Параметры зарплатного эквивалента 2007 года.

- `base_year` — 2007;
- `base_capital_rub` — 250000;
- `average_wage_2007_rub_per_month` — средняя зарплата 2007 года;
- `average_wage_current_default_rub_per_month` — значение по умолчанию для текущей средней зарплаты;
- `wage_equivalent_2007_months` — отношение `base_capital_rub / average_wage_2007_rub_per_month`.

## `comfortable_housing_model`

Параметры подхода по стоимости комфортного жилья.

- `price_m2_default` — цена 1 м²;
- `area_norm_m2_per_person_default` — норматив площади;
- `adults_default` — число взрослых;
- `children_for_full_housing_default` — число детей для полной модели жилья;
- `rates_default` — прогрессивная шкала ФМК как доли расчётной стоимости комфортного жилья.

## `budget_defaults`

Сценарные значения для оценки бюджетных обязательств.

- `births_child1` — первые рождения в год;
- `births_child2` — вторые рождения в год;
- `births_child3` — третьи рождения в год;
- `births_child4plus` — четвёртые и последующие рождения в год;
- `program_coverage_percent` — охват программы;
- `certificate_use_share_percent` — доля использования сертификатов для кассовой оценки;
- `conversion_percent` — конверсия усиления меры в потенциальное дополнительное рождение.
