(() => {
  'use strict';

  const DATA_URL = 'data/abortions_dashboard.json';
  const GEO_URL = 'data/abortions_subjects.geojson';
  const state = {
    data: null,
    geo: null,
    series: [],
    byTerritory: new Map(),
    districts: [],
    subjects: [],
    countryId: 'terr_rf_bez_novyh_subektov',
    mapStats: { engine: 'svg-geojson', renderedPaths: 0, valueCount: 0, domain: null },
  };

  const el = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (v) => v == null || Number.isNaN(Number(v)) ? '—' : nf0.format(Number(v));
  const fmt2 = (v) => v == null || Number.isNaN(Number(v)) ? '—' : nf2.format(Number(v));

  function typeNorm(t) {
    const s = String(t || '');
    if (s.includes('country')) return 'country';
    if (s === 'federal_district' || s === 'district') return 'federal_district';
    if (s.startsWith('federal_subject') || s === 'subject') return 'federal_subject';
    return s || 'unknown';
  }

  function metricLabel(metric) {
    return {
      abortions: 'число прерываний беременности',
      abortions_per_1000_women_15_49: 'на 1000 женщин 15–49 лет',
      abortions_per_100_births: 'на 100 родов',
    }[metric] || metric;
  }

  function metricDecimals(metric) { return metric === 'abortions' ? 0 : 2; }
  function metricFormat(metric, value) { return metric === 'abortions' ? fmtInt(value) : fmt2(value); }
  function metricValue(row, metric) {
    if (!row) return null;
    const v = metric === 'abortions' ? row.abortions : row[metric];
    return v == null || Number.isNaN(Number(v)) ? null : Number(v);
  }

  function plotConfig() { return { responsive: true, displayModeBar: false, locale: 'ru', topojsonURL: 'assets/vendor/plotly/' }; }
  function plotLayout(title = '') {
    return {
      title: title ? { text: title, font: { family: 'Arial', size: 16, color: '#162a30' } } : undefined,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Arial', color: '#182d33' },
      margin: { l: 58, r: 24, t: title ? 48 : 22, b: 54 },
      xaxis: { gridcolor: 'rgba(20,40,45,.10)', zeroline: false },
      yaxis: { gridcolor: 'rgba(20,40,45,.10)', zeroline: false },
      legend: { orientation: 'h', x: 0, y: -0.22 },
      hoverlabel: { bgcolor: '#fff', bordercolor: '#d6a436', font: { color: '#111' } },
    };
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
    return sorted[idx];
  }

  function interpolateColor(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }

  function mapColor(value, domain) {
    if (!Number.isFinite(value) || !domain) return '#dfd8c9';
    const t = Math.max(0, Math.min(1, (value - domain.min) / (domain.max - domain.min || 1)));
    const stops = [
      { t: 0, rgb: [248, 230, 180] },
      { t: 0.48, rgb: [214, 164, 54] },
      { t: 1, rgb: [15, 79, 87] },
    ];
    let left = stops[0];
    let right = stops[stops.length - 1];
    for (let i = 1; i < stops.length; i += 1) {
      if (t <= stops[i].t) {
        left = stops[i - 1];
        right = stops[i];
        break;
      }
    }
    const k = (t - left.t) / (right.t - left.t || 1);
    const rgb = interpolateColor(left.rgb, right.rgb, k);
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function collectCoordinates(coords, out) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      out.push(coords);
      return;
    }
    coords.forEach((child) => collectCoordinates(child, out));
  }

  function geometryPath(geometry, project) {
    const ringPath = (ring) => ring.map((pt, idx) => {
      const p = project(pt);
      return `${idx ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(' ') + ' Z';
    if (!geometry) return '';
    if (geometry.type === 'Polygon') return geometry.coordinates.map(ringPath).join(' ');
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap((poly) => poly.map(ringPath)).join(' ');
    return '';
  }

  function renderGeoMap(targetId, features, valuesById, metric, year) {
    const mount = el(targetId);
    if (!mount) return;
    const coords = [];
    features.forEach((feature) => collectCoordinates(feature.geometry.coordinates, coords));
    const lons = coords.map((c) => Number(c[0])).filter(Number.isFinite);
    const lats = coords.map((c) => Number(c[1])).filter(Number.isFinite);
    const finiteValues = Array.from(valuesById.values()).filter(Number.isFinite).sort((a, b) => a - b);
    const domain = finiteValues.length ? {
      min: percentile(finiteValues, 0.05),
      max: percentile(finiteValues, 0.95),
    } : null;
    if (domain && domain.max <= domain.min) domain.max = domain.min + 1;

    const width = 980;
    const height = 640;
    const pad = 28;
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const project = ([lon, lat]) => ({
      x: pad + ((lon - minLon) / (maxLon - minLon || 1)) * (width - pad * 2),
      y: pad + ((maxLat - lat) / (maxLat - minLat || 1)) * (height - pad * 2),
    });

    mount.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'geo-map';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Картограмма субъектов: ${metricLabel(metric)}, ${year}`);
    features.forEach((feature) => {
      const id = feature.properties.territory_id;
      const value = valuesById.get(id);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', geometryPath(feature.geometry, project));
      path.setAttribute('fill', mapColor(value, domain));
      path.setAttribute('stroke', '#fffaf0');
      path.setAttribute('stroke-width', '.75');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('tabindex', '0');
      if (!Number.isFinite(value)) path.classList.add('no-data');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${feature.properties.territory_name}: ${Number.isFinite(value) ? metricFormat(metric, value) : 'нет данных'} (${year})`;
      path.appendChild(title);
      svg.appendChild(path);
    });
    wrapper.appendChild(svg);
    const legend = document.createElement('div');
    legend.className = 'map-legend-local';
    const minText = domain ? metricFormat(metric, domain.min) : '—';
    const maxText = domain ? metricFormat(metric, domain.max) : '—';
    legend.innerHTML = `<span>${metricLabel(metric)}</span><i class="map-legend-ramp" aria-hidden="true"></i><span>${minText}</span><span>${maxText}</span>`;
    mount.appendChild(wrapper);
    mount.appendChild(legend);
    state.mapStats = {
      engine: 'svg-geojson',
      renderedPaths: features.length,
      valueCount: finiteValues.length,
      domain,
    };
  }

  function normaliseRows(data) {
    const terrMap = new Map();
    (data.territories || []).forEach((t) => {
      terrMap.set(t.territory_id, {
        territory_id: t.territory_id,
        territory_name: t.short_name || t.territory_name,
        territory_type: typeNorm(t.territory_type || t.level),
        federal_district: t.federal_district_name || t.parent_name || null,
        federal_district_id: t.federal_district_id || t.parent_territory_id || null,
      });
    });
    const out = [];
    function push(raw, tid, extra = {}) {
      const meta = terrMap.get(tid) || {};
      out.push({
        territory_id: tid || raw.territory_id,
        territory_name: raw.territory_name || meta.territory_name || tid,
        territory_type: typeNorm(raw.territory_type || raw.level || meta.territory_type),
        federal_district: raw.federal_district || raw.federal_district_name || meta.federal_district || null,
        federal_district_id: raw.federal_district_id || meta.federal_district_id || null,
        year: Number(raw.year),
        abortions: raw.abortions != null ? Number(raw.abortions) : (raw.abortions_count != null ? Number(raw.abortions_count) : null),
        births: raw.births != null ? Number(raw.births) : (raw.births_count != null ? Number(raw.births_count) : null),
        women_15_49: raw.women_15_49 != null ? Number(raw.women_15_49) : (raw.women_15_49_count != null ? Number(raw.women_15_49_count) : null),
        abortions_per_1000_women_15_49: raw.abortions_per_1000_women_15_49 != null ? Number(raw.abortions_per_1000_women_15_49) : null,
        abortions_per_100_births: raw.abortions_per_100_births != null ? Number(raw.abortions_per_100_births) : null,
      });
    }
    if (Array.isArray(data.series) && data.series[0] && Array.isArray(data.series[0].values)) {
      data.series.forEach((g) => (g.values || []).forEach((v) => push(v, g.territory_id)));
    } else if (Array.isArray(data.annual)) {
      data.annual.forEach((r) => push(r, r.territory_id));
    } else if (Array.isArray(data.series)) {
      data.series.forEach((r) => push(r, r.territory_id));
    }
    return out.filter((r) => r.territory_id && Number.isFinite(r.year));
  }

  async function loadData() {
    const [data, geo] = await Promise.all([
      fetch(DATA_URL).then((r) => r.json()),
      fetch(GEO_URL).then((r) => r.json()),
    ]);
    state.data = data;
    state.geo = geo;
    state.series = normaliseRows(data);
    state.byTerritory = new Map();
    state.series.forEach((r) => {
      if (!state.byTerritory.has(r.territory_id)) state.byTerritory.set(r.territory_id, []);
      state.byTerritory.get(r.territory_id).push(r);
    });
    state.byTerritory.forEach((rows) => rows.sort((a, b) => a.year - b.year));

    const latest = [];
    state.byTerritory.forEach((rows, tid) => {
      const last = rows.filter((r) => r.abortions != null).slice(-1)[0] || rows[rows.length - 1];
      if (last) latest.push(last);
    });
    const country = latest.find((r) => r.territory_id === state.countryId) || latest.find((r) => r.territory_type === 'country');
    if (country) state.countryId = country.territory_id;
    state.districts = latest.filter((r) => r.territory_type === 'federal_district').sort((a, b) => a.territory_name.localeCompare(b.territory_name, 'ru'));
    state.subjects = latest.filter((r) => r.territory_type === 'federal_subject').sort((a, b) => a.territory_name.localeCompare(b.territory_name, 'ru'));
    populateControls();
    renderAll();
  }

  function populateControls() {
    const years = Array.from(new Set(state.series.map((r) => r.year))).filter((y) => y !== 2018).sort((a, b) => a - b);
    el('yearSelect').innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    el('yearSelect').value = years.includes(2024) ? '2024' : String(years[years.length - 1]);
    el('districtSelect').innerHTML = state.districts.map((r) => `<option value="${r.territory_id}">${r.territory_name}</option>`).join('');
    el('subjectSelect').innerHTML = state.subjects.map((r) => `<option value="${r.territory_id}">${r.territory_name}</option>`).join('');
    ['territoryMode', 'districtSelect', 'subjectSelect', 'yearSelect', 'indicatorSelect', 'savedShareRange'].forEach((id) => {
      el(id)?.addEventListener('change', renderAll);
      el(id)?.addEventListener('input', renderAll);
    });
  }

  function selectedTerritoryId() {
    const mode = el('territoryMode').value;
    el('districtSelect').disabled = mode !== 'district';
    el('subjectSelect').disabled = mode !== 'subject';
    if (mode === 'district') return el('districtSelect').value || state.districts[0]?.territory_id || state.countryId;
    if (mode === 'subject') return el('subjectSelect').value || state.subjects[0]?.territory_id || state.countryId;
    return state.countryId;
  }
  function territoryName(tid) {
    const rows = state.byTerritory.get(tid) || [];
    return rows.length ? rows[rows.length - 1].territory_name : 'Россия';
  }
  function latestRow(tid, metric = 'abortions') {
    const rows = (state.byTerritory.get(tid) || []).filter((r) => metricValue(r, metric) != null);
    return rows.length ? rows[rows.length - 1] : null;
  }
  function rowForYear(tid, year) { return (state.byTerritory.get(tid) || []).find((r) => r.year === Number(year)) || null; }

  function updateHero() {
    const a = latestRow(state.countryId, 'abortions');
    const w = latestRow(state.countryId, 'abortions_per_1000_women_15_49');
    const b = latestRow(state.countryId, 'abortions_per_100_births');
    el('heroAbortions').textContent = a ? fmtInt(a.abortions) : '—';
    el('heroRateWomen').textContent = w ? fmt2(w.abortions_per_1000_women_15_49) : '—';
    el('heroRateBirths').textContent = b ? fmt2(b.abortions_per_100_births) : '—';
  }

  function updateKpi() {
    const tid = selectedTerritoryId();
    const a = latestRow(tid, 'abortions');
    const w = latestRow(tid, 'abortions_per_1000_women_15_49');
    const b = latestRow(tid, 'abortions_per_100_births');
    const share = Number(el('savedShareRange').value || 0);
    el('savedShareLabel').textContent = share;
    el('selectedTerritoryLabel').textContent = territoryName(tid);
    el('kpiAbortions').textContent = a ? fmtInt(a.abortions) : '—';
    el('kpiRateWomen').textContent = w ? fmt2(w.abortions_per_1000_women_15_49) : '—';
    el('kpiRateBirths').textContent = b ? fmt2(b.abortions_per_100_births) : '—';
    el('kpiPotential').textContent = a ? fmtInt(Math.round(a.abortions * share / 100)) : '—';
  }

  function renderMap() {
    if (!state.geo) return;
    const selectedYear = Number(el('yearSelect').value);
    const metric = el('indicatorSelect').value;
    const year = (metric === 'abortions_per_100_births' && selectedYear === 2024) ? 2023 : selectedYear;
    const features = state.geo.features || [];
    const rows = features.map((f) => rowForYear(f.properties.territory_id, year));
    const valuesById = new Map(features.map((f, i) => [f.properties.territory_id, metricValue(rows[i], metric)]));
    renderGeoMap('abortionsMap', features, valuesById, metric, year);
  }

  function renderLineChart(divId, metric, title) {
    if (!window.Plotly) return;
    const selected = selectedTerritoryId();
    const ids = selected === state.countryId ? [state.countryId] : [state.countryId, selected];
    const colors = ['#0f4f57', '#d6a436'];
    const traces = ids.map((tid, idx) => {
      const rows = (state.byTerritory.get(tid) || []).filter((r) => metricValue(r, metric) != null);
      return { type: 'scatter', mode: 'lines+markers', name: tid === state.countryId ? 'Россия' : territoryName(tid), x: rows.map((r) => r.year), y: rows.map((r) => metricValue(r, metric)), line: { color: colors[idx], width: idx ? 3 : 4 }, marker: { size: 6 }, hovertemplate: '%{x}<br>%{y:,.2f}<extra></extra>' };
    });
    Plotly.react(divId, traces, plotLayout(title), plotConfig());
  }

  function renderSavedBirths() {
    if (!window.Plotly) return;
    const selected = selectedTerritoryId();
    const share = Number(el('savedShareRange').value || 0) / 100;
    const rows = (state.byTerritory.get(selected) || []).filter((r) => r.abortions != null);
    const trace = { type: 'bar', name: 'сценарная оценка', x: rows.map((r) => r.year), y: rows.map((r) => Math.round(r.abortions * share)), marker: { color: '#d6a436' }, hovertemplate: '%{x}<br>%{y:,.0f}<extra></extra>' };
    Plotly.react('savedBirthsPlot', [trace], plotLayout('Потенциально сохранённые рождения'), plotConfig());
  }

  function renderTopTable() {
    const selectedYear = Number(el('yearSelect').value);
    const metric = el('indicatorSelect').value;
    const year = (metric === 'abortions_per_100_births' && selectedYear === 2024) ? 2023 : selectedYear;
    const rows = state.series.filter((r) => r.territory_type === 'federal_subject' && Number(r.year) === year && metricValue(r, metric) != null).sort((a, b) => metricValue(b, metric) - metricValue(a, metric)).slice(0, 10);
    el('topRegionsTable').querySelector('tbody').innerHTML = rows.map((r) => `<tr><td>${r.territory_name}</td><td class="num">${metricFormat(metric, metricValue(r, metric))}</td><td class="num">${r.year}</td></tr>`).join('');
  }

  function renderTerritoryTable() {
    const selected = selectedTerritoryId();
    const rows = (state.byTerritory.get(selected) || []).filter((r) => r.year >= 2020).sort((a, b) => b.year - a.year).slice(0, 8);
    el('territoryTable').querySelector('tbody').innerHTML = rows.map((r) => `<tr><td>${r.year}</td><td class="num">${fmtInt(r.abortions)}</td><td class="num">${fmt2(r.abortions_per_1000_women_15_49)}</td><td class="num">${fmt2(r.abortions_per_100_births)}</td></tr>`).join('');
  }

  function chartReady(id) {
    if (id === 'abortionsMap') return Boolean(document.querySelector('#abortionsMap .geo-map svg path'));
    return Boolean(document.querySelector(`#${id} .main-svg`));
  }

  function getState() {
    const selected = state.data ? selectedTerritoryId() : state.countryId;
    const chartIds = ['abortionsMap', 'savedBirthsPlot', 'abortionsTrend', 'rateWomenTrend', 'rateBirthsTrend'];
    return {
      loaded: Boolean(state.data && state.geo && state.series.length),
      runtimeExternalFetch: state.data?.metadata?.runtime_external_fetch,
      selectedTerritoryId: selected,
      selectedTerritoryName: territoryName(selected),
      analysisMode: el('territoryMode')?.value || 'country',
      year: Number(el('yearSelect')?.value || 0),
      indicator: el('indicatorSelect')?.value || '',
      scenarioShare: Number(el('savedShareRange')?.value || 0),
      seriesCount: state.series.length,
      geoFeatureCount: state.geo?.features?.length || 0,
      districtCount: state.districts.length,
      subjectCount: state.subjects.length,
      chartIds,
      renderedCharts: chartIds.filter(chartReady),
      mapEngine: state.mapStats.engine,
      mapRenderedPaths: state.mapStats.renderedPaths,
      mapValueCount: state.mapStats.valueCount,
      mapDomain: state.mapStats.domain,
      topTableRows: el('topRegionsTable')?.querySelectorAll('tbody tr').length || 0,
      territoryTableRows: el('territoryTable')?.querySelectorAll('tbody tr').length || 0,
      kpiPotentialText: el('kpiPotential')?.textContent || '',
    };
  }

  function setupModuleContract() {
    window.AbortionsModule = { getState };
  }

  function renderAll() {
    updateHero(); updateKpi(); renderMap();
    renderLineChart('abortionsTrend', 'abortions', 'Число прерываний беременности');
    renderLineChart('rateWomenTrend', 'abortions_per_1000_women_15_49', 'На 1000 женщин 15–49 лет');
    renderLineChart('rateBirthsTrend', 'abortions_per_100_births', 'На 100 родов');
    renderSavedBirths(); renderTopTable(); renderTerritoryTable();
  }

  setupModuleContract();

  loadData().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', `<div style="background:#fff;color:#111;padding:16px;font-weight:700">Данные страницы «Аборты» временно недоступны: ${String(err.message || err)}</div>`);
  });
})();
