# 01. Аудит текущего проекта

## Цель

Понять текущее состояние проекта перед внесением изменений.

## Действия

1. Найти корень проекта.
2. Составить дерево файлов.
3. Найти HTML-страницы.
4. Найти все JS/CSS/JSON.
5. Найти внешние зависимости.
6. Найти runtime-запросы к внешним источникам.
7. Найти видимые английские слова и служебные пометки.
8. Проверить текущую нумерацию страниц.
9. Проверить наличие локальных vendor-библиотек.
10. Сохранить результат в `.codex/reviews/initial_audit.md`.

## Команды

```bash
find . -maxdepth 4 -type f | sort
python scripts/check_no_external_runtime.py || true
python scripts/check_russian_ui.py || true
python scripts/check_json.py || true
bash scripts/check_js_syntax.sh || true
```

