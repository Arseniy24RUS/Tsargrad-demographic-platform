# 10. Финальные проверки и релиз

## Обязательные проверки

```bash
python scripts/check_json.py
python scripts/check_no_external_runtime.py
python scripts/check_russian_ui.py
python scripts/check_data_locality.py
python scripts/check_nav_numbering.py
bash scripts/check_js_syntax.sh
```

Если есть Node/Playwright:

```bash
npm run test:smoke
```

## Документы

Обновить:

- `README.md`
- `docs/METHODOLOGY.md`
- `docs/DATA_MANIFEST.md`
- `docs/THIRD_PARTY_NOTICES.md`
- `RELEASE_CHECKLIST.md`

## Архив

```bash
python scripts/make_release_zip.py
```

