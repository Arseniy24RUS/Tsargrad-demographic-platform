#!/usr/bin/env python3
"""Search for forbidden English/debug words in likely visible UI strings.

This is intentionally conservative. If a false positive appears in non-visible code,
move the term into a technical file or add a narrow allow rule with justification.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BANNED = [
    "baseline", "debug", "todo", "prototype", "rpn", "download", "github raw",
    "fetch", "localhost", "nan", "undefined", "null", "drag", "rotate", "xlsx"
]
# CSV can appear in code paths; forbid it only as standalone visible text in HTML/JS string literals.
BANNED_REGEX = [re.compile(r"\bCSV\b", re.IGNORECASE)]
SCAN_EXTS = {".html", ".js", ".mjs"}
IGNORE_PARTS = {"vendor", "data", "node_modules"}
ALLOW_FILES = {"THIRD_PARTY_NOTICES.md", "METHODOLOGY.md", "DATA_MANIFEST.md", "sources.json"}

STRING_RE = re.compile(r"(['\"])(.*?)(?<!\\)\1", re.DOTALL)
TAG_RE = re.compile(r">([^<>]{2,})<")


def visible_chunks(path: Path, text: str):
    if path.suffix.lower() == ".html":
        for m in TAG_RE.finditer(text):
            yield m.group(1)
        for m in re.finditer(r"(?:aria-label|title|placeholder|alt)=['\"]([^'\"]+)['\"]", text):
            yield m.group(1)
    elif path.suffix.lower() in {".js", ".mjs"}:
        for m in STRING_RE.finditer(text):
            s = m.group(2)
            low = s.lower().strip()
            if low.endswith(".csv") or low.endswith(".json") or low.endswith(".html"):
                continue
            if re.fullmatch(r"[A-Za-z0-9_$#./:-]+", s.strip()):
                continue
            # likely visible Russian-containing strings or UI error strings
            if re.search(r"[А-Яа-яЁё]", s):
                yield s


def main() -> int:
    failures = []
    for path in sorted(DOCS.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SCAN_EXTS:
            continue
        if set(path.parts) & IGNORE_PARTS:
            continue
        if path.name in ALLOW_FILES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for chunk in visible_chunks(path, text):
            low = chunk.lower()
            for word in BANNED:
                if word in low:
                    failures.append((path, word, chunk.strip()[:160]))
            for rx in BANNED_REGEX:
                if rx.search(chunk):
                    failures.append((path, rx.pattern, chunk.strip()[:160]))
    if failures:
        print("FAIL: найдены запрещённые слова в вероятно видимых строках интерфейса:")
        for path, word, chunk in failures[:200]:
            print(f" - {path.relative_to(ROOT)}: {word!r} → {chunk!r}")
        if len(failures) > 200:
            print(f" ... ещё {len(failures)-200}")
        return 1
    print("OK: запрещённые англицизмы в интерфейсе не найдены")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
