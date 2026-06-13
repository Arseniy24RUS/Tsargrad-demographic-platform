#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "SKIP: node не найден, проверка JS-синтаксиса пропущена"
  exit 0
fi
if [ ! -d "$ROOT/docs/assets/js" ]; then
  echo "FAIL: нет docs/assets/js"
  exit 1
fi
found=0
while IFS= read -r -d '' file; do
  found=1
  node --check "$file"
done < <(find "$ROOT/docs/assets/js" -type f \( -name '*.js' -o -name '*.mjs' \) ! -path '*/vendor/*' -print0)
if [ "$found" = 0 ]; then
  echo "SKIP: собственные JS-файлы не найдены"
else
  echo "OK: JS-синтаксис проверен"
fi
