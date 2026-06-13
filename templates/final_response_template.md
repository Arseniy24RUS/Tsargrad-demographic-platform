# Шаблон финального ответа Codex пользователю

Готово. Собрана самодостаточная релизная версия платформы.

Архив: `[tsargrad_demographic_platform_selfcontained_release_github_pages.zip](...)`

Страницы:

- `[СКР](...)`
- `[Расселение](...)`
- `[Усадьба](...)`
- `[Ипотека](...)`
- `[Выплаты](...)`

Что сделано:

1. Удалены внешние runtime-зависимости.
2. Авторские прогнозы СКР и численности населения до 2050 года сохранены локально.
3. Первая страница разделена на режимы Россия / федеральный округ / субъект РФ.
4. Исправлена логика дельт СКР.
5. Добавлен краткий и подробный вид.
6. Доработана 3D-усадьба.
7. Проверена ипотека, выплаты, расселение.
8. Интерфейс очищен от англицизмов и служебных пометок.

Проверки:

```text
python scripts/check_json.py — OK
python scripts/check_no_external_runtime.py — OK
python scripts/check_russian_ui.py — OK
python scripts/check_data_locality.py — OK
python scripts/check_nav_numbering.py — OK
bash scripts/check_js_syntax.sh — OK
npm run test:smoke — OK / пропущено с объяснением
```

Чеклист: `[RELEASE_CHECKLIST.md](...)`

