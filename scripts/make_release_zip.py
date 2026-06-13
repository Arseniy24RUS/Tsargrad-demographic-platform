#!/usr/bin/env python3
"""Create the self-contained release zip from repository root."""
from __future__ import annotations
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
name = "tsargrad_demographic_platform_selfcontained_release_github_pages.zip"
out = ROOT.parent / name
EXCLUDE_DIRS = {
    ".git",
    ".playwright-mcp",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    "artifacts",
    "test-results",
    "playwright-report",
}
EXCLUDE_FILE_PREFIXES = (
    "estate-browser-",
    "estate-architecture3-",
    "estate-planui1-",
    "estate-roofstable1-",
    "03-estate-back-windows-",
    "page-",
)
EXCLUDE_FILE_SUFFIXES = (
    ".tmp",
)
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for path in ROOT.rglob("*"):
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if path == out:
            continue
        if path.is_file():
            if path.name.startswith(EXCLUDE_FILE_PREFIXES) or path.name.endswith(EXCLUDE_FILE_SUFFIXES):
                continue
            z.write(path, path.relative_to(ROOT.parent))
print(out)
