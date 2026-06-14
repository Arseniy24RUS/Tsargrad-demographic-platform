#!/usr/bin/env python3
"""Check navigation labels and links across published HTML pages."""
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    "index.html",
    "skr.html",
    "settlement.html",
    "estate.html",
    "capital.html",
    "mortgage.html",
    "payments.html",
    "family.html",
    "abortions.html",
]
EXPECTED_LINKS = {
    "СКР": "skr.html",
    "Расселение": "settlement.html",
    "Усадьба": "estate.html",
    "Маткапитал": "capital.html",
    "Ипотека": "mortgage.html",
    "Выплаты": "payments.html",
    "Семья": "family.html",
    "Аборты": "abortions.html",
}
FORBIDDEN_NAV_LABELS = ["Главная"]
FORBIDDEN_PREFIX_RE = re.compile(r">\s*(0[1-9]|[1-9]\.)\s*(СКР|Расселение|Усадьба|Маткапитал|Ипотека|Выплаты|Семья|Аборты)\s*<")
NAV_RE = re.compile(r"<nav\b[^>]*>.*?</nav>", re.IGNORECASE | re.DOTALL)
BRAND_RE = re.compile(r"<a\b[^>]*class=\"[^\"]*\bbrand\b[^\"]*\"[^>]*href=\"index\.html\"", re.IGNORECASE)


def normalize_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


fail: list[str] = []
for page in PAGES:
    path = ROOT / "docs" / page
    if not path.exists():
        fail.append(f"нет docs/{page}")
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    nav_match = NAV_RE.search(text)
    if not nav_match:
        fail.append(f"docs/{page}: не найден блок навигации")
        continue
    nav = nav_match.group(0)

    if not BRAND_RE.search(text):
        fail.append(f"docs/{page}: логотип или название сайта не ведут на index.html")

    for label in FORBIDDEN_NAV_LABELS:
        if label in normalize_html(nav):
            fail.append(f"docs/{page}: в навигации найден запрещённый пункт {label}")

    prefix = FORBIDDEN_PREFIX_RE.search(nav)
    if prefix:
        fail.append(f"docs/{page}: числовой префикс в навигации: {prefix.group(0)}")

    for label, href in EXPECTED_LINKS.items():
        pattern = re.compile(rf"<a\b[^>]*href=\"{re.escape(href)}\"[^>]*>\s*{re.escape(label)}\s*</a>", re.IGNORECASE)
        if not pattern.search(nav):
            fail.append(f"docs/{page}: не найден пункт меню {label} -> {href}")

    if re.search(r"<a\b[^>]*href=\"index\.html\"[^>]*>\s*Главная\s*</a>", nav, re.IGNORECASE):
        fail.append(f"docs/{page}: index.html не должен быть отдельным пунктом меню")

if fail:
    print("FAIL: навигация не соответствует структуре без пункта «Главная» и числовых префиксов")
    for item in fail:
        print(" -", item)
    sys.exit(1)

print("OK: навигация на 9 страницах ведёт на разделы без пункта «Главная» и без числовых префиксов")
