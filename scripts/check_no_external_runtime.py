#!/usr/bin/env python3
"""Check that runtime files do not depend on external network resources."""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

RUNTIME_EXTS = {".html", ".js", ".css", ".mjs", ".json"}
ALLOW_PATH_PARTS = {
    "THIRD_PARTY_NOTICES.md",
    "METHODOLOGY.md",
    "DATA_MANIFEST.md",
    "sources.json",
    "README.md",
}
ALLOW_DIR_PARTS = {".codex", "scripts", "tests", "node_modules"}
URL_RE = re.compile(r"https?://", re.IGNORECASE)
ALLOWED_NAMESPACE_URLS = {
    "http://www.w3.org/2000/svg",
}
FORBIDDEN_PATTERNS = [
    "raw.githubusercontent.com",
    "cdn.jsdelivr.net",
    "unpkg.com",
    "cdnjs.cloudflare.com",
    "cdn.plot.ly",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
]


def is_allowed(path: Path) -> bool:
    parts = set(path.parts)
    if parts & ALLOW_DIR_PARTS:
        return True
    if path.name in ALLOW_PATH_PARTS:
        return True
    if "vendor" in parts:
        # vendored libraries may include license comments with URLs; runtime HTML must not point to them externally.
        return True
    return False


def main() -> int:
    if not DOCS.exists():
        print("FAIL: нет директории docs/", file=sys.stderr)
        return 2
    failures = []
    for path in sorted(DOCS.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in RUNTIME_EXTS:
            continue
        if is_allowed(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            failures.append((path, f"не удалось прочитать: {exc}"))
            continue
        scan_text = text
        for namespace_url in ALLOWED_NAMESPACE_URLS:
            scan_text = scan_text.replace(namespace_url, "")
        if URL_RE.search(scan_text):
            failures.append((path, "найдена внешняя ссылка http(s)"))
        lower = scan_text.lower()
        for pat in FORBIDDEN_PATTERNS:
            if pat in lower:
                failures.append((path, f"найден запрещённый домен: {pat}"))
    if failures:
        print("FAIL: найдены внешние runtime-зависимости:")
        for path, msg in failures:
            print(f" - {path.relative_to(ROOT)}: {msg}")
        return 1
    print("OK: внешних runtime-зависимостей не найдено")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
