'use strict';

let estateData;

const estateIds = [
  'estateAdults',
  'estateChildren',
  'estateElders',
  'estateFloors',
  'estateSeparateElderHouse',
  'estateAreaNorm',
  'estatePriceM2',
  'estateChildSubsidy',
  'estateElderSubsidy',
  'estateInfraCost',
  'estateLandPrice',
  'estateSiteArea',
  'estatePilotFamilies'
];

function el(id){ return document.getElementById(id); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
function estateRubleShort(x){ return fmtRub(x); }
function estateM2(x){ return `${fmtNum(x,0)} м²`; }
function estatePeopleWord(n){ return `${fmtNum(n,0)} чел.`; }
function estateMeters(x){ return `${fmtNum(x,1)} м`; }
function estateFloorsWord(n){ return `${fmtNum(n,0)} ${n===1?'этаж':'этажа'}`; }
function yesNo(value){ return value ? 'да' : 'нет'; }
function parseEstateNumber(value){
  const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatEstatePriceThousands(priceM2){
  const thousands = priceM2 / 1000;
  const decimals = Math.abs(thousands - Math.round(thousands)) < 0.001 ? 0 : 1;
  return fmtNum(thousands, decimals);
}

function readClampedNumber(id, fallback){
  const node = el(id);
  const raw = Number(node.value);
  const min = node.min === '' ? -Infinity : Number(node.min);
  const max = node.max === '' ? Infinity : Number(node.max);
  const step = Number(node.step || 1) || 1;
  const next = clamp(Number.isFinite(raw) ? raw : fallback, min, max);
  const rounded = Number.isFinite(step) && step >= 1 ? Math.round(next / step) * step : next;
  node.value = String(clamp(rounded, min, max));
  return +node.value;
}

function getEstateParams(){
  const d = estateData.defaults;
  return {
    adults:readClampedNumber('estateAdults',d.adults),
    children:readClampedNumber('estateChildren',d.children),
    elders:readClampedNumber('estateElders',d.elders),
    floors:readClampedNumber('estateFloors',d.floors),
    separateElderHouse:el('estateSeparateElderHouse').checked,
    areaNormM2:readClampedNumber('estateAreaNorm',d.areaNormM2),
    priceM2:readClampedNumber('estatePriceM2',d.priceM2),
    coreAreaM2:d.coreAreaM2,
    childModuleAreaM2:d.childModuleAreaM2,
    elderModuleAreaM2:d.elderModuleAreaM2,
    siteAreaSotka:readClampedNumber('estateSiteArea',d.siteAreaSotka),
    lotAspectRatio:d.lotAspectRatio,
    minSetbackM:d.minSetbackM,
    floorHeightM:d.floorHeightM,
    landPricePerSotka:+el('estateLandPrice').value,
    infraFixedCost:+el('estateInfraCost').value,
    scaleDiscountMaxPct:d.scaleDiscountMaxPct,
    scaleDiscountAreaM2:d.scaleDiscountAreaM2,
    childSubsidyPct:+el('estateChildSubsidy').value,
    elderSubsidyPct:+el('estateElderSubsidy').value,
    pilotFamilies:+el('estatePilotFamilies').value
  };
}

function unitCost(area, p){
  const extra = Math.max(0, area - p.coreAreaM2);
  const discount = p.scaleDiscountMaxPct/100 * (1 - Math.exp(-extra / Math.max(1,p.scaleDiscountAreaM2)));
  return p.priceM2 * (1 - discount);
}

function costForArea(area, p, houseCount=1){
  const u = unitCost(area, p);
  const houseCost = area * u;
  const land = p.siteAreaSotka * p.landPricePerSotka * houseCount;
  const infra = p.infraFixedCost * houseCount;
  return {area, unitCost:u, houseCost, landCost:land, infraCost:infra, total:houseCost+land+infra};
}

function estateModel(p){
  const people = p.adults + p.children + p.elders;
  const childModules = Math.max(0, p.children - 1);
  const elderModules = p.elders;
  const childAreaM2 = childModules * p.childModuleAreaM2;
  const elderAreaM2 = elderModules * p.elderModuleAreaM2;
  const modularArea = p.coreAreaM2 + childAreaM2 + elderAreaM2;
  const normArea = p.areaNormM2 * people;
  const extraAreaModule = Math.max(0, normArea - modularArea);
  const totalArea = modularArea + extraAreaModule;
  const current = costForArea(totalArea, p, 1);
  const childModuleValue = childAreaM2 * p.priceM2;
  const elderModuleValue = elderAreaM2 * p.priceM2;
  const subsidy = childModuleValue*p.childSubsidyPct/100 + elderModuleValue*p.elderSubsidyPct/100;
  const familyCost = Math.max(0, current.total - subsidy);

  const nuclearPeople = Math.max(1, p.adults + p.children);
  const nuclearModules = Math.max(0,p.children - 1);
  const nuclearArea = Math.max(p.coreAreaM2 + nuclearModules*p.childModuleAreaM2, p.areaNormM2*nuclearPeople);
  const nuclearCost = costForArea(nuclearArea, p, 1);
  const elderHouseholds = p.elders > 0 ? Math.ceil(p.elders/2) : 0;
  const elderSeparateArea = p.elders > 0 ? Math.max(p.areaNormM2*p.elders, 42*elderHouseholds) : 0;
  const elderCost = p.elders > 0 ? costForArea(elderSeparateArea, p, elderHouseholds) : {area:0,unitCost:0,houseCost:0,landCost:0,infraCost:0,total:0};
  const separateTotal = nuclearCost.total + elderCost.total;
  const jointPerPerson = current.total/people;
  const separatePerPerson = separateTotal/people;
  const savingsAbs = separateTotal - current.total;
  const savingsPct = separateTotal>0 ? savingsAbs/separateTotal*100 : 0;

  const separateElderHouse = Boolean(p.separateElderHouse && p.elders > 0);
  const elderLivingAreaM2 = separateElderHouse ? elderAreaM2 : 0;
  const mainLivingAreaM2 = Math.max(0, totalArea - elderLivingAreaM2);
  const mainFootprintM2 = Math.max(35, mainLivingAreaM2 / Math.max(1,p.floors));
  const elderFootprintM2 = elderLivingAreaM2;
  const buildingFootprintM2 = mainFootprintM2 + elderFootprintM2;
  const siteAreaM2 = p.siteAreaSotka * 100;
  const siteWidthM = Math.sqrt(siteAreaM2 / p.lotAspectRatio);
  const siteDepthM = siteWidthM * p.lotAspectRatio;
  const mainHouseWidthM = Math.sqrt(mainFootprintM2 * 1.45);
  const mainHouseDepthM = mainFootprintM2 / mainHouseWidthM;
  const elderHouseWidthM = elderFootprintM2 > 0 ? Math.sqrt(elderFootprintM2 * 1.25) : 0;
  const elderHouseDepthM = elderHouseWidthM > 0 ? elderFootprintM2 / elderHouseWidthM : 0;
  const neededWidthM = mainHouseWidthM + p.minSetbackM*2 + (elderFootprintM2 > 0 ? elderHouseWidthM + 4 : 0);
  const neededDepthM = Math.max(mainHouseDepthM, elderHouseDepthM) + p.minSetbackM*2 + 4;
  const fitsOnSite = neededWidthM <= siteWidthM && neededDepthM <= siteDepthM;

  return {
    people,
    childModules,
    elderModules,
    childAreaM2,
    elderAreaM2,
    separateElderHouse,
    modularArea,
    normArea,
    extraAreaModule,
    totalArea,
    current,
    childModuleValue,
    elderModuleValue,
    subsidy,
    familyCost,
    nuclearArea,
    nuclearCost,
    elderSeparateArea,
    elderHouseholds,
    elderCost,
    separateTotal,
    jointPerPerson,
    separatePerPerson,
    savingsAbs,
    savingsPct,
    mainLivingAreaM2,
    elderLivingAreaM2,
    mainFootprintM2,
    elderFootprintM2,
    buildingFootprintM2,
    siteAreaM2,
    siteWidthM,
    siteDepthM,
    mainHouseWidthM,
    mainHouseDepthM,
    elderHouseWidthM,
    elderHouseDepthM,
    fitsOnSite
  };
}

function zoneCount(m){
  return 1 + m.childModules + (m.elderAreaM2 > 0 ? 1 : 0) + (m.extraAreaModule > 0 ? 1 : 0);
}

function updateEstateKpis(m,p){
  el('estateAdultsLabel').textContent = p.adults;
  el('estateChildrenLabel').textContent = p.children;
  el('estateEldersLabel').textContent = p.elders;
  el('estateFloorsLabel').textContent = estateFloorsWord(p.floors);
  el('estateSiteAreaLabel').textContent = `${fmtNum(p.siteAreaSotka,0)} сот.`;
  el('estateHeroAreaNorm').value = String(fmtNum(p.areaNormM2,0)).replace(/\s+/g, '');
  el('estateHeroPriceM2').value = formatEstatePriceThousands(p.priceM2);
  el('estateModulePill').textContent = `${estateFloorsWord(p.floors)} · ${zoneCount(m)} зон`;
  el('estateAreaPill').textContent = estateM2(m.totalArea);
  el('estateSavingsPill').textContent = m.savingsAbs>0 ? `${fmtPct(m.savingsPct,1)} экономии` : 'нет экономии';
  el('estateKpiPeople').textContent = estatePeopleWord(m.people);
  el('estateKpiArea').textContent = estateM2(m.totalArea);
  el('estateKpiCostPerPerson').textContent = estateRubleShort(m.jointPerPerson);
  el('estateKpiSavings').textContent = m.savingsAbs>0 ? estateRubleShort(m.savingsAbs) : '—';
  el('estateTotalCost').textContent = estateRubleShort(m.current.total);
  el('estateSubsidy').textContent = estateRubleShort(m.subsidy);
  el('estateFamilyCost').textContent = estateRubleShort(m.familyCost);
  el('estatePilotSubsidyPerFamily').textContent = estateRubleShort(m.subsidy);
  el('estatePilotBudget').textContent = estateRubleShort(m.subsidy*p.pilotFamilies);
  el('estatePilotModules').textContent = fmtNum((m.childModules + (m.elderAreaM2 > 0 ? 1 : 0) + (m.extraAreaModule>0?1:0))*p.pilotFamilies,0);
  el('estatePilotArea').textContent = estateM2(m.totalArea*p.pilotFamilies);
  const fitNote = el('estateSiteFitNote');
  const elderNote = m.separateElderHouse ? ' Отдельный дом для прародителей учтён в пятне застройки.' : '';
  fitNote.textContent = m.fitsOnSite
    ? `Пятно застройки ${estateM2(m.buildingFootprintM2)} размещается на участке ${estateMeters(m.siteWidthM)} × ${estateMeters(m.siteDepthM)}.${elderNote}`
    : `Пятно застройки ${estateM2(m.buildingFootprintM2)} требует большего участка или большей этажности.${elderNote}`;
  fitNote.classList.toggle('warning', !m.fitsOnSite);
}

function updateEstateCharts(m,p){
  const colors = TG.colors;
  const narrow=TG.isNarrow();
  const compact=window.matchMedia('(max-width: 1260px)').matches;
  const areaX=compact?['ядро','детские','старшие','общие']:['Ядро дома','Детские зоны','Прародители рядом','Общие пространства'];
  const areaY=[p.coreAreaM2, m.childAreaM2, m.elderAreaM2, m.extraAreaModule];
  Plotly.react('estateAreaChart',[{
    type:'bar',
    x:areaX,
    y:areaY,
    marker:{color:[colors.teal,colors.gold,colors.lightBlue,'#c7baa0']},
    text:areaY.map(v=>v?estateM2(v):''),
    textposition:'outside',
    hovertemplate:'%{x}: %{y:.0f} м²<extra></extra>'
  }], TG.plotLayout({
    margin:compact?{l:48,r:18,t:20,b:92}:{l:56,r:20,t:20,b:80},
    xaxis:TG.categoryAxis({tickangle:compact?0:-20}),
    yaxis:{title:'м²',gridcolor:'#efe5d4'}
  }), TG.plotConfig);

  const costX=narrow?['совместно','раздельно']:['Совместная усадьба','Раздельное проживание'];
  Plotly.react('estateCostChart',[{
    type:'bar',
    x:costX,
    y:[m.jointPerPerson,m.separatePerPerson],
    marker:{color:[colors.teal,colors.gold]},
    text:[estateRubleShort(m.jointPerPerson),estateRubleShort(m.separatePerPerson)],
    textposition:'outside',
    hovertemplate:'%{x}: %{y:,.0f} ₽/чел.<extra></extra>'
  }], TG.plotLayout({
    margin:narrow?{l:54,r:18,t:20,b:96}:{l:70,r:20,t:20,b:90},
    xaxis:TG.categoryAxis({tickangle:0}),
    yaxis:{title:'₽ на человека',gridcolor:'#efe5d4'},
    annotations:narrow?[]:[{x:'Совместная усадьба',y:m.jointPerPerson,text:m.savingsAbs>0?`−${fmtPct(m.savingsPct,1)}`:'',showarrow:false,yshift:-32,font:{color:'#fff',size:18}}]
  }), TG.plotConfig);

  const budgetRows=['Дом','Земля','Инженерия','Субсидия','Остаток семьи'];
  const budgetValues=[m.current.houseCost,m.current.landCost,m.current.infraCost,m.subsidy,m.familyCost];
  Plotly.react('estateBudgetChart',[{
    type:'bar',
    orientation:'h',
    y:budgetRows,
    x:budgetValues,
    marker:{color:[colors.teal,'#9b8c70',colors.gold,colors.green,colors.red]},
    text:budgetValues.map(v=>estateRubleShort(v)),
    textposition:'auto',
    hovertemplate:'%{y}: %{x:,.0f} ₽<extra></extra>'
  }], TG.plotLayout({
    margin:{l:110,r:25,t:20,b:50},
    xaxis:{title:'₽',gridcolor:'#efe5d4'},
    yaxis:{gridcolor:'rgba(0,0,0,0)'}
  }), TG.plotConfig);

  const labels=[], costVals=[], sepVals=[];
  for(let c=0;c<=8;c++){
    const pp=Object.assign({},p,{children:c});
    const mm=estateModel(pp);
    labels.push(`${c} детей`);
    costVals.push(mm.jointPerPerson);
    sepVals.push(mm.separatePerPerson);
  }
  Plotly.react('estateScaleChart',[
    {type:'scatter',mode:'lines+markers',x:labels,y:costVals,name:'совместная усадьба',line:{color:colors.teal,width:3},marker:{size:7},hovertemplate:'%{x}: %{y:,.0f} ₽/чел.<extra></extra>'},
    {type:'scatter',mode:'lines+markers',x:labels,y:sepVals,name:'раздельный сценарий',line:{color:colors.gold,width:3,dash:'dash'},marker:{size:7},hovertemplate:'%{x}: %{y:,.0f} ₽/чел.<extra></extra>'}
  ], TG.plotLayout({
    margin:{l:70,r:20,t:10,b:70},
    yaxis:{title:'₽ на человека',gridcolor:'#efe5d4'},
    legend:{orientation:'h',x:0,y:1.16,bgcolor:'rgba(255,255,255,.86)'}
  }), TG.plotConfig);
}

function updateEstateTable(m,p){
  const rows=[
    {'Показатель':'Состав семьи','Значение':`${p.adults} родителей, ${p.children} детей, ${p.elders} прародителей`},
    {'Показатель':'Этажность основного дома','Значение':estateFloorsWord(p.floors)},
    {'Показатель':'Отдельный дом для прародителей','Значение':yesNo(m.separateElderHouse)},
    {'Показатель':'Расчётная жилая площадь','Значение':estateM2(m.totalArea)},
    {'Показатель':'Пятно застройки','Значение':estateM2(m.buildingFootprintM2)},
    {'Показатель':'Участок','Значение':`${fmtNum(p.siteAreaSotka,0)} сот.`},
    {'Показатель':'Размер участка','Значение':`${estateMeters(m.siteWidthM)} × ${estateMeters(m.siteDepthM)}`},
    {'Показатель':'Размещение на участке','Значение':m.fitsOnSite?'помещается с заданными отступами':'нужен больший участок или больше этажей'},
    {'Показатель':'Ядро дома','Значение':estateM2(p.coreAreaM2)},
    {'Показатель':'Детские зоны','Значение':`${m.childModules} × ${p.childModuleAreaM2} м² = ${estateM2(m.childAreaM2)}`},
    {'Показатель':'Прародители рядом','Значение':`${m.elderModules} × ${p.elderModuleAreaM2} м² = ${estateM2(m.elderAreaM2)}`},
    {'Показатель':'Общие пространства','Значение':estateM2(m.extraAreaModule)},
    {'Показатель':'Цена 1 м² с эффектом масштаба','Значение':estateRubleShort(m.current.unitCost)},
    {'Показатель':'Полная стоимость','Значение':estateRubleShort(m.current.total)},
    {'Показатель':'Сценарная субсидия','Значение':estateRubleShort(m.subsidy)},
    {'Показатель':'Остаток семьи','Значение':estateRubleShort(m.familyCost)},
    {'Показатель':'Стоимость на человека совместно','Значение':estateRubleShort(m.jointPerPerson)},
    {'Показатель':'Стоимость на человека раздельно','Значение':estateRubleShort(m.separatePerPerson)},
    {'Показатель':'Экономия совместного сценария','Значение':`${estateRubleShort(m.savingsAbs)} (${fmtPct(m.savingsPct,1)})`}
  ];
  el('estateTable').innerHTML = tableHTML(rows,[{key:'Показатель',label:'Показатель'},{key:'Значение',label:'Значение'}]);
}

function updateEstate(){
  const p=getEstateParams();
  const m=estateModel(p);
  updateEstateKpis(m,p);
  updateEstateCharts(m,p);
  updateEstateTable(m,p);
  window._estateModel={m,p};
  window._estateRows=[{
    ...p,
    totalArea:m.totalArea,
    mainLivingAreaM2:m.mainLivingAreaM2,
    elderAreaM2:m.elderAreaM2,
    elderLivingAreaM2:m.elderLivingAreaM2,
    buildingFootprintM2:m.buildingFootprintM2,
    siteWidthM:m.siteWidthM,
    siteDepthM:m.siteDepthM,
    fitsOnSite:m.fitsOnSite?'да':'нет',
    totalCost:m.current.total,
    houseCost:m.current.houseCost,
    landCost:m.current.landCost,
    infraCost:m.current.infraCost,
    unitCost:m.current.unitCost,
    subsidy:m.subsidy,
    familyCost:m.familyCost,
    savingsAbs:m.savingsAbs,
    savingsPct:m.savingsPct
  }];
  if(window.Estate3D && typeof window.Estate3D.update==='function') window.Estate3D.update(m,p);
}

function resetEstateValues(){
  const d=estateData.defaults;
  el('estateAdults').value=d.adults;
  el('estateChildren').value=d.children;
  el('estateElders').value=d.elders;
  el('estateFloors').value=d.floors;
  el('estateSeparateElderHouse').checked=false;
  el('estateAreaNorm').value=d.areaNormM2;
  el('estatePriceM2').value=d.priceM2;
  el('estateChildSubsidy').value=d.childSubsidyPct;
  el('estateElderSubsidy').value=d.elderSubsidyPct;
  el('estateInfraCost').value=d.infraFixedCost;
  el('estateLandPrice').value=d.landPricePerSotka;
  el('estateSiteArea').value=d.siteAreaSotka;
  el('estatePilotFamilies').value=d.pilotFamilies;
  el('estateDimensionsToggle').checked=false;
  if(window.Estate3D?.setDimensionsVisible) window.Estate3D.setDimensionsVisible(false);
  updateEstate();
}

function syncEstateHeroAreaNorm(){
  const hero = el('estateHeroAreaNorm');
  const lower = el('estateAreaNorm');
  const min = Number(hero.min || lower.min || 18);
  const max = Number(hero.max || lower.max || 50);
  const value = clamp(Math.round(parseEstateNumber(hero.value) || estateData.defaults.areaNormM2), min, max);
  hero.value = String(value);
  lower.value = String(value);
  updateEstate();
}

function syncEstateHeroPrice(){
  const hero = el('estateHeroPriceM2');
  const lower = el('estatePriceM2');
  const min = Number(hero.dataset.min || 30);
  const max = Number(hero.dataset.max || 200);
  const step = Number(hero.dataset.step || 0.5) || 0.5;
  const fallback = estateData.defaults.priceM2 / 1000;
  const raw = parseEstateNumber(hero.value);
  const roundedThousands = Math.round(clamp(Number.isFinite(raw) ? raw : fallback, min, max) / step) * step;
  const priceM2 = Math.round(clamp(roundedThousands, min, max) * 1000);
  lower.value = String(priceM2);
  hero.value = formatEstatePriceThousands(priceM2);
  updateEstate();
}

function adjustEstateHeroStepper(button){
  const input = el(button.dataset.heroStepTarget);
  if(!input) return;
  const delta = Number(button.dataset.stepDelta || 0);
  if(input.id === 'estateHeroPriceM2'){
    const step = Number(input.dataset.step || 0.5) || 0.5;
    const min = Number(input.dataset.min || 30);
    const max = Number(input.dataset.max || 200);
    const raw = parseEstateNumber(input.value);
    const fallback = estateData.defaults.priceM2 / 1000;
    const next = clamp((Number.isFinite(raw) ? raw : fallback) + delta * step, min, max);
    input.value = formatEstatePriceThousands(Math.round(next * 1000));
  } else {
    const step = Number(input.step || 1) || 1;
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    const raw = parseEstateNumber(input.value);
    input.value = String(clamp((Number.isFinite(raw) ? raw : 0) + delta * step, min, max));
  }
  input.dispatchEvent(new Event('input', { bubbles:true }));
  input.focus();
}

function adjustEstateStepper(button){
  const input = el(button.dataset.stepTarget);
  if(!input) return;
  const delta = Number(button.dataset.stepDelta || 0);
  const step = Number(input.step || 1) || 1;
  const min = input.min === '' ? -Infinity : Number(input.min);
  const max = input.max === '' ? Infinity : Number(input.max);
  const raw = Number(input.value);
  input.value = String(clamp((Number.isFinite(raw) ? raw : 0) + delta * step, min, max));
  input.dispatchEvent(new Event('input', { bubbles:true }));
  input.focus();
}

async function initEstate(){
  estateData=await loadJSON('data/estate_inputs.json');
  resetEstateValues();
  estateIds.forEach(id=>el(id).addEventListener('input', updateEstate));
  el('estateHeroAreaNorm').addEventListener('input', syncEstateHeroAreaNorm);
  el('estateHeroPriceM2').addEventListener('input', syncEstateHeroPrice);
  document.querySelectorAll('[data-step-target]').forEach(b=>b.addEventListener('click',()=>adjustEstateStepper(b)));
  document.querySelectorAll('[data-hero-step-target]').forEach(b=>b.addEventListener('click',()=>adjustEstateHeroStepper(b)));
  el('estateReset').addEventListener('click', resetEstateValues);
  el('estateDownloadCsv').addEventListener('click',()=>downloadCsv('усадьба_сценарий.csv', window._estateRows||[]));
  el('estateViewReset').addEventListener('click',()=>{ if(window.Estate3D) window.Estate3D.resetView(); });
  el('estateDimensionsToggle').addEventListener('change',e=>{ if(window.Estate3D?.setDimensionsVisible) window.Estate3D.setDimensionsVisible(e.target.checked); });
  updateEstate();
}

if(document.body.dataset.page==='estate') initEstate().catch(()=>showDataUnavailable('estateTable'));
