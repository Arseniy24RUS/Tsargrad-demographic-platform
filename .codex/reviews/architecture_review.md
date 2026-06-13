# Architecture Review

Платформа остаётся статическим сайтом в `docs/`.

Runtime-загрузка ограничена локальными путями:

- `docs/data/*`;
- `docs/assets/js/*`;
- `docs/assets/css/*`;
- `docs/assets/vendor/*`;
- `docs/assets/img/*`.

Скрытый сетевой запрос Plotly к `cdn.plot.ly/un/world_110m.json` устранён заменой geo-карты на локальную SVG-карту из `subjects.geojson`.

Релизный архив собирается скриптом `scripts/make_release_zip.py` и исключает `node_modules`, test output и временные директории.
