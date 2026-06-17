
'use strict';

(function(){
  const DATA_URL = 'data/settlement_article_scenarios_russia.json';
  const RUSSIA_ID = 'terr_rf_bez_novyh_subektov';
  const DASHBOARD_END = 2050;
  const HARD_SCENARIOS = {
    urban: 'urbanization',
    fix: 'fixation',
    deurban: 'deurbanization'
  };
  const SCENARIO_UI = {
    urbanization: {
      title: 'Урбанизационный сценарий',
      short: 'урбанизационный сценарий',
      color: '#A94B48',
      description: 'Продолжение тренда сокращения сельской доли.'
    },
    fixation: {
      title: 'Фиксация',
      short: 'фиксация',
      color: '#145B61',
      description: 'Сельская доля сохраняется на уровне 2024 года.'
    },
    deurbanization: {
      title: 'ИЖС-сценарий',
      short: 'ИЖС-сценарий',
      color: '#D4A537',
      description: 'Рост сельской и пригородной среды относительно урбанизационного сценария.'
    }
  };

  const state = {
    data: null,
    installed: false,
    lastScenario: null,
    originalUpdateSettlementCharts: null,
    originalUpdateSettlementTable: null
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
  function scenarioKey(){
    const active = document.querySelector('[data-preset].active');
    const preset = active?.dataset?.preset || (typeof settlementState !== 'undefined' ? settlementState.preset : 'deurban');
    return HARD_SCENARIOS[preset] || 'deurbanization';
  }
  function rowsFor(key, endYear=DASHBOARD_END){
    return (state.data?.scenarios?.[key] || []).filter(row => row.year <= endYear);
  }
  function rowFor(key, year){
    return (state.data?.scenarios?.[key] || []).find(row => row.year === year) || null;
  }
  function actualRows(endYear=2023){
    return (state.data?.actual || []).filter(row => row.year <= endYear);
  }
  function valueAt(key, year, field){
    const row = rowFor(key, year);
    return row ? row[field] : null;
  }
  function selectedScenarioTitle(){
    const key = scenarioKey();
    return SCENARIO_UI[key]?.title || 'Сценарий';
  }
  function ensureIntroCard(){
    if(document.getElementById('settlementArticleScenarioCard')) return;
    const controls = document.querySelector('.scenario-chip-row');
    if(!controls) return;
    const card = document.createElement('div');
    card.id = 'settlementArticleScenarioCard';
    card.className = 'settlement-article-scenario-card';
    card.innerHTML = `
      <div class="scenario-source-status">Источник численности: расчёт из статьи «Урбанизация против рождаемости»</div>
      <div class="scenario-source-title">Жёсткие сценарии структуры расселения</div>
      <div class="scenario-source-text">
        Для России используется приложенный расчёт: урбанизационный сценарий, фиксация доли сельского населения и ИЖС-сценарий. На графике численности всегда показываются все три сценария; выбранный сценарий выделяется золотым контуром и используется в KPI.
      </div>
      <div class="scenario-source-note" id="settlementArticleSourceNote">Горизонт платформы — 2050 год.</div>
    `;
    controls.parentNode.insertBefore(card, controls);
  }
  function relabelControls(){
    const delta = document.getElementById('delta2050');
    const deltaLabel = document.getElementById('delta2050Title');
    const deltaText = delta?.closest('.control')?.querySelector('.text-note');
    if(delta){
      delta.disabled = true;
      delta.setAttribute('aria-hidden','true');
      delta.closest('.control')?.classList.add('settlement-disabled-slider');
    }
    if(deltaLabel) deltaLabel.textContent = 'Сценарии доли сельской и пригородной среды';
    if(deltaText) deltaText.innerHTML = 'Ползунок отключён: используются жёсткие сценарные траектории из исходного расчёта.';
    document.querySelectorAll('[data-preset]').forEach(btn => {
      if(btn.dataset.preset === 'urban') btn.textContent = 'урбанизационный сценарий';
      if(btn.dataset.preset === 'fix') btn.textContent = 'фиксация';
      if(btn.dataset.preset === 'deurban') btn.textContent = 'ИЖС-сценарий';
    });
    const footer = document.querySelector('.footer');
    if(footer && !footer.dataset.settlementArticlePatch){
      footer.dataset.settlementArticlePatch = '1';
      footer.textContent = 'Расчётная платформа для экспертного обсуждения. Модуль «Расселение» использует сценарии численности из авторского расчёта; вклад структуры расселения трактуется как сценарный эффект, а не как официальный прогноз.';
    }
  }
  function updateScenarioExplanatoryCard(){
    const note = document.getElementById('settlementArticleSourceNote');
    if(!note || !state.data) return;
    const s2050 = state.data.summary?.['2050'] || {};
    note.innerHTML = `К 2050 году ИЖС-сценарий выше урбанизационного сценария на ${fmtSignedMillions(s2050.deurbanization_minus_urbanization,2)}.`;
  }

  function renderRuralShareChart(){
    const target = document.getElementById('ruralShareChart');
    if(!target || !window.Plotly || !state.data) return;
    const selected = scenarioKey();
    const actual = actualRows(2023);
    const traces = [
      {
        type:'scatter',
        x: actual.map(r => r.year),
        y: actual.map(r => 100*r.rural_share),
        name:'Фактическая доля сельского населения',
        mode:'lines',
        line:{color:'#6B7280',width:3}
      }
    ];
    ['urbanization','fixation','deurbanization'].forEach(key => {
      const rows = rowsFor(key, DASHBOARD_END);
      traces.push({
        type:'scatter',
        x: rows.map(r => r.year),
        y: rows.map(r => 100*r.rural_share),
        name: SCENARIO_UI[key].title,
        mode:'lines',
        line:{
          color: SCENARIO_UI[key].color,
          width: key===selected ? 5 : 2.6,
          dash: key===selected ? 'solid' : 'dot'
        }
      });
    });
    const narrow = window.TG?.isNarrow ? TG.isNarrow() : false;
    const layout = TG.plotLayout({
      height:470,
      margin:narrow?{l:52,r:22,t:28,b:112}:{l:70,r:36,t:36,b:76},
      xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,range:[1990,DASHBOARD_END],automargin:true},
      yaxis:{title:'доля сельского населения, %',gridcolor:'#efe5d4'},
      legend:narrow?{orientation:'h',x:0,y:-0.30,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.92)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1},
      annotations:[{
        x:2050,
        y:100*valueAt(selected,2050,'rural_share'),
        text:`2050: ${fmtPctLocal(valueAt(selected,2050,'rural_share'),1)}`,
        showarrow:true,
        arrowhead:2,
        ax:-45,
        ay:-30,
        bgcolor:'rgba(255,255,255,.92)',
        bordercolor:'#D4A537',
        font:{color:'#145B61'}
      }]
    });
    Plotly.react('ruralShareChart', traces, layout, TG.plotConfig);
    const title = document.getElementById('ruralShareChartTitle');
    if(title) title.textContent = 'Жёсткие сценарии доли сельского населения';
  }

  function renderPopulationChart(){
    const target = document.getElementById('populationTraceChart');
    if(!target || !window.Plotly || !state.data) return;
    const selected = scenarioKey();
    const actual = actualRows(2023);
    const deurb = rowsFor('deurbanization', DASHBOARD_END);
    const urban = rowsFor('urbanization', DASHBOARD_END);
    const bandX = [...urban.map(r => r.year), ...deurb.map(r => r.year).reverse()];
    const bandY = [...urban.map(r => r.population_total/1e6), ...deurb.map(r => r.population_total/1e6).reverse()];
    const traces = [
      {
        type:'scatter',
        x:bandX,
        y:bandY,
        name:'коридор между урбанизационным и ИЖС-сценарием',
        mode:'lines',
        fill:'toself',
        fillcolor:'rgba(212,165,55,.16)',
        line:{color:'rgba(212,165,55,0)',width:0},
        hoverinfo:'skip',
        showlegend:true
      },
      {
        type:'scatter',
        x: actual.map(r => r.year),
        y: actual.map(r => r.population_total/1e6),
        name:'Фактическая численность',
        mode:'lines',
        line:{color:'#343434',width:3.2}
      }
    ];
    ['urbanization','fixation','deurbanization'].forEach(key => {
      const rows = rowsFor(key, DASHBOARD_END);
      traces.push({
        type:'scatter',
        x: rows.map(r => r.year),
        y: rows.map(r => r.population_total/1e6),
        name: SCENARIO_UI[key].title,
        mode:'lines',
        line:{
          color: SCENARIO_UI[key].color,
          width: key===selected ? 5 : 2.8,
          dash: key===selected ? 'solid' : 'dot'
        }
      });
    });
    const diff2050 = valueAt('deurbanization',2050,'population_total') - valueAt('urbanization',2050,'population_total');
    const narrow = window.TG?.isNarrow ? TG.isNarrow() : false;
    const layout = TG.plotLayout({
      height:500,
      margin:narrow?{l:54,r:18,t:30,b:118}:{l:76,r:32,t:38,b:78},
      xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,range:[1990,DASHBOARD_END],automargin:true},
      yaxis:{title:'млн человек',gridcolor:'#efe5d4'},
      legend:narrow?{orientation:'h',x:0,y:-0.31,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.92)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.13,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1},
      annotations:[
        {
          x:2050,
          y:valueAt(selected,2050,'population_total')/1e6,
          text:`${selectedScenarioTitle()} 2050: ${fmtMillions(valueAt(selected,2050,'population_total'),1)}`,
          showarrow:true,
          arrowhead:2,
          ax:-80,
          ay:-34,
          bgcolor:'rgba(255,255,255,.93)',
          bordercolor:'#D4A537',
          font:{color:'#145B61'}
        },
        {
          x:2034,
          y:Math.max(valueAt('deurbanization',2036,'population_total'), valueAt('urbanization',2036,'population_total'))/1e6 + 1.2,
          text:`ИЖС-сценарий к 2050: ${fmtSignedMillions(diff2050,2)} к урбанизационному сценарию`,
          showarrow:false,
          align:'left',
          bgcolor:'rgba(255,255,255,.93)',
          bordercolor:'#eadbbf',
          font:{color:'#145B61',size:12}
        }
      ]
    });
    Plotly.react('populationTraceChart', traces, layout, TG.plotConfig);
  }

  function updateKpis(){
    if(!state.data) return;
    const selected = scenarioKey();
    const row2050 = rowFor(selected,2050);
    const urban2050 = rowFor('urbanization',2050);
    const fix2050 = rowFor('fixation',2050);
    const deurb2050 = rowFor('deurbanization',2050);
    const diffToUrban = row2050 && urban2050 ? row2050.population_total - urban2050.population_total : null;
    const diffDeurbUrban = deurb2050 && urban2050 ? deurb2050.population_total - urban2050.population_total : null;

    const popMetric = document.getElementById('settlementKpiPop2050')?.closest('.metric');
    const birthsMetric = document.getElementById('settlementKpiBirths')?.closest('.metric');
    const deltaMetric = document.getElementById('settlementKpiDeltaTfr2050')?.closest('.metric');
    if(popMetric) popMetric.querySelector('span').textContent = 'численность 2050';
    if(birthsMetric) birthsMetric.querySelector('span').textContent = 'разница с урбанизацией 2050';
    if(deltaMetric) deltaMetric.querySelector('span').textContent = 'коридор ИЖС−урбан. 2050';

    const setText = (id, text) => { const el=document.getElementById(id); if(el) el.textContent=text; };
    setText('settlementKpiRuralShare2050', row2050 ? fmtPctLocal(row2050.rural_share,1) : '—');
    setText('settlementKpiPop2050', row2050 ? fmtMillions(row2050.population_total,2) : '—');
    setText('settlementKpiBirths', diffToUrban==null ? '—' : fmtSignedMillions(diffToUrban,2));
    setText('settlementKpiDeltaTfr2050', diffDeurbUrban==null ? '—' : fmtSignedMillions(diffDeurbUrban,2));
    setText('settlementActivePill', 'Россия · ' + (SCENARIO_UI[selected]?.short || 'сценарий'));

    const currentShare = actualRows(2023).at(-1)?.rural_share;
    setText('settlementHeroShare', fmtPctLocal(currentShare,1));
    const label = document.getElementById('settlementShareLabelNow');
    if(label) label.textContent = 'сельская доля сейчас';
  }

  function renderScenarioTable(){
    const table = document.getElementById('settlementTable');
    if(!table || !state.data) return;
    const years = [2024,2030,2036,2050];
    const rows = years.map(year => {
      const u = rowFor('urbanization',year);
      const f = rowFor('fixation',year);
      const d = rowFor('deurbanization',year);
      if(!u || !f || !d) return '';
      const diff = d.population_total - u.population_total;
      const yearLabel = String(year);
      return `<tr>
        <td>${yearLabel}</td>
        <td>${fmtPctLocal(u.rural_share,1)}</td>
        <td>${fmtPctLocal(f.rural_share,1)}</td>
        <td>${fmtPctLocal(d.rural_share,1)}</td>
        <td>${fmtMillions(u.population_total,2)}</td>
        <td>${fmtMillions(f.population_total,2)}</td>
        <td>${fmtMillions(d.population_total,2)}</td>
        <td>${fmtSignedMillions(diff,2)}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `<table class="data-table settlement-article-table">
      <thead><tr>
        <th>Год</th>
        <th>сельская доля: урбанизационный сценарий</th>
        <th>сельская доля: фиксация</th>
        <th>сельская доля: ИЖС-сценарий</th>
        <th>население: урбанизационный сценарий</th>
        <th>население: фиксация</th>
        <th>население: ИЖС-сценарий</th>
        <th>ИЖС − урбанизационный</th>
      </tr></thead><tbody>${rows}</tbody>
    </table>`;
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
      все три линии после 2024 года — сценарии авторского расчёта. Они не показывают рост населения: при СКР ниже простого воспроизводства население сокращается во всех сценариях, а политика расселения лишь меняет масштаб потерь.
    `;
    card.insertBefore(notice, popChart);
  }

  function refreshArticleScenario(){
    if(!state.data) return;
    // The source scenario is only for Russia. Do not override regional charts.
    const selectedTerritory = (typeof settlementState !== 'undefined' && settlementState.selected) ? settlementState.selected : RUSSIA_ID;
    if(selectedTerritory !== RUSSIA_ID){
      const notice = document.getElementById('settlementArticleMethodNotice');
      if(notice){
        notice.innerHTML = '<strong>Региональный режим:</strong> приложенный жёсткий сценарный расчёт численности относится к России в целом. Для выбранной территории используется локальная оценочная модель страницы.';
      }
      return;
    }
    ensureIntroCard();
    relabelControls();
    updateScenarioExplanatoryCard();
    renderMethodNotice();
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
    return state.data;
  }

  function attachEventHooks(){
    document.querySelectorAll('[data-preset], #settlementTerritorySelect').forEach(el => {
      el.addEventListener('click', () => setTimeout(refreshArticleScenario, 80));
      el.addEventListener('change', () => setTimeout(refreshArticleScenario, 80));
    });
    window.addEventListener('resize', () => setTimeout(refreshArticleScenario, 120));
  }

  function monkeyPatchUpdate(){
    if(state.installed) return;
    if(typeof updateSettlementCharts === 'function'){
      state.originalUpdateSettlementCharts = updateSettlementCharts;
      updateSettlementCharts = function(){
        const result = state.originalUpdateSettlementCharts.apply(this, arguments);
        setTimeout(refreshArticleScenario, 40);
        return result;
      };
    }
    if(typeof updateSettlementTable === 'function'){
      state.originalUpdateSettlementTable = updateSettlementTable;
      updateSettlementTable = function(rows){
        const selectedTerritory = (typeof settlementState !== 'undefined' && settlementState.selected) ? settlementState.selected : RUSSIA_ID;
        if(selectedTerritory !== RUSSIA_ID){
          return state.originalUpdateSettlementTable.apply(this, arguments);
        }
        setTimeout(renderScenarioTable, 20);
      };
    }
    state.installed = true;
  }

  async function install(){
    try{
      await loadData();
      ensureIntroCard();
      relabelControls();
      monkeyPatchUpdate();
      attachEventHooks();
      // Repeat a few times because settlement.js loads data asynchronously.
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
