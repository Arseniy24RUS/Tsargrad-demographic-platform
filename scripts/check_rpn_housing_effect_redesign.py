#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REQUIRED = [
    "docs/assets/css/rpn_housing_effect_redesign.css",
    "docs/assets/js/rpn_housing_effect_redesign.js",
    "docs/data/rpn_housing_effect_model.json",
    "docs/methodology/RPN_HOUSING_EFFECT_REDESIGN.md",
]


def main() -> int:
    repo = Path.cwd()
    errors: list[str] = []
    for rel in REQUIRED:
        if not (repo / rel).exists():
            errors.append(f"Нет файла: {rel}")
    data_path = repo / "docs/data/rpn_housing_effect_model.json"
    if data_path.exists():
        try:
            data = json.loads(data_path.read_text(encoding="utf-8"))
            groups = data.get("groups", {})
            for key in ["gap_only", "gap_housing", "gap_housing_need", "gap_housing_high", "gap_housing_need_high"]:
                if key not in groups:
                    errors.append(f"В JSON нет группы {key}")
                else:
                    for field in ["target_women_weighted", "latent_gap_births", "additional_3y_probability_delta"]:
                        if field not in groups[key]:
                            errors.append(f"В группе {key} нет поля {field}")
            if data.get("metadata", {}).get("primary_counting_population") != "женщины 18–44 лет":
                errors.append("В metadata должна быть явно указана расчётная группа женщин 18–44 лет")
        except Exception as exc:
            errors.append(f"JSON не читается: {exc}")
    html_candidates = [repo / "docs/skr.html", repo / "docs/index.html"]
    html_text = "\n".join(p.read_text(encoding="utf-8") for p in html_candidates if p.exists())
    if "rpn_housing_effect_redesign.css" not in html_text:
        errors.append("CSS не подключён на странице Рождаемость")
    if "rpn_housing_effect_redesign.js" not in html_text:
        errors.append("JS не подключён на странице Рождаемость")
    js_path = repo / "docs/assets/js/rpn_housing_effect_redesign.js"
    if js_path.exists():
        try:
            subprocess.run(["node", "--check", str(js_path)], check=True, capture_output=True, text=True)
        except FileNotFoundError:
            pass
        except subprocess.CalledProcessError as exc:
            errors.append("JS не проходит node --check: " + (exc.stderr or exc.stdout))
    if errors:
        print("FAIL: модуль конструктора жилищного резерва требует исправлений:")
        for err in errors:
            print("-", err)
        return 1
    print("OK: конструктор жилищного резерва рождаемости установлен корректно")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
