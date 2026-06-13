const fs = require('fs');
const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/index.html', title: 'СКР', slug: '01-skr' },
  { path: '/settlement.html', title: 'Расселение', slug: '02-settlement' },
  { path: '/estate.html', title: 'Усадьба', slug: '03-estate' },
  { path: '/capital.html', title: 'Маткапитал', slug: '04-capital' },
  { path: '/mortgage.html', title: 'Ипотека', slug: '05-mortgage' },
  { path: '/payments.html', title: 'Выплаты', slug: '06-payments' }
];

const forbiddenText = [
  'baseline', 'debug', 'TODO', 'prototype', 'GitHub Raw', 'download', 'NaN', 'undefined', 'null'
];

async function guardRuntime(page) {
  const external = [];
  const consoleErrors = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:8000') && !url.startsWith('http://localhost:8000')) {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { external, consoleErrors };
}

async function expectCleanRuntime(result) {
  expect(result.external, `внешние запросы: ${result.external.join('\n')}`).toEqual([]);
  expect(result.consoleErrors, `ошибки консоли: ${result.consoleErrors.join('\n')}`).toEqual([]);
}

async function expectNoForbiddenUi(page) {
  const body = await page.locator('body').innerText();
  for (const token of forbiddenText) {
    expect(body.toLowerCase()).not.toContain(token.toLowerCase());
  }
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((el, nextValue) => {
    el.value = String(nextValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test.beforeAll(() => {
  fs.mkdirSync('artifacts/screenshots', { recursive: true });
});

test.describe('самодостаточный релиз', () => {
  for (const p of pages) {
    test(`${p.title}: страница открывается без внешних запросов`, async ({ page }) => {
      const runtime = await guardRuntime(page);
      await page.goto(p.path, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toContainText(p.title);
      await expectNoForbiddenUi(page);
      await page.screenshot({ path: `artifacts/screenshots/${p.slug}-desktop.png`, fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('body')).toContainText(p.title);
      await expectNoForbiddenUi(page);
      await page.screenshot({ path: `artifacts/screenshots/${p.slug}-mobile.png`, fullPage: true });
      await expectCleanRuntime(runtime);
    });
  }

  test('СКР: режимы, краткий/подробный вид и выбор территории работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#tfrChart .main-svg').first()).toBeVisible();
    await expect(page.locator('[data-detail-section]').first()).toBeHidden();

    await page.locator('[data-view-mode="detail"]').click();
    await expect(page.locator('[data-detail-section]').first()).toBeVisible();

    await page.locator('[data-analysis-mode="district"]').click();
    await expect(page.locator('#territorySelect')).toBeEnabled();
    await page.locator('#territorySelect').selectOption({ index: 1 });
    await expect(page.locator('#selectedKpiTitle')).toContainText('федеральный округ');

    await page.locator('[data-analysis-mode="subject"]').click();
    await page.locator('#territorySelect').selectOption({ index: 2 });
    await expect(page.locator('#selectedKpiTitle')).toContainText('субъект');

    await page.locator('#policy2030Btn').click();
    await expect(page.locator('#policyMonthLabel')).toContainText('2030-01');
    await expectCleanRuntime(runtime);
  });

  test('Расселение: сценарии, территория и локальный прогноз численности работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/settlement.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#settlementTfrChart .main-svg').first()).toBeVisible();
    await page.waitForFunction(() => window.SettlementModule?.getState?.().tfrForecastLoaded);
    const initial = await page.evaluate(() => window.SettlementModule.getState());
    expect(initial.forecastMethod).toBe('local_gp_ucm_ensemble');
    expect(initial.negativeForecastGapCount).toBe(0);
    expect(initial.minForecastGap).toBeGreaterThan(0);
    expect(initial.positiveShareShiftNonNegative).toBe(true);
    expect(initial.chartTraceCount).toBeGreaterThanOrEqual(7);
    expect(initial.rows).toHaveLength(25);
    await page.locator('[data-preset="fix"]').click();
    const fixed = await page.evaluate(() => window.SettlementModule.getState());
    const maxFixedDelta = Math.max(...fixed.rows.map(r => Math.abs((r.scenarioTfr ?? 0) - (r.baselineTfr ?? 0))));
    expect(maxFixedDelta).toBeLessThan(0.001);
    await setRange(page, '#delta2050', 12);
    const shifted = await page.evaluate(() => window.SettlementModule.getState());
    expect(shifted.forecastMethod).toBe('local_gp_ucm_ensemble');
    expect(shifted.kpis.baselineTfr2050).toBeCloseTo(fixed.kpis.baselineTfr2050, 5);
    expect(shifted.negativeForecastGapCount).toBe(0);
    expect(shifted.minForecastGap).toBeGreaterThan(0);
    expect(shifted.positiveShareShiftNonNegative).toBe(true);
    expect(shifted.kpis.scenarioTfr2050).toBeGreaterThan(shifted.kpis.baselineTfr2050);
    expect(Math.min(...shifted.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeGreaterThan(0.3);
    expect(Math.max(...shifted.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeLessThan(4.8);
    for (const territoryId of ['terr_rf_bez_novyh_subektov', 'terr_moskovskaya_oblast', 'terr_sibirskiy_federalnyy_okrug']) {
      await page.locator('#settlementTerritorySelect').selectOption(territoryId);
      await setRange(page, '#delta2050', 12);
      const territoryState = await page.evaluate(() => window.SettlementModule.getState());
      expect(territoryState.negativeForecastGapCount, territoryId).toBe(0);
      expect(territoryState.minForecastGap, territoryId).toBeGreaterThan(0);
      expect(territoryState.positiveShareShiftNonNegative, territoryId).toBe(true);
      expect(territoryState.kpis.scenarioTfr2050, territoryId).toBeGreaterThanOrEqual(territoryState.kpis.baselineTfr2050);
    }
    await page.locator('#settlementTerritorySelect').selectOption({ index: 1 });
    await expect(page.locator('#settlementKpiBirths')).not.toHaveText('—');
    await page.locator('#populationScenarioBtn').click();
    await expect(page.locator('#populationScenarioBtn')).toContainText('с миграцией');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadSettlementCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });

  test('Усадьба: настройки, 3D-сцена, размеры и выгрузка работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/estate.html', { waitUntil: 'networkidle' });
    await expect(page.locator('label[for="estateAdults"]')).toContainText('Родители');
    await expect(page.locator('label[for="estateElders"]')).toContainText('Прародители рядом');
    await expect(page.locator('label[for="estateSiteArea"]')).toContainText('Участок (соток)');
    await expect(page.locator('#estateAdults')).toHaveAttribute('max', '2');
    await expect(page.locator('#estateSeparateElderHouse')).not.toBeChecked();
    await expect(page.locator('[data-estate-preset]')).toHaveCount(0);
    await expect(page.locator('#estateWorkModule')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('микробизнес');
    await page.waitForFunction(() => window.Estate3D?.getViewState?.());
    const initialState = await page.evaluate(() => window.Estate3D?.getViewState?.());
    expect(initialState.separateElderHouse).toBe(false);
    expect(initialState.elderHousePresent).toBe(false);
    expect(initialState.fenceGateCount).toBe(1);
    await expect(page.locator('.estate-stepper-grid .estate-stepper-card')).toHaveCount(4);
    await expect(page.locator('.estate-stepper-echo')).toHaveCount(5);
    await expect(page.locator('.estate-stepper-echo').first()).toBeHidden();
    await page.locator('[data-step-target="estateSiteArea"][data-step-delta="1"]').click();
    await expect(page.locator('#estateSiteArea')).toHaveValue('13');
    await setRange(page, '#estateChildren', 6);
    await setRange(page, '#estateFloors', 4);
    await page.locator('#estateSeparateElderHouse').check();
    await page.waitForTimeout(500);
    const elderHouseState = await page.evaluate(() => window.Estate3D?.getViewState?.());
    expect(elderHouseState.separateElderHouse).toBe(true);
    expect(elderHouseState.elderHousePresent).toBe(true);
    expect(elderHouseState.fenceGateCount).toBe(2);
    expect(elderHouseState.treeCollisionCount).toBe(0);
    expect(elderHouseState.minTreeClearanceM).toBeGreaterThan(0);
    await expect(page.locator('#estateFloors')).toHaveValue('4');
    await expect(page.locator('#estateKpiArea')).not.toHaveText('—');
    const canvasCount = await page.locator('#estateThree canvas').count();
    const hint = await page.locator('#estateViewHint').innerText();
    expect(canvasCount > 0 || hint.includes('резерв')).toBeTruthy();
    await page.locator('#estateDimensionsToggle').check();
    const dimensionsState = await page.evaluate(() => window.Estate3D?.getViewState?.());
    expect(dimensionsState.dimensionOverlayVisible).toBe(true);
    expect(dimensionsState.dimensionOverlayMode).toBe('ground-plan');
    expect(dimensionsState.dimensionLayerVisible).toBe(true);
    expect(dimensionsState.dimension3dLabelCount).toBeGreaterThanOrEqual(8);
    expect(dimensionsState.dimensionArrowCount).toBeGreaterThanOrEqual(16);
    expect(dimensionsState.dimensionEndCapCount).toBeGreaterThanOrEqual(16);
    expect(dimensionsState.dimensionGroundLabelCount).toBeGreaterThanOrEqual(7);
    expect(dimensionsState.dimensionWhiteLabelCount).toBe(0);
    expect(dimensionsState.dimensionHeightLinePresent).toBe(true);
    expect(dimensionsState.dimensionSvgLabelCount).toBe(0);
    expect(dimensionsState.lastDimensionTogglePreservedCamera).toBe(true);
    expect(dimensionsState.fenceGateCount).toBeGreaterThanOrEqual(1);
    expect(dimensionsState.mainDoorCount).toBe(1);
    expect(dimensionsState.doorMetrics.widthM).toBeCloseTo(1.05, 2);
    expect(dimensionsState.doorMetrics.heightM).toBeCloseTo(2.15, 2);
    expect(dimensionsState.windowMetrics.widthM).toBeCloseTo(1.35, 2);
    expect(dimensionsState.windowMetrics.heightM).toBeCloseTo(1.40, 2);
    await page.locator('#estateViewReset').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#estateDownloadCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });

  test('Маткапитал: сценарий, Plotly-графики, KPI и выгрузка работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/capital.html', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText('Маткапитал');
    await expect(page.locator('#kpiWageTarget')).not.toHaveText('—');
    for (const selector of ['#chartArguments .main-svg', '#chartByOrder .main-svg', '#chartHousingCoverage .main-svg', '#chartBudget .main-svg']) {
      await expect(page.locator(selector).first()).toBeVisible();
    }
    await expect(page.locator('#chartArguments')).toContainText('Эквивалент 2007 года');
    await expect(page.locator('#chartArguments')).toContainText('зарплаты');
    await expect(page.locator('#chartArguments')).toContainText('По стоимости');
    await expect(page.locator('#chartArguments')).toContainText('комфортного жилья');
    await expect(page.locator('#chartByOrderTotals')).toContainText('Итого за 4 детей');
    await expect(page.locator('#chartByOrderTotals')).toContainText('действующая модель');
    await expect(page.locator('#chartByOrderTotals')).toContainText('по стоимости комфортного жилья');
    const totalsTextBefore = await page.locator('#chartByOrderTotals').innerText();
    const before = await page.evaluate(() => window.CapitalModule.getState());
    expect(before.runtimeExternalFetch).toBe(false);
    expect(before.chartCount).toBe(4);
    expect(before.tableRows).toBeGreaterThanOrEqual(5);
    expect(before.kpi.wageTarget).toBeGreaterThan(1000000);
    expect(before.orderAxisLabels).toEqual(['1-й ребёнок', '2-й ребёнок', '3-й ребёнок', '4-й и следующие']);
    expect(before.orderAxisLabels).not.toContain('Итого за 4 детей');
    expect(before.orderTotals.displayMode).toBe('summary-band');
    expect(before.chartLabels.byOrder.total).toEqual({ label: 'Итого за 4 детей', displayMode: 'summary-band' });
    expect(before.calculationBreakdown.wageEquivalent.months).toBeGreaterThan(18);
    expect(before.calculationBreakdown.wageEquivalent.baseCapital).toBe(250000);
    expect(before.calculationBreakdown.wageEquivalent.formula).toContain('зарплаты');
    expect(before.calculationBreakdown.comfortableHousing.formula).toContain('м²');
    expect(before.calculationBreakdown.comfortableHousing.rate2Percent).toBeGreaterThan(0);
    expect(before.orderTotals.comfortable).toBeGreaterThan(before.orderTotals.current);
    expect(before.housingCoverage.finalComfortablePercent).toBeCloseTo(100, 1);

    await page.locator('#avgWage').fill('120000');
    await page.locator('#avgWage').dispatchEvent('input');
    await page.locator('#priceM2').fill('95000');
    await page.locator('#priceM2').dispatchEvent('input');
    await page.locator('#rate2').fill('25');
    await page.locator('#rate2').dispatchEvent('input');
    await page.locator('#coverage').fill('85');
    await page.locator('#coverage').dispatchEvent('input');
    await page.locator('#useShare').fill('60');
    await page.locator('#useShare').dispatchEvent('input');
    await page.locator('#conversion').fill('7.5');
    await page.locator('#conversion').dispatchEvent('input');

    const after = await page.evaluate(() => window.CapitalModule.getState());
    expect(after.params.avgWage).toBe(120000);
    expect(after.params.priceM2).toBe(95000);
    expect(after.params.rates[1]).toBeCloseTo(0.25, 3);
    expect(after.params.coverage).toBeCloseTo(0.85, 4);
    expect(after.params.useShare).toBeCloseTo(0.6, 4);
    expect(after.params.conversion).toBeCloseTo(0.075, 4);
    expect(after.kpi.wageTarget).toBeGreaterThan(before.kpi.wageTarget);
    expect(after.kpi.proposedSecond).toBeGreaterThan(before.kpi.proposedSecond);
    expect(after.kpi.costPerBirth).toBeLessThan(before.kpi.costPerBirth);
    expect(after.params.comfortableBudget).not.toBe(before.params.comfortableBudget);
    expect(after.tableTotals.comfortableCash).not.toBe(before.tableTotals.comfortableCash);
    expect(after.tableTotals.comfortableCash).toBeLessThan(after.tableTotals.comfortableBudget);
    expect(after.orderAxisLabels).toEqual(before.orderAxisLabels);
    expect(after.orderAxisLabels).not.toContain('Итого за 4 детей');
    expect(after.orderTotals.displayMode).toBe('summary-band');
    expect(after.calculationBreakdown.wageEquivalent.target).toBeGreaterThan(before.calculationBreakdown.wageEquivalent.target);
    expect(after.calculationBreakdown.comfortableHousing.payout).toBeGreaterThan(before.calculationBreakdown.comfortableHousing.payout);
    expect(after.calculationBreakdown.comfortableHousing.rate2Percent).toBeCloseTo(25, 2);
    expect(after.charts.every(chart => chart.engine === 'plotly' && chart.visible && chart.shapeCount > 4)).toBeTruthy();
    expect(await page.locator('#chartByOrderTotals').innerText()).not.toBe(totalsTextBefore);
    await expect(page.locator('#chartArguments')).toContainText('120 000 ₽');
    await expect(page.locator('#chartArguments')).toContainText('25%');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadCapital').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('matcapital');
    await expectCleanRuntime(runtime);
  });

  test('Ипотека: аннуитет, льготная/рыночная части и выгрузка работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/mortgage.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#calcMethod')).toHaveValue('annuity');
    await page.locator('#loanAmount').fill('14000000');
    await page.locator('#loanAmount').dispatchEvent('input');
    await expect(page.locator('#mortgageKpiBirthCost')).not.toHaveText('—');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadMortgageCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });

  test('Выплаты: итоговая формула, дополнительные настройки и выгрузка работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/payments.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#paymentsSummaryLine')).toContainText('При текущих настройках мера охватывает');
    await expect(page.locator('#paymentsSummaryLine')).toContainText('Цена одного потенциального рождения');
    await page.locator('summary').click();
    await page.locator('#paymentTakeup').fill('7');
    await page.locator('#paymentTakeup').dispatchEvent('input');
    await expect(page.locator('#paymentsKpiBirths')).not.toHaveText('—');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadPaymentsCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });
});
