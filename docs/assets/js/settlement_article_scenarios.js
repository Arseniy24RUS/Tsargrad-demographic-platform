'use strict';

(function(){
  const DATA_URL = 'data/settlement_article_scenarios_russia.json';
  const RUSSIA_ID = 'terr_rf_bez_novyh_subektov';
  const DASHBOARD_END = 2050;
  const USER_SLIDER_MIN = -10;
  const USER_SLIDER_MAX = 10;
  const SCENARIO_KEYS = ['urbanization', 'fixation', 'deurbanization'];
  const PRESET_TO_KEY = {
    urban: 'urbanization',
    fix: 'fixation',
    deurban: 'deurbanization'
  };
  const KEY_TO_PRESET = {
    urbanization: 'urban',
    fixation: 'fix',
    deurbanization: 'deurban'
  };
  const SCENARIO_UI = {
    urbanization: {
      title: 'урбанизационный сценарий',
      label: 'Урбанизационный сценарий',
      color: '#A94B48',
      description: 'продолжение снижения сельской доли'
    },
    fixation: {
      title: 'фиксация',
      label: 'Фиксация',
      color: '#145B61',
      description: 'сохранение доли на уровне начала расчёта'
    },
    deurbanization: {
      title: 'ИЖС-сценарий',
      label: 'ИЖС-сценарий',
      color: '#D4A537',
      description: 'рост сельской и пригородной среды'
    },
    custom: {
      title: 'ручная настройка',
      label: 'Ручная настройка',
      color: '#D4A537',
      description: 'траектория по настройке пользователя'
    }
  };

  const state = {
    data: null,
    installed: false,
    calibration: null,
    originalUpdateSettlementCharts: null,
    originalUpdateSettlementTable: null,
    originalSetPreset: null,
    originalUpdateSliderLabels: null,
    lastModeledRows: []
  };

  function fmtNumLocal(value, digits=1){
    if(value === null || value === undefined || !Number.isFinite(+value)) return '—';
    return (+value).toLocaleString('ru-RU', {maximumFractionDigits: digits, minimumFractionDigits: digits});
  }
  function fmtMillions(value, digits=2){
    if(value === null || value === undefined || !Number.isFinite(+value)) return '—';
    return fmtNumLocal(+value/1e6, digits) + ' млн';
  }
  function fmtSignedMillions(value, digits=2){
    if(value === null || value === undefined || !Number.isFinite(+value)) return '—';
    const sign = value > 0 ? '+' : '';
    return sign + fmtMillions(value, digits);
  }
  function fmtPctLocal(share, digits=1){
    if(share === null || share === undefined || !Number.isFinite(+share)) return '—';
    return fmtNumLocal(+share*100, digits) + '%';
  }
  function fmtPoints(value, digits=1){
    if(value === null || value === undefined || !Number.isFinite(+value)) return '—';
    const sign = value > 0 ? '+' : '';
    return sign + fmtNumLocal(+value, digits) + ' п.п.';
  }
  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }
  function nearlyEqual(a, b, eps=0.000001){
    return Number.isFinite(+a) && Number.isFinite(+b) && Math.abs(+a - +b) <= eps;
  }
  function rowsFor(key, endYear=DASHBOARD_END){
    return (state.data?.scenarios?.[key] || []).filter(row => Number(row.year) <= endYear);
  }
  function rowFor(key, year){
    return (state.data?.scenarios?.[key] || []).find(row => Number(row.year) === Number(year)) || null;
  }
  function actualRows(endYear=2023){
    return (state.data?.actual || []).filter(row => Number(row.year) <= endYear);
  }
  function valueAt(key, year, field){
    const row = rowFor(key, year);
    return row ? Number(row[field]) : null;
  }
  function activePreset(){
    const active = document.querySelector('[data-preset].active');
    return active?.dataset?.preset || null;
  }
  function activeScenarioKey(){
    const preset = activePreset();
    return preset ? PRESET_TO_KEY[preset] || null : null;
  }
  function currentDeltaPoints(){
    const slider = document.getElementById('delta2050');
    if(!slider) return state.calibration?.presetDeltas.deurbanization || 0;
    return Number(slider.value);
  }
  function selectedScenarioTitle(){
    const key = activeScenarioKey();
    return key ? SCENARIO_UI[key].label : SCENARIO_UI.custom.label;
  }

  function buildCalibration(){
    const fix2050 = rowFor('fixation', DASHBOARD_END);
    if(!fix2050) return null;
    const fixationShare = Number(fix2050.rural_share);
    const presetDeltas = {};
    SCENARIO_KEYS.forEach(key => {
      const row = rowFor(key, DASHBOARD_END);
      presetDeltas[key] = row ? (Number(row.rural_share) - fixationShare) * 100 : 0;
    });
    return {
      fixationShare,
      presetDeltas,
      sliderMin: USER_SLIDER_MIN,
      sliderMax: USER_SLIDER_MAX
    };
  }

  function mix(a, b, t){
    if(!Number.isFinite(+a) || !Number.isFinite(+b)) return null;
    return Number(a) + (Number(b) - Number(a)) * t;
  }

  function exactKeyForDelta(deltaPoints){
    const active = activeScenarioKey();
    if(active) return active;
    for(const key of SCENARIO_KEYS){
      if(nearlyEqual(deltaPoints, state.calibration?.presetDeltas?.[key], 0.01)) return key;
    }
    return null;
  }

  function modelArticleRow(year, deltaPoints){
    const exactKey = exactKeyForDelta(deltaPoints);
    if(exactKey){
      const exact = rowFor(exactKey, year);
      if(exact) return {
        year: Number(year),
        rural_share: Number(exact.rural_share),
        population_total: Number(exact.population_total),
        scenarioKey: exactKey,
        interpolation: exactKey
      };
    }

    const urban = rowFor('urbanization', year);
    const fix = rowFor('fixation', year);
    const izhs = rowFor('deurbanization', year);
    if(!urban || !fix || !izhs) return null;

    if(deltaPoints <= 0){
      const anchor = state.calibration.presetDeltas.urbanization || -1;
      const t = deltaPoints / anchor;
      return {
        year: Number(year),
        rural_share: mix(fix.rural_share, urban.rural_share, t),
        population_total: mix(fix.population_total, urban.population_total, t),
        scenarioKey: 'custom',
        interpolation: 'urbanization-fixation'
      };
    }

    const anchor = state.calibration.presetDeltas.deurbanization || 1;
    const t = deltaPoints / anchor;
    return {
      year: Number(year),
      rural_share: mix(fix.rural_share, izhs.rural_share, t),
      population_total: mix(fix.population_total, izhs.population_total, t),
      scenarioKey: 'custom',
      interpolation: 'fixation-deurbanization'
    };
  }

  function articleYears(){
    return rowsFor('fixation', DASHBOARD_END).map(row => Number(row.year));
  }

  function modeledArticleRows(deltaPoints=currentDeltaPoints()){
    return articleYears().map(year => modelArticleRow(year, deltaPoints)).filter(Boolean);
  }

  function modeledRowsForState(deltaPoints=currentDeltaPoints()){
    const baseRows = (typeof settlementState !== 'undefined' && Array.isArray(settlementState.rows)) ? settlementState.rows : [];
    const baseByYear = new Map(baseRows.map(row => [Number(row.year), row]));
    const allowedYears = baseByYear.size ? new Set(baseByYear.keys()) : new Set(articleYears());
    const modelRows = modeledArticleRows(deltaPoints).filter(row => allowedYears.has(Number(row.year)));
    return modelRows.map(model => {
      const base = baseByYear.get(Number(model.year)) || {};
      const urban = rowFor('urbanization', model.year);
      const fix = rowFor('fixation', model.year);
      const izhs = rowFor('deurbanization', model.year);
      const scenarioPopulation = Number(model.population_total);
      const urbanPopulation = Number(urban?.population_total);
      const scenarioShare = Number(model.rural_share);
      const urbanShare = Number(urban?.rural_share);
      return {
        ...base,
        year: Number(model.year),
        baselineShare: urbanShare,
        scenarioShare,
        baselinePopulation: urbanPopulation,
        scenarioPopulation,
        extraPopulation: Number.isFinite(scenarioPopulation) && Number.isFinite(urbanPopulation) ? scenarioPopulation - urbanPopulation : null,
        articleUrbanPopulation: urbanPopulation,
        articleFixationPopulation: fix ? Number(fix.population_total) : null,
        articleIzhsPopulation: izhs ? Number(izhs.population_total) : null,
        articleUrbanShare: urbanShare,
        articleFixationShare: fix ? Number(fix.rural_share) : null,
        articleIzhsShare: izhs ? Number(izhs.rural_share) : null,
        articleDelta2050: deltaPoints / 100,
        articleScenarioKey: exactKeyForDelta(deltaPoints) || 'custom',
        populationScenario: 'noMIG'
      };
    });
  }

  function syncArticleStateRows(){
    if(typeof settlementState === 'undefined' || settlementState.selected !== RUSSIA_ID || !state.calibration) return [];
    const rows = modeledRowsForState();
    if(rows.length){
      settlementState.rows = rows;
      settlementState.populationScenario = 'noMIG';
      state.lastModeledRows = rows;
    }
    return rows;
  }

  function ensureIntroCard(){
    if(document.getElementById('settlementArticleScenarioCard')) return;
    const controls = document.querySelector('.scenario-chip-row');
    if(!controls) return;
    const card = document.createElement('div');
    card.id = 'settlementArticleScenarioCard';
    card.className = 'settlement-article-scenario-card';
    card.innerHTML = `
      <div class="scenario-source-status">Источник численности: расчёт статьи</div>
      <div class="scenario-source-title">Управляемая модель структуры расселения</div>
      <div class="scenario-source-text">
        Пресеты откалиброваны по трём траекториям из расчёта статьи. Ползунок задаёт отклонение доли сельской и пригородной среды к 2050 году от режима фиксации; графики, KPI и таблица пересчитываются сразу.
      </div>
      <div class="scenario-source-note" id="settlementArticleSourceNote">Горизонт платформы — 2050 год.</div>
    `;
    controls.parentNode.insertBefore(card, controls);
  }

  function renderMethodNotice(){
    if(document.getElementById('settlementArticleMethodNotice')) return;
    const popChart = document.getElementById('populationTraceChart');
    const card = popChart?.closest('.card');
    if(!card) return;
    const notice = document.createElement('div');
    notice.id = 'settlementArticleMethodNotice';
    notice.className = 'settlement-article-method-notice';
    notice.innerHTML = `
      <strong>Как читать график:</strong>
      серая линия показывает факт, красная — урбанизационную траекторию из расчёта статьи, золотая — результат текущих настроек пользователя. При СКР ниже простого воспроизводства численность снижается; параметры расселения меняют масштаб потерь.
    `;
    card.insertBefore(notice, popChart);
  }

  function updateScenarioExplanatoryCard(){
    const note = document.getElementById('settlementArticleSourceNote');
    if(!note || !state.data || !state.calibration) return;
    const deltaPoints = currentDeltaPoints();
    const modeled = modelArticleRow(DASHBOARD_END, deltaPoints);
    const urban2050 = rowFor('urbanization', DASHBOARD_END);
    const diff = modeled && urban2050 ? Number(modeled.population_total) - Number(urban2050.population_total) : null;
    note.textContent = `Текущая настройка 2050: ${fmtPoints(deltaPoints, 1)} к фиксации; разница с урбанизационной траекторией — ${fmtSignedMillions(diff, 2)}.`;
  }

  function syncControls(){
    if(!state.calibration) return;
    const slider = document.getElementById('delta2050');
    if(slider){
      slider.disabled = false;
      slider.removeAttribute('aria-hidden');
      slider.min = String(state.calibration.sliderMin);
      slider.max = String(state.calibration.sliderMax);
      slider.step = '0.01';
      slider.closest('.control')?.classList.remove('settlement-disabled-slider');
    }
    const ticks = document.querySelectorAll('.range-ruler .range-tick');
    if(ticks[0]) ticks[0].textContent = fmtPoints(state.calibration.sliderMin, 1);
    if(ticks[1]) ticks[1].textContent = '0';
    if(ticks[2]) ticks[2].textContent = fmtPoints(state.calibration.sliderMax, 1);
    const deltaLabel = document.getElementById('delta2050Title');
    if(deltaLabel) deltaLabel.textContent = 'Целевая доля сельской и пригородной среды к 2050 году';
    const deltaText = slider?.closest('.control')?.querySelector('.text-note');
    if(deltaText) deltaText.innerHTML = `Отклонение от фиксации: <span class="range-value" id="delta2050Label">${fmtPoints(currentDeltaPoints(), 1)}</span>`;
    document.querySelectorAll('[data-preset]').forEach(btn => {
      const key = PRESET_TO_KEY[btn.dataset.preset];
      if(key) btn.textContent = SCENARIO_UI[key].label;
    });
    updateSliderLabelsLocal();
  }

  function updateSliderLabelsLocal(){
    const label = document.getElementById('delta2050Label');
    if(label) label.textContent = fmtPoints(currentDeltaPoints(), 1);
  }

  function setCalibratedPreset(name){
    if(!state.calibration) return;
    const key = PRESET_TO_KEY[name] || 'deurbanization';
    const slider = document.getElementById('delta2050');
    if(slider) slider.value = String(state.calibration.presetDeltas[key]);
    if(typeof settlementState !== 'undefined') settlementState.preset = KEY_TO_PRESET[key] || 'custom';
    document.querySelectorAll('.scenario-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === (KEY_TO_PRESET[key] || name));
    });
    updateSliderLabelsLocal();
    if(typeof updateSettlementCharts === 'function') updateSettlementCharts();
  }

  function ensureDefaultPreset(){
    if(!state.calibration) return;
    const slider = document.getElementById('delta2050');
    const active = activePreset();
    if(active === 'deurban' && slider && !nearlyEqual(Number(slider.value), state.calibration.presetDeltas.deurbanization, 0.0001)){
      slider.value = String(state.calibration.presetDeltas.deurbanization);
    }
    document.querySelectorAll('.scenario-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === 'deurban');
    });
    if(typeof settlementState !== 'undefined' && !settlementState.preset) settlementState.preset = 'deurban';
  }

  function renderRuralShareChart(){
    const target = document.getElementById('ruralShareChart');
    if(!target || !window.Plotly || !state.data || !state.calibration) return;
    const actual = actualRows(2023);
    const urban = rowsFor('urbanization', DASHBOARD_END);
    const scenario = modeledArticleRows();
    const deltaPoints = currentDeltaPoints();
    const narrow = window.TG?.isNarrow ? TG.isNarrow() : false;
    const title = selectedScenarioTitle();
    const traces = [
      {
        type:'scatter',
        x: actual.map(row => row.year),
        y: actual.map(row => 100 * Number(row.rural_share)),
        name:'Фактическая доля',
        mode:'lines',
        line:{color:'#6B7280',width:3}
      },
      {
        type:'scatter',
        x: urban.map(row => row.year),
        y: urban.map(row => 100 * Number(row.rural_share)),
        name:'Урбанизационная траектория',
        mode:'lines',
        line:{color:SCENARIO_UI.urbanization.color,width:3,dash:'dot'}
      },
      {
        type:'scatter',
        x: scenario.map(row => row.year),
        y: scenario.map(row => 100 * Number(row.rural_share)),
        name:`Выбранная траектория: ${title}`,
        mode:'lines',
        line:{color:SCENARIO_UI.deurbanization.color,width:4.5}
      }
    ];
    const layout = TG.plotLayout({
      height:470,
      margin:narrow?{l:52,r:22,t:28,b:112}:{l:70,r:36,t:36,b:76},
      xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,range:[1990,DASHBOARD_END],automargin:true},
      yaxis:{title:'доля сельской и пригородной среды, %',gridcolor:'#efe5d4'},
      legend:narrow?{orientation:'h',x:0,y:-0.30,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.92)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}
    });
    Plotly.react('ruralShareChart', traces, layout, TG.plotConfig);
    const chartTitle = document.getElementById('ruralShareChartTitle');
    if(chartTitle) chartTitle.textContent = 'Траектория доли по настройкам пользователя';
  }

  function renderPopulationChart(){
    const target = document.getElementById('populationTraceChart');
    if(!target || !window.Plotly || !state.data || !state.calibration) return;
    const actual = actualRows(2023);
    const urban = rowsFor('urbanization', DASHBOARD_END);
    const scenario = modeledArticleRows();
    const narrow = window.TG?.isNarrow ? TG.isNarrow() : false;
    const traces = [
      {
        type:'scatter',
        x: actual.map(row => row.year),
        y: actual.map(row => Number(row.population_total) / 1e6),
        name:'Фактическая численность',
        mode:'lines',
        line:{color:'#343434',width:3.2}
      },
      {
        type:'scatter',
        x: urban.map(row => row.year),
        y: urban.map(row => Number(row.population_total) / 1e6),
        name:'Урбанизационная траектория',
        mode:'lines',
        line:{color:SCENARIO_UI.urbanization.color,width:3,dash:'dot'}
      },
      {
        type:'scatter',
        x: scenario.map(row => row.year),
        y: scenario.map(row => Number(row.population_total) / 1e6),
        name:`Выбранный сценарий: ${selectedScenarioTitle()}`,
        mode:'lines',
        line:{color:SCENARIO_UI.deurbanization.color,width:4.5},
        fill:'tonexty',
        fillcolor:'rgba(212,165,55,.14)'
      }
    ];
    const layout = TG.plotLayout({
      height:500,
      margin:narrow?{l:54,r:18,t:30,b:118}:{l:76,r:32,t:38,b:78},
      xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,range:[1990,DASHBOARD_END],automargin:true},
      yaxis:{title:'млн человек',gridcolor:'#efe5d4'},
      legend:narrow?{orientation:'h',x:0,y:-0.31,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.92)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.13,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}
    });
    Plotly.react('populationTraceChart', traces, layout, TG.plotConfig);
  }

  function updateKpis(){
    if(!state.data || !state.calibration) return;
    const rows = syncArticleStateRows();
    const row2050 = rows.find(row => Number(row.year) === DASHBOARD_END) || {};
    const model2050 = modelArticleRow(DASHBOARD_END, currentDeltaPoints());
    const urban2050 = rowFor('urbanization', DASHBOARD_END);
    const diffToUrban = model2050 && urban2050 ? Number(model2050.population_total) - Number(urban2050.population_total) : null;

    const popMetric = document.getElementById('settlementKpiPop2050')?.closest('.metric');
    const birthsMetric = document.getElementById('settlementKpiBirths')?.closest('.metric');
    const deltaMetric = document.getElementById('settlementKpiDeltaTfr2050')?.closest('.metric');
    if(popMetric) popMetric.querySelector('span').textContent = 'численность 2050';
    if(birthsMetric) birthsMetric.querySelector('span').textContent = 'разница с урбанизационной траекторией 2050';
    if(deltaMetric) deltaMetric.querySelector('span').textContent = 'изменение СКР к 2050';

    const setText = (id, text) => { const el = document.getElementById(id); if(el) el.textContent = text; };
    setText('settlementKpiRuralShare2050', model2050 ? fmtPctLocal(model2050.rural_share, 1) : '—');
    setText('settlementKpiPop2050', model2050 ? fmtMillions(model2050.population_total, 2) : '—');
    setText('settlementKpiBirths', fmtSignedMillions(diffToUrban, 2));
    setText('settlementKpiDeltaTfr2050', row2050?.deltaTfr == null ? '—' : `${row2050.deltaTfr >= 0 ? '+' : ''}${fmtNumLocal(row2050.deltaTfr, 3)}`);
    setText('settlementActivePill', 'Россия · ' + selectedScenarioTitle());

    const currentShare = actualRows(2023).at(-1)?.rural_share;
    setText('settlementHeroShare', fmtPctLocal(currentShare, 1));
    const label = document.getElementById('settlementShareLabelNow');
    if(label) label.textContent = 'сельская и пригородная среда сейчас';
  }

  function renderScenarioTable(){
    const table = document.getElementById('settlementTable');
    if(!table || !state.data || !state.calibration) return;
    const years = [2024, 2030, 2036, 2042, 2050];
    const rows = years.map(year => {
      const urban = rowFor('urbanization', year);
      const model = modelArticleRow(year, currentDeltaPoints());
      if(!urban || !model) return '';
      const diff = Number(model.population_total) - Number(urban.population_total);
      return `<tr>
        <td>${year}</td>
        <td>${fmtPctLocal(urban.rural_share, 1)}</td>
        <td>${fmtPctLocal(model.rural_share, 1)}</td>
        <td>${fmtMillions(urban.population_total, 2)}</td>
        <td>${fmtMillions(model.population_total, 2)}</td>
        <td>${fmtSignedMillions(diff, 2)}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `<table class="data-table settlement-article-table">
      <thead><tr>
        <th>Год</th>
        <th>доля: урбанизационная траектория</th>
        <th>доля: выбранные настройки</th>
        <th>население: урбанизационная траектория</th>
        <th>население: выбранные настройки</th>
        <th>разница</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>`;
  }

  function refreshArticleScenario(){
    if(!state.data || !state.calibration) return;
    const selectedTerritory = (typeof settlementState !== 'undefined' && settlementState.selected) ? settlementState.selected : RUSSIA_ID;
    ensureIntroCard();
    syncControls();
    renderMethodNotice();
    if(selectedTerritory !== RUSSIA_ID){
      const notice = document.getElementById('settlementArticleMethodNotice');
      if(notice){
        notice.innerHTML = '<strong>Региональный режим:</strong> расчёт статьи откалиброван для России в целом. Для выбранной территории используется локальная оценочная модель страницы.';
      }
      return;
    }
    const notice = document.getElementById('settlementArticleMethodNotice');
    if(notice){
      notice.innerHTML = '<strong>Как читать график:</strong> серая линия показывает факт, красная — урбанизационную траекторию из расчёта статьи, золотая — результат текущих настроек пользователя. При СКР ниже простого воспроизводства численность снижается; параметры расселения меняют масштаб потерь.';
    }
    updateScenarioExplanatoryCard();
    renderRuralShareChart();
    renderPopulationChart();
    updateKpis();
    renderScenarioTable();
  }

  function ensureBaseSettlementCharts(){
    const moduleState = window.SettlementModule?.getState?.();
    if(!moduleState || !moduleState.tfrForecastLoaded || (moduleState.rows || []).length) return;
    if(typeof updateSettlementCharts !== 'function') return;
    try{
      document.querySelectorAll('#settlementTfrChart > .text-note').forEach(node => node.remove());
      updateSettlementCharts();
      document.querySelectorAll('#settlementTfrChart > .text-note').forEach(node => node.remove());
    }catch(_){
      // The next tick retries after settlement.js finishes its async hydration.
    }
  }

  async function loadData(){
    if(state.data) return state.data;
    const response = await fetch(DATA_URL);
    if(!response.ok) throw new Error(`Не удалось загрузить сценарии расселения: ${response.status}`);
    state.data = await response.json();
    state.calibration = buildCalibration();
    return state.data;
  }

  function monkeyPatchUpdate(){
    if(state.installed) return;
    if(typeof setPreset === 'function'){
      state.originalSetPreset = setPreset;
      setPreset = setCalibratedPreset;
    }
    if(typeof updateSliderLabels === 'function'){
      state.originalUpdateSliderLabels = updateSliderLabels;
      updateSliderLabels = updateSliderLabelsLocal;
    }
    if(typeof updateSettlementCharts === 'function'){
      state.originalUpdateSettlementCharts = updateSettlementCharts;
      updateSettlementCharts = function(){
        const result = state.originalUpdateSettlementCharts.apply(this, arguments);
        setTimeout(refreshArticleScenario, 20);
        return result;
      };
    }
    if(typeof updateSettlementTable === 'function'){
      state.originalUpdateSettlementTable = updateSettlementTable;
      updateSettlementTable = function(rows){
        const selectedTerritory = (typeof settlementState !== 'undefined' && settlementState.selected) ? settlementState.selected : RUSSIA_ID;
        if(!state.data || selectedTerritory !== RUSSIA_ID){
          return state.originalUpdateSettlementTable.apply(this, arguments);
        }
        setTimeout(renderScenarioTable, 20);
      };
    }
    window.addEventListener('resize', () => setTimeout(refreshArticleScenario, 120));
    state.installed = true;
  }

  async function install(){
    try{
      await loadData();
      ensureIntroCard();
      monkeyPatchUpdate();
      ensureDefaultPreset();
      syncControls();
      let attempts = 0;
      const tick = () => {
        attempts += 1;
        ensureBaseSettlementCharts();
        refreshArticleScenario();
        if(attempts < 15) setTimeout(tick, 250);
      };
      tick();
    }catch(error){
      console.error(error);
      const controls = document.querySelector('.controls');
      if(controls && !document.getElementById('settlementArticleScenarioError')){
        const err = document.createElement('div');
        err.id = 'settlementArticleScenarioError';
        err.className = 'settlement-article-error';
        err.textContent = 'Сценарные данные расселения временно недоступны.';
        controls.prepend(err);
      }
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', install);
  }else{
    install();
  }
})();
