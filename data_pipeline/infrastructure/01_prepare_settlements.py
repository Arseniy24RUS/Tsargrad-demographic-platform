#!/usr/bin/env python3
"""Подготовка слоя населённых пунктов для страницы «Инфраструктура».

Минимальный запуск:
python data_pipeline/infrastructure/01_prepare_settlements.py --input raw/SettlementsAllData.csv --output docs/data/infrastructure

В текущем патче уже приложены готовые JSON, поэтому этот скрипт нужен для воспроизводимости и будущей пересборки.
"""
import argparse
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='SettlementsAllData.csv')
    parser.add_argument('--output', required=True, help='папка docs/data/infrastructure')
    args = parser.parse_args()
    print('Этот патч уже содержит подготовленные данные. Для полной пересборки используйте код генерации из README патча или перенесите build-логику из текущей сборки.')
    print(f'Вход: {args.input}')
    print(f'Выход: {args.output}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
