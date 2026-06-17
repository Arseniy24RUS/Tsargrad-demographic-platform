'use strict';
const PAYMENTS_END_YEAR=2050;
const paymentsState={data:null, rows:[], summary:null};
function paymentOrderLabel(o){return o>=7?'7-го и последующих':`${o}-го`;}
function getPaymentsParams(){
  return {
    startOrder:+document.getElementById('paymentStartOrder').value,
    takeup:+document.getElementById('paymentTakeup').value/100,
    birthsPerParticipant:+document.getElementById('birthsPerParticipant').value,
    effectWindow:+document.getElementById('effectWindow').value,
    startYear:+document.getElementById('policyStartYearPayments').value,
    monthlyPayment:+document.getElementById('monthlyPayment').value,
    duration:+document.getElementById('paymentDuration').value,
    horizon:+document.getElementById('budgetHorizon').value,
    survival:+document.getElementById('survivalAdded').value
  };
}
function mothersByChildren(){ return paymentsState.data.mothers_by_current_children_vpn2020; }
function poolForStartOrder(order){
  return mothersByChildren().filter(d=>d.children>=order-1).reduce((a,b)=>a+b.mothers,0);
}
function baselineBirthsForStartOrder(order){
  return paymentsState.data.baseline_births_by_order_per_year_default.filter(d=>d.order>=order).reduce((a,b)=>a+b.births,0);
}
function simulatePayments(params){
  const pool=poolForStartOrder(params.startOrder);
  const participants=pool*params.takeup;
  const totalAdditionalBirths=participants*params.birthsPerParticipant;
  const addPerYear=totalAdditionalBirths/Math.max(1,params.effectWindow);
  const baselinePerYear=baselineBirthsForStartOrder(params.startOrder);
  const rows=[];
  let cumBudget=0, cumAddBudget=0;
  const horizon=Math.max(0, Math.min(params.horizon, PAYMENTS_END_YEAR - params.startYear + 1));
  for(let i=0;i<horizon;i++){
    const year=params.startYear+i;
    let activeBaselineCohorts=0, activeAddedCohorts=0;
    for(let c=0;c<=i;c++){
      const age=year-(params.startYear+c);
      if(age>=0 && age<params.duration){
        activeBaselineCohorts += baselinePerYear;
        if(c<params.effectWindow) activeAddedCohorts += addPerYear;
      }
    }
    const budgetBaseline=activeBaselineCohorts*params.monthlyPayment*12;
    const budgetAdded=activeAddedCohorts*params.monthlyPayment*12;
    const budgetTotal=budgetBaseline+budgetAdded;
    cumBudget += budgetTotal; cumAddBudget += budgetAdded;
    rows.push({year, activeBaselineCohorts, activeAddedCohorts, budgetBaseline, budgetAdded, budgetTotal, cumBudget, cumAddBudget});
  }
  const marginalCost= totalAdditionalBirths>0 ? cumAddBudget/totalAdditionalBirths : null;
  const totalCost= totalAdditionalBirths>0 ? cumBudget/totalAdditionalBirths : null;
  const popRows=[];
  const proj=paymentsState.data.population_projection_from_article_workbook.filter(r=>r.year<=PAYMENTS_END_YEAR);
  for(const p of proj){
    let added=0;
    for(let y=params.startYear;y<params.startYear+params.effectWindow;y++){
      if(p.year>=y){ added += addPerYear*Math.pow(params.survival, p.year-y); }
    }
    popRows.push({year:p.year, baseline:p.baseline, scenario:p.baseline+added, added});
  }
  return {pool,participants,totalAdditionalBirths,addPerYear,baselinePerYear,rows,popRows,marginalCost,totalCost};
}
function updatePaymentsKpis(s){
  document.getElementById('paymentsHeroPayment').textContent=fmtRub(+document.getElementById('monthlyPayment').value);
  document.getElementById('paymentsHeroOrder').textContent=paymentOrderLabel(+document.getElementById('paymentStartOrder').value);
  document.getElementById('paymentsKpiPool').textContent=fmtNum(s.pool,0);
  document.getElementById('paymentsKpiParticipants').textContent=fmtNum(s.participants,0);
  document.getElementById('paymentsKpiBirths').textContent=fmtNum(s.totalAdditionalBirths,0);
  document.getElementById('paymentsKpiCost').textContent=fmtRub(s.totalCost);
  const line=document.getElementById('paymentsSummaryLine');
  if(line){
    const totalBudget=s.rows.length?s.rows[s.rows.length-1].cumBudget:0;
    line.textContent=`При текущих настройках мера охватывает ${fmtNum(s.participants,0)} матерей, даёт ${fmtNum(s.totalAdditionalBirths,0)} потенциальных дополнительных рождений и требует ${fmtNum(totalBudget/1e9,2)} млрд ₽ до 2050 года. Цена одного потенциального рождения — ${fmtNum(s.totalCost/1e6,2)} млн ₽.`;
  }
}
function updatePaymentsCharts(){
  const p=getPaymentsParams();
  const s=simulatePayments(p);
  paymentsState.summary=s; paymentsState.rows=s.rows;
  updatePaymentsKpis(s);
  const years=s.rows.map(r=>r.year);
  Plotly.react('paymentsBudgetChart', [
    {type:'bar',x:years,y:s.rows.map(r=>r.budgetBaseline/1e9),name:'Выплаты всем детям выбранной очередности',marker:{color:TG.colors.teal}},
    {type:'bar',x:years,y:s.rows.map(r=>r.budgetAdded/1e9),name:'Выплаты дополнительным рождениям',marker:{color:'rgba(212,165,55,.42)',line:{color:TG.colors.gold,width:1.2},pattern:{shape:'/',fgcolor:TG.colors.gold,bgcolor:'rgba(212,165,55,.08)',size:8,solidity:.35}}}
  ], TG.plotLayout({height:490,barmode:'stack',yaxis:{title:'млрд ₽ в год',gridcolor:'#efe5d4'},xaxis:{gridcolor:'#efe5d4'},margin:{l:70,r:25,t:40,b:70}}), TG.plotConfig);
  Plotly.react('paymentsPopulationChart', [
    {type:'scatter',x:s.popRows.map(r=>r.year),y:s.popRows.map(r=>r.baseline/1e6),name:'Базовая траектория',mode:'lines',line:{color:TG.colors.muted,width:3}},
    {type:'scatter',x:s.popRows.map(r=>r.year),y:s.popRows.map(r=>r.scenario/1e6),name:'С учётом меры',mode:'lines',line:{color:TG.colors.gold,width:4}},
    {type:'scatter',x:s.popRows.map(r=>r.year),y:s.popRows.map(r=>r.added/1e6),name:'Прирост населения',mode:'lines',line:{color:TG.colors.teal,width:2,dash:'dash'},yaxis:'y2'}
  ], TG.plotLayout({height:490,yaxis:{title:'население, млн',gridcolor:'#efe5d4'},yaxis2:{title:'прирост, млн',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},xaxis:{gridcolor:'#efe5d4', range:[2021,PAYMENTS_END_YEAR]},margin:{l:70,r:80,t:40,b:70}}), TG.plotConfig);
  updateThresholdChart(p);
  updatePaymentsMothersChart();
  updatePaymentsTable(s.rows);
}
function updateThresholdChart(baseParams){
  const thresholds=[2,3,4,5,6,7];
  const rows=thresholds.map(o=>simulatePayments(Object.assign({},baseParams,{startOrder:o})));
  const labels=thresholds.map(o=>`с ${o}-го`);
  const thresholdTraceNames=['Дополнительные рождения, тыс.','Цена программы на рождение, млн ₽'];
  Plotly.react('paymentsThresholdChart', [
    {type:'bar',x:labels,y:rows.map(r=>r.totalAdditionalBirths/1000),name:thresholdTraceNames[0],marker:{color:TG.colors.teal},hovertemplate:'%{x}<br>дополнительные рождения: %{y:.1f} тыс.<extra></extra>'},
    {type:'scatter',x:labels,y:rows.map(r=>r.totalCost/1e6),name:thresholdTraceNames[1],mode:'lines+markers',line:{color:TG.colors.gold,width:3},marker:{size:8},yaxis:'y2',hovertemplate:'%{x}<br>цена программы: %{y:.2f} млн ₽<extra></extra>'}
  ], TG.plotLayout({height:490,yaxis:{title:'тыс. рождений',gridcolor:'#efe5d4'},yaxis2:{title:'млн ₽',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},xaxis:{gridcolor:'#efe5d4'},margin:{l:70,r:82,t:40,b:70}}), TG.plotConfig);
  paymentsState.thresholdTraceNames = thresholdTraceNames;
  paymentsState.thresholdRows = rows.map((r,i)=>({
    startOrder:thresholds[i],
    label:labels[i],
    totalAdditionalBirths:r.totalAdditionalBirths,
    marginalCost:r.marginalCost,
    totalCost:r.totalCost
  }));
}
function updatePaymentsMothersChart(){
  const mothers=mothersByChildren();
  const labels=TG.isNarrow()?mothers.map(d=>String(d.children >= 7 ? '7+' : d.children)):mothers.map(d=>d.label);
  const counts=mothers.map(d=>d.mothers);
  const potential=counts.map((_,i)=> i===0 ? 0 : counts.slice(0,i).reduce((a,b)=>a+b,0));
  const startOrder=getPaymentsParams().startOrder;
  const highlight=labels.map((_,i)=> i>=startOrder-1 ? TG.colors.gold : TG.colors.teal);
  Plotly.react('paymentsMothersChart', [
    {type:'bar', x:labels, y:counts.map(v=>v/1e6), name:'Фактическое число матерей', marker:{color:highlight}},
    {type:'bar', x:labels, y:potential.map(v=>v/1e6), name:'Штриховка — гипотетический максимум', marker:{color:'rgba(212,165,55,.35)',line:{color:TG.colors.gold,width:1.2},pattern:{shape:'/',fgcolor:TG.colors.gold,bgcolor:'rgba(212,165,55,.12)',size:8,solidity:.35}}}
  ], TG.plotLayout({height:490,barmode:'stack',yaxis:{title:'млн женщин',gridcolor:'#efe5d4'},xaxis:TG.categoryAxis({title:TG.isNarrow()?'детей у матери':'',tickangle:0}),margin:TG.isNarrow()?{l:50,r:24,t:28,b:112}:{l:70,r:25,t:40,b:90},legend:TG.isNarrow()?{orientation:'h',x:0,y:-0.28,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}}), TG.plotConfig);
}
function updatePaymentsTable(rows){
  const tableRows=rows.map(r=>({
    'Год':r.year,
    'Дети выбранной очередности':fmtNum(r.activeBaselineCohorts,0),
    'Дополнительные рождения':fmtNum(r.activeAddedCohorts,0),
    'Бюджет основной':fmtRub(r.budgetBaseline),
    'Бюджет дополнительных рождений':fmtRub(r.budgetAdded),
    'Итого':fmtRub(r.budgetTotal)
  }));
  document.getElementById('paymentsTable').innerHTML=tableHTML(tableRows);
}
function enforcePaymentsHorizon(){
  const start = +document.getElementById('policyStartYearPayments').value || 2026;
  const horizonEl = document.getElementById('budgetHorizon');
  const maxHorizon = Math.max(1, PAYMENTS_END_YEAR - start + 1);
  horizonEl.max = String(maxHorizon);
  if(+horizonEl.value > maxHorizon) horizonEl.value = maxHorizon;
}
function fillPaymentsControls(){
  const d=paymentsState.data.defaults;
  document.getElementById('paymentStartOrder').value=d.start_order;
  document.getElementById('paymentTakeup').value=d.takeup_percent;
  document.getElementById('birthsPerParticipant').value=d.births_per_participant_window;
  document.getElementById('effectWindow').value=d.effect_window_years;
  document.getElementById('policyStartYearPayments').value=d.policy_start_year;
  document.getElementById('monthlyPayment').value=d.monthly_payment_rub;
  document.getElementById('paymentDuration').value=d.payment_duration_years;
  document.getElementById('budgetHorizon').value=d.budget_horizon_years;
  document.getElementById('survivalAdded').value=d.annual_survival_added_cohorts;
  enforcePaymentsHorizon();
}
function setupPaymentsControls(){
  fillPaymentsControls();
  ['paymentStartOrder','paymentTakeup','birthsPerParticipant','effectWindow','policyStartYearPayments','monthlyPayment','paymentDuration','budgetHorizon','survivalAdded'].forEach(id=>{
    document.getElementById(id).addEventListener('input', ()=>{ if(id==='policyStartYearPayments') enforcePaymentsHorizon(); updatePaymentsCharts(); });
  });
  document.getElementById('scenario35').addEventListener('click',()=>{ document.getElementById('paymentTakeup').value=3.5; updatePaymentsCharts(); });
  document.getElementById('scenario70').addEventListener('click',()=>{ document.getElementById('paymentTakeup').value=7; updatePaymentsCharts(); });
  document.getElementById('resetPayments').addEventListener('click',()=>{ fillPaymentsControls(); updatePaymentsCharts(); });
  document.getElementById('downloadPaymentsCsv').addEventListener('click',()=>{
    downloadCsv('ежемесячные_выплаты_сценарий.csv', paymentsState.rows.map(r=>({год:r.year,дети_выбранной_очередности:Math.round(r.activeBaselineCohorts),дополнительные_рождения:Math.round(r.activeAddedCohorts),бюджет_основной_рублей:Math.round(r.budgetBaseline),бюджет_дополнительный_рублей:Math.round(r.budgetAdded),бюджет_всего_рублей:Math.round(r.budgetTotal)})));
  });
}
function getPaymentsState(){
  const params = getPaymentsParams();
  const summary = paymentsState.summary;
  const thresholdRows = paymentsState.thresholdRows || [];
  return {
    loaded:Boolean(paymentsState.data),
    params,
    summaryLine:document.getElementById('paymentsSummaryLine')?.textContent || '',
    kpiCostText:document.getElementById('paymentsKpiCost')?.textContent || '',
    totalCost:summary?.totalCost ?? null,
    marginalCost:summary?.marginalCost ?? null,
    totalAdditionalBirths:summary?.totalAdditionalBirths ?? null,
    thresholdRows,
    thresholdTraceNames:paymentsState.thresholdTraceNames || []
  };
}
async function initPayments(){
  try{
    paymentsState.data=await loadJSON('data/payments_inputs.json');
    setupPaymentsControls(); updatePaymentsCharts();
  }catch(err){ showDataUnavailable('paymentsTable'); }
}
window.PaymentsModule = { getState:getPaymentsState };
if(document.body.dataset.page==='payments') initPayments();
