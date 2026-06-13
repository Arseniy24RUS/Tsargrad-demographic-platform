'use strict';

const mortgageState={data:null, rows:[]};
const scenarioLabels={
  isd_report_progressive:'ИСД ФНИСЦ РАН: 6→0%',
  current_family_mortgage:'Действующая: 6% для всех',
  tsargrad_mkd:'Царьград: МКД 12/8/4/0%',
  tsargrad_izhs:'Царьград: ИЖС 6/4/2/0%'
};
function annuityPayment(principal, annualRate, months){
  if(principal<=0) return 0;
  const i=annualRate/100/12;
  if(Math.abs(i)<1e-12) return principal/months;
  return principal*i/(1-Math.pow(1+i,-months));
}
function simplePayment(principal, annualRate, months){
  if(principal<=0) return 0;
  const years=months/12;
  return (principal + principal*annualRate/100*years)/months;
}
function loanPayment(principal, annualRate, months, method){
  return method==='simple' ? simplePayment(principal,annualRate,months) : annuityPayment(principal,annualRate,months);
}
function getMortgageParams(){
  return {
    scenario:document.getElementById('scenarioSelect').value,
    method:document.getElementById('calcMethod').value,
    keyRate:+document.getElementById('keyRate').value,
    bankSpread:+document.getElementById('bankSpread').value,
    marketRate:+document.getElementById('marketRate').value,
    loanAmount:+document.getElementById('loanAmount').value,
    termYears:+document.getElementById('termYears').value,
    loanLimit:+document.getElementById('loanLimit').value,
    takeUp:+document.getElementById('takeUpMortgage').value/100,
    conversion:+document.getElementById('birthConversionMortgage').value/100,
    areaNorm:+document.getElementById('areaNormMortgage').value,
    priceM2:+document.getElementById('priceM2Mortgage').value
  };
}
function motherCountsArray(){
  const m=mortgageState.data.mother_counts_vpn2020_from_report;
  return [m['0_children'],m['1_child'],m['2_children'],m['3_children'],m['4_children'],m['5_children'],m['6_children'],m['7_plus_children']];
}
function calcMortgageRows(){
  const p=getMortgageParams();
  const rates=mortgageState.data.rate_scenarios[p.scenario];
  const months=p.termYears*12;
  const льготнаяЧасть=Math.min(p.loanAmount,p.loanLimit);
  const рыночнаяЧасть=Math.max(0,p.loanAmount-p.loanLimit);
  const рыночныйПлатежВесьКредит=loanPayment(p.loanAmount,p.marketRate,months,p.method);
  const рыночныйПлатежЛьготнойЧасти=loanPayment(льготнаяЧасть,p.marketRate,months,p.method);
  const рыночныеПроцентыЛьготнойЧасти=рыночныйПлатежЛьготнойЧасти*months-льготнаяЧасть;
  const mothers=motherCountsArray();
  const rows=[];
  for(let order=1; order<=7; order++){
    const rate=rates[Math.min(order-1,rates.length-1)];
    const платежЛьготнойЧасти=loanPayment(льготнаяЧасть,rate,months,p.method);
    const платежРыночнойЧасти=loanPayment(рыночнаяЧасть,p.marketRate,months,p.method);
    const monthlyPayment=платежЛьготнойЧасти + платежРыночнойЧасти;
    const процентыЛьготнойЧасти=платежЛьготнойЧасти*months-льготнаяЧасть;
    const budgetSubsidy=Math.max(0, рыночныеПроцентыЛьготнойЧасти-процентыЛьготнойЧасти);
    const subsidyPerChild=budgetSubsidy/order;
    const candidateMothers=mothers[Math.max(0, Math.min(order-1,mothers.length-1))];
    const participants=candidateMothers*p.takeUp;
    const potentialBirths=participants*p.conversion;
    const totalBudget=budgetSubsidy*participants;
    const costPerPotentialBirth=potentialBirths>0?totalBudget/potentialBirths:null;
    const requiredArea=(2+order)*p.areaNorm;
    const housingCost=requiredArea*p.priceM2;
    rows.push({order, label:`${order}-й ребёнок`, rate, monthlyPayment, marketMonthly:рыночныйПлатежВесьКредит, subsidizedLoan:льготнаяЧасть, marketLoan:рыночнаяЧасть, budgetSubsidy, subsidyPerChild, candidateMothers, participants, potentialBirths, totalBudget, costPerPotentialBirth, requiredArea, housingCost});
  }
  mortgageState.rows=rows;
  return rows;
}
function updateMortgageKpis(rows){
  document.getElementById('mortgageHeroKeyRate').textContent=fmtPct(+document.getElementById('keyRate').value,1);
  document.getElementById('mortgageHeroLoan').textContent=fmtRub(+document.getElementById('loanAmount').value);
  const r1=rows[0], r4=rows[3] || rows[rows.length-1];
  document.getElementById('mortgageKpiPay1').textContent=fmtRub(r1.monthlyPayment);
  document.getElementById('mortgageKpiPay4').textContent=fmtRub(r4.monthlyPayment);
  document.getElementById('mortgageKpiBudget').textContent=fmtRub(r4.budgetSubsidy);
  document.getElementById('mortgageKpiBirthCost').textContent=fmtRub(r4.costPerPotentialBirth);
}
function mortgageLayout(extra={}){ return TG.plotLayout(Object.assign({height:490,margin:TG.isNarrow()?{l:50,r:24,t:28,b:112}:{l:70,r:25,t:40,b:90}},extra)); }
function updateMortgageCharts(){
  const rows=calcMortgageRows();
  updateMortgageKpis(rows);
  const narrow=TG.isNarrow();
  const x=rows.map(r=>String(r.order));
  const commonX=TG.categoryAxis({title:'очередность рождения',tickangle:0});
  Plotly.react('mortgagePaymentChart', [
    {type:'bar',x,y:rows.map(r=>r.marketMonthly),name:'Рыночный платёж без льготы',marker:{color:'rgba(20,91,97,.35)'}},
    {type:'bar',x,y:rows.map(r=>r.monthlyPayment),name:'Платёж семьи по сценарию',marker:{color:TG.colors.gold}}
  ], mortgageLayout({barmode:'group',yaxis:{title:'рублей в месяц',gridcolor:'#efe5d4'},xaxis:commonX}), TG.plotConfig);
  Plotly.react('mortgageBudgetChart', [
    {type:'bar',x,y:rows.map(r=>r.budgetSubsidy/1e6),name:'Субсидия на кредит, млн ₽',marker:{color:TG.colors.teal}},
    {type:'scatter',x,y:rows.map(r=>r.subsidyPerChild/1e6),name:'Субсидия на ребёнка, млн ₽',mode:'lines+markers',line:{color:TG.colors.gold,width:3},marker:{size:8},yaxis:'y2'}
  ], mortgageLayout({yaxis:{title:'млн ₽ на кредит',gridcolor:'#efe5d4'},yaxis2:{title:'млн ₽ на ребёнка',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},xaxis:commonX,margin:narrow?{l:50,r:56,t:28,b:112}:{l:70,r:80,t:40,b:90}}), TG.plotConfig);
  updateMothersPotentialChart('mothersPotentialChart');
  Plotly.react('housingAreaChart', [
    {type:'bar',x,y:rows.map(r=>r.requiredArea),name:'Комфортная площадь, м²',marker:{color:TG.colors.teal}},
    {type:'scatter',x,y:rows.map(r=>r.housingCost/1e6),name:'Стоимость жилья, млн ₽',mode:'lines+markers',line:{color:TG.colors.gold,width:3},marker:{size:8},yaxis:'y2'}
  ], mortgageLayout({yaxis:{title:'м²',gridcolor:'#efe5d4'},yaxis2:{title:'млн ₽',overlaying:'y',side:'right',gridcolor:'rgba(0,0,0,0)'},xaxis:commonX}), TG.plotConfig);
  updateMortgageTable(rows);
}
function updateMothersPotentialChart(containerId){
  const counts=motherCountsArray();
  const labels=TG.isNarrow()?['0','1','2','3','4','5','6','7+']:['0 детей','1 ребёнок','2 ребёнка','3 ребёнка','4 ребёнка','5 детей','6 детей','7+'];
  const potential=counts.map((_,i)=> i===0 ? 0 : counts.slice(0,i).reduce((a,b)=>a+b,0));
  Plotly.react(containerId, [
    {type:'bar',x:labels,y:counts.map(v=>v/1e6),name:'Фактическое число матерей',marker:{color:TG.colors.teal}},
    {type:'bar',x:labels,y:potential.map(v=>v/1e6),name:'Штриховка — гипотетический максимум',marker:{color:'rgba(212,165,55,.35)',line:{color:TG.colors.gold,width:1.2},pattern:{shape:'/',fgcolor:TG.colors.gold,bgcolor:'rgba(212,165,55,.12)',size:8,solidity:.35}}}
  ], TG.plotLayout({height:490,barmode:'stack',yaxis:{title:'млн женщин',gridcolor:'#efe5d4'},xaxis:TG.categoryAxis({title:TG.isNarrow()?'детей у матери':'',tickangle:0}),margin:TG.isNarrow()?{l:50,r:24,t:28,b:112}:{l:70,r:25,t:40,b:90},legend:TG.isNarrow()?{orientation:'h',x:0,y:-0.28,xanchor:'left',yanchor:'top',bgcolor:'rgba(255,255,255,.90)',bordercolor:'#eadbbf',borderwidth:1,font:{size:10}}:{orientation:'h',x:0,y:1.12,bgcolor:'rgba(255,255,255,.86)',bordercolor:'#eadbbf',borderwidth:1}}), TG.plotConfig);
}
function updateMortgageTable(rows){
  const tableRows=rows.map(r=>({
    'Очередность':r.label,
    'Ставка':fmtPct(r.rate,1),
    'Платёж семьи':fmtRub(r.monthlyPayment),
    'Льготная часть':fmtRub(r.subsidizedLoan),
    'Рыночная часть':fmtRub(r.marketLoan),
    'Субсидия на кредит':fmtRub(r.budgetSubsidy),
    'Субсидия на ребёнка':fmtRub(r.subsidyPerChild),
    'Потенциальные рождения':fmtNum(r.potentialBirths,0),
    'Бюджет при охвате':fmtRub(r.totalBudget),
    'Цена потенциального рождения':fmtRub(r.costPerPotentialBirth)
  }));
  document.getElementById('mortgageTable').innerHTML=tableHTML(tableRows);
}
function setMortgageDefaults(){
  const defaults=mortgageState.data.default_parameters;
  document.getElementById('scenarioSelect').value='isd_report_progressive';
  document.getElementById('calcMethod').value='annuity';
  document.getElementById('keyRate').value=defaults.key_rate_percent;
  document.getElementById('bankSpread').value=defaults.bank_spread_pp;
  document.getElementById('marketRate').value=(+defaults.key_rate_percent + +defaults.bank_spread_pp).toFixed(1);
  document.getElementById('loanAmount').value=defaults.loan_amount_rub;
  document.getElementById('termYears').value=defaults.term_years;
  document.getElementById('loanLimit').value=defaults.subsidized_loan_limit_rub;
  document.getElementById('takeUpMortgage').value=defaults.take_up_percent;
  document.getElementById('birthConversionMortgage').value=defaults.birth_conversion_percent;
  document.getElementById('areaNormMortgage').value=defaults.area_norm_m2_per_person;
  document.getElementById('priceM2Mortgage').value=defaults.izhs_price_rub_per_m2;
}
function setupMortgageControls(){
  const d=mortgageState.data;
  const scenSel=document.getElementById('scenarioSelect');
  scenSel.innerHTML='';
  Object.keys(d.rate_scenarios).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=scenarioLabels[k]||k; scenSel.appendChild(o); });
  setMortgageDefaults();
  ['scenarioSelect','calcMethod','keyRate','bankSpread','marketRate','loanAmount','termYears','loanLimit','takeUpMortgage','birthConversionMortgage','areaNormMortgage','priceM2Mortgage'].forEach(id=>{
    document.getElementById(id).addEventListener('input',()=>{
      if(id==='keyRate' || id==='bankSpread'){
        const kr=+document.getElementById('keyRate').value; const sp=+document.getElementById('bankSpread').value;
        document.getElementById('marketRate').value=(kr+sp).toFixed(1);
      }
      updateMortgageCharts();
    });
  });
  document.getElementById('resetMortgage').addEventListener('click',()=>{ setMortgageDefaults(); updateMortgageCharts(); });
  document.getElementById('downloadMortgageCsv').addEventListener('click',()=>{
    const rows=mortgageState.rows.map(r=>({очередность:r.order,ставка_процентов:r.rate,платеж_рублей:Math.round(r.monthlyPayment),льготная_часть_рублей:Math.round(r.subsidizedLoan),рыночная_часть_рублей:Math.round(r.marketLoan),субсидия_рублей:Math.round(r.budgetSubsidy),потенциальные_рождения:Math.round(r.potentialBirths),бюджет_рублей:Math.round(r.totalBudget)}));
    downloadCsv('семейная_ипотека_сценарий.csv', rows);
  });
}
async function initMortgage(){
  try{
    mortgageState.data=await loadJSON('data/mortgage_inputs.json');
    setupMortgageControls(); updateMortgageCharts();
  }catch(err){ showDataUnavailable('mortgageTable'); }
}
if(document.body.dataset.page==='mortgage') initMortgage();
