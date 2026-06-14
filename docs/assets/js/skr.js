'use strict';

const skrState = {
  data:null, geo:null, rpn:null, rpnRegional:null, selected:'terr_rf_bez_novyh_subektov', map:null, layer:null,
  policyMonths:[], policyStart:null, policyIndex:0, highlightedLayer:null, analysisMode:'country',
  policyPointerId:null
};

const POLICY_START_MIN = '2026-06';
const POLICY_START_MAX = '2035-12';
const POLICY_AXIS_MIN = '2025-01';
const POLICY_AXIS_MAX = '2050-12';

function forecastTfr(monthly, key, endMonth, upperBound){
  const observed = monthly.filter(d => d[key] !== null && d[key] !== undefined).map((d,i)=>({i, date:parseDate(d.date), value:+d[key]}));
  if(!observed.length) return [];
  const start = observed[0].date;
  const end = parseDate(`${endMonth}-01`);
  const allDates = monthRange(monthId(start), monthId(end));
  const y = observed.map(d => Math.max(1e-5, Math.min(upperBound-1e-5, d.value)));
  const z = y.map(v => Math.log(v/(upperBound-v)));
  const xs = observed.map((_,i)=>i);
  const reg = linearRegression(xs,z);
  const inv = zz => upperBound/(1+Math.exp(-zz));
  return allDates.map((date, idx)=>{
    const mu = reg.intercept + reg.slope*idx;
    const predSE = reg.sigma*Math.sqrt(1 + 1/reg.n + ((idx-reg.xbar)**2)/(reg.sxx || 1));
    const q = 1.28;
    return {date, month:monthId(date), mean:inv(mu), lo:inv(mu-q*predSE), hi:inv(mu+q*predSE), source:'локальная экстраполяция'};
  });
}
function seriesMap(arr){ const m=new Map(); arr.forEach(x=>m.set(x.month,x)); return m; }
function getTerritoryLabel(tid){
  const t = skrState.data.territories.find(x=>x.id===tid);
  if(!t) return tid;
  if(tid === skrState.data.metadata.russia_territory_id) return 'Россия';
  return t.short_name || t.name;
}
function getTerritoryNameVariants(tid){
  const t=skrState.data.territories.find(x=>x.id===tid) || {};
  const names=[t.name,t.short_name];
  if(tid===skrState.data.metadata.russia_territory_id) names.push('Российская Федерация','Россия');
  return [...new Set(names.filter(Boolean))];
}
function getMonthly(tid){ return skrState.data.monthly[tid] || []; }
function territoryLevel(t){
  if(!t) return 'subject';
  if(t.id===skrState.data.metadata.russia_territory_id) return 'country';
  if(t.type==='federal_district') return 'district';
  return 'subject';
}
function selectedTerritoriesForMode(){
  return skrState.data.territories.filter(t=>getMonthly(t.id).length && territoryLevel(t)===skrState.analysisMode);
}
async function loadAuthorTfrForecast(){
  const forecast=await loadJSON('data/author_tfr_forecast_2050.json');
  return forecast.series || {};
}
function externalAnnualRowsFor(tid){
  if(!skrState.authorTfr) return null;
  return skrState.authorTfr[tid] || null;
}
function annualToMonthlyForecast(rows, monthly, endMonth){
  const lastObservedDate = monthly.length ? parseDate(monthly[monthly.length-1].date) : parseDate('2025-12-01');
  const endYear = +endMonth.slice(0,4);
  return rows
    .filter(r=>+r.year<=endYear && r.median!==null && r.median!==undefined)
    .map(r=>{
      const date=parseDate(`${r.year}-12-01`);
      return {date, month:monthId(date), mean:+r.median, lo:r.q10, hi:r.q90, source:'author_forecast_local'};
    })
    .filter(d=>d.date>lastObservedDate || d.month===monthId(lastObservedDate));
}
function getTotalForecast(tid){
  const monthly=getMonthly(tid);
  const ext=externalAnnualRowsFor(tid);
  if(ext) return annualToMonthlyForecast(ext, monthly, skrState.data.metadata.forecast_end_month);
  return [];
}
function forecastValueAt(forecast, month){
  const direct=forecast.find(x=>x.month===month);
  if(direct) return direct.mean;
  const date=parseDate(`${month}-01`);
  return forecast.find(x=>x.date>=date)?.mean ?? forecast[forecast.length-1]?.mean ?? null;
}
function targetTrajectory(forecast, policyStart, meta){
  const policyDate = parseDate(`${policyStart}-01`);
  const effectDate = addMonths(policyDate, meta.lag_months || 9);
  const fMap = seriesMap(forecast);
  const effectMonth = monthId(effectDate);
  const effectForecast = (fMap.get(effectMonth) || forecast.find(x=>x.date>=effectDate) || forecast[forecast.length-1]).mean;
  const d2036 = parseDate('2036-12-01');
  const d2050 = parseDate('2050-12-01');
  const mid2036=meta.target_2036_mid, low2036=meta.target_2036_low, high2036=meta.target_2036_high;
  const mid2050=meta.target_2050_mid, low2050=meta.target_2050_low, high2050=meta.target_2050_high;
  function interp(d, d0, v0, d1, v1){ const den = Math.max(1, monthsBetween(d0,d1)); return v0 + monthsBetween(d0,d)/den*(v1-v0); }
  const out=[];
  for(const f of forecast){
    const d=f.date; let mid=null, low=null, high=null;
    if(d>=effectDate){
      if(effectDate <= d2036){
        if(d<=d2036){ mid=interp(d,effectDate,effectForecast,d2036,mid2036); low=interp(d,effectDate,effectForecast,d2036,low2036); high=interp(d,effectDate,effectForecast,d2036,high2036); }
        else { mid=interp(d,d2036,mid2036,d2050,mid2050); low=interp(d,d2036,low2036,d2050,low2050); high=interp(d,d2036,high2036,d2050,high2050); }
      } else { mid=interp(d,effectDate,effectForecast,d2050,mid2050); low=interp(d,effectDate,effectForecast,d2050,low2050); high=interp(d,effectDate,effectForecast,d2050,high2050); }
    }
    out.push({date:d, month:f.month, mid, low, high, gap:mid==null?null:Math.max(0, mid-f.mean)});
  }
  const f2036 = fMap.get('2036-12')?.mean || forecast.find(x=>x.date>=d2036)?.mean;
  const f2050 = fMap.get('2050-12')?.mean || forecast.find(x=>x.date>=d2050)?.mean;
  const monthsTo2036 = monthsBetween(effectDate,d2036);
  const lift2036 = monthsTo2036>0 ? mid2036-effectForecast : null;
  const lift2050 = mid2050-effectForecast;
  const monthlyLift2036 = monthsTo2036>0 ? lift2036/monthsTo2036 : null;
  const gapForecast2036 = f2036==null?null:mid2036-f2036;
  const gapForecast2050 = f2050==null?null:mid2050-f2050;
  return {rows:out, policyDate, effectDate, effectForecast, lift2036, lift2050, monthlyLift2036, gapForecast2036, gapForecast2050, f2036, f2050};
}
function clampPolicyIndex(idx){
  if(!skrState.policyMonths.length) return 0;
  return Math.max(0, Math.min(skrState.policyMonths.length-1, Math.round(idx)));
}
function getPolicyIndex(){
  const idx=skrState.policyMonths.indexOf(skrState.policyStart);
  return idx>=0 ? idx : clampPolicyIndex(skrState.policyIndex || 0);
}
function getLagMonths(){
  return skrState.data?.metadata?.lag_months || 9;
}
function effectMonthForPolicy(policyStart=skrState.policyStart){
  if(!policyStart) return null;
  return monthId(addMonths(parseDate(`${policyStart}-01`), getLagMonths()));
}
function updatePolicyStatusLabels(effectMonth=effectMonthForPolicy()){
  const labels=[
    ['policyMonthLabel', skrState.policyStart],
    ['effectMonthLabel', effectMonth],
    ['chartPolicyMonthLabel', skrState.policyStart],
    ['chartEffectMonthLabel', effectMonth]
  ];
  labels.forEach(([id, value])=>{
    const el=document.getElementById(id);
    if(el) el.textContent=value || '—';
  });
}
function updatePolicyHandleA11y(){
  const handle=document.getElementById('policyStartDragHandle');
  if(!handle || !skrState.policyMonths.length) return;
  const idx=getPolicyIndex();
  const effectMonth=effectMonthForPolicy();
  handle.setAttribute('role','slider');
  handle.setAttribute('aria-valuemin','0');
  handle.setAttribute('aria-valuemax',String(skrState.policyMonths.length-1));
  handle.setAttribute('aria-valuenow',String(idx));
  handle.setAttribute('aria-valuetext',`ввод мер ${skrState.policyStart}, начало эффекта ${effectMonth}`);
}
function getTfrPlotRect(){
  const chart=document.getElementById('tfrChart');
  if(!chart) return null;
  const dragLayer=chart.querySelector('.nsewdrag');
  const rect=(dragLayer || chart).getBoundingClientRect();
  if(rect.width <= 0 || rect.height <= 0) return null;
  return {chart, rect};
}
function getTfrAxisRangeMs(){
  const chart=document.getElementById('tfrChart');
  const axisRange=chart?._fullLayout?.xaxis?.range;
  const start=axisRange?.[0] ? new Date(axisRange[0]).getTime() : parseDate(`${POLICY_AXIS_MIN}-01`).getTime();
  const end=axisRange?.[1] ? new Date(axisRange[1]).getTime() : parseDate(`${POLICY_AXIS_MAX}-01`).getTime();
  return [start, end];
}
function positionPolicyDragHandle(){
  const handle=document.getElementById('policyStartDragHandle');
  const wrap=document.querySelector('.tfr-chart-wrap');
  const plot=getTfrPlotRect();
  if(!handle || !wrap || !plot || !skrState.policyStart){
    if(handle) handle.hidden=true;
    return;
  }
  const [axisStart, axisEnd]=getTfrAxisRangeMs();
  const wrapRect=wrap.getBoundingClientRect();
  const policyMs=parseDate(`${skrState.policyStart}-01`).getTime();
  const fraction=Math.max(0, Math.min(1, (policyMs-axisStart)/Math.max(1, axisEnd-axisStart)));
  const left=plot.rect.left-wrapRect.left+fraction*plot.rect.width;
  handle.hidden=false;
  handle.style.left=`${left}px`;
  handle.style.top=`${plot.rect.top-wrapRect.top}px`;
  handle.style.height=`${plot.rect.height}px`;
  updatePolicyHandleA11y();
}
function policyIndexFromClientX(clientX){
  const plot=getTfrPlotRect();
  if(!plot || !skrState.policyMonths.length) return getPolicyIndex();
  const [axisStart, axisEnd]=getTfrAxisRangeMs();
  const fraction=Math.max(0, Math.min(1, (clientX-plot.rect.left)/Math.max(1, plot.rect.width)));
  const targetMs=axisStart+fraction*(axisEnd-axisStart);
  let nearest=0;
  let nearestDelta=Infinity;
  skrState.policyMonths.forEach((month, idx)=>{
    const delta=Math.abs(parseDate(`${month}-01`).getTime()-targetMs);
    if(delta<nearestDelta){ nearestDelta=delta; nearest=idx; }
  });
  return nearest;
}
function setPolicyIndex(idx, options={}){
  if(!skrState.policyMonths.length) return;
  const safeIdx=clampPolicyIndex(idx);
  const nextMonth=skrState.policyMonths[safeIdx];
  const changed=skrState.policyStart!==nextMonth || skrState.policyIndex!==safeIdx;
  skrState.policyIndex=safeIdx;
  skrState.policyStart=nextMonth;
  updatePolicyStatusLabels();
  updatePolicyHandleA11y();
  if(options.render===false){
    requestAnimationFrame(positionPolicyDragHandle);
    return;
  }
  if(changed && skrState.data) updateSkrChart();
  else requestAnimationFrame(positionPolicyDragHandle);
}
function setPolicyMonth(month){
  const idx=skrState.policyMonths.indexOf(month);
  if(idx>=0) setPolicyIndex(idx);
}
function getSkrModuleState(){
  return {
    policyStart:skrState.policyStart,
    effectMonth:effectMonthForPolicy(),
    policyIndex:getPolicyIndex(),
    policyMonths:[...skrState.policyMonths],
    lagMonths:getLagMonths()
  };
}
function setupSkrModule(){
  window.SkrModule = {
    getState:getSkrModuleState,
    setPolicyIndex,
    setPolicyMonth
  };
}
function setupPolicyPointerControl(){
  const handle=document.getElementById('policyStartDragHandle');
  if(!handle) return;
  let mouseActive=false;
  const moveToClientX = ev => setPolicyIndex(policyIndexFromClientX(ev.clientX));
  handle.addEventListener('pointerdown', ev=>{
    ev.preventDefault();
    skrState.policyPointerId=ev.pointerId;
    handle.classList.add('is-active');
    handle.setPointerCapture?.(ev.pointerId);
    moveToClientX(ev);
  });
  handle.addEventListener('pointermove', ev=>{
    if(skrState.policyPointerId!==ev.pointerId) return;
    ev.preventDefault();
    moveToClientX(ev);
  });
  const endPointer = ev => {
    if(skrState.policyPointerId!==ev.pointerId) return;
    skrState.policyPointerId=null;
    handle.classList.remove('is-active');
    handle.releasePointerCapture?.(ev.pointerId);
  };
  handle.addEventListener('pointerup', endPointer);
  handle.addEventListener('pointercancel', endPointer);
  handle.addEventListener('mousedown', ev=>{
    if(skrState.policyPointerId!==null) return;
    ev.preventDefault();
    mouseActive=true;
    handle.classList.add('is-active');
    moveToClientX(ev);
  });
  document.addEventListener('mousemove', ev=>{
    if(!mouseActive || skrState.policyPointerId!==null) return;
    ev.preventDefault();
    moveToClientX(ev);
  });
  document.addEventListener('mouseup', ()=>{
    if(!mouseActive) return;
    mouseActive=false;
    handle.classList.remove('is-active');
  });
  handle.addEventListener('keydown', ev=>{
    const idx=getPolicyIndex();
    if(ev.key==='ArrowLeft' || ev.key==='ArrowDown'){
      ev.preventDefault();
      setPolicyIndex(idx-1);
    } else if(ev.key==='ArrowRight' || ev.key==='ArrowUp'){
      ev.preventDefault();
      setPolicyIndex(idx+1);
    } else if(ev.key==='Home'){
      ev.preventDefault();
      setPolicyIndex(0);
    } else if(ev.key==='End'){
      ev.preventDefault();
      setPolicyIndex(skrState.policyMonths.length-1);
    }
  });
  window.addEventListener('resize',()=>requestAnimationFrame(positionPolicyDragHandle));
}
function makeSkrTraces(activeTid){
  const meta=skrState.data.metadata;
  const russiaId=meta.russia_territory_id;
  const ids = activeTid===russiaId ? [russiaId] : [russiaId, activeTid];
  const russiaForecast = getTotalForecast(russiaId);
  const federalTarget = targetTrajectory(russiaForecast, skrState.policyStart, meta);
  const traces=[];
  const targetRows=federalTarget.rows;
  traces.push({x:targetRows.map(d=>d.date), y:targetRows.map(d=>d.low), name:'Нижняя граница цели', mode:'lines', line:{width:0}, hoverinfo:'skip', showlegend:false});
  traces.push({x:targetRows.map(d=>d.date), y:targetRows.map(d=>d.high), name:'Целевой коридор СКР', mode:'lines', line:{width:0}, fill:'tonexty', fillcolor:'rgba(60,122,71,.16)', hoverinfo:'skip'});
  traces.push({x:russiaForecast.map(d=>d.date), y:russiaForecast.map(d=>d.mean), name:'Инерционный прогноз для расчёта разрыва', mode:'lines', line:{width:0}, hoverinfo:'skip', showlegend:false});
  traces.push({x:targetRows.map(d=>d.date), y:targetRows.map(d=>d.mid), name:'Отставание от плана', mode:'lines', line:{width:0}, fill:'tonexty', fillcolor:'rgba(169,75,72,.16)', hoverinfo:'skip'});
  traces.push({x:targetRows.map(d=>d.date), y:targetRows.map(d=>d.mid), name:'Требуемая траектория России', mode:'lines', line:{color:TG.colors.green, width:4}});
  traces.push({x:russiaForecast.map(d=>d.date), y:russiaForecast.map(d=>d.lo), name:'нижний интервал', mode:'lines', line:{width:0}, hoverinfo:'skip', showlegend:false});
  traces.push({x:russiaForecast.map(d=>d.date), y:russiaForecast.map(d=>d.hi), name:'Интервал прогноза', mode:'lines', line:{width:0}, fill:'tonexty', fillcolor:'rgba(23,63,120,.10)', hoverinfo:'skip'});
  ids.forEach((tid, idx)=>{
    const monthly=getMonthly(tid); if(!monthly.length) return;
    const fTotal=getTotalForecast(tid);
    const label=getTerritoryLabel(tid);
    const isRussia=tid===russiaId; const isActive=tid===activeTid;
    const totalColor=isRussia?TG.colors.teal:(isActive?TG.colors.blue:TG.colors.muted);
    const t3Color=isRussia?TG.colors.gold:(isActive?TG.colors.orange:TG.colors.muted);
    const width=isRussia?3.4:3.0; const opacity=isRussia?1:.86;
    const obsX=monthly.map(d=>parseDate(d.date));
    traces.push({x:obsX,y:monthly.map(d=>d.tfr_total),name:`СКР факт — ${label}`,mode:'lines+markers',line:{color:totalColor,width},marker:{size:isActive?6:4},opacity});
    traces.push({x:fTotal.filter(d=>d.date>parseDate(monthly[monthly.length-1].date)).map(d=>d.date),y:fTotal.filter(d=>d.date>parseDate(monthly[monthly.length-1].date)).map(d=>d.mean),name:`СКР прогноз — ${label}`,mode:'lines',line:{color:totalColor,width:width-0.4,dash:'dash'},opacity});
    traces.push({x:obsX,y:monthly.map(d=>d.tfr_third_plus),name:`СКР 3+ факт — ${label}`,mode:'lines+markers',visible:'legendonly',line:{color:t3Color,width:Math.max(2,width-0.8)},marker:{size:isActive?5:3},opacity});
  });
  return {traces, activeTarget:federalTarget, activeForecast:russiaForecast};
}
function updateSkrChart(){
  const activeTid=skrState.selected;
  const {traces, activeTarget}=makeSkrTraces(activeTid);
  const meta=skrState.data.metadata;
  const narrow=TG.isNarrow();
  const policyDate=activeTarget.policyDate, effectDate=activeTarget.effectDate;
  const target2036=parseDate('2036-12-01'), target2050=parseDate('2050-12-01');
  const ann=[];
  if(!narrow && activeTarget.gapForecast2036 !== null){
    ann.push({x:target2036,y:meta.target_2036_mid,xref:'x',yref:'y',text:`Отставание от цели 2036: ${fmtTfr(activeTarget.gapForecast2036,2)}<br>требуемый прирост: ${fmtTfr(activeTarget.lift2036,2)}`,showarrow:true,arrowhead:2,ax:-120,ay:-76,bgcolor:'rgba(255,255,255,.92)',bordercolor:'#e0cfad',font:{size:14,color:'#111514'}});
  } else if(!narrow) {
    ann.push({x:effectDate,y:meta.target_2036_mid,xref:'x',yref:'y',text:'Для 2036 нужен скачок',showarrow:true,arrowhead:2,ax:80,ay:-40,bgcolor:'rgba(255,255,255,.92)',bordercolor:'#e0cfad',font:{size:14,color:'#111514'}});
  }
  if(!narrow) ann.push({x:target2050,y:meta.target_2050_mid,xref:'x',yref:'y',text:`Отставание от цели 2050: ${fmtTfr(activeTarget.gapForecast2050,2)}<br>требуемый прирост: ${fmtTfr(activeTarget.lift2050,2)}`,showarrow:true,arrowhead:2,ax:-125,ay:40,bgcolor:'rgba(255,255,255,.92)',bordercolor:'#e0cfad',font:{size:14,color:'#111514'}});
  ann.push({x:policyDate,y:.90,xref:'x',yref:'paper',text:'запуск мер',showarrow:false,xshift:narrow?-5:-12,bgcolor:'rgba(255,253,248,.88)',bordercolor:'#eadbbf',font:{size:narrow?10:12,color:'#8a641a'}});
  ann.push({x:effectDate,y:.98,xref:'x',yref:'paper',text:'эффект +9 мес.',showarrow:false,xshift:narrow?8:16,bgcolor:'rgba(255,253,248,.88)',bordercolor:'#eadbbf',font:{size:narrow?10:12,color:'#145b61'}});
  const layout=TG.plotLayout({
    height:610,
    margin:narrow?{l:48,r:18,t:34,b:112}:{l:65,r:38,t:48,b:80},
    title:{text:''},
    xaxis:{gridcolor:'#efe5d4', range:[parseDate('2025-01-01'),parseDate('2050-12-01')], dtick:narrow?'M60':'M24', tickformat:'%Y', automargin:true},
    yaxis:{gridcolor:'#efe5d4', range:[0,3.35], title:'детей на 1 женщину', tickformat:',.1f'},
    legend:narrow?{orientation:'h',x:0,y:-0.26,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.10,bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:12}},
    shapes:[
      {type:'rect',xref:'x',yref:'paper',x0:policyDate,x1:effectDate,y0:0,y1:1,fillcolor:'rgba(111,119,117,.12)',line:{width:0},layer:'below'},
      {type:'line',xref:'x',yref:'paper',x0:policyDate,x1:policyDate,y0:0,y1:1,line:{color:TG.colors.gold,width:2,dash:'dot'}},
      {type:'line',xref:'x',yref:'paper',x0:effectDate,x1:effectDate,y0:0,y1:1,line:{color:TG.colors.teal,width:2,dash:'dot'}},
      {type:'line',xref:'x',yref:'paper',x0:target2036,x1:target2036,y0:0,y1:1,line:{color:'rgba(60,122,71,.55)',width:2,dash:'dot'}},
      {type:'line',xref:'x',yref:'paper',x0:target2050,x1:target2050,y0:0,y1:1,line:{color:'rgba(60,122,71,.55)',width:2,dash:'dot'}}
    ],
    annotations:ann
  });
  const rendered=Plotly.react('tfrChart', traces, layout, TG.plotConfig);
  updateSkrKpis(activeTid);
  if(rendered && typeof rendered.then === 'function') rendered.then(()=>positionPolicyDragHandle());
  else requestAnimationFrame(positionPolicyDragHandle);
}
function updateSkrKpis(activeTid){
  const meta=skrState.data.metadata;
  const latest=skrState.data.latest[activeTid] || {};
  const activeForecast=getTotalForecast(activeTid);
  const territoryTarget=activeForecast.length ? targetTrajectory(activeForecast, skrState.policyStart, meta) : {};
  const f2036=forecastValueAt(activeForecast,'2036-12');
  const f2050=forecastValueAt(activeForecast,'2050-12');
  const gap2036=f2036==null?null:meta.target_2036_mid-f2036;
  const gap2050=f2050==null?null:meta.target_2050_mid-f2050;
  const lift2036=territoryTarget.lift2036 ?? null;
  document.getElementById('activeTerritoryPill').textContent=getTerritoryLabel(activeTid);
  document.getElementById('kpiLastTfr').textContent=latest.tfr_total==null?'—':fmtTfr(latest.tfr_total,3);
  document.getElementById('kpiLastTfr3').textContent=f2036==null?'—':fmtTfr(f2036,2);
  document.getElementById('kpiDelta2036').textContent=gap2036==null?'—':`${gap2036>=0?'+':''}${fmtTfr(gap2036,2)}`;
  document.getElementById('kpiMonthlyLift').textContent=lift2036==null?'—':`${lift2036>=0?'+':''}${fmtTfr(lift2036,2)}`;
  updatePolicyStatusLabels(territoryTarget.effectDate?monthId(territoryTarget.effectDate):effectMonthForPolicy());
  updatePolicyHandleA11y();
  const russiaForecast=getTotalForecast(meta.russia_territory_id);
  const russiaLatest=skrState.data.latest[meta.russia_territory_id] || {};
  const russia2036=forecastValueAt(russiaForecast,'2036-12');
  document.getElementById('russiaKpiSummary').textContent=`последний СКР ${fmtTfr(russiaLatest.tfr_total,3)}, прогноз 2036 ${fmtTfr(russia2036,2)}`;
  const selectedTitle=skrState.analysisMode==='country'?'Россия':skrState.analysisMode==='district'?'Выбранный федеральный округ':'Выбранный субъект';
  document.getElementById('selectedKpiTitle').textContent=selectedTitle;
  document.getElementById('selectedKpiSummary').textContent=`${getTerritoryLabel(activeTid)}: прогноз 2036 ${fmtTfr(f2036,2)}, 2050 ${fmtTfr(f2050,2)}, отставание от цели 2050 ${fmtTfr(gap2050,2)}`;
}

function setupTerritorySelector(){
  const sel=document.getElementById('territorySelect');
  const groups={country_excluding_new_subjects:'Россия', federal_district:'Федеральные округа', federal_subject:'Субъекты РФ', federal_subject_remainder:'Субъекты РФ', federal_subject_aggregate:'Субъекты РФ'};
  const byGroup={};
  selectedTerritoriesForMode().forEach(t=>{ const g=groups[t.type]||'Прочие'; (byGroup[g] ||= []).push(t); });
  sel.innerHTML='';
  Object.entries(byGroup).forEach(([g, arr])=>{
    const og=document.createElement('optgroup'); og.label=g;
    arr.forEach(t=>{ const o=document.createElement('option'); o.value=t.id; o.textContent=getTerritoryLabel(t.id); og.appendChild(o); });
    sel.appendChild(og);
  });
  const allowed=selectedTerritoriesForMode().map(t=>t.id);
  if(!allowed.includes(skrState.selected)) skrState.selected=allowed[0] || skrState.data.metadata.russia_territory_id;
  sel.value=skrState.selected;
  sel.disabled=skrState.analysisMode==='country';
}
function setupTerritorySelectorEvents(){
  const sel=document.getElementById('territorySelect');
  sel.addEventListener('change',()=>{ selectTerritory(sel.value, false); });
}
function setAnalysisMode(mode){
  skrState.analysisMode=mode;
  document.querySelectorAll('[data-analysis-mode]').forEach(b=>b.classList.toggle('active',b.dataset.analysisMode===mode));
  setupTerritorySelector();
  updateSkrChart();
  updateRpnRegionalModule();
}
function setViewMode(mode){
  document.body.classList.toggle('view-brief', mode==='brief');
  document.querySelectorAll('[data-view-mode]').forEach(b=>b.classList.toggle('active',b.dataset.viewMode===mode));
}
function setupModeControls(){
  document.querySelectorAll('[data-analysis-mode]').forEach(b=>b.addEventListener('click',()=>setAnalysisMode(b.dataset.analysisMode)));
  document.querySelectorAll('[data-view-mode]').forEach(b=>b.addEventListener('click',()=>setViewMode(b.dataset.viewMode)));
  setViewMode('brief');
}
function setupPolicyControl(){
  skrState.policyMonths = monthRange(POLICY_START_MIN, POLICY_START_MAX).map(monthId);
  setupSkrModule();
  setupPolicyPointerControl();
  setPolicyIndex(0,{render:false});
  document.getElementById('policyNowBtn').addEventListener('click',()=>setPolicyIndex(0));
  document.getElementById('policy2030Btn').addEventListener('click',()=>setPolicyMonth('2030-01'));
  document.getElementById('resetTerritoryBtn').addEventListener('click',()=>selectTerritory(skrState.data.metadata.russia_territory_id, true));
}
function colorForTfr(v){
  if(v===null || v===undefined || isNaN(v)) return '#d9d2c3';
  if(v<1.0) return '#f0e1bd';
  if(v<1.2) return '#d9b56b';
  if(v<1.4) return '#b8872e';
  if(v<1.6) return '#7c6f32';
  if(v<1.8) return '#3f7252';
  return '#145b61';
}
function setupMap(){
  const features = skrState.geo.features || [];
  const width=1000, height=560, pad=18;
  const rawPoints=[];
  function visitCoords(coords, cb){
    if(typeof coords[0] === 'number') cb(coords);
    else coords.forEach(part=>visitCoords(part, cb));
  }
  const normalizeLon = lon => {
    let value=+lon;
    while(value < 0) value += 360;
    while(value >= 360) value -= 360;
    if(value < 15) value += 360;
    return value;
  };
  features.forEach(f=>visitCoords(f.geometry.coordinates, ([lon, lat])=>rawPoints.push({lon:normalizeLon(lon), lat:+lat})));
  const centerLat=rawPoints.reduce((sum,p)=>sum+p.lat,0)/Math.max(1,rawPoints.length);
  const cosLat=Math.max(.42, Math.cos(centerLat*Math.PI/180));
  const xs=rawPoints.map(p=>p.lon*cosLat), ys=rawPoints.map(p=>p.lat);
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const scale=Math.min((width-pad*2)/(maxX-minX), (height-pad*2)/(maxY-minY));
  const offsetX=(width-(maxX-minX)*scale)/2;
  const offsetY=(height-(maxY-minY)*scale)/2;
  const project=([lon, lat])=>[
    offsetX + (normalizeLon(lon)*cosLat-minX)*scale,
    offsetY + (maxY-lat)*scale
  ];
  function ringPath(ring){
    return ring.map((pt, idx)=>{
      const [x,y]=project(pt);
      return `${idx?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  }
  function geometryPath(geometry){
    const coords=geometry.coordinates;
    if(geometry.type==='Polygon') return coords.map(ringPath).join(' ');
    if(geometry.type==='MultiPolygon') return coords.flatMap(poly=>poly.map(ringPath)).join(' ');
    return '';
  }
  const el=document.getElementById('map');
  el.innerHTML='';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Карта субъектов России по последнему СКР');
  const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('width',width);
  bg.setAttribute('height',height);
  bg.setAttribute('fill','#fffdf8');
  svg.appendChild(bg);
  features.forEach(feature=>{
    const p=feature.properties || {};
    const tid=p.territory_id || p.map_feature_id;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', geometryPath(feature.geometry));
    path.setAttribute('fill', colorForTfr(p.latest_tfr_total));
    path.setAttribute('stroke', '#fff8e8');
    path.setAttribute('stroke-width', '0.7');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('tabindex', '0');
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');
    title.textContent=`${p.territory_name || p.Name_full}: СКР ${fmtTfr(p.latest_tfr_total,3)}, СКР 3+ ${fmtTfr(p.latest_tfr_third_plus,3)}`;
    path.appendChild(title);
    const activate=()=>{
      if(p.has_stat_data && p.territory_id){
        setAnalysisMode('subject');
        selectTerritory(p.territory_id, true);
      }
    };
    path.addEventListener('click', activate);
    path.addEventListener('keydown', ev=>{ if(ev.key==='Enter' || ev.key===' '){ ev.preventDefault(); activate(); } });
    svg.appendChild(path);
  });
  el.appendChild(svg);
  document.getElementById('mapLegend').innerHTML = [
    ['нет данных','#d9d2c3'],['< 1,0','#f0e1bd'],['1,0–1,2','#d9b56b'],['1,2–1,4','#b8872e'],['1,4–1,6','#7c6f32'],['1,6–1,8','#3f7252'],['≥ 1,8','#145b61']
  ].map(([l,c])=>`<span class="swatch" style="background:${c}"></span><span>${l}</span>`).join(' ');
}
function selectTerritory(tid, syncSelector){
  if(!getMonthly(tid).length) return;
  skrState.selected=tid;
  if(syncSelector) document.getElementById('territorySelect').value=tid;
  updateSkrChart();
  updateRpnRegionalModule();
}


// --- РПН-2022: желаемое / ожидаемое число детей и жилищный резерв рождаемости ---
const RPN_SCENARIO_LABELS = {
  upper_bound_all_women_desired_expected_gap:'Все женщины 18–44: латентный максимум',
  upper_bound_women_with_positive_gap:'Женщины с разрывом желаемое > ожидаемого',
  upper_bound_housing_barrier:'Жильё мешает: верхняя граница',
  upper_bound_need_improvement_and_housing_barrier:'Нужно улучшить жильё + жильё мешает',
  near_term_support_all_women_probability_delta:'3 года: все женщины',
  near_term_support_housing_barrier_probability_delta:'3 года: жильё мешает',
  near_term_support_housing_barrier_and_housing_measures_high:'3 года: жильё мешает + меры 4–5',
  near_term_support_need_barrier_and_housing_measures_high:'3 года: узкая целевая группа'
};
const RPN_MEASURE_LABELS = {
  land_plot_for_house_construction:'Земельный участок под дом',
  partial_mortgage_credit_repayment:'Погашение жилищного кредита',
  monthly_cash_payment:'Ежемесячная выплата',
  additional_monthly_benefits:'Дополнительные ежемесячные пособия'
};
function fmtPeopleShort(x, digits=2){
  if(x === null || x === undefined || Number.isNaN(x)) return '—';
  if(Math.abs(x) >= 1e6) return `${fmtNum(x/1e6, digits)} млн`;
  if(Math.abs(x) >= 1e3) return `${fmtNum(x/1e3, digits)} тыс.`;
  return fmtNum(x,0);
}
function setupRpnControls(){
  if(!skrState.rpn || !document.getElementById('rpnScenarioSelect')) return;
  const scenarioSelect=document.getElementById('rpnScenarioSelect');
  scenarioSelect.innerHTML='';
  skrState.rpn.potential_births_scenarios.forEach(s=>{
    const o=document.createElement('option');
    o.value=s.scenario_id;
    o.textContent=RPN_SCENARIO_LABELS[s.scenario_id] || s.scenario_id;
    scenarioSelect.appendChild(o);
  });
  scenarioSelect.value='near_term_support_housing_barrier_probability_delta';
  const sexSelect=document.getElementById('rpnSexSelect');
  [scenarioSelect, sexSelect, document.getElementById('rpnLatentClosureRange'), document.getElementById('rpnProbabilityScaleRange')].forEach(el=>{
    if(el) el.addEventListener('input', updateRpnModule);
    if(el && el.tagName === 'SELECT') el.addEventListener('change', updateRpnModule);
  });
}
function updateRpnModule(){
  if(!skrState.rpn || !document.getElementById('rpnKpiDesired')) return;
  const data=skrState.rpn;
  const overall=data.overall_by_sex.find(d=>d.group==='Все') || data.overall_by_sex[0];
  const women=data.overall_by_sex.find(d=>d.group==='Женщины') || overall;
  const barrierWomen=data.barrier_distribution.find(d=>d.barrier==='housing_difficulties' && d.sex==='Женщины');
  document.getElementById('rpnKpiDesired').textContent=fmtNum(overall.desired_children_mean,2);
  document.getElementById('rpnKpiExpected').textContent=fmtNum(overall.expected_children_mean,2);
  document.getElementById('rpnKpiGap').textContent=fmtNum(overall.gap_mean,2);
  document.getElementById('rpnKpiHousingBarrier').textContent=fmtPct(barrierWomen?.very_or_somewhat_hinders_pct,1);
  drawRpnIntentChart();
  drawRpnHousingGapChart();
  drawRpnBarrierChart();
  drawRpnMeasuresChart();
  drawRpnPotentialChart();
  drawRpnOrderPotentialChart();
  drawRpnScenarioTable();
}
function rpnChartLayout(extra={}){
  return TG.plotLayout(Object.assign({
    height:500,
    margin:{l:64,r:42,t:42,b:86},
    legend:{orientation:'h',x:0,y:1.16,bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:12}}
  }, extra));
}
function drawRpnIntentChart(){
  const d=skrState.rpn;
  const rows=d.overall_by_sex;
  const x=rows.map(r=>r.group);
  const russiaLatest=skrState.data.latest[skrState.data.metadata.russia_territory_id]?.tfr_total;
  const traces=[
    {type:'bar', name:'уже рождено, среднее', x, y:rows.map(r=>r.born_children_mean), marker:{color:'rgba(111,119,117,.70)'}},
    {type:'bar', name:'ожидаемое / собираются иметь', x, y:rows.map(r=>r.expected_children_mean), marker:{color:TG.colors.teal}},
    {type:'bar', name:'желаемое', x, y:rows.map(r=>r.desired_children_mean), marker:{color:TG.colors.gold}},
    {type:'scatter', mode:'lines+markers', name:'СКР факт РФ 2026‑05', x, y:x.map(()=>russiaLatest), line:{color:TG.colors.red,width:2,dash:'dot'}, marker:{size:7,color:TG.colors.red}}
  ];
  Plotly.react('rpnIntentChart', traces, rpnChartLayout({
    barmode:'group',
    yaxis:{title:'детей', range:[0,2.35], gridcolor:'#efe5d4'},
    xaxis:{gridcolor:'#efe5d4'},
    title:{text:'Среднее число детей: рождено, ожидается, желательно',x:0,xanchor:'left',font:{size:20}}
  }), TG.plotConfig);
}
function drawRpnHousingGapChart(){
  const sex=document.getElementById('rpnSexSelect')?.value || 'Все';
  const rows=skrState.rpn.by_housing_condition.filter(d=>d.sex===sex);
  const x=rows.map(d=>d.housing_condition.replace(' — ','<br>'));
  const traces=[
    {type:'bar', name:'ожидаемое', x, y:rows.map(d=>d.expected_children_mean), marker:{color:TG.colors.teal}},
    {type:'bar', name:'желаемое', x, y:rows.map(d=>d.desired_children_mean), marker:{color:TG.colors.gold}},
    {type:'scatter', mode:'lines+markers', name:'разрыв', x, y:rows.map(d=>d.gap_mean), yaxis:'y2', line:{color:TG.colors.red,width:3}, marker:{size:8}}
  ];
  Plotly.react('rpnHousingGapChart', traces, rpnChartLayout({
    barmode:'group',
    yaxis:{title:'детей', range:[1.45,2.22], gridcolor:'#efe5d4'},
    yaxis2:{title:'разрыв', overlaying:'y', side:'right', range:[0,0.34], gridcolor:'rgba(0,0,0,0)'},
    xaxis:{tickangle:-10, gridcolor:'#efe5d4'},
    title:{text:`Жилищные условия и планы: ${sex.toLowerCase()}`,x:0,xanchor:'left',font:{size:20}}
  }), TG.plotConfig);
}
function drawRpnBarrierChart(){
  const rows=skrState.rpn.barrier_distribution.filter(d=>d.sex!=='Все');
  const x=rows.map(d=>`${d.barrier==='housing_difficulties'?'Жилищные трудности':'Ипотечный кредит'}<br>${d.sex}`);
  const traces=[
    {type:'bar', name:'очень мешает', x, y:rows.map(d=>d['очень мешает_pct']), marker:{color:TG.colors.red}},
    {type:'bar', name:'мешает', x, y:rows.map(d=>d['мешает_pct']), marker:{color:TG.colors.gold}},
    {type:'bar', name:'не мешает', x, y:rows.map(d=>d['не мешает_pct']), marker:{color:TG.colors.teal}},
    {type:'bar', name:'трудно сказать / отказ', x, y:rows.map(d=>d['трудно сказать / отказ_pct']), marker:{color:'#d9d2c3'}}
  ];
  Plotly.react('rpnBarrierChart', traces, rpnChartLayout({
    barmode:'stack',
    yaxis:{title:'% ответов', range:[0,100], gridcolor:'#efe5d4'},
    xaxis:{tickangle:-13, gridcolor:'#efe5d4'},
    title:{text:'Что мешает иметь желаемое число детей',x:0,xanchor:'left',font:{size:20}}
  }), TG.plotConfig);
}
function drawRpnMeasuresChart(){
  const sex=document.getElementById('rpnSexSelect')?.value || 'Все';
  const rows=skrState.rpn.birth_decision_measures
    .filter(d=>d.sex===sex && d.born_children_group==='все')
    .sort((a,b)=>a.share_score_4_5_pct-b.share_score_4_5_pct);
  const traces=[{type:'bar', orientation:'h', name:'оценка 4–5', y:rows.map(d=>RPN_MEASURE_LABELS[d.measure]||d.measure), x:rows.map(d=>d.share_score_4_5_pct), marker:{color:TG.colors.gold}, text:rows.map(d=>fmtPct(d.share_score_4_5_pct,1)), textposition:'outside', cliponaxis:false}];
  Plotly.react('rpnMeasuresChart', traces, rpnChartLayout({
    margin:{l:190,r:40,t:42,b:54},
    xaxis:{title:'% оценивших меру на 4–5', range:[0,Math.max(70, Math.max(...rows.map(d=>d.share_score_4_5_pct))+10)], gridcolor:'#efe5d4'},
    yaxis:{gridcolor:'#efe5d4'},
    title:{text:`Значимость мер: ${sex.toLowerCase()}`,x:0,xanchor:'left',font:{size:20}}
  }), TG.plotConfig);
}
function selectedRpnScenario(){
  const sel=document.getElementById('rpnScenarioSelect');
  const sid=sel?.value || 'near_term_support_housing_barrier_probability_delta';
  return skrState.rpn.potential_births_scenarios.find(s=>s.scenario_id===sid) || skrState.rpn.potential_births_scenarios[0];
}
function drawRpnPotentialChart(){
  const s=selectedRpnScenario();
  const latentPct=+(document.getElementById('rpnLatentClosureRange')?.value || 10);
  const probScale=+(document.getElementById('rpnProbabilityScaleRange')?.value || 100);
  document.getElementById('rpnLatentClosureLabel').textContent=fmtPct(latentPct,0);
  document.getElementById('rpnProbabilityScaleLabel').textContent=fmtPct(probScale,0);
  document.getElementById('rpnScenarioDescription').textContent=s.description || '';
  const probAdd=s.additional_births_next_3y_probability_positive_delta * probScale/100;
  const baselineBirths=s.baseline_births_next_3y_by_probability || 0;
  const support=baselineBirths + probAdd;
  const latent=s.latent_desired_expected_gap_births * latentPct/100;
  document.getElementById('rpnKpiTargetWomen').textContent=fmtPeopleShort(s.target_women_weighted,2);
  document.getElementById('rpnKpiProbBirths').textContent=fmtPeopleShort(probAdd,2);
  document.getElementById('rpnKpiLatentBirths').textContent=fmtPeopleShort(latent,2);
  document.getElementById('rpnKpiMeanGap').textContent=fmtNum(s.mean_positive_gap,2);
  const labels=['Базовые рождения<br>за 3 года','При поддержке<br>за 3 года','Прирост по вероятности<br>за 3 года','Реализованный<br>латентный разрыв'];
  const vals=[baselineBirths,support,probAdd,latent].map(v=>v/1e6);
  const traces=[{type:'bar', x:labels, y:vals, marker:{color:[TG.colors.teal,TG.colors.green,TG.colors.gold,TG.colors.red]}, text:vals.map(v=>fmtNum(v,2)+' млн'), textposition:'outside', cliponaxis:false}];
  Plotly.react('rpnPotentialChart', traces, rpnChartLayout({
    yaxis:{title:'млн рождений / детей', rangemode:'tozero', gridcolor:'#efe5d4'},
    xaxis:{tickangle:0, gridcolor:'#efe5d4'},
    title:{text:RPN_SCENARIO_LABELS[s.scenario_id] || s.scenario_id,x:0,xanchor:'left',font:{size:19}}
  }), TG.plotConfig);
}
function drawRpnOrderPotentialChart(){
  const rows=skrState.rpn.housing_barrier_potential_by_born_children;
  const narrow=TG.isNarrow();
  const x=rows.map(d=>narrow ? (d.born_children===4?'4+':String(d.born_children)) : (d.born_children===4?'4+ детей':`${d.born_children} ${d.born_children===1?'ребёнок':'детей'}`));
  const traces=[
    {type:'bar', name:'латентный разрыв', x, y:rows.map(d=>d.latent_desired_expected_gap_births/1000), marker:{color:TG.colors.teal}},
    {type:'bar', name:'вероятностный эффект за 3 года', x, y:rows.map(d=>d.additional_births_next_3y_probability_positive_delta/1000), marker:{color:TG.colors.gold}}
  ];
  Plotly.react('rpnOrderPotentialChart', traces, rpnChartLayout({
    barmode:'group',
    margin:narrow?{l:50,r:22,t:24,b:112}:{l:64,r:42,t:24,b:112},
    yaxis:{title:'тыс. потенциальных рождений', rangemode:'tozero', gridcolor:'#efe5d4'},
    xaxis:TG.categoryAxis({title:'текущее число детей',tickangle:0}),
    title:{text:''},
    legend:{orientation:'h',x:0,y:-0.26,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:narrow?10:12}}
  }), TG.plotConfig);
}
function drawRpnScenarioTable(){
  const rows=skrState.rpn.potential_births_scenarios.map(s=>({
    scenario:RPN_SCENARIO_LABELS[s.scenario_id] || s.scenario_id,
    target:fmtPeopleShort(s.target_women_weighted,2),
    latent:fmtPeopleShort(s.latent_desired_expected_gap_births,2),
    prob3y:fmtPeopleShort(s.additional_births_next_3y_probability_positive_delta,2),
    meanGap:fmtNum(s.mean_positive_gap,2)
  }));
  document.getElementById('rpnScenarioTable').innerHTML=tableHTML(rows,[
    {key:'scenario',label:'Сценарий'},
    {key:'target',label:'Целевая группа'},
    {key:'latent',label:'Латентный максимум'},
    {key:'prob3y',label:'Вероятностный эффект'},
    {key:'meanGap',label:'Средний разрыв'}
  ]);
}


// --- РПН-2012/2017: региональная ретроспектива ---
function setupRpnRegionalControls(){
  if(!skrState.rpnRegional || !document.getElementById('rpnRegionalYearSelect')) return;
  ['rpnRegionalYearSelect','rpnRegionalSexSelect'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.addEventListener('change', updateRpnRegionalModule); el.addEventListener('input', updateRpnRegionalModule); }
  });
}
function rpnRegRows(year, sex){
  if(!skrState.rpnRegional) return [];
  return skrState.rpnRegional.records.filter(d=>String(d.year)===String(year) && d.sex===sex && d.region_code!=='RU');
}
function rpnRegNational(year, sex){
  if(!skrState.rpnRegional) return null;
  return skrState.rpnRegional.records.find(d=>String(d.year)===String(year) && d.sex===sex && d.region_code==='RU') || null;
}
function territoryRpnRegionalRows(tid, sex){
  if(!skrState.rpnRegional) return [];
  const id = tid || skrState.data.metadata.russia_territory_id;
  if(id===skrState.data.metadata.russia_territory_id){
    return skrState.rpnRegional.records.filter(d=>d.region_code==='RU' && d.sex===sex).sort((a,b)=>a.year-b.year);
  }
  return skrState.rpnRegional.records.filter(d=>d.territory_id===id && d.sex===sex).sort((a,b)=>a.year-b.year);
}
function updateRpnRegionalModule(){
  if(!skrState.rpnRegional || !document.getElementById('rpnRegionalScatter')) return;
  drawRpnRegionalScatter();
  drawRpnRegionalTrend();
  drawRpnRegionalTable();
}
function drawRpnRegionalScatter(){
  const year=document.getElementById('rpnRegionalYearSelect')?.value || '2017';
  const sex=document.getElementById('rpnRegionalSexSelect')?.value || 'Все';
  const rows=rpnRegRows(year, sex).filter(d=>d.fact_tfr_total!==null && d.desired_mean!==null && d.expected_mean!==null);
  const nat=rpnRegNational(year, sex);
  const selectedId=skrState.selected;
  const selectedRows=rows.filter(d=>d.territory_id===selectedId);
  const otherRows=rows.filter(d=>d.territory_id!==selectedId);
  const traces=[
    {type:'scatter', mode:'markers', name:'субъекты РФ', x:otherRows.map(d=>d.fact_tfr_total), y:otherRows.map(d=>d.desired_mean),
      text:otherRows.map(d=>`<b>${d.region_name}</b><br>СКР факт: ${fmtTfr(d.fact_tfr_total,3)}<br>Желаемое: ${fmtNum(d.desired_mean,2)}<br>Ожидаемое: ${fmtNum(d.expected_mean,2)}<br>Разрыв: ${fmtNum(d.gap_mean,2)}<br>Число ответов: ${fmtNum(d.n,0)}`),
      hovertemplate:'%{text}<extra></extra>', marker:{size:9, color:otherRows.map(d=>d.gap_mean), colorscale:[[0,'#d9d2c3'],[.5,TG.colors.gold],[1,TG.colors.red]], cmin:0, cmax:.75, colorbar:{title:'разрыв',thickness:12}, line:{color:'#fffdf8',width:1}}},
    {type:'scatter', mode:'markers', name:'ожидаемое число детей', x:rows.map(d=>d.fact_tfr_total), y:rows.map(d=>d.expected_mean),
      text:rows.map(d=>`<b>${d.region_name}</b><br>СКР факт: ${fmtTfr(d.fact_tfr_total,3)}<br>Ожидаемое: ${fmtNum(d.expected_mean,2)}`), hovertemplate:'%{text}<extra></extra>', marker:{size:7,color:'rgba(20,91,97,.45)',symbol:'circle-open',line:{color:TG.colors.teal,width:1.5}}}
  ];
  if(nat && nat.fact_tfr_total!==null){
    traces.push({type:'scatter',mode:'markers+text',name:'Россия',x:[nat.fact_tfr_total],y:[nat.desired_mean],text:['Россия'],textposition:'top center',hovertemplate:`<b>Россия</b><br>СКР факт: ${fmtTfr(nat.fact_tfr_total,3)}<br>Желаемое: ${fmtNum(nat.desired_mean,2)}<br>Ожидаемое: ${fmtNum(nat.expected_mean,2)}<extra></extra>`,marker:{size:15,color:TG.colors.blue,line:{color:'#fffdf8',width:1.5}}});
  }
  if(selectedRows.length){
    const s=selectedRows[0];
    traces.push({type:'scatter',mode:'markers+text',name:'выбранная территория',x:[s.fact_tfr_total],y:[s.desired_mean],text:[s.region_name],textposition:'bottom center',hovertemplate:`<b>${s.region_name}</b><br>СКР факт: ${fmtTfr(s.fact_tfr_total,3)}<br>Желаемое: ${fmtNum(s.desired_mean,2)}<br>Ожидаемое: ${fmtNum(s.expected_mean,2)}<br>Разрыв: ${fmtNum(s.gap_mean,2)}<extra></extra>`,marker:{size:17,color:TG.colors.red,symbol:'diamond',line:{color:'#fffdf8',width:1.5}}});
  }
  Plotly.react('rpnRegionalScatter', traces, rpnChartLayout({
    title:{text:`РПН-${year}: факт СКР и репродуктивные установки (${sex.toLowerCase()})`,x:0,xanchor:'left',font:{size:20}},
    xaxis:{title:'фактический СКР за год',gridcolor:'#efe5d4',zeroline:false},
    yaxis:{title:'среднее число детей',gridcolor:'#efe5d4',zeroline:false,range:[0.8,3.4]},
    legend:{orientation:'h',x:0,y:1.18,bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:12}}
  }), TG.plotConfig);
}
function drawRpnRegionalTrend(){
  const sex=document.getElementById('rpnRegionalSexSelect')?.value || 'Все';
  const rows=territoryRpnRegionalRows(skrState.selected, sex);
  document.getElementById('rpnRegionalTerritoryPill').textContent=getTerritoryLabel(skrState.selected);
  if(!rows.length){
    document.getElementById('rpnRegionalTrend').innerHTML='<div class="text-note" style="padding:20px">Для выбранной территории нет региональных значений РПН-2012/2017.</div>';
    return;
  }
  const x=rows.map(d=>String(d.year));
  const traces=[
    {type:'scatter',mode:'lines+markers',name:'желаемое',x,y:rows.map(d=>d.desired_mean),line:{color:TG.colors.gold,width:4},marker:{size:9}},
    {type:'scatter',mode:'lines+markers',name:'ожидаемое',x,y:rows.map(d=>d.expected_mean),line:{color:TG.colors.teal,width:4},marker:{size:9}},
    {type:'scatter',mode:'lines+markers',name:'фактический СКР',x,y:rows.map(d=>d.fact_tfr_total),line:{color:TG.colors.red,width:3,dash:'dot'},marker:{size:8}}
  ];
  Plotly.react('rpnRegionalTrend', traces, rpnChartLayout({
    title:{text:`${getTerritoryLabel(skrState.selected)}: установки и факт`,x:0,xanchor:'left',font:{size:20}},
    yaxis:{title:'детей / СКР',gridcolor:'#efe5d4',range:[0.8,3.5]},
    xaxis:{type:'category',gridcolor:'#efe5d4'},
    legend:{orientation:'h',x:0,y:1.16,bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:12}}
  }), TG.plotConfig);
}
function drawRpnRegionalTable(){
  const sex=document.getElementById('rpnRegionalSexSelect')?.value || 'Все';
  const rows=territoryRpnRegionalRows(skrState.selected, sex).map(d=>({
    year:d.year,
    n:fmtNum(d.n,0),
    desired:fmtNum(d.desired_mean,2),
    expected:fmtNum(d.expected_mean,2),
    gap:fmtNum(d.gap_mean,2),
    tfr:fmtTfr(d.fact_tfr_total,3),
    gapFact:fmtNum(d.tfr_gap_desired_minus_fact,2),
    housingNeed:fmtPct(d.housing_need_share_pct,1),
    badHousing:fmtPct(d.bad_housing_share_pct,1)
  }));
  document.getElementById('rpnRegionalTable').innerHTML=tableHTML(rows,[
    {key:'year',label:'Год'}, {key:'n',label:'Число ответов'}, {key:'desired',label:'Желаемое'}, {key:'expected',label:'Ожидаемое'}, {key:'gap',label:'Разрыв'}, {key:'tfr',label:'СКР факт'}, {key:'gapFact',label:'Желаемое−СКР'}, {key:'housingNeed',label:'Нужно улучшить жильё'}, {key:'badHousing',label:'Плохое жильё'}
  ]);
}

async function initSkr(){
  try{
    const [data, geo, rpn, rpnRegional] = await Promise.all([loadJSON('data/tfr_data.json'), loadJSON('data/subjects.geojson'), loadJSON('data/rpn2022_fertility_housing_dashboard.json'), loadJSON('data/rpn_regional_intentions_2012_2017.json')]);
    skrState.data=data; skrState.geo=geo; skrState.rpn=rpn; skrState.rpnRegional=rpnRegional;
    try{ skrState.authorTfr = await loadAuthorTfrForecast(); }catch(_){ skrState.authorTfr = null; }
    setupTerritorySelector(); setupTerritorySelectorEvents(); setupModeControls(); setupPolicyControl(); setupMap(); updateSkrChart(); setupRpnControls(); setupRpnRegionalControls(); updateRpnModule(); updateRpnRegionalModule();
  }catch(err){
    showDataUnavailable('tfrChart');
  }
}
if(document.body.dataset.page==='skr') initSkr();
