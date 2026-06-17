'use strict';

(function(){
  const DATA_URL = 'data/rpn_housing_effect_model.json';
  let model = null;
  let state = {
    housingBarrier: true,
    housingNeed: false,
    highHousingMeasures: false,
    coveragePct: 60,
    conversionPct: 35,
    implementationYears: 6,
    showThreeYearCheck: false
  };

  const fmt0 = new Intl.NumberFormat('ru-RU', {maximumFractionDigits:0});
  const fmt1 = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:1, maximumFractionDigits:1});
  const fmtPct = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:0, maximumFractionDigits:0});

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRpnHousingEffectRedesign);
  else initRpnHousingEffectRedesign();

  async function initRpnHousingEffectRedesign(){
    try{
      const response = await fetch(DATA_URL);
      if(!response.ok) throw new Error(`Не удалось загрузить ${DATA_URL}`);
      model = await response.json();
      state = {...state, ...normalizeDefaults(model.defaults || {})};
      hideLegacyHousingEffect();
      const mount = ensureMount();
      mount.innerHTML = template();
      bindControls(mount);
      renderAll();
    }catch(error){
      console.error(error);
      const mount = ensureMount();
      mount.innerHTML = `<section class="rpn-effect-designer"><div class="rpn-effect-hero"><h2>Жилищный резерв рождаемости</h2><p>Данные модуля временно недоступны. Проверьте файл ${DATA_URL}.</p></div></section>`;
    }
  }

  function normalizeDefaults(defaults){
    return {
      housingBarrier: boolDefault(defaults.housing_barrier, state.housingBarrier),
      housingNeed: false,
      highHousingMeasures: false,
      coveragePct: numberDefault(defaults.coverage_pct, state.coveragePct),
      conversionPct: numberDefault(defaults.conversion_pct, state.conversionPct),
      implementationYears: numberDefault(defaults.implementation_years, state.implementationYears),
      showThreeYearCheck: false
    };
  }

  function boolDefault(value, fallback){
    return typeof value === 'boolean' ? value : fallback;
  }

  function numberDefault(value, fallback){
    return Number.isFinite(+value) ? +value : fallback;
  }

  function ensureMount(){
    let mount = document.getElementById('rpnHousingEffectDesignerMount');
    if(mount) return mount;
    mount = document.createElement('div');
    mount.id = 'rpnHousingEffectDesignerMount';
    mount.className = 'rpn-effect-mount';
    mount.setAttribute('data-detail-section', '');
    const hero = document.querySelector('.rpn-hero-card');
    if(hero && hero.parentNode) hero.parentNode.insertBefore(mount, hero.nextSibling);
    else {
      const main = document.querySelector('main') || document.body;
      main.appendChild(mount);
    }
    return mount;
  }

  function hideLegacyHousingEffect(){
    const ids = ['rpnScenarioSelect','rpnPotentialChart','rpnOrderPotentialChart','rpnScenarioTable'];
    const seen = new Set();
    ids.forEach(id => {
      const el = document.getElementById(id);
      const section = el?.closest('section');
      if(section && !seen.has(section)){
        section.classList.add('rpn-old-housing-effect-hidden');
        section.setAttribute('aria-hidden','true');
        seen.add(section);
      }
    });
  }

  function template(){
    const m = model.metadata || {};
    const methodCards = [
      {
        title: 'Почему женщины 18–44?',
        text: m.why_not_15_49 || 'Рамка расчёта следует РПН-2022: используются женщины 18–44 лет, по которым измерены желаемое и ожидаемое число детей.'
      },
      {
        title: 'Как читается сценарий?',
        text: 'Пользователь задаёт охват меры, конверсию резерва в рождения и срок реализации. Итог показывает потенциальные рождения за выбранный период и среднегодовую оценку.'
      },
      {
        title: 'Что такое жилищный резерв?',
        text: 'Это нереализованное желаемое число детей у женщин с положительным разрывом между желаемым и ожидаемым числом детей; жилищный барьер можно включить или отключить отдельно.'
      }
    ];
    const cards = methodCards.map(card => `
      <div class="explain-card"><h4>${escapeHtml(card.title)}</h4><p>${escapeHtml(card.text)}</p></div>`).join('');
    return `
      <section class="rpn-effect-designer" id="rpnHousingEffectDesigner">
        <div class="rpn-effect-hero">
          <div>
            <div class="section-number">Конструктор жилищного резерва</div>
            <h2>Сценарий влияния жилищных условий на рождаемость</h2>
            <p class="lead compact">Здесь видно, какая группа женщин попадает в расчёт, какой жилищный резерв она содержит и какая часть этого резерва может перейти в рождения при заданном охвате, конверсии и сроке реализации.</p>
          </div>
          <span class="rpn-effect-badge">РПН‑2022 · федеральная оценка</span>
        </div>
        <div class="rpn-effect-status">
          <span class="status-chip"><strong>Расчётная рамка:</strong> женщины 18–44 лет</span>
          <span class="status-chip"><strong>Не СКР:</strong> сценарий потенциальных рождений</span>
          <span class="status-chip"><strong>Формула:</strong> резерв × охват × конверсия</span>
        </div>
        <div class="rpn-effect-body">
          <section class="rpn-effect-summary" aria-label="Итог текущих настроек">
            <div class="rpn-effect-summary-copy">
              <span>При текущих настройках</span>
              <p id="rpnFxSummaryText">—</p>
            </div>
            <div class="rpn-effect-mini-kpis">
              <div class="metric"><span>Целевая группа</span><b id="rpnFxEligibleWomen">—</b></div>
              <div class="metric"><span>Жилищный резерв</span><b id="rpnFxLatentBirths">—</b></div>
              <div class="metric gold"><span>Сценарный эффект</span><b id="rpnFxScenarioBirths">—</b></div>
              <div class="metric"><span>В среднем в год</span><b id="rpnFxAnnualBirths">—</b></div>
            </div>
          </section>
          <div class="rpn-effect-main-grid">
            <div class="rpn-effect-panel rpn-effect-settings">
              <h3>Настройка расчёта</h3>
              <div class="rpn-effect-controls">
                <div class="rpn-effect-control">
                  <label>Кого считаем</label>
                  <label class="rpn-effect-check is-locked"><input type="checkbox" checked disabled /><span>Женщины 18–44 лет с разрывом желаемое &gt; ожидаемое<small>Рамка взята из РПН‑2022. Это не весь возраст 15–49, а именно опрошенная группа.</small></span></label>
                </div>
                <div class="rpn-effect-control">
                  <label>Жилищные условия целевой группы</label>
                  <div class="rpn-effect-checks">
                    <label class="rpn-effect-check"><input id="rpnFxHousingBarrier" type="checkbox" /><span>Жилищные трудности мешают иметь желаемое число детей<small>Ответы «мешает» или «очень мешает».</small></span></label>
                  </div>
                </div>
                ${rangeControl('rpnFxCoverage','Охват меры внутри выбранной группы','coveragePct',0,100,5,'%')}
                ${rangeControl('rpnFxConversion','Конверсия резерва в рождения','conversionPct',0,100,5,'%')}
                ${rangeControl('rpnFxYears','Срок реализации эффекта','implementationYears',1,10,1,' лет')}
              </div>
              <div class="rpn-effect-source"><strong>Почему так:</strong> ${escapeHtml(m.why_not_15_49 || '')}</div>
            </div>
            <div class="rpn-effect-results-stack">
              <div class="rpn-effect-panel rpn-effect-group-panel">
                <h3>Выбранная группа</h3>
                <div class="text-note" id="rpnFxGroupText">—</div>
                <div class="rpn-effect-formula" id="rpnFxFormula">—</div>
              </div>
              <div class="rpn-effect-diagram-grid">
                <div class="rpn-effect-chart-card"><h4>Воронка расчёта</h4><div id="rpnFxFunnelChart"></div><div class="rpn-effect-chart-note">От общей рамки РПН к выбранной целевой группе и сценарию реализации.</div></div>
                <div class="rpn-effect-chart-card"><h4>Потенциал и эффект</h4><div id="rpnFxPotentialChart"></div><div class="rpn-effect-chart-note" id="rpnFxChartNote">—</div></div>
              </div>
              <div class="rpn-effect-explain rpn-effect-methods">${cards}</div>
            </div>
          </div>
          <div class="rpn-effect-secondary-grid">
            <div class="rpn-effect-panel">
              <h3>Резерв по числу уже рождённых детей</h3>
              <div class="text-note">Показана выбранная жилищная группа: женщины с положительным разрывом и жилищным барьером. Это помогает увидеть, где находится резерв перехода к следующему ребёнку.</div>
              <div id="rpnFxOrderChart"></div>
            </div>
            <div class="rpn-effect-panel">
              <h3>Что входит в текущую группу</h3>
              <div id="rpnFxGroupTable"></div>
            </div>
          </div>
        </div>
      </section>`;
  }

  function rangeControl(id, label, key, min, max, step, suffix){
    return `<div class="rpn-effect-control"><div class="rpn-effect-range-head"><label for="${id}">${label}</label><output id="${id}Label">—</output></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" />${rangeRuler(min, max, suffix)}</div>`;
  }

  function rangeRuler(min, max, suffix){
    if(min === 1 && max === 10) return `<div class="rpn-effect-range-ruler" aria-hidden="true"><span>1 год</span><span>5 лет</span><span>10 лет</span></div>`;
    const end = suffix === '%' ? '100%' : `${max}${suffix || ''}`;
    return `<div class="rpn-effect-range-ruler" aria-hidden="true"><span>${min}${suffix === '%' ? '%' : ''}</span><span>50%</span><span>${end}</span></div>`;
  }

  function bindControls(root){
    const bindCheck = (id, key) => {
      const el = root.querySelector(`#${id}`);
      if(!el) return;
      el.checked = !!state[key];
      el.addEventListener('change', () => { state[key] = el.checked; normalizeCheckState(); renderAll(); });
    };
    const bindRange = (id, key, suffix) => {
      const el = root.querySelector(`#${id}`);
      if(!el) return;
      el.value = state[key];
      el.addEventListener('input', () => { state[key] = +el.value; renderAll(); });
    };
    bindCheck('rpnFxHousingBarrier','housingBarrier');
    bindRange('rpnFxCoverage','coveragePct','%');
    bindRange('rpnFxConversion','conversionPct','%');
    bindRange('rpnFxYears','implementationYears',' лет');
    normalizeCheckState();
  }

  function normalizeCheckState(){
    state.housingNeed = false;
    state.highHousingMeasures = false;
    state.showThreeYearCheck = false;
    const barrier = document.getElementById('rpnFxHousingBarrier');
    if(barrier) barrier.checked = !!state.housingBarrier;
    [barrier].forEach(input => {
      const label = input?.closest('.rpn-effect-check');
      if(!label) return;
      label.classList.toggle('is-active', !!input.checked);
      label.classList.toggle('is-disabled', !!input.disabled && !label.classList.contains('is-locked'));
    });
  }

  function selectedGroupId(){
    if(!state.housingBarrier) return 'gap_only';
    return 'gap_housing';
  }

  function renderAll(){
    if(!model) return;
    normalizeCheckState();
    setLabel('rpnFxCoverageLabel', `${fmtPct.format(state.coveragePct)}%`);
    setLabel('rpnFxConversionLabel', `${fmtPct.format(state.conversionPct)}%`);
    setLabel('rpnFxYearsLabel', `${fmt0.format(state.implementationYears)} ${yearsWord(state.implementationYears)}`);
    const group = model.groups[selectedGroupId()];
    const rates = getRates(group);
    renderText(group, rates);
    renderFunnel(group, rates);
    renderPotential(group, rates);
    renderOrderChart();
    renderGroupTable(group, rates);
  }

  function getRates(group){
    const coverage = state.coveragePct / 100;
    const conversion = state.conversionPct / 100;
    const latent = group.latent_gap_births;
    const scenario = latent * coverage * conversion;
    const annual = scenario / Math.max(1, state.implementationYears);
    return {coverage, conversion, latent, scenario, annual};
  }

  function renderText(group, rates){
    const summaryAnnual = compact(rates.annual).replace(/\.$/, '');
    setLabel('rpnFxGroupText', group.plain_label);
    setLabel('rpnFxEligibleWomen', compact(group.target_women_weighted));
    setLabel('rpnFxLatentBirths', compact(group.latent_gap_births));
    setLabel('rpnFxScenarioBirths', compact(rates.scenario));
    setLabel('rpnFxAnnualBirths', compact(rates.annual));
    setLabel('rpnFxSummaryText', `мера работает с группой ${compact(group.target_women_weighted)} женщин и даёт ${compact(rates.scenario)} потенциальных рождений за ${fmt0.format(state.implementationYears)} ${yearsWord(state.implementationYears)}; среднегодовая оценка — ${summaryAnnual}.`);
    setLabel('rpnFxFormula', `Сценарный эффект = ${compact(group.latent_gap_births)} × ${fmt0.format(state.coveragePct)}% охвата × ${fmt0.format(state.conversionPct)}% конверсии = ${compact(rates.scenario)} потенциальных рождений за ${fmt0.format(state.implementationYears)} ${yearsWord(state.implementationYears)}.`);
    setLabel('rpnFxChartNote', 'Показано, какая часть полного жилищного резерва переходит в сценарный эффект при выбранных охвате и конверсии.');
  }

  function renderFunnel(group, rates){
    const ctx = model.context || {};
    const rows = [
      {label:'Женщины 18–44 в РПН', value:ctx.women_18_44_weighted || 0, color:'#d7b56d'},
      {label:'Есть разрыв планов', value:model.groups.gap_only.target_women_weighted, color:'#b9903d'},
      {label:'Выбранная группа', value:group.target_women_weighted, color:'#155a5f'},
      {label:'Сценарный эффект', value:rates.scenario, color:'#0f3f43'}
    ];
    document.getElementById('rpnFxFunnelChart').innerHTML = barSvg(rows, {valueLabel:v=>compact(v), max:rows[0].value});
  }

  function renderPotential(group, rates){
    const rows = [
      {label:'Жилищный резерв', value:group.latent_gap_births, color:'#d7b56d'},
      {label:'Сценарный эффект', value:rates.scenario, color:'#155a5f'}
    ];
    document.getElementById('rpnFxPotentialChart').innerHTML = barSvg(rows, {valueLabel:v=>compact(v)});
  }

  function renderOrderChart(){
    const rows = (model.order_potential || []).map(r=>({
      label: r.born_children>=4 ? '4+ детей' : `${r.born_children} ${childWord(r.born_children)}`,
      value: r.latent_gap_births,
      color: '#155a5f'
    }));
    document.getElementById('rpnFxOrderChart').innerHTML = barSvg(rows, {valueLabel:v=>compact(v)});
  }

  function renderGroupTable(group, rates){
    const criteria = (group.criteria || []).map(x=>`<li>${escapeHtml(x)}</li>`).join('');
    const share = group.target_women_weighted && model.context?.women_18_44_weighted ? group.target_women_weighted / model.context.women_18_44_weighted * 100 : null;
    const table = `
      <table class="rpn-effect-table">
        <tbody>
          <tr><th>Критерии группы</th><td><ul style="margin:0;padding-left:18px">${criteria}</ul></td></tr>
          <tr><th>Взвешенная численность</th><td>${fmt0.format(group.target_women_weighted)} женщин${share!==null ? ` · ${fmt1.format(share)}% рамки РПН` : ''}</td></tr>
          <tr><th>Средний положительный разрыв</th><td>${fmt1.format(group.mean_positive_gap)} ребёнка на женщину с разрывом</td></tr>
          <tr><th>Полный резерв группы</th><td>${fmt0.format(group.latent_gap_births)} потенциальных рождений</td></tr>
          <tr><th>При текущих настройках</th><td>${fmt0.format(rates.scenario)} потенциальных рождений, или ${fmt0.format(rates.annual)} в среднем в год</td></tr>
        </tbody>
      </table>`;
    document.getElementById('rpnFxGroupTable').innerHTML = table;
  }

  function barSvg(rows, options={}){
    const width = 620;
    const rowH = 46;
    const padTop = 14;
    const padLeft = 170;
    const padRight = 110;
    const height = padTop*2 + rows.length*rowH;
    const max = options.max || Math.max(...rows.map(r=>r.value), 1);
    const labeler = options.valueLabel || (v=>fmt0.format(v));
    const bars = rows.map((r,i)=>{
      const y = padTop + i*rowH + 7;
      const w = Math.max(2, (width-padLeft-padRight) * (r.value / max));
      return `<text x="0" y="${y+18}" font-size="14" fill="#1d2929">${escapeSvg(r.label)}</text>
        <rect x="${padLeft}" y="${y}" width="${w}" height="24" rx="7" fill="${r.color}" opacity="0.96"></rect>
        <text x="${padLeft+w+8}" y="${y+17}" font-size="13" fill="#1d2929" font-weight="700">${escapeSvg(labeler(r.value))}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Диаграмма">${bars}</svg>`;
  }

  function setLabel(id, value){ const el=document.getElementById(id); if(el) el.innerHTML = value; }
  function compact(v){
    if(!Number.isFinite(+v)) return '—';
    const n = +v;
    if(Math.abs(n) >= 1e6) return `${fmt1.format(n/1e6)} млн`;
    if(Math.abs(n) >= 1e3) return `${fmt1.format(n/1e3)} тыс.`;
    return fmt0.format(n);
  }
  function yearsWord(n){
    const x = Math.abs(+n) % 100, y = x % 10;
    if(x > 10 && x < 20) return 'лет';
    if(y === 1) return 'год';
    if(y >= 2 && y <= 4) return 'года';
    return 'лет';
  }
  function childWord(n){
    if(n===1) return 'ребёнок';
    if(n>=2 && n<=4) return 'ребёнка';
    return 'детей';
  }
  function escapeHtml(s){return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
  function escapeSvg(s){return escapeHtml(s).replace(/'/g,'&apos;');}

  window.RpnHousingEffectDesigner = {
    getState(){
      const groupId = model ? selectedGroupId() : null;
      const group = groupId ? model.groups[groupId] : null;
      const rates = group ? getRates(group) : null;
      return {
        loaded: !!model,
        groupId,
        state: {...state},
        targetWomenWeighted: group?.target_women_weighted ?? null,
        latentGapBirths: group?.latent_gap_births ?? null,
        scenarioBirths: rates?.scenario ?? null,
        annualBirths: rates?.annual ?? null,
        threeYearCheckBirths: null
      };
    }
  };
})();
