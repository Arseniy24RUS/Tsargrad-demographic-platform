# Комплект автономной разработки для Codex

Этот комплект предназначен для помещения в корень репозитория платформы `Россия 2050`.

## Как использовать

1. Распаковать архив в корень текущего проекта.
2. Убедиться, что рядом с `AGENTS.md` находится папка `docs/` текущей платформы.
3. Запустить первичный аудит:

```bash
python scripts/audit_all.py
```

4. Поставить Codex App задачу: прочитать `AGENTS.md` и выполнить `.codex/tasks/00_master_plan.md` до полного прохождения проверок.

## Основные файлы

- `AGENTS.md` — главный файл инструкций для Codex.
- `.codex/tasks/` — пошаговые задачи.
- `.codex/subagents/` — роли субагентов.
- `docs/PROJECT_CONTEXT.md` — продуктовый контекст.
- `docs/ACCEPTANCE_CRITERIA.md` — критерии приёмки.
- `scripts/` — автоматические проверки.
- `tests/` — Playwright smoke tests.
- `package.json` — команды проверки и smoke-тестов.

## Главная команда

```bash
python scripts/audit_all.py
```

При наличии Node/Playwright:

```bash
npm install
npm run test:smoke
```

