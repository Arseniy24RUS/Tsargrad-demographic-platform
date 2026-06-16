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
    "infrastructure.html",
    "estate.html",
    "capital.html",
    "mortgage.html",
    "payments.html",
    "family.html",
    "abortions.html",
]
EXPECTED_LINKS = {
    "Рождаемость": "skr.html",
    "Расселение": "settlement.html",
    "Инфраструктура": "infrastructure.html",
    "Свой дом": "estate.html",
    "Маткапитал": "capital.html",
    "Ипотека": "mortgage.html",
    "Выплаты": "payments.html",
    "Браки": "family.html",
    "Аборты": "abortions.html",
}
FORBIDDEN_NAV_LABELS = ["Главная"]
FORBIDDEN_PREFIX_RE = re.compile(
    r">\s*(0[1-9]|[1-9]\.)\s*("
    + "|".join(re.escape(label) for label in EXPECTED_LINKS)
    + r")\s*<"
)
NAV_RE = re.compile(r"<nav\b[^>]*>.*?</nav>", re.IGNORECASE | re.DOTALL)
BRAND_RE = re.compile(
    r"<a\b[^>]*class=\"[^\"]*\bbrand\b[^\"]*\"[^>]*href=\"index\.html\"",
    re.IGNORECASE,
)


def normalize_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def main() -> int:
    failures: list[str] = []
    for page in PAGES:
        path = ROOT / "docs" / page
        if not path.exists():
            failures.append(f"нет docs/{page}")
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        nav_match = NAV_RE.search(text)
        if not nav_match:
            failures.append(f"docs/{page}: не найден блок навигации")
            continue
        nav = nav_match.group(0)

        if not BRAND_RE.search(text):
            failures.append(f"docs/{page}: логотип или название сайта не ведут на index.html")

        nav_text = normalize_html(nav)
        for label in FORBIDDEN_NAV_LABELS:
            if label in nav_text:
                failures.append(f"docs/{page}: в навигации найден запрещённый пункт {label}")

        prefix = FORBIDDEN_PREFIX_RE.search(nav)
        if prefix:
            failures.append(f"docs/{page}: числовой префикс в навигации: {prefix.group(0)}")

        for label, href in EXPECTED_LINKS.items():
            pattern = re.compile(
                rf"<a\b[^>]*href=\"{re.escape(href)}\"[^>]*>\s*{re.escape(label)}\s*</a>",
                re.IGNORECASE,
            )
            if not pattern.search(nav):
                failures.append(f"docs/{page}: не найден пункт меню {label} -> {href}")

    if failures:
        print("FAIL: навигация не соответствует структуре без пункта «Главная» и числовых префиксов")
        for item in failures:
            print(" -", item)
        return 1

    print("OK: навигация на 10 страницах ведёт на 9 разделов без пункта «Главная» и без числовых префиксов")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
