(function(){
  'use strict';

  const данныеПоУмолчанию = {
    current_policy_2026: {
      first_child: 728921.90,
      second_child_extra_after_first: 234321.27,
      second_child_full_if_no_prior_right: 963243.17,
      incremental_schedule_for_family_with_first_right: { child1: 728921.90, child2: 234321.27, child3: 0, child4plus: 0 }
    },
    historical_reference: {
      base_year: 2007,
      base_capital_rub: 250000,
      average_wage_2007_rub_per_month: 13593,
      average_wage_current_default_rub_per_month: 100360,
      average_wage_2024_rub_per_month: 89069,
      wage_equivalent_2007_months: 18.3918193188
    },
    comfortable_housing_model: {
      price_m2_default: 83500,
      area_norm_m2_per_person_default: 18,
      adults_default: 2,
      children_for_full_housing_default: 4,
      rates_default: { child1: 0.15, child2: 0.20, child3: 0.30, child4plus: 0.35 }
    },
    budget_defaults: {
      births_child1: 512000,
      births_child2: 392000,
      births_child3: 208000,
      births_child4plus: 110000,
      program_coverage_percent: 100,
      certificate_use_share_percent: 80,
      cash_lag_years: 3,
      conversion_percent: 5
    }
  };

  const НАЗВАНИЕ_ЖИЛЬЯ = 'по стоимости комфортного жилья';
  const состояние = {
    данные: данныеПоУмолчанию,
    rows: [],
    scenario: null,
    kpi: null,
    orderTotals: null,
    orderAxisLabels: [],
    calculationBreakdown: null,
    housingCoverage: null,
    chartLabels: {},
    tableTotals: null,
    runtimeExternalFetch: false
  };
  const ids = ['avgWage','priceM2','areaNorm','adults','rate1','rate2','rate3','rate4','births1','births2','births3','births4','coverage','useShare','conversion','childrenTarget'];

  function el(id){ return document.getElementById(id); }
  function sum(a){ return a.reduce((x,y)=>x+y,0); }
  function число(id){
    const node = el(id);
    const v = Number(String(node ? node.value : '').replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  }
  function модельЖилья(){
    const d = состояние.данные || {};
    return d.comfortable_housing_model || d.tsargrad_housing_model || данныеПоУмолчанию.comfortable_housing_model;
  }
  function рубли(v, digits=0){
    const value = Number.isFinite(v) ? v : 0;
    const abs = Math.abs(value);
    if(abs >= 1e12) return (value/1e12).toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' трлн ₽';
    if(abs >= 1e9) return (value/1e9).toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' млрд ₽';
    if(abs >= 1e6) return (value/1e6).toLocaleString('ru-RU', {maximumFractionDigits:2}) + ' млн ₽';
    return value.toLocaleString('ru-RU', {maximumFractionDigits:digits}) + ' ₽';
  }
  function целое(v){ return Math.round(Number.isFinite(v) ? v : 0).toLocaleString('ru-RU'); }
  function процент(v, digits=1){ return (Number.isFinite(v) ? v : 0).toLocaleString('ru-RU', {maximumFractionDigits:digits}) + '%'; }
  function safe(v){ return String(v).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  function setDefaults(){
    const d = состояние.данные;
    const housing = модельЖилья();
    el('avgWage').value = d.historical_reference.average_wage_current_default_rub_per_month;
    el('priceM2').value = housing.price_m2_default;
    el('areaNorm').value = housing.area_norm_m2_per_person_default;
    el('adults').value = housing.adults_default;
    el('childrenTarget').value = housing.children_for_full_housing_default;
    el('rate1').value = Math.round(housing.rates_default.child1 * 100);
    el('rate2').value = Math.round(housing.rates_default.child2 * 100);
    el('rate3').value = Math.round(housing.rates_default.child3 * 100);
    el('rate4').value = Math.round(housing.rates_default.child4plus * 100);
    el('births1').value = d.budget_defaults.births_child1;
    el('births2').value = d.budget_defaults.births_child2;
    el('births3').value = d.budget_defaults.births_child3;
    el('births4').value = d.budget_defaults.births_child4plus;
    el('coverage').value = d.budget_defaults.program_coverage_percent;
    el('useShare').value = d.budget_defaults.certificate_use_share_percent;
    el('conversion').value = d.budget_defaults.conversion_percent;
  }

  function currentScheduleFromData(current){
    const schedule = current.incremental_schedule_for_family_with_first_right || {};
    return [
      Number(schedule.child1 ?? current.first_child ?? 0),
      Number(schedule.child2 ?? current.second_child_extra_after_first ?? 0),
      Number(schedule.child3 ?? 0),
      Number(schedule.child4plus ?? 0)
    ];
  }

  function readScenario(){
    const d = состояние.данные;
    const current = d.current_policy_2026;
    const ref = d.historical_reference;
    const avgWage = число('avgWage');
    const priceM2 = число('priceM2');
    const areaNorm = число('areaNorm');
    const adults = число('adults');
    const childrenTarget = число('childrenTarget');
    const rates = [число('rate1')/100, число('rate2')/100, число('rate3')/100, число('rate4')/100];
    const births = [число('births1'), число('births2'), число('births3'), число('births4')];
    const coverage = число('coverage')/100;
    const useShare = число('useShare')/100;
    const conversion = число('conversion')/100;
    const wageEquivalentMonths = ref.base_capital_rub / ref.average_wage_2007_rub_per_month;
    const wageTarget = wageEquivalentMonths * avgWage;
    const housingCost = priceM2 * areaNorm * (adults + childrenTarget);
    const comfortableSchedule = rates.map(r => housingCost * r);
    const currentSchedule = currentScheduleFromData(current);
    const labels = ['1-й ребёнок', '2-й ребёнок', '3-й ребёнок', '4-й и следующие'];
    const currentBudgetByOrder = currentSchedule.map((v,i)=>v*births[i]*coverage);
    const comfortableBudgetByOrder = comfortableSchedule.map((v,i)=>v*births[i]*coverage);
    const comfortableCashByOrder = comfortableBudgetByOrder.map(v => v * useShare);
    const currentCashByOrder = currentBudgetByOrder.map(v => v * useShare);
    const currentBudget = sum(currentBudgetByOrder);
    const comfortableBudget = sum(comfortableBudgetByOrder);
    const currentCash = sum(currentCashByOrder);
    const comfortableCash = sum(comfortableCashByOrder);
    const incremental = comfortableBudget - currentBudget;
    const potentialBirths = (births[1] + births[2] + births[3]) * coverage * conversion;
    const costPerBirth = potentialBirths > 0 ? incremental / potentialBirths : 0;
    const rows = labels.map((label,i)=>({
      'Очередность': label,
      'Действующая модель, ₽': currentSchedule[i],
      'По стоимости комфортного жилья, ₽': comfortableSchedule[i],
      'Рождений в год': births[i],
      'Действующие обязательства, ₽': currentBudgetByOrder[i],
      'Обязательства по стоимости комфортного жилья, ₽': comfortableBudgetByOrder[i],
      'Кассовая оценка по стоимости комфортного жилья, ₽': comfortableCashByOrder[i]
    }));
    return {
      current, ref, avgWage, priceM2, areaNorm, adults, childrenTarget, rates, births, coverage, useShare, conversion,
      wageEquivalentMonths, wageTarget, housingCost, comfortableSchedule, currentSchedule, labels,
      currentBudgetByOrder, comfortableBudgetByOrder, currentCashByOrder,
      comfortableCashByOrder, currentBudget, comfortableBudget, currentCash, comfortableCash, incremental,
      potentialBirths, costPerBirth, rows
    };
  }

  function updateKpi(s){
    const currentSecond = s.current.second_child_extra_after_first;
    const comfortableSecond = s.comfortableSchedule[1];
    const targetByWage = s.wageTarget;
    const gap = targetByWage / Math.max(currentSecond, 1);
    const wageTargetText = рубли(targetByWage,0);
    const comfortableSecondText = рубли(comfortableSecond,0);
    const currentSecondText = рубли(currentSecond,0);
    const comfortableBudgetText = рубли(s.comfortableBudget,1);
    const comfortableCashText = рубли(s.comfortableCash,1);
    const incrementalText = рубли(s.incremental,1);
    const costPerBirthText = рубли(s.costPerBirth,1);
    состояние.kpi = {
      wageTarget: targetByWage,
      comfortableSecond,
      proposedSecond: comfortableSecond,
      currentSecond,
      gapRatio: gap,
      comfortableBudget: s.comfortableBudget,
      proposedBudget: s.comfortableBudget,
      comfortableCash: s.comfortableCash,
      incremental: s.incremental,
      potentialBirths: s.potentialBirths,
      costPerBirth: s.costPerBirth,
      wageTargetText,
      comfortableSecondText,
      proposedSecondText: comfortableSecondText,
      currentSecondText,
      comfortableBudgetText,
      proposedBudgetText: comfortableBudgetText,
      comfortableCashText,
      incrementalText,
      costPerBirthText
    };
    el('heroClaim').textContent = рубли(Math.round(targetByWage),0);
    el('heroCurrentSecond').textContent = currentSecondText;
    el('kpiWageTarget').textContent = wageTargetText;
    el('kpiHousingSecond').textContent = comfortableSecondText;
    el('kpiGap').textContent = 'в ' + gap.toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' раза';
    el('kpiBudget').textContent = comfortableBudgetText;
    el('summarySentence').textContent = 'При текущих настройках подход по стоимости комфортного жилья формирует обязательства ' + comfortableBudgetText + ' в год, из них кассовая оценка при заданном использовании — ' + comfortableCashText + '. Это на ' + incrementalText + ' больше действующей маржинальной модели. Цена одного потенциального рождения при заданной конверсии — ' + costPerBirthText + '.';
  }

  function графикМакет(title, extra={}){
    return Object.assign({
      title: { text: title || '', font: { family: 'Arial, sans-serif', size: 16, color: '#1c3434' }, x: 0, xanchor: 'left' },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#fffdf8',
      margin: { l: 82, r: 28, t: title ? 44 : 18, b: 82 },
      font: { family: 'Arial, sans-serif', color: '#263b3b' },
      hoverlabel: { bgcolor: '#fffdf8', bordercolor: '#d6a332', font: { color: '#102328' } },
      legend: { orientation: 'h', x: 0, y: 1.15, xanchor: 'left', yanchor: 'bottom', font: { size: 12 } },
      xaxis: { tickfont: { size: 12 }, gridcolor: '#efe2c7', zeroline: false, automargin: true },
      yaxis: { tickfont: { size: 12 }, gridcolor: '#e8d9b6', zerolinecolor: '#cdbf9d', automargin: true }
    }, extra);
  }
  function графикНастройки(){
    return { responsive: true, displayModeBar: false, locale: 'ru' };
  }
  function подписиРублей(values){
    return values.map(v => рубли(v, 1));
  }
  function деньгиHover(){
    return '%{x}<br>%{fullData.name}: %{customdata}<extra></extra>';
  }
  function множитель(value){
    return 'в ' + (Number.isFinite(value) ? value : 0).toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' раза';
  }
  function drawPlot(containerId, traces, layout){
    const box = el(containerId);
    if(!box || !window.Plotly) return;
    window.Plotly.react(box, traces, layout, графикНастройки());
  }

  function buildCalculationBreakdown(s){
    const currentSecond = s.current.second_child_extra_after_first;
    const familySize = s.adults + s.childrenTarget;
    const wageRatio = s.wageTarget / Math.max(currentSecond, 1);
    const housingRatio = s.comfortableSchedule[1] / Math.max(currentSecond, 1);
    return {
      current: {
        secondExtra: currentSecond,
        secondExtraText: рубли(currentSecond, 1)
      },
      wageEquivalent: {
        baseCapital: s.ref.base_capital_rub,
        averageWage2007: s.ref.average_wage_2007_rub_per_month,
        months: s.wageEquivalentMonths,
        currentAverageWage: s.avgWage,
        target: s.wageTarget,
        ratioToCurrent: wageRatio,
        formula: рубли(s.ref.base_capital_rub, 0) + ' ÷ ' + рубли(s.ref.average_wage_2007_rub_per_month, 0) + ' = ' + s.wageEquivalentMonths.toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' зарплаты; ' + s.wageEquivalentMonths.toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' × ' + рубли(s.avgWage, 0) + ' = ' + рубли(s.wageTarget, 1)
      },
      comfortableHousing: {
        priceM2: s.priceM2,
        areaNorm: s.areaNorm,
        familySize,
        housingCost: s.housingCost,
        rate2: s.rates[1],
        rate2Percent: s.rates[1] * 100,
        payout: s.comfortableSchedule[1],
        ratioToCurrent: housingRatio,
        formula: рубли(s.priceM2, 0) + ' × ' + s.areaNorm.toLocaleString('ru-RU', {maximumFractionDigits:0}) + ' м² × ' + familySize.toLocaleString('ru-RU') + ' чел. = ' + рубли(s.housingCost, 1) + '; ' + процент(s.rates[1] * 100, 0) + ' × ' + рубли(s.housingCost, 1) + ' = ' + рубли(s.comfortableSchedule[1], 1)
      }
    };
  }

  function calculationDiagram(containerId, s){
    const b = buildCalculationBreakdown(s);
    состояние.calculationBreakdown = b;
    const chartNode = el(containerId);
    const narrow = (chartNode ? chartNode.clientWidth : window.innerWidth) < 520;
    const monthsText = b.wageEquivalent.months.toLocaleString('ru-RU', {maximumFractionDigits:1});
    const areaText = s.areaNorm.toLocaleString('ru-RU', {maximumFractionDigits:0});
    const familyText = b.comfortableHousing.familySize.toLocaleString('ru-RU');
    const rate2Text = процент(b.comfortableHousing.rate2Percent, 0);
    const rows = [
      {
        y: 0.80,
        color: '#8d7a5b',
        fill: 'rgba(141,122,91,.08)',
        icon: 'calendar',
        iconSrc: 'assets/img/capital_icon_current.png',
        title: 'Сейчас',
        formula: 'доплата за 2-го<br>после первого',
        result: рубли(b.current.secondExtra, 1),
        meta: 'точка сравнения'
      },
      {
        y: 0.50,
        color: '#155d66',
        fill: 'rgba(21,93,102,.08)',
        icon: 'coins',
        iconSrc: 'assets/img/capital_icon_wage.png',
        title: 'Эквивалент 2007 года',
        formula: рубли(b.wageEquivalent.baseCapital, 0) + ' ÷ ' + рубли(b.wageEquivalent.averageWage2007, 0) + '<br>= ' + monthsText + ' зарплаты',
        result: рубли(b.wageEquivalent.target, 1),
        meta: monthsText + ' × ' + рубли(b.wageEquivalent.currentAverageWage, 0) + '<br>' + множитель(b.wageEquivalent.ratioToCurrent) + ' к сейчас'
      },
      {
        y: 0.20,
        color: '#d6a332',
        fill: 'rgba(214,163,50,.10)',
        icon: 'house',
        iconSrc: 'assets/img/capital_icon_housing.png',
        title: 'По стоимости<br>комфортного жилья',
        formula: рубли(b.comfortableHousing.priceM2, 0) + ' × ' + areaText + ' м² × ' + familyText + ' чел.<br>= ' + рубли(b.comfortableHousing.housingCost, 1),
        result: рубли(b.comfortableHousing.payout, 1),
        meta: rate2Text + ' × ' + рубли(b.comfortableHousing.housingCost, 1) + '<br>' + множитель(b.comfortableHousing.ratioToCurrent) + ' к сейчас'
      }
    ];
    const annotations = [];
    const shapes = [];
    const images = [];
    rows.forEach((row, index) => {
      const y0 = row.y - (narrow ? 0.115 : 0.112);
      const y1 = row.y + (narrow ? 0.115 : 0.112);
      shapes.push(
        { type: 'rect', xref: 'x', yref: 'y', x0: 0.025, x1: 0.975, y0, y1, fillcolor: row.fill, line: { color: 'rgba(16,35,40,.12)', width: 1 }, layer: 'below' },
        { type: 'rect', xref: 'x', yref: 'y', x0: 0.025, x1: narrow ? 0.038 : 0.034, y0, y1, fillcolor: row.color, line: { color: row.color, width: 1 }, layer: 'below' }
      );
      if(narrow){
        images.push({
          source: row.iconSrc,
          xref: 'paper',
          yref: 'paper',
          x: 0.085,
          y: row.y + 0.020,
          sizex: 0.135,
          sizey: 0.135,
          xanchor: 'center',
          yanchor: 'middle',
          sizing: 'contain',
          layer: 'above'
        });
        annotations.push(
          { xref: 'x', yref: 'y', x: 0.16, y: row.y + 0.045, text: '<b>' + row.title + '</b><br>' + row.formula, showarrow: false, align: 'left', xanchor: 'left', yanchor: 'middle', font: { size: 11, color: '#102328' } },
          { xref: 'x', yref: 'y', x: 0.16, y: row.y - 0.055, text: '<b>' + row.result + '</b>', showarrow: false, align: 'left', xanchor: 'left', yanchor: 'middle', font: { size: 18, color: row.color } },
          { xref: 'x', yref: 'y', x: 0.56, y: row.y - 0.055, text: row.meta, showarrow: false, align: 'left', xanchor: 'left', yanchor: 'middle', font: { size: 10, color: '#4b5a58' } }
        );
      } else {
        images.push({
          source: row.iconSrc,
          xref: 'paper',
          yref: 'paper',
          x: 0.120,
          y: row.y,
          sizex: 0.150,
          sizey: 0.150,
          xanchor: 'center',
          yanchor: 'middle',
          sizing: 'contain',
          layer: 'above'
        });
        shapes.push(
          { type: 'rect', xref: 'x', yref: 'y', x0: 0.205, x1: 0.515, y0: row.y - 0.084, y1: row.y + 0.084, fillcolor: '#fffdf8', line: { color: 'rgba(16,35,40,.14)', width: 1 }, layer: 'below' },
          { type: 'rect', xref: 'x', yref: 'y', x0: 0.66, x1: 0.95, y0: row.y - 0.084, y1: row.y + 0.084, fillcolor: '#fffaf1', line: { color: row.color, width: 1.5 }, layer: 'below' },
          { type: 'line', xref: 'x', yref: 'y', x0: 0.545, x1: 0.64, y0: row.y, y1: row.y, line: { color: row.color, width: 3 }, layer: 'below' },
          { type: 'circle', xref: 'x', yref: 'y', x0: 0.537, x1: 0.553, y0: row.y - 0.015, y1: row.y + 0.015, fillcolor: row.color, line: { color: row.color, width: 1 }, layer: 'above' }
        );
        annotations.push(
          { xref: 'x', yref: 'y', x: 0.225, y: row.y, text: '<b>' + row.title + '</b><br>' + row.formula, showarrow: false, align: 'left', xanchor: 'left', yanchor: 'middle', font: { size: 14, color: '#102328' } },
          { xref: 'x', yref: 'y', x: 0.645, y: row.y, ax: 0.545, ay: row.y, axref: 'x', ayref: 'y', text: '', showarrow: true, arrowhead: 2, arrowsize: 1, arrowwidth: 2.4, arrowcolor: row.color },
          { xref: 'x', yref: 'y', x: 0.805, y: row.y + 0.032, text: '<b>' + row.result + '</b>', showarrow: false, align: 'center', xanchor: 'center', yanchor: 'middle', font: { size: 24, color: row.color } },
          { xref: 'x', yref: 'y', x: 0.805, y: row.y - 0.042, text: row.meta, showarrow: false, align: 'center', xanchor: 'center', yanchor: 'middle', font: { size: 11, color: '#4b5a58' } }
        );
      }
    });
    shapes.forEach(shape => {
      shape.xref = 'paper';
      shape.yref = 'paper';
    });
    annotations.forEach(annotation => {
      annotation.xref = 'paper';
      annotation.yref = 'paper';
      if(annotation.axref === 'x') annotation.axref = 'paper';
      if(annotation.ayref === 'y') annotation.ayref = 'paper';
    });
    drawPlot(containerId, [{
      type: 'scatter',
      mode: 'markers',
      x: [0.5],
      y: [0.5],
      marker: { size: 1, opacity: 0 },
      hoverinfo: 'skip',
      showlegend: false
    }], графикМакет('', {
      showlegend: false,
      plot_bgcolor: 'rgba(0,0,0,0)',
      margin: { l: 8, r: 8, t: 8, b: 8 },
      xaxis: { visible: false, range: [0, 1], fixedrange: true },
      yaxis: { visible: false, range: [0, 1], fixedrange: true },
      shapes,
      annotations,
      images
    }));
  }

  function barChart(containerId, items, opt={}){
    const labels = items.map(item => item.lines ? item.lines.join('<br>') : item.label);
    const values = items.map(item => item.value);
    drawPlot(containerId, [{
      type: 'bar',
      x: labels,
      y: values,
      customdata: подписиРублей(values),
      text: подписиРублей(values),
      textposition: 'outside',
      textfont: { size: 15, color: '#102328' },
      cliponaxis: false,
      marker: { color: items.map(item => item.color || '#d6a332'), line: { color: '#fff7e5', width: 1 } },
      hovertemplate: деньгиHover(),
      name: opt.name || 'значение'
    }], графикМакет(opt.label || '', {
      showlegend: false,
      yaxis: { tickformat: '~s', ticksuffix: ' ₽', gridcolor: '#e8d9b6', automargin: true },
      xaxis: { tickangle: 0, automargin: true }
    }));
  }

  function денежныеТики(maxValue){
    const top = Math.max(maxValue * 1.18, 1000000);
    const millions = top / 1000000;
    const step = millions <= 4 ? 1 : millions <= 8 ? 2 : millions <= 15 ? 3 : 5;
    const upper = Math.ceil(millions / step) * step;
    const values = [];
    for(let m = 0; m <= upper + 0.001; m += step) values.push(m * 1000000);
    return {
      range: [0, upper * 1000000],
      tickvals: values,
      ticktext: values.map(v => v === 0 ? '0 ₽' : (v / 1000000).toLocaleString('ru-RU', {maximumFractionDigits:1}) + ' млн ₽')
    };
  }

  function renderOrderTotals(totals){
    const currentNode = el('orderTotalCurrent');
    const comfortableNode = el('orderTotalComfortable');
    const summaryNode = el('chartByOrderTotals');
    if(currentNode) currentNode.textContent = totals.currentText || рубли(totals.current, 1);
    if(comfortableNode) comfortableNode.textContent = totals.comfortableText || рубли(totals.comfortable, 1);
    if(summaryNode){
      summaryNode.dataset.displayMode = 'summary-band';
      summaryNode.setAttribute('aria-label', 'Итого за 4 детей: действующая модель ' + (totals.currentText || рубли(totals.current, 1)) + ', по стоимости комфортного жилья ' + (totals.comfortableText || рубли(totals.comfortable, 1)));
    }
  }

  function groupedOrderChart(containerId, labels, current, comfortable, totals){
    const chartNode = el(containerId);
    const narrow = (chartNode ? chartNode.clientWidth : window.innerWidth) < 520;
    renderOrderTotals(totals);
    const displayLabels = labels.map(label => {
      if(label === '4-й и следующие') return '4-й и <br>следующие';
      return label.replace(' ребёнок', ' <br>ребёнок');
    });
    const chartText = values => values.map(v => v > 0 ? рубли(v, 1) : '');
    const ticks = денежныеТики(Math.max(...current, ...comfortable));
    drawPlot(containerId, [
      {
        type: 'bar',
        name: 'действующая модель',
        x: displayLabels,
        y: current,
        customdata: подписиРублей(current),
        text: chartText(current),
        textposition: 'outside',
        textfont: { size: narrow ? 11 : 13, color: '#102328' },
        cliponaxis: false,
        marker: { color: '#8d7a5b', line: { color: 'rgba(255,250,241,.8)', width: 1 } },
        hovertemplate: деньгиHover()
      },
      {
        type: 'bar',
        name: НАЗВАНИЕ_ЖИЛЬЯ,
        x: displayLabels,
        y: comfortable,
        customdata: подписиРублей(comfortable),
        text: chartText(comfortable),
        textposition: 'outside',
        textfont: { size: narrow ? 11 : 13, color: '#102328' },
        cliponaxis: false,
        marker: { color: '#d6a332', line: { color: 'rgba(255,250,241,.9)', width: 1 } },
        hovertemplate: деньгиHover()
      }
    ], графикМакет('', {
      barmode: 'group',
      bargap: 0.28,
      bargroupgap: 0.12,
      showlegend: false,
      margin: { l: narrow ? 58 : 72, r: 16, t: 26, b: narrow ? 94 : 76 },
      yaxis: Object.assign({ gridcolor: '#e8d9b6', zerolinecolor: '#cdbf9d', automargin: true, fixedrange: true }, ticks),
      xaxis: { tickangle: 0, tickfont: { size: narrow ? 10 : 12 }, automargin: true, fixedrange: true }
    }));
  }

  function coverageChart(containerId, labels, current, comfortable, housingCost){
    const cumCur=[], cumComfort=[]; let c=0,p=0;
    for(let i=0;i<labels.length;i++){
      c+=current[i]; p+=comfortable[i];
      cumCur.push(c/housingCost*100);
      cumComfort.push(p/housingCost*100);
    }
    drawPlot(containerId, [
      {
        type: 'scatter',
        mode: 'lines+markers+text',
        name: 'действующая модель',
        x: labels,
        y: cumCur,
        text: cumCur.map(v => процент(v,0)),
        textposition: 'top center',
        textfont: { size: 14, color: '#102328' },
        line: { color: '#8d7a5b', width: 4 },
        marker: { size: 9 },
        hovertemplate: '%{x}<br>%{fullData.name}: %{y:.1f}%<extra></extra>'
      },
      {
        type: 'scatter',
        mode: 'lines+markers+text',
        name: НАЗВАНИЕ_ЖИЛЬЯ,
        x: labels,
        y: cumComfort,
        text: cumComfort.map(v => процент(v,0)),
        textposition: 'bottom center',
        textfont: { size: 14, color: '#102328' },
        line: { color: '#d6a332', width: 5 },
        marker: { size: 10 },
        hovertemplate: '%{x}<br>%{fullData.name}: %{y:.1f}%<extra></extra>'
      }
    ], графикМакет('', {
      margin: { l: 82, r: 28, t: 72, b: 82 },
      shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 100, y1: 100, line: { color: '#155d66', width: 2, dash: 'dash' } }],
      annotations: [{ xref: 'paper', x: 1, y: 100, text: '100% стоимости жилья', showarrow: false, xanchor: 'right', yanchor: 'bottom', font: { color: '#155d66', size: 12 } }],
      yaxis: { range: [0, 112], ticksuffix: '%', gridcolor: '#e8d9b6', automargin: true }
    }));
    состояние.housingCoverage = {
      currentPercentByOrder: cumCur,
      comfortablePercentByOrder: cumComfort,
      finalCurrentPercent: cumCur[cumCur.length-1] || 0,
      finalComfortablePercent: cumComfort[cumComfort.length-1] || 0
    };
  }

  function renderBudgetChart(s){
    barChart('chartBudget', [
      {label:'действует', lines:['действует'], sub:'обязательства', value:s.currentBudget, color:'#8d7a5b'},
      {label:НАЗВАНИЕ_ЖИЛЬЯ, lines:['по стоимости', 'комфортного жилья'], sub:'обязательства', value:s.comfortableBudget, color:'#d6a332'},
      {label:'кассовая оценка', lines:['кассовая', 'оценка'], sub:'при использовании', value:s.comfortableCash, color:'#155d66'}
    ], {
      label:'бюджетные обязательства',
      legend:[
        {label:'сертификаты', color:'#d6a332'},
        {label:'кассовая оценка', color:'#155d66'}
      ]
    });
  }

  function renderTable(s){
    const totalRow = {
      'Очередность':'Итого',
      'Действующая модель, ₽':sum(s.currentSchedule),
      'По стоимости комфортного жилья, ₽':sum(s.comfortableSchedule),
      'Рождений в год':sum(s.births),
      'Действующие обязательства, ₽':s.currentBudget,
      'Обязательства по стоимости комфортного жилья, ₽':s.comfortableBudget,
      'Кассовая оценка по стоимости комфортного жилья, ₽':s.comfortableCash
    };
    состояние.rows = s.rows.concat([totalRow]);
    состояние.tableTotals = {
      currentCertificatesTotal: totalRow['Действующая модель, ₽'],
      comfortableCertificatesTotal: totalRow['По стоимости комфортного жилья, ₽'],
      currentBudget: s.currentBudget,
      comfortableBudget: s.comfortableBudget,
      currentCash: s.currentCash,
      comfortableCash: s.comfortableCash
    };
    const header=['Очередность','Действующая модель, ₽','По стоимости комфортного жилья, ₽','Рождений в год','Действующие обязательства, ₽','Обязательства по стоимости комфортного жилья, ₽','Кассовая оценка по стоимости комфортного жилья, ₽'];
    let html='<table class="table"><thead><tr>'+header.map(h=>'<th>'+safe(h)+'</th>').join('')+'</tr></thead><tbody>';
    состояние.rows.forEach(r=>{
      html+='<tr>'+header.map(h=>{
        let v=r[h];
        if(h.includes('₽')) v=рубли(Number(v)||0,1);
        else if(h==='Рождений в год') v=целое(Number(v)||0);
        return '<td>'+safe(v)+'</td>';
      }).join('')+'</tr>';
    });
    html+='</tbody></table>';
    el('capitalTable').innerHTML=html;
  }

  function recalc(){
    const s = readScenario();
    состояние.orderTotals = {
      current: sum(s.currentSchedule),
      comfortable: sum(s.comfortableSchedule),
      currentText: рубли(sum(s.currentSchedule),1),
      comfortableText: рубли(sum(s.comfortableSchedule),1),
      label: 'Итого за 4 детей',
      displayMode: 'summary-band'
    };
    состояние.orderAxisLabels = s.labels.slice();
    состояние.scenario = {
      avgWage: s.avgWage,
      priceM2: s.priceM2,
      areaNorm: s.areaNorm,
      adults: s.adults,
      childrenTarget: s.childrenTarget,
      rates: s.rates.slice(),
      births: s.births.slice(),
      coverage: s.coverage,
      useShare: s.useShare,
      conversion: s.conversion,
      housingCost: s.housingCost,
      currentBudget: s.currentBudget,
      comfortableBudget: s.comfortableBudget,
      proposedBudget: s.comfortableBudget,
      comfortableCash: s.comfortableCash
    };
    updateKpi(s);
    calculationDiagram('chartArguments', s);
    groupedOrderChart('chartByOrder', s.labels, s.currentSchedule, s.comfortableSchedule, состояние.orderTotals);
    coverageChart('chartHousingCoverage', ['1-й','2-й','3-й','4-й'], s.currentSchedule, s.comfortableSchedule, s.housingCost);
    renderBudgetChart(s);
    renderTable(s);
    состояние.chartLabels = {
      arguments: ['сейчас','эквивалент 2007 года',НАЗВАНИЕ_ЖИЛЬЯ],
      byOrder: {
        axis: s.labels.slice(),
        total: { label: 'Итого за 4 детей', displayMode: 'summary-band' },
        series: ['действующая модель', НАЗВАНИЕ_ЖИЛЬЯ]
      },
      housingCoverage: ['100% стоимости жилья','действующая модель',НАЗВАНИЕ_ЖИЛЬЯ],
      budget: ['действует','обязательства',НАЗВАНИЕ_ЖИЛЬЯ,'кассовая оценка']
    };
  }

  function getState(){
    const chartIds = ['chartArguments','chartByOrder','chartHousingCoverage','chartBudget'];
    const charts = chartIds.map(id => {
      const node = el(id);
      const plot = node ? (node.matches('.js-plotly-plot') ? node : node.querySelector('.js-plotly-plot')) : null;
      const svgs = plot ? Array.from(plot.querySelectorAll('svg')) : [];
      const rect = plot ? plot.getBoundingClientRect() : { width: 0, height: 0 };
      const texts = svgs.flatMap(svg => Array.from(svg.querySelectorAll('text')));
      const shapes = svgs.flatMap(svg => Array.from(svg.querySelectorAll('rect,path,circle,line')));
      return {
        id,
        engine: 'plotly',
        visible: Boolean(plot && rect.width > 20 && rect.height > 20),
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0),
        textCount: texts.length,
        shapeCount: shapes.length,
        labels: texts.map(node => node.textContent.trim()).filter(Boolean)
      };
    });
    return {
      runtimeExternalFetch: false,
      metadata: состояние.данные.metadata || {},
      params: состояние.scenario,
      kpi: состояние.kpi,
      orderTotals: состояние.orderTotals,
      orderAxisLabels: состояние.orderAxisLabels,
      calculationBreakdown: состояние.calculationBreakdown,
      housingCoverage: состояние.housingCoverage,
      chartLabels: состояние.chartLabels,
      tableTotals: состояние.tableTotals,
      chartCount: charts.filter(item => item.visible).length,
      charts,
      svgChartCount: charts.filter(item => item.visible).length,
      svgCharts: charts,
      tableRows: document.querySelectorAll('#capitalTable tbody tr').length,
      dataRows: состояние.rows.length
    };
  }

  window.CapitalModule = {
    getState,
    recalc
  };

  function downloadTable(){
    if(!состояние.rows.length) recalc();
    const header = Object.keys(состояние.rows[0] || {});
    const lines = [header.join(';')].concat(состояние.rows.map(r => header.map(h => String(r[h] ?? '').replace(/;/g, ',')).join(';')));
    const blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url;
    a.download='matcapital_table.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function init(){
    try{
      const r = await fetch('data/matcapital_inputs.json');
      if(r.ok){ состояние.данные = await r.json(); }
    }catch(e){ /* локальная резервная конфигурация уже загружена */ }
    setDefaults();
    ids.forEach(id => el(id).addEventListener('input', recalc));
    el('resetCapital').addEventListener('click', ()=>{ setDefaults(); recalc(); });
    el('downloadCapital').addEventListener('click', downloadTable);
    window.addEventListener('resize', ()=>{ window.clearTimeout(window.__capitalResize); window.__capitalResize=setTimeout(recalc,120); });
    recalc();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
