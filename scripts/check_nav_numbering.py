#!/usr/bin/env python3
"""Check that all visible navigation labels are present without numeric prefixes."""
from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ["index.html", "settlement.html", "estate.html", "capital.html", "mortgage.html", "payments.html"]
EXPECTED = ["СКР", "Расселение", "Усадьба", "Маткапитал", "Ипотека", "Выплаты"]
FORBIDDEN = ["01 СКР", "02 Расселение", "03 Усадьба", "04 Маткапитал", "05 Ипотека", "06 Выплаты"]

fail: list[str] = []
for page in PAGES:
    path = ROOT / "docs" / page
    if not path.exists():
        fail.append(f"нет docs/{page}")
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for label in EXPECTED:
        if label not in text:
            fail.append(f"docs/{page}: не найден пункт меню {label}")
    for label in FORBIDDEN:
        if label in text:
            fail.append(f"docs/{page}: найден отвлекающий числовой префикс {label}")

if fail:
    print("FAIL: навигация не соответствует стандарту без нумерации")
    for item in fail:
        print(" -", item)
    sys.exit(1)

print("OK: навигация без числовых префиксов найдена на всех страницах")
