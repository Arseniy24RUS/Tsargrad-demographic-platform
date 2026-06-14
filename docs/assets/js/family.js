(() => {
  'use strict';

  const DATA_URL = 'data/family_dashboard.json';
  const GEO_URL = 'data/family_subjects.geojson';
  const state = {
    data: null,
    geo: null,
    series: [],
    byTerritory: new Map(),
    districts: [],
    subjects: [],
    countryId: 'terr_rf_bez_novyh_subektov',
  };

  const el = (id) => document.getElementById(id);
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (v) => v == null || Number.isNaN(Number(v)) ? '—' : nf0.format(Number(v));
  const fmt1 = (v) => v == null || Number.isNaN(Number(v)) ? '—' : nf1.format(Number(v));
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
      marriages_count: 'число браков',
      divorces_count: 'число разводов',
      marriage_rate_per_1000: 'браков на 1000 населения',
      divorce_rate_per_1000: 'разводов на 1000 населения',
      divorces_per_100_marriages: 'разводов на 100 браков',
      marriage_divorce_balance_per_1000: 'баланс брачности',
      family_stability_index_0_100: 'индекс семейной устойчивости',
    }[metric] || metric;
  }

  function metricFormat(metric, value) {
    if (metric === 'marriages_count' || metric === 'divorces_count') return fmtInt(value);
    if (metric === 'divorces_per_100_marriages') return fmt1(value);
    return fmt2(value);
  }

  function metricValue(row, metric) {
    if (!row) return null;
    const v = row[metric];
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
    function push(raw, tid) {
      const meta = terrMap.get(tid) || {};
      out.push({
        territory_id: tid || raw.territory_id,
        territory_name: raw.territory_name || meta.territory_name || tid,
        territory_type: typeNorm(raw.territory_type || raw.level || meta.territory_type),
        federal_district: raw.federal_district || raw.federal_district_name || meta.federal_district || null,
        federal_district_id: raw.federal_district_id || meta.federal_district_id || null,
        year: Number(raw.year),
        marriages_count: raw.marriages_count != null ? Number(raw.marriages_count) : null,
        divorces_count: raw.divorces_count != null ? Number(raw.divorces_count) : null,
        marriage_rate_per_1000: raw.marriage_rate_per_1000 != null ? Number(raw.marriage_rate_per_1000) : null,
        divorce_rate_per_1000: raw.divorce_rate_per_1000 != null ? Number(raw.divorce_rate_per_1000) : null,
        divorces_per_100_marriages: raw.divorces_per_100_marriages != null ? Number(raw.divorces_per_100_marriages) : null,
        marriage_divorce_balance_count: raw.marriage_divorce_balance_count != null ? Number(raw.marriage_divorce_balance_count) : null,
        marriage_divorce_balance_per_1000: raw.marriage_divorce_balance_per_1000 != null ? Number(raw.marriage_divorce_balance_per_1000) : null,
        family_stability_index_0_100: raw.family_stability_index_0_100 != null ? Number(raw.family_stability_index_0_100) : null,
      });
    }
    if (Array.isArray(data.series) && data.series[0] && Array.isArray(data.series[0].values)) {
      data.series.forEach((g) => (g.values || []).forEach((v) => push(v, g.territory_id)));
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
    state.byTerritory.forEach((rows) => {
      const last = rows.filter((r) => r.marriages_count != null && r.divorces_count != null).slice(-1)[0] || rows[rows.length - 1];
      if (last) latest.push(last);
    });
    const country = latest.find((r) => r.territory_id === state.countryId) || latest.find((r) => r.territory_type === 'country');
    if (country) state.countryId = country.territory_id;
    const terrs = Array.from(new Map(latest.map((r) => [r.territory_id, r])).values());
    state.districts = terrs.filter((r) => r.territory_type === 'federal_district').sort((a, b) => a.territory_name.localeCompare(b.territory_name, 'ru'));
    state.subjects = terrs.filter((r) => r.territory_type === 'federal_subject').sort((a, b) => a.territory_name.localeCompare(b.territory_name, 'ru'));
    initControls(); renderAll();
  }

  function territoryName(tid) {
    const rows = state.byTerritory.get(tid) || [];
    return rows[0]?.territory_name || tid;
  }

  function latestRow(tid, metric = 'marriages_count') {
    const rows = (state.byTerritory.get(tid) || []).filter((r) => metricValue(r, metric) != null);
    return rows.length ? rows[rows.length - 1] : null;
  }

  function rowForYear(tid, year) {
    return (state.byTerritory.get(tid) || []).find((r) => Number(r.year) === Number(year));
  }

  function selectedTerritoryId() {
    const mode = el('territoryMode').value;
    if (mode === 'district') return el('districtSelect').value || state.countryId;
    if (mode === 'subject') return el('subjectSelect').value || state.countryId;
    return state.countryId;
  }

  function initControls() {
    el('districtSelect').innerHTML = state.districts.map((d) => `<option value="${d.territory_id}">${d.territory_name}</option>`).join('');
    el('subjectSelect').innerHTML = state.subjects.map((s) => `<option value="${s.territory_id}">${s.territory_name}</option>`).join('');
    const years = Array.from(new Set(state.series.map((r) => r.year))).sort((a, b) => b - a);
    el('yearSelect').innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
    ['territoryMode','districtSelect','subjectSelect','yearSelect','indicatorSelect','scenarioReduceRange'].forEach((id) => {
      const node = el(id); if (node) node.addEventListener('input', renderAll);
    });
    el('territoryMode').addEventListener('change', updateControlVisibility);
    updateControlVisibility();
  }

  function updateControlVisibility() {
    const mode = el('territoryMode').value;
    el('districtSelect').closest('.control').style.display = mode === 'district' ? '' : 'none';
    el('subjectSelect').closest('.control').style.display = mode === 'subject' ? '' : 'none';
  }

  function updateHero() {
    const r = latestRow(state.countryId, 'marriages_count');
    el('heroMarriages').textContent = r ? fmtInt(r.marriages_count) : '—';
    el('heroDivorces').textContent = r ? fmtInt(r.divorces_count) : '—';
    el('heroDivorceIndex').textContent = r ? fmt1(r.divorces_per_100_marriages) : '—';
  }

  function updateKpi() {
    const tid = selectedTerritoryId();
    const r = latestRow(tid, 'marriages_count');
    const share = Number(el('scenarioReduceRange').value || 0);
    el('scenarioReduceLabel').textContent = share;
    el('selectedTerritoryLabel').textContent = territoryName(tid);
    el('kpiMarriages').textContent = r ? fmtInt(r.marriages_count) : '—';
    el('kpiDivorces').textContent = r ? fmtInt(r.divorces_count) : '—';
    el('kpiRates').textContent = r ? `${fmt1(r.marriage_rate_per_1000)} / ${fmt1(r.divorce_rate_per_1000)}` : '—';
    el('kpiDivorceIndex').textContent = r ? fmt1(r.divorces_per_100_marriages) : '—';
    el('kpiScenario').textContent = r ? fmtInt(Math.round(r.divorces_count * share / 100)) : '—';
  }

  function renderMap() {
    if (!window.Plotly || !state.geo) return;
    const year = Number(el('yearSelect').value);
    const metric = el('indicatorSelect').value;
    const features = state.geo.features || [];
    const rows = features.map((f) => rowForYear(f.properties.territory_id, year));
    const locations = features.map((f) => f.properties.territory_id);
    const values = rows.map((r) => metricValue(r, metric));
    const hover = features.map((f, i) => {
      const r = rows[i];
      if (!r) return `${f.properties.territory_name}<br>нет сопоставимых данных`;
      return [`<b>${f.properties.territory_name}</b>`, `Год: ${year}`, `Браки: ${fmtInt(r.marriages_count)}`, `Разводы: ${fmtInt(r.divorces_count)}`, `Браков на 1000: ${fmt1(r.marriage_rate_per_1000)}`, `Разводов на 1000: ${fmt1(r.divorce_rate_per_1000)}`, `Разводов на 100 браков: ${fmt1(r.divorces_per_100_marriages)}`].join('<br>');
    });
    const trace = {
      type: 'choropleth',
      geojson: state.geo,
      featureidkey: 'properties.territory_id',
      locations,
      z: values,
      text: hover,
      hoverinfo: 'text',
      colorscale: [[0, '#f6ead0'], [0.45, '#d6a436'], [1, '#0f4f57']],
      marker: { line: { width: 0.35, color: 'rgba(0,0,0,.35)' } },
      colorbar: { title: metricLabel(metric), thickness: 12, len: 0.72 },
    };
    const layout = { ...plotLayout(''), margin: { l: 0, r: 0, t: 0, b: 0 }, geo: { projection: { type: 'mercator' }, fitbounds: 'locations', visible: false, bgcolor: 'rgba(0,0,0,0)' } };
    Plotly.react('familyMap', [trace], layout, plotConfig());
  }

  function renderLineChart(divId, metricA, metricB, names, title) {
    if (!window.Plotly) return;
    const selected = selectedTerritoryId();
    const ids = selected === state.countryId ? [state.countryId] : [state.countryId, selected];
    const colors = ['#0f4f57', '#d6a436', '#7b8f96', '#b76f2c'];
    const traces = [];
    ids.forEach((tid, idx) => {
      const rowsA = (state.byTerritory.get(tid) || []).filter((r) => metricValue(r, metricA) != null);
      traces.push({ type: 'scatter', mode: 'lines+markers', name: `${tid === state.countryId ? 'Россия' : territoryName(tid)} · ${names[0]}`, x: rowsA.map((r) => r.year), y: rowsA.map((r) => metricValue(r, metricA)), line: { color: colors[idx * 2], width: idx ? 3 : 4 }, marker: { size: 5 }, hovertemplate: '%{x}<br>%{y:,.2f}<extra></extra>' });
      if (metricB) {
        const rowsB = (state.byTerritory.get(tid) || []).filter((r) => metricValue(r, metricB) != null);
        traces.push({ type: 'scatter', mode: 'lines+markers', name: `${tid === state.countryId ? 'Россия' : territoryName(tid)} · ${names[1]}`, x: rowsB.map((r) => r.year), y: rowsB.map((r) => metricValue(r, metricB)), line: { color: colors[idx * 2 + 1], width: idx ? 3 : 4, dash: 'dot' }, marker: { size: 5 }, hovertemplate: '%{x}<br>%{y:,.2f}<extra></extra>' });
      }
    });
    Plotly.react(divId, traces, plotLayout(title), plotConfig());
  }

  function renderDivorceReduction() {
    if (!window.Plotly) return;
    const selected = selectedTerritoryId();
    const share = Number(el('scenarioReduceRange').value || 0) / 100;
    const rows = (state.byTerritory.get(selected) || []).filter((r) => r.divorces_count != null);
    const trace = { type: 'bar', name: 'меньше разводов', x: rows.map((r) => r.year), y: rows.map((r) => Math.round(r.divorces_count * share)), marker: { color: '#d6a436' }, hovertemplate: '%{x}<br>%{y:,.0f}<extra></extra>' };
    Plotly.react('divorceReductionPlot', [trace], plotLayout('Снижение числа разводов'), plotConfig());
  }

  function renderTopTable() {
    const year = Number(el('yearSelect').value);
    const metric = el('indicatorSelect').value;
    const rows = state.series.filter((r) => r.territory_type === 'federal_subject' && Number(r.year) === year && metricValue(r, metric) != null).sort((a, b) => metricValue(b, metric) - metricValue(a, metric)).slice(0, 10);
    el('topRegionsTable').querySelector('tbody').innerHTML = rows.map((r) => `<tr><td>${r.territory_name}</td><td class="num">${metricFormat(metric, metricValue(r, metric))}</td><td class="num">${r.year}</td></tr>`).join('');
  }

  function renderTerritoryTable() {
    const selected = selectedTerritoryId();
    const rows = (state.byTerritory.get(selected) || []).filter((r) => r.year >= 2016).sort((a, b) => b.year - a.year).slice(0, 8);
    el('territoryTable').querySelector('tbody').innerHTML = rows.map((r) => `<tr><td>${r.year}</td><td class="num">${fmtInt(r.marriages_count)}</td><td class="num">${fmtInt(r.divorces_count)}</td><td class="num">${fmt1(r.divorces_per_100_marriages)}</td></tr>`).join('');
  }

  function chartReady(id) {
    return Boolean(document.querySelector(`#${id} .main-svg`));
  }

  function getState() {
    const selected = state.data ? selectedTerritoryId() : state.countryId;
    const chartIds = ['familyMap', 'divorceReductionPlot', 'eventsTrend', 'ratesTrend', 'indexTrend'];
    return {
      loaded: Boolean(state.data && state.geo && state.series.length),
      runtimeExternalFetch: state.data?.metadata?.runtime_external_fetch,
      selectedTerritoryId: selected,
      selectedTerritoryName: territoryName(selected),
      analysisMode: el('territoryMode')?.value || 'country',
      year: Number(el('yearSelect')?.value || 0),
      indicator: el('indicatorSelect')?.value || '',
      scenarioShare: Number(el('scenarioReduceRange')?.value || 0),
      seriesCount: state.series.length,
      geoFeatureCount: state.geo?.features?.length || 0,
      districtCount: state.districts.length,
      subjectCount: state.subjects.length,
      chartIds,
      renderedCharts: chartIds.filter(chartReady),
      topTableRows: el('topRegionsTable')?.querySelectorAll('tbody tr').length || 0,
      territoryTableRows: el('territoryTable')?.querySelectorAll('tbody tr').length || 0,
      kpiScenarioText: el('kpiScenario')?.textContent || '',
    };
  }

  function setupModuleContract() {
    window.FamilyModule = { getState };
  }

  function renderAll() {
    updateHero(); updateKpi(); renderMap();
    renderLineChart('eventsTrend', 'marriages_count', 'divorces_count', ['браки', 'разводы'], 'Абсолютные значения');
    renderLineChart('ratesTrend', 'marriage_rate_per_1000', 'divorce_rate_per_1000', ['браки', 'разводы'], 'На 1000 населения');
    renderLineChart('indexTrend', 'divorces_per_100_marriages', null, ['разводов на 100 браков'], 'Индекс разводимости');
    renderDivorceReduction(); renderTopTable(); renderTerritoryTable();
  }

  setupModuleContract();

  loadData().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin', `<div style="background:#fff;color:#111;padding:16px;font-weight:700">Данные страницы «Семья» временно недоступны: ${String(err.message || err)}</div>`);
  });
})();
