'use strict';

const SETTLEMENT_END_YEAR = 2050;
const settlementState = {
  data:null,
  selected:'terr_rf_bez_novyh_subektov',
  rows:[],
  preset:'deurban',
  populationScenario:'noMIG',
  authorPopulation:null,
  authorPopulationLoaded:false,
  tfrForecast:null,
  tfrForecastLoaded:false,
  forecastMethod:'не загружен'
};

function getSettlementLabel(tid){
  const t = settlementState.data.territories.find(x=>x.id===tid);
  if(!t) return tid;
  return tid==='terr_rf_bez_novyh_subektov' ? 'Россия' : (t.short_name || t.name);
}
function settlementShareTerm(tid=settlementState.selected){
  return ['terr_moskva','terr_sankt_peterburg','terr_sevastopol'].includes(tid)
    ? 'пригородный переход'
    : 'сельская и пригородная среда';
}
function getSettlementNames(tid){
  const t=settlementState.data.territories.find(x=>x.id===tid) || {};
  const names=[t.name,t.short_name];
  if(tid==='terr_rf_bez_novyh_subektov') names.push('Российская Федерация','Россия');
  return [...new Set(names.filter(Boolean))];
}
function clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}
function ppLabel(x){return `${x>=0?'+':''}${fmtNum(x,1)} п.п.`;}
function percentFromShare(x,d=1){return fmtPct(100*x,d);}
function getSettlementParams(){return {delta2050:+document.getElementById('delta2050').value/100};}
function scenarioShare(year, baselineShare, delta2050){
  const y0=2025, y1=SETTLEMENT_END_YEAR;
  if(year<=y0) return baselineShare;
  const t=clamp((year-y0)/(y1-y0),0,1);
  return clamp(baselineShare + t*delta2050,0,0.95);
}
function authorPopulationFor(tid, year){
  if(!settlementState.authorPopulationLoaded || !settlementState.authorPopulation) return null;
  settlementState.populationScenario = 'noMIG';
  const scenario=settlementState.authorPopulation.noMIG || {};
  return scenario[tid]?.get(year) || null;
}
function settlementTfrForecastFor(tid){
  if(!settlementState.tfrForecastLoaded || !settlementState.tfrForecast) return [];
  return settlementState.tfrForecast[tid] || [];
}
function legacySettlementForecastMap(tid){
  return new Map((settlementState.data.forecast[tid] || []).map(r=>[r.year,r]));
}
function buildSettlementRows(){
  const data=settlementState.data, tid=settlementState.selected, p=getSettlementParams();
  const forecast=settlementTfrForecastFor(tid).filter(f=>f.year<=SETTLEMENT_END_YEAR);
  const legacyByYear=legacySettlementForecastMap(tid);
  const latest=data.latest[tid]||{};
  const currentShare = latest.rural_share_2025 ?? 0.25;
  const bRate=data.metadata.births_per_tfr_unit_per_capita || 0.00615;
  let extraPop=0, cumBirths=0;
  const rows=[];
  forecast.forEach(f=>{
    const legacy=legacyByYear.get(f.year) || {};
    const baseTfr=f.total_tfr;
    const baseShare=f.baseline_rural_share ?? legacy.baseline_rural_share ?? currentShare;
    const scShare=scenarioShare(f.year,baseShare,p.delta2050);
    const scTfr=(f.urban_tfr==null||f.rural_tfr==null||baseTfr==null)?null:baseTfr + (scShare-baseShare)*(f.rural_tfr-f.urban_tfr);
    const deltaTfr=(scTfr==null||baseTfr==null)?null:scTfr-baseTfr;
    const localAuthorPop=authorPopulationFor(tid, f.year);
    const basePop=localAuthorPop || legacy.baseline_population;
    let addBirths=null, scenarioPopulation=null;
    if(basePop!=null && deltaTfr!=null){
      addBirths = basePop*bRate*deltaTfr;
      cumBirths += addBirths;
      extraPop = extraPop*0.995 + addBirths;
      scenarioPopulation = basePop + extraPop;
    }
    rows.push({year:f.year, urbanTfr:f.urban_tfr, ruralTfr:f.rural_tfr, baselineShare:baseShare, scenarioShare:scShare, baselineTfr:baseTfr, scenarioTfr:scTfr, deltaTfr, baselinePopulation:basePop, scenarioPopulation, extraPopulation:scenarioPopulation==null||basePop==null?null:scenarioPopulation-basePop, additionalBirths:addBirths, cumulativeBirths:cumBirths, forecastMethod:settlementState.forecastMethod, totalSource:f.total_source, gapSource:f.gap_source});
  });
  settlementState.rows=rows;
  return rows;
}
function updateSettlementKpis(rows){
  const latest=settlementState.data.latest[settlementState.selected]||{};
  const r2050=rows.find(r=>r.year===SETTLEMENT_END_YEAR) || rows[rows.length-1];
  const term=settlementShareTerm();
  document.getElementById('settlementShareLabelNow').textContent=`${term} сейчас`;
  document.getElementById('delta2050Title').textContent=`Изменение доли: ${term}, к 2050 году`;
  document.getElementById('settlementShareLabel2050').textContent=`${term} 2050`;
  document.getElementById('ruralShareChartTitle').textContent=`Траектория: ${term}`;
  document.getElementById('settlementHeroShare').textContent=latest.rural_share_2025==null?'—':percentFromShare(latest.rural_share_2025,1);
  document.getElementById('settlementHeroGap').textContent=latest.gap_rural_minus_urban==null?'—':`+${fmtTfr(latest.gap_rural_minus_urban,2)}`;
  document.getElementById('settlementKpiDeltaTfr2050').textContent=r2050?.deltaTfr==null?'—':`${r2050.deltaTfr>=0?'+':''}${fmtTfr(r2050.deltaTfr,3)}`;
  document.getElementById('settlementKpiRuralShare2050').textContent=r2050?.scenarioShare==null?'—':percentFromShare(r2050.scenarioShare,1);
  document.getElementById('settlementKpiPop2050').textContent=r2050?.extraPopulation==null?'—':`${r2050.extraPopulation>=0?'+':''}${fmtNum(r2050.extraPopulation/1e6,2)} млн`;
  document.getElementById('settlementKpiBirths').textContent=r2050?.cumulativeBirths==null?'—':`${r2050.cumulativeBirths>=0?'+':''}${fmtNum(r2050.cumulativeBirths/1e6,2)} млн`;
  document.getElementById('settlementActivePill').textContent=getSettlementLabel(settlementState.selected);
}
function historicalArrays(tid){
  const hist=settlementState.data.history[tid] || [];
  return {x:hist.map(r=>r.year), total:hist.map(r=>r.total), urban:hist.map(r=>r.urban), rural:hist.map(r=>r.rural)};
}
function updateSettlementCharts(){
  const rows=buildSettlementRows(); updateSettlementKpis(rows);
  const tid=settlementState.selected, hist=historicalArrays(tid), fx=rows.map(r=>r.year), title=getSettlementLabel(tid);
  const narrow=TG.isNarrow();
  Plotly.react('settlementTfrChart', [
    {type:'scatter',x:hist.x,y:hist.urban,name:'Городской СКР — факт',mode:'lines+markers',line:{color:TG.colors.blue,width:2.8},marker:{size:4}},
    {type:'scatter',x:hist.x,y:hist.rural,name:'Сельский СКР — факт',mode:'lines+markers',line:{color:TG.colors.green,width:2.8},marker:{size:4}},
    {type:'scatter',x:hist.x,y:hist.total,name:'Общий СКР — факт',mode:'lines',line:{color:TG.colors.gold,width:2.6}},
    {type:'scatter',x:fx,y:rows.map(r=>r.urbanTfr),name:'Городской СКР — прогноз',mode:'lines',line:{color:TG.colors.blue,width:2.4,dash:'dash'}},
    {type:'scatter',x:fx,y:rows.map(r=>r.ruralTfr),name:'Сельский СКР — прогноз',mode:'lines',line:{color:TG.colors.green,width:2.4,dash:'dash'}},
    {type:'scatter',x:fx,y:rows.map(r=>r.baselineTfr),name:'Общий СКР — базовая траектория',mode:'lines',line:{color:'rgba(20,91,97,.58)',width:3,dash:'dot'}},
    {type:'scatter',x:fx,y:rows.map(r=>r.scenarioTfr),name:'Общий СКР — сценарий ИЖС',mode:'lines',line:{color:TG.colors.red,width:4}}
  ], TG.plotLayout({height:610,margin:narrow?{l:48,r:18,t:30,b:112}:{l:65,r:34,t:42,b:78},title:{text:''},xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,range:[1990,SETTLEMENT_END_YEAR],automargin:true},yaxis:{title:'детей на 1 женщину',gridcolor:'#efe5d4',range:[0,Math.max(2.8,...hist.rural.filter(Boolean),...rows.map(r=>r.ruralTfr||0))+0.1]},legend:narrow?{orientation:'h',x:0,y:-0.26,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.10,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}}), TG.plotConfig);
  Plotly.react('ruralShareChart', [
    {type:'scatter',x:fx,y:rows.map(r=>100*r.baselineShare),name:'Доля среды — базовая траектория',mode:'lines',line:{color:TG.colors.teal,width:3,dash:'dot'}},
    {type:'scatter',x:fx,y:rows.map(r=>100*r.scenarioShare),name:'Доля среды — ИЖС-сценарий',mode:'lines',line:{color:TG.colors.gold,width:4}},
    {type:'bar',x:fx,y:rows.map(r=>r.deltaTfr),name:'Изменение СКР',marker:{color:'rgba(169,75,72,.45)',line:{color:TG.colors.red,width:.5}},yaxis:'y2'}
  ], TG.plotLayout({height:470,margin:narrow?{l:48,r:54,t:24,b:112}:{l:65,r:72,t:35,b:76},xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,automargin:true},yaxis:{title:'доля сельского населения, %',gridcolor:'#efe5d4'},yaxis2:{title:'изменение СКР',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},legend:narrow?{orientation:'h',x:0,y:-0.28,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}}), TG.plotConfig);
  Plotly.react('populationTraceChart', [
    {type:'scatter',x:fx,y:rows.map(r=>r.baselinePopulation==null?null:r.baselinePopulation/1e6),name:'Базовая численность',mode:'lines',line:{color:TG.colors.teal,width:3}},
    {type:'scatter',x:fx,y:rows.map(r=>r.scenarioPopulation==null?null:r.scenarioPopulation/1e6),name:'Сценарий ИЖС',mode:'lines',line:{color:TG.colors.gold,width:4}},
    {type:'scatter',x:fx,y:rows.map(r=>r.extraPopulation==null?null:r.extraPopulation/1e6),name:'Прирост к базовой траектории',mode:'lines',fill:'tozeroy',fillcolor:'rgba(212,165,55,.18)',line:{color:TG.colors.red,width:2,dash:'dot'},yaxis:'y2'}
  ], TG.plotLayout({height:470,margin:narrow?{l:52,r:56,t:24,b:112}:{l:70,r:80,t:35,b:76},xaxis:{gridcolor:'#efe5d4',dtick:narrow?10:5,automargin:true},yaxis:{title:'млн человек',gridcolor:'#efe5d4'},yaxis2:{title:'прирост, млн',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},legend:narrow?{orientation:'h',x:0,y:-0.28,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}}), TG.plotConfig);
  updateSettlementTable(rows);
}
function settlementKpiState(){
  const r2050=settlementState.rows.find(r=>r.year===SETTLEMENT_END_YEAR) || settlementState.rows[settlementState.rows.length-1] || {};
  return {
    deltaTfr2050:r2050.deltaTfr ?? null,
    scenarioShare2050:r2050.scenarioShare ?? null,
    extraPopulation2050:r2050.extraPopulation ?? null,
    cumulativeBirths2050:r2050.cumulativeBirths ?? null,
    baselineTfr2050:r2050.baselineTfr ?? null,
    scenarioTfr2050:r2050.scenarioTfr ?? null
  };
}
function settlementGapDiagnostics(rows){
  const gaps=rows.map(r=>r.ruralTfr-r.urbanTfr).filter(Number.isFinite);
  const minForecastGap=gaps.length?Math.min(...gaps):null;
  const negativeForecastGapCount=gaps.filter(g=>g<=0).length;
  const positiveShareShiftNonNegative=rows.every(r=>{
    const shiftedShare=Math.min(.95,r.baselineShare+.12*(r.year-2025)/25);
    const shiftedTfr=r.baselineTfr+(shiftedShare-r.baselineShare)*(r.ruralTfr-r.urbanTfr);
    return shiftedTfr+1e-9>=r.baselineTfr;
  });
  return {minForecastGap,negativeForecastGapCount,positiveShareShiftNonNegative};
}
function settlementChartTraceCount(){
  const chart=document.getElementById('settlementTfrChart');
  return chart?._fullData?.length || chart?.data?.length || 0;
}
function updateSettlementTable(rows){
  const years=[2026,2030,2036,2042,2050];
  const tableRows=years.map(y=>rows.find(r=>r.year===y)).filter(Boolean).map(r=>({
    'Год':r.year,
    'Доля среды: базовая':percentFromShare(r.baselineShare,1),
    'Доля среды: сценарий':percentFromShare(r.scenarioShare,1),
    'СКР: базовая траектория':fmtTfr(r.baselineTfr,3),
    'СКР: сценарий':fmtTfr(r.scenarioTfr,3),
    'Изменение СКР':`${r.deltaTfr>=0?'+':''}${fmtTfr(r.deltaTfr,3)}`,
    'Население: базовая траектория':r.baselinePopulation==null?'—':`${fmtNum(r.baselinePopulation/1e6,2)} млн`,
    'Население: сценарий':r.scenarioPopulation==null?'—':`${fmtNum(r.scenarioPopulation/1e6,2)} млн`,
    'Прирост населения':r.extraPopulation==null?'—':`${r.extraPopulation>=0?'+':''}${fmtNum(r.extraPopulation/1e6,2)} млн`
  }));
  document.getElementById('settlementTable').innerHTML=tableHTML(tableRows);
}
function setupSettlementSelector(){
  const sel=document.getElementById('settlementTerritorySelect');
  const groups={country_excluding_new_subjects:'Россия',federal_district:'Федеральные округа',federal_subject:'Субъекты РФ',federal_subject_remainder:'Субъекты РФ',federal_subject_aggregate:'Субъекты РФ'};
  const byGroup={}; settlementState.data.territories.forEach(t=>{ const g=groups[t.type]||'Прочие'; (byGroup[g] ||= []).push(t); });
  Object.entries(byGroup).forEach(([g, arr])=>{ const og=document.createElement('optgroup'); og.label=g; arr.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=t.short_name || t.name; og.appendChild(o); }); sel.appendChild(og); });
  sel.value=settlementState.selected; sel.addEventListener('change',()=>{settlementState.selected=sel.value; updateSettlementCharts();});
}
function setPreset(name){
  settlementState.preset=name; document.querySelectorAll('.scenario-chip').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));
  if(name==='urban') document.getElementById('delta2050').value=-3;
  if(name==='fix') document.getElementById('delta2050').value=0;
  if(name==='deurban') document.getElementById('delta2050').value=5;
  updateSliderLabels(); updateSettlementCharts();
}
function updateSliderLabels(){
  const label=document.getElementById('delta2050Label');
  if(label) label.textContent=ppLabel(+document.getElementById('delta2050').value);
}
function setupSettlementControls(){
  document.getElementById('delta2050').addEventListener('input',()=>{settlementState.preset='custom'; document.querySelectorAll('.scenario-chip').forEach(b=>b.classList.remove('active')); updateSliderLabels(); updateSettlementCharts();});
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));
  const dl=document.getElementById('downloadSettlementCsv'); if(dl) dl.addEventListener('click',()=>downloadCsv('расселение_ижс_сценарий.csv', settlementState.rows));
  settlementState.populationScenario = 'noMIG';
  updateSliderLabels();
}
async function hydrateAuthorPopulation(){
  try{
    const source=await loadJSON('data/author_population_forecast_2050.json');
    const scenarios={};
    Object.entries(source.scenarios || {}).forEach(([scenario, byTerritory])=>{
      scenarios[scenario]={};
      Object.entries(byTerritory).forEach(([tid, rows])=>{
        scenarios[scenario][tid]=new Map(rows.map(r=>[r.year, r.population_total]));
      });
    });
    settlementState.authorPopulation=scenarios;
    settlementState.authorPopulationLoaded=true;
  }catch(_){
    settlementState.authorPopulationLoaded=false;
  }
}
async function hydrateSettlementTfrForecast(){
  const source=await loadJSON('data/settlement_tfr_forecast_2050.json');
  const series={};
  Object.entries(source.series || {}).forEach(([tid, rows])=>{
    series[tid]=(rows || []).map(r=>({
      year:+r.year,
      total_tfr:+r.total_tfr,
      total_q10:+r.total_q10,
      total_q90:+r.total_q90,
      urban_tfr:+r.urban_tfr,
      urban_q10:+r.urban_q10,
      urban_q90:+r.urban_q90,
      rural_tfr:+r.rural_tfr,
      rural_q10:+r.rural_q10,
      rural_q90:+r.rural_q90,
      baseline_rural_share:+r.baseline_rural_share,
      rural_urban_gap:+r.rural_urban_gap,
      gap_source:r.gap_source || '',
      total_source:r.total_source
    }));
  });
  settlementState.tfrForecast=series;
  settlementState.tfrForecastLoaded=true;
  settlementState.forecastMethod=source.metadata?.method || 'local_gp_ucm_ensemble';
}
async function initSettlement(){
  try{
    settlementState.data=await loadJSON('data/settlement_data.json');
    await hydrateAuthorPopulation();
    await hydrateSettlementTfrForecast();
    setupSettlementSelector(); setupSettlementControls(); updateSettlementCharts();
  }catch(err){ showDataUnavailable('settlementTfrChart'); }
}
if(document.body.dataset.page==='settlement') initSettlement();
window.SettlementModule = {
  getState(){
    const gapDiagnostics=settlementGapDiagnostics(settlementState.rows);
    return {
      selected:settlementState.selected,
      forecastMethod:settlementState.forecastMethod,
      rows:settlementState.rows,
      delta2050:getSettlementParams().delta2050,
      populationScenario:settlementState.populationScenario,
      kpis:settlementKpiState(),
      minForecastGap:gapDiagnostics.minForecastGap,
      negativeForecastGapCount:gapDiagnostics.negativeForecastGapCount,
      positiveShareShiftNonNegative:gapDiagnostics.positiveShareShiftNonNegative,
      chartTraceCount:settlementChartTraceCount(),
      runtimeExternalFetch:false,
      tfrForecastLoaded:settlementState.tfrForecastLoaded,
      authorPopulationLoaded:settlementState.authorPopulationLoaded
    };
  }
};
