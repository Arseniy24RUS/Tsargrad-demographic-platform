const fs = require('fs');
const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/index.html', title: 'Россия 2050', slug: '00-home' },
  { path: '/skr.html', title: 'Рождаемость', slug: '01-skr' },
  { path: '/settlement.html', title: 'Расселение', slug: '02-settlement' },
  { path: '/infrastructure.html', title: 'Инфраструктура', slug: '03-infrastructure' },
  { path: '/estate.html', title: 'Свой дом', slug: '04-estate' },
  { path: '/capital.html', title: 'Маткапитал', slug: '05-capital' },
  { path: '/mortgage.html', title: 'Ипотека', slug: '06-mortgage' },
  { path: '/payments.html', title: 'Выплаты', slug: '07-payments' },
  { path: '/family.html', title: 'Браки', slug: '08-family' },
  { path: '/abortions.html', title: 'Аборты', slug: '09-abortions' }
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

async function expectMobileNavDrawer(page, path) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path, { waitUntil: 'networkidle' });
  await expect(page.locator('.menu-toggle')).toHaveCount(1);
  await expect(page.locator('.menu-toggle')).not.toContainText('Меню');
  await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-label', 'Открыть меню');
  await page.locator('.menu-toggle').click();
  await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#siteNav')).toHaveClass(/is-open/);
  await expect(page.locator('#siteNav a')).toHaveCount(9);
  const drawerState = await page.evaluate(() => {
    const nav = document.querySelector('#siteNav');
    const firstLink = nav?.querySelector('a');
    const backdrop = nav?.parentElement?.querySelector('.nav-backdrop');
    if (!nav || !firstLink || !backdrop) return null;
    const rect = firstLink.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      backdropVisible: !backdrop.hidden,
      navVisible: getComputedStyle(nav).display !== 'none',
      hitIsNavLink: Boolean(hit?.closest('#siteNav')),
      firstLinkText: firstLink.textContent.trim()
    };
  });
  expect(drawerState).toMatchObject({
    backdropVisible: true,
    navVisible: true,
    hitIsNavLink: true,
    firstLinkText: 'Рождаемость'
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#siteNav')).not.toHaveClass(/is-open/);
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((el, nextValue) => {
    el.value = String(nextValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

function addMonthsId(month, delta) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
      await expect(page.locator('nav a', { hasText: 'Главная' })).toHaveCount(0);
      await expect(page.locator('a.brand').first()).toHaveAttribute('href', /index\.html/);
      await expectNoForbiddenUi(page);
      await page.screenshot({ path: `artifacts/screenshots/${p.slug}-desktop.png`, fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('body')).toContainText(p.title);
      await expect(page.locator('nav a', { hasText: 'Главная' })).toHaveCount(0);
      await expectNoForbiddenUi(page);
      await page.screenshot({ path: `artifacts/screenshots/${p.slug}-mobile.png`, fullPage: true });
      await expectCleanRuntime(runtime);
    });
  }

  test('Мобильная навигация: иконка открывает видимый drawer поверх затемнения', async ({ page }) => {
    for (const p of pages) {
      await expectMobileNavDrawer(page, p.path);
    }
  });

  test('Главная: открывается как первый экран и ведёт в разделы без пункта Главная', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText('Россия 2050');
    await expect(page.locator('body')).toContainText('Малоэтажная и многодетная Россия');
    await expect(page.locator('nav a', { hasText: 'Главная' })).toHaveCount(0);
    await expect(page.locator('nav a[href="skr.html"]')).toContainText('Рождаемость');
    await expect(page.locator('nav a[href="infrastructure.html"]')).toContainText('Инфраструктура');
    await expect(page.locator('a.brand').first()).toHaveAttribute('href', /index\.html/);
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText('Малоэтажная и многодетная Россия');
    await expectCleanRuntime(runtime);
  });

  test('Рождаемость: режимы, краткий/подробный вид и выбор территории работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/skr.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#tfrChart .main-svg').first()).toBeVisible();
    await expect(page.locator('#policyMonthRange')).toHaveCount(0);
    await expect(page.locator('#policyMonthChartRange')).toHaveCount(0);
    await expect(page.locator('#policyStartDragHandle')).toHaveCount(0);
    await expect(page.locator('#policyNowBtn')).toHaveCount(0);
    await expect(page.locator('#policy2030Btn')).toHaveCount(0);
    await expect(page.locator('#resetTerritoryBtn')).toHaveCount(0);
    await expect(page.locator('#policyLagDragBand')).toBeVisible();
    await expect(page.locator('.map-mode-controls [data-analysis-mode]')).toHaveCount(3);
    await expect(page.locator('.map-mode-controls [data-view-mode]')).toHaveCount(2);
    await page.waitForFunction(() => {
      const state = window.SkrModule?.getState?.();
      return state?.policyStart && state.policyStart === state.autoPolicyStartMonth;
    });
    const policyInitial = await page.evaluate(() => window.SkrModule.getState());
    expect(policyInitial.interactionMode).toBe('lag-band');
    expect(policyInitial.effectMonth).toBe(addMonthsId(policyInitial.policyStart, policyInitial.lagMonths));
    expect(policyInitial.policyIndex).toBe(0);
    expect(policyInitial.lastObservedMonth).toBe('2026-05');
    expect(policyInitial.forecastStartMonth).toBe('2026-06');
    expect(policyInitial.forecastEndMonth).toBe('2050-12');
    expect(policyInitial.forecastMonthsAreContinuous).toBe(true);
    expect(policyInitial.targetTrajectoryStartMonth).toBe(policyInitial.effectMonth);
    await page.waitForFunction(() => window.VciomFertilityBlock?.getState?.().loaded);
    const vciomState = await page.evaluate(() => window.VciomFertilityBlock.getState());
    expect(vciomState.source).toBe('local-json');
    expect(vciomState.runtimeExternalFetch).toBe(false);
    await expect(page.locator('#vciom-2025-intentions')).toBeVisible();
    await expect(page.locator('[data-detail-section]').first()).toBeHidden();

    await page.locator('[data-view-mode="detail"]').click();
    await expect(page.locator('[data-detail-section]').first()).toBeVisible();
    await page.waitForFunction(() => window.RpnHousingEffectDesigner?.getState?.().loaded);
    await expect(page.locator('#rpnHousingEffectDesigner')).toBeVisible();
    await expect(page.locator('#rpnScenarioSelect')).toBeHidden();
    await expect(page.locator('#rpnFxEligibleWomen')).not.toHaveText('—');
    await expect(page.locator('#rpnFxScenarioBirths')).not.toHaveText('—');
    await expect(page.locator('#rpnFxSummaryText')).toContainText('потенциальных рождений');
    await expect(page.locator('.rpn-effect-summary')).toBeVisible();
    await expect(page.locator('.rpn-effect-range-ruler')).toHaveCount(3);
    await expect(page.locator('#rpnFxHousingNeed')).toHaveCount(0);
    await expect(page.locator('#rpnFxHighMeasures')).toHaveCount(0);
    await expect(page.locator('#rpnFxShowThreeYear')).toHaveCount(0);
    await expect(page.locator('#rpnFxThreeYearBirths')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Семье нужно улучшить жилищные условия');
    await expect(page.locator('body')).not.toContainText('Жилищные меры высоко значимы');
    await expect(page.locator('body')).not.toContainText('Показывать контрольную 3-летнюю оценку РПН');
    await expect(page.locator('body')).not.toContainText('Контроль 3 года');
    const housingEffectInitial = await page.evaluate(() => window.RpnHousingEffectDesigner.getState());
    expect(housingEffectInitial.groupId).toBe('gap_housing');
    expect(housingEffectInitial.state.housingNeed).toBe(false);
    expect(housingEffectInitial.state.highHousingMeasures).toBe(false);
    expect(housingEffectInitial.state.showThreeYearCheck).toBe(false);
    expect(housingEffectInitial.threeYearCheckBirths).toBeNull();
    expect(housingEffectInitial.state.coveragePct).toBe(60);
    expect(housingEffectInitial.state.conversionPct).toBe(35);
    expect(housingEffectInitial.state.implementationYears).toBe(6);
    await setRange(page, '#rpnFxConversion', 70);
    const housingEffectChanged = await page.evaluate(() => window.RpnHousingEffectDesigner.getState());
    expect(housingEffectChanged.scenarioBirths).toBeGreaterThan(housingEffectInitial.scenarioBirths);
    await page.locator('#rpnFxHousingBarrier').uncheck();
    await expect.poll(() => page.evaluate(() => window.RpnHousingEffectDesigner.getState().groupId)).toBe('gap_only');

    await page.locator('[data-analysis-mode="district"]').click();
    await expect(page.locator('#territorySelect')).toBeEnabled();
    await page.locator('#territorySelect').selectOption({ index: 1 });
    await expect(page.locator('#selectedKpiTitle')).toContainText('федеральный округ');

    await page.locator('[data-analysis-mode="subject"]').click();
    await page.locator('#territorySelect').selectOption({ index: 2 });
    await expect(page.locator('#selectedKpiTitle')).toContainText('субъект');

    await page.locator('#policyLagDragBand').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe(addMonthsId(policyInitial.policyStart, 1));
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().effectMonth)).toBe(addMonthsId(policyInitial.policyStart, policyInitial.lagMonths + 1));
    await page.keyboard.press('Home');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe(policyInitial.autoPolicyStartMonth);

    await page.evaluate(() => window.SkrModule.setPolicyMonth('2030-01'));
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe('2030-01');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().effectMonth)).toBe('2030-10');
    await expect(page.locator('#policyMonthLabel')).toContainText('2030-01');
    await expect(page.locator('#effectMonthLabel')).toContainText('2030-10');
    await expect(page.locator('#policyLagDragBand')).toHaveAttribute('aria-valuetext', /2030-01/);
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().targetTrajectoryStartMonth)).toBe('2030-10');

    await page.locator('#policyLagDragBand').focus();
    await page.keyboard.press('Home');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe(policyInitial.autoPolicyStartMonth);
    await expectCleanRuntime(runtime);
  });

  test('Расселение: управляемая модель, территория и локальный прогноз численности работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/settlement.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#settlementTfrChart .main-svg').first()).toBeVisible();
    await expect(page.locator('#settlementArticleScenarioCard')).toBeVisible();
    await expect(page.locator('#settlementArticleMethodNotice')).toBeVisible();
    await expect(page.locator('#populationScenarioBtn')).toHaveCount(0);
    await page.waitForFunction(() => {
      const chart = document.getElementById('populationTraceChart');
      const names = (chart?.data || []).map(trace => trace.name);
      return names.includes('Фактическая численность')
        && names.includes('Урбанизационная траектория')
        && names.some(name => String(name).includes('Выбранный сценарий') && String(name).includes('ИЖС-сценарий'));
    });
    const articlePopulation = await page.evaluate(() => {
      const chart = document.getElementById('populationTraceChart');
      const names = (chart?.data || []).map(trace => trace.name);
      const urban = chart.data.find(item => item.name === 'Урбанизационная траектория');
      const selected = chart.data.find(item => String(item.name).includes('Выбранный сценарий'));
      const selectedLastIndex = selected.x.findIndex(year => Number(year) === 2050);
      const urbanLastIndex = urban.x.findIndex(year => Number(year) === 2050);
      return {
        names,
        selectedFirst: Number(selected.y[0]),
        selectedLast: Number(selected.y[selectedLastIndex]),
        urbanLast: Number(urban.y[urbanLastIndex])
      };
    });
    expect(articlePopulation.names).not.toContain('Фиксация');
    expect(articlePopulation.names).not.toContain('ИЖС-сценарий');
    expect(articlePopulation.selectedLast).toBeLessThan(articlePopulation.selectedFirst);
    expect(articlePopulation.selectedLast).toBeGreaterThan(articlePopulation.urbanLast);
    await expect(page.locator('#settlementTable')).toContainText('2050');
    await expect(page.locator('#settlementTable')).not.toContainText('2100');
    await expect(page.locator('.range-ruler')).toContainText('0');
    const sliderRange = await page.locator('#delta2050').evaluate(el => ({ min: Number(el.min), max: Number(el.max), value: Number(el.value), disabled: el.disabled }));
    expect(sliderRange.disabled).toBe(false);
    expect(sliderRange.min).toBeLessThan(-2);
    expect(sliderRange.max).toBeGreaterThan(1.7);
    expect(sliderRange.value).toBeGreaterThan(1.7);
    await page.waitForFunction(() => window.SettlementModule?.getState?.().tfrForecastLoaded);
    await page.waitForFunction(() => window.SettlementModule?.getState?.().rows?.some(row => row.articleScenarioKey === 'deurbanization'));
    const initial = await page.evaluate(() => window.SettlementModule.getState());
    expect(initial.forecastMethod).toBe('local_gp_ucm_ensemble');
    expect(initial.populationScenario).toBe('noMIG');
    expect(initial.negativeForecastGapCount).toBe(0);
    expect(initial.minForecastGap).toBeGreaterThan(0);
    expect(initial.positiveShareShiftNonNegative).toBe(true);
    expect(initial.chartTraceCount).toBeGreaterThanOrEqual(7);
    expect(initial.rows).toHaveLength(25);
    expect(initial.rows.at(-1).articleScenarioKey).toBe('deurbanization');
    expect(initial.rows.at(-1).scenarioPopulation).toBeGreaterThan(initial.rows.at(-1).baselinePopulation);
    expect(initial.rows.at(-1).scenarioPopulation - initial.rows[0].scenarioPopulation).toBeLessThan(0);
    await page.locator('[data-preset="fix"]').click();
    await expect(page.locator('[data-preset="fix"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => {
      const rows = window.SettlementModule.getState().rows;
      return Math.max(...rows.map(r => Math.abs((r.scenarioTfr ?? 0) - (r.baselineTfr ?? 0))));
    })).toBeLessThan(0.001);
    await expect.poll(() => page.evaluate(() => window.SettlementModule.getState().rows.at(-1).articleScenarioKey)).toBe('fixation');
    const fixed = await page.evaluate(() => window.SettlementModule.getState());
    const maxFixedDelta = Math.max(...fixed.rows.map(r => Math.abs((r.scenarioTfr ?? 0) - (r.baselineTfr ?? 0))));
    expect(maxFixedDelta).toBeLessThan(0.001);
    expect(fixed.rows.at(-1).articleScenarioKey).toBe('fixation');
    const fixedPopulation2050 = fixed.rows.at(-1).scenarioPopulation;
    await page.locator('[data-preset="deurban"]').click();
    await expect(page.locator('[data-preset="deurban"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.SettlementModule.getState().rows.at(-1).articleScenarioKey)).toBe('deurbanization');
    const izh = await page.evaluate(() => window.SettlementModule.getState());
    const izhPopulation2050 = izh.rows.at(-1).scenarioPopulation;
    expect(izhPopulation2050).toBeGreaterThan(fixedPopulation2050);
    await setRange(page, '#delta2050', 1);
    await expect.poll(() => page.evaluate(() => window.SettlementModule.getState().rows.at(-1).articleScenarioKey)).toBe('custom');
    const shifted = await page.evaluate(() => window.SettlementModule.getState());
    expect(shifted.forecastMethod).toBe('local_gp_ucm_ensemble');
    expect(shifted.kpis.baselineTfr2050).toBeCloseTo(fixed.kpis.baselineTfr2050, 5);
    expect(shifted.negativeForecastGapCount).toBe(0);
    expect(shifted.minForecastGap).toBeGreaterThan(0);
    expect(shifted.positiveShareShiftNonNegative).toBe(true);
    expect(shifted.kpis.scenarioTfr2050).toBeGreaterThan(shifted.kpis.baselineTfr2050);
    expect(shifted.rows.at(-1).articleScenarioKey).toBe('custom');
    expect(shifted.rows.at(-1).scenarioPopulation).toBeGreaterThan(fixedPopulation2050);
    expect(shifted.rows.at(-1).scenarioPopulation).toBeLessThan(izhPopulation2050);
    expect(Math.min(...shifted.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeGreaterThan(0.3);
    expect(Math.max(...shifted.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeLessThan(4.8);
    for (const territoryId of ['terr_rf_bez_novyh_subektov', 'terr_moskovskaya_oblast', 'terr_sibirskiy_federalnyy_okrug']) {
      await page.locator('#settlementTerritorySelect').selectOption(territoryId);
      await setRange(page, '#delta2050', 1);
      const territoryState = await page.evaluate(() => window.SettlementModule.getState());
      expect(territoryState.negativeForecastGapCount, territoryId).toBe(0);
      expect(territoryState.minForecastGap, territoryId).toBeGreaterThan(0);
      expect(territoryState.positiveShareShiftNonNegative, territoryId).toBe(true);
      expect(territoryState.kpis.scenarioTfr2050, territoryId).toBeGreaterThanOrEqual(territoryState.kpis.baselineTfr2050);
    }
    await page.locator('#settlementTerritorySelect').selectOption({ index: 1 });
    await expect(page.locator('#settlementKpiBirths')).not.toHaveText('—');
    await expect(page.locator('#populationScenarioBtn')).toHaveCount(0);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadSettlementCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });

  test('Инфраструктура: карта, графики, фильтры и паспорт поселения работают локально', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/infrastructure.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.InfrastructureModule?.getState?.().loaded);
    await expect(page.locator('#infraMapCanvas')).toBeVisible();
    for (const selector of ['#infraClassChart .main-svg', '#infraMunicipalChart .main-svg', '#infraComponentsChart .main-svg']) {
      await expect(page.locator(selector).first()).toBeVisible();
    }
    const initial = await page.evaluate(() => window.InfrastructureModule.getState());
    expect(initial.runtimeExternalFetch).toBe(false);
    expect(initial.regionCount).toBe(85);
    expect(initial.countrySettlements).toBe(155741);
    expect(initial.chartCount).toBe(3);
    expect(initial.renderedRegions).toBeGreaterThanOrEqual(89);
    expect(initial.cartogramValueCount).toBe(85);
    expect(initial.noDataRegionCount).toBe(4);
    expect(initial.firstSelectableRegionHit).toBeTruthy();
    expect(initial.renderedCharts).toEqual(expect.arrayContaining(['infraClassChart', 'infraMunicipalChart', 'infraComponentsChart']));
    expect(initial.featureCounts.roads).toBeGreaterThan(1000000);
    expect(initial.featureCounts.education).toBeGreaterThan(10000);
    expect(initial.mapMode).toContain('картограмма');
    const chartColors = await page.evaluate(() => ['infraClassChart', 'infraMunicipalChart', 'infraComponentsChart'].flatMap(id => {
      const gd = document.getElementById(id);
      return (gd?.data || []).flatMap(trace => Array.isArray(trace.marker?.color) ? trace.marker.color : [trace.marker?.color]).filter(Boolean);
    }));
    const allowedChartColors = ['#2f7d5c', '#d8a238', '#d98f45', '#b94b4b', '#145b61', '#0f4f55'];
    expect(chartColors.length).toBeGreaterThan(3);
    expect(chartColors.map(c => String(c).toLowerCase()).every(c => allowedChartColors.includes(c))).toBe(true);
    expect(chartColors).toEqual(expect.arrayContaining(['#2f7d5c', '#d8a238']));
    expect(chartColors.map(c => String(c).toLowerCase())).not.toEqual(expect.arrayContaining(['#1f77b4', '#636efa', 'rgb(31, 119, 180)']));
    const countryMapCoverage = await page.locator('#infraMapCanvas').evaluate(el => {
      const ctx = el.getContext('2d');
      const image = ctx.getImageData(0, 0, el.width, Math.max(1, el.height - 90));
      let left = el.width, top = el.height, right = 0, bottom = 0, alphaPixels = 0;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const alpha = image.data[(y * image.width + x) * 4 + 3];
          if (alpha > 8) {
            alphaPixels += 1;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      }
      return {
        alphaPixels,
        widthRatio: alphaPixels ? (right - left) / el.width : 0,
        heightRatio: alphaPixels ? (bottom - top) / el.height : 0
      };
    });
    expect(countryMapCoverage.alphaPixels).toBeGreaterThan(5000);
    expect(countryMapCoverage.widthRatio).toBeGreaterThan(0.45);
    expect(countryMapCoverage.heightRatio).toBeGreaterThan(0.32);

    const hit = initial.firstSelectableRegionHit;
    await page.locator('#infraMapCanvas').click({ position: { x: hit.x, y: hit.y } });
    await expect.poll(() => page.evaluate(() => window.InfrastructureModule.getState().selectedRegion)).toBe(hit.slug);
    await expect.poll(() => page.locator('#infraSubject').inputValue()).toBe(hit.slug);

    await page.locator('#infraSubject').selectOption('moskovskaya_oblast');
    await page.waitForFunction(() => window.InfrastructureModule.getState().selectedRegion === 'moskovskaya_oblast' && window.InfrastructureModule.getState().filteredSettlements > 0);
    const region = await page.evaluate(() => window.InfrastructureModule.getState());
    expect(region.selectedSubject).toBe('Московская область');
    expect(region.filteredSettlements).toBeGreaterThan(1000);
    expect(region.renderedPoints).toBeGreaterThan(1000);
    expect(region.mapMode).toContain('поселения');

    await page.locator('#infraClassFilter').selectOption('A');
    await page.locator('#infraSearch').fill('Королев');
    await page.waitForFunction(() => window.InfrastructureModule.getState().filteredSettlements >= 1);
    const filtered = await page.evaluate(() => window.InfrastructureModule.getState());
    expect(filtered.classFilter).toBe('A');
    expect(filtered.filteredSettlements).toBeGreaterThanOrEqual(1);
    expect(filtered.filteredSettlements).toBeLessThan(region.filteredSettlements);

    const box = await page.locator('#infraMapCanvas').boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#infraSettlementPassport')).toBeVisible();
    await expectCleanRuntime(runtime);
  });

  test('Свой дом: настройки, 3D-сцена, размеры и выгрузка работают', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/estate.html', { waitUntil: 'networkidle' });
    await expect(page.locator('label[for="estateAdults"]')).toContainText('Родители');
    await expect(page.locator('label[for="estateElders"]')).toContainText('Прародители рядом');
    await expect(page.locator('label[for="estateSiteArea"]')).toContainText('Участок (соток)');
    await expect(page.locator('#estateAdults')).toHaveAttribute('max', '2');
    await expect(page.locator('#estateFloors')).toHaveAttribute('max', '3');
    await expect(page.locator('#estateSeparateElderHouse')).not.toBeChecked();
    await expect(page.locator('[data-estate-preset]')).toHaveCount(0);
    await expect(page.locator('#estateWorkModule')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('микробизнес');
    await page.waitForFunction(() => window.Estate3D?.getViewState?.());
    await expect(page.locator('#estateHeroAreaNorm')).toHaveValue('30');
    await expect(page.locator('#estateHeroPriceM2')).toHaveValue('83,5');
    await expect(page.locator('#estateAreaNorm')).toHaveValue('30');
    await expect(page.locator('#estatePriceM2')).toHaveValue('83500');
    const defaultEstate = await page.evaluate(() => window._estateModel?.p);
    expect(defaultEstate.priceM2).toBe(83500);
    expect(defaultEstate.areaNormM2).toBe(30);
    const beforeHeroNorm = await page.evaluate(() => ({
      area: document.querySelector('#estateKpiArea')?.textContent,
      table: document.querySelector('#estateTable')?.innerText
    }));
    await page.locator('[data-hero-step-target="estateHeroAreaNorm"][data-step-delta="1"]').click();
    await expect(page.locator('#estateHeroAreaNorm')).toHaveValue('31');
    await expect(page.locator('#estateAreaNorm')).toHaveValue('31');
    await expect(page.locator('#estateKpiArea')).not.toHaveText(beforeHeroNorm.area);
    const afterHeroNorm = await page.evaluate(() => ({
      params: window._estateModel?.p,
      table: document.querySelector('#estateTable')?.innerText
    }));
    expect(afterHeroNorm.params.areaNormM2).toBe(31);
    expect(afterHeroNorm.table).not.toBe(beforeHeroNorm.table);
    const beforeHeroPrice = await page.evaluate(() => ({
      total: document.querySelector('#estateTotalCost')?.textContent,
      table: document.querySelector('#estateTable')?.innerText
    }));
    await page.locator('#estateHeroPriceM2').fill('90');
    await page.locator('#estateHeroPriceM2').dispatchEvent('input');
    await expect(page.locator('#estateHeroPriceM2')).toHaveValue('90');
    await expect(page.locator('#estatePriceM2')).toHaveValue('90000');
    await expect(page.locator('#estateTotalCost')).not.toHaveText(beforeHeroPrice.total);
    const afterHeroPrice = await page.evaluate(() => ({
      params: window._estateModel?.p,
      table: document.querySelector('#estateTable')?.innerText
    }));
    expect(afterHeroPrice.params.priceM2).toBe(90000);
    expect(afterHeroPrice.table).not.toBe(beforeHeroPrice.table);
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
    await expect(page.locator('#estateFloors')).toHaveValue('3');
    await page.locator('#estateSeparateElderHouse').check();
    await page.waitForTimeout(500);
    const elderHouseState = await page.evaluate(() => window.Estate3D?.getViewState?.());
    expect(elderHouseState.floors).toBe(3);
    expect(elderHouseState.separateElderHouse).toBe(true);
    expect(elderHouseState.elderHousePresent).toBe(true);
    expect(elderHouseState.fenceGateCount).toBe(2);
    expect(elderHouseState.treeCollisionCount).toBe(0);
    expect(elderHouseState.minTreeClearanceM).toBeGreaterThan(0);
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
    await page.waitForFunction(() => window.PaymentsModule?.getState?.().loaded);
    await expect(page.locator('#paymentsSummaryLine')).toContainText('При текущих настройках мера охватывает');
    await expect(page.locator('#paymentsSummaryLine')).toContainText('Цена одного потенциального рождения');
    const initial = await page.evaluate(() => window.PaymentsModule.getState());
    expect(initial.totalCost / 1e6).toBeCloseTo(66.16, 1);
    expect(initial.marginalCost / 1e6).toBeCloseTo(3.97, 1);
    expect(initial.kpiCostText).not.toContain('3,97');
    expect(initial.thresholdTraceNames).toContain('Цена программы на рождение, млн ₽');
    expect(initial.thresholdTraceNames.join(' ')).not.toContain('Маржинальная');
    const thresholdCosts = initial.thresholdRows.map(row => Number((row.totalCost / 1e6).toFixed(2)));
    expect(new Set(thresholdCosts).size).toBeGreaterThan(1);
    await page.locator('summary').click();
    await page.locator('#paymentTakeup').fill('7');
    await page.locator('#paymentTakeup').dispatchEvent('input');
    await expect(page.locator('#paymentsKpiBirths')).not.toHaveText('—');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadPaymentsCsv').click();
    await downloadPromise;
    await expectCleanRuntime(runtime);
  });

  test('Браки: данные, графики и сценарий работают локально', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/family.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.FamilyModule?.getState?.().loaded);
    const before = await page.evaluate(() => window.FamilyModule.getState());
    expect(before.runtimeExternalFetch).toBe(false);
    expect(before.seriesCount).toBeGreaterThan(1000);
    expect(before.geoFeatureCount).toBeGreaterThan(70);
    expect(before.mapEngine).toBe('svg-geojson');
    expect(before.mapRenderedPaths).toBeGreaterThanOrEqual(83);
    expect(before.mapValueCount).toBeGreaterThanOrEqual(80);
    expect(before.mapDomain.max).toBeGreaterThan(before.mapDomain.min);
    expect(before.dataChecks.rf2010Divorces).toBe(639321);
    expect(before.dataChecks.rf2010DivorceIndex).toBeCloseTo(52.6162, 3);
    expect(before.renderedCharts).toEqual(expect.arrayContaining(before.chartIds));
    const rf2010ChartDivorces = await page.evaluate(() => {
      const trace = document.getElementById('eventsTrend').data.find(item => String(item.name || '').includes('разводы'));
      const idx = trace.x.findIndex(year => Number(year) === 2010);
      return Number(trace.y[idx]);
    });
    expect(rf2010ChartDivorces).toBe(639321);
    expect(before.territoryTableRows).toBeGreaterThan(0);
    await page.locator('#territoryMode').selectOption('subject');
    await page.locator('#subjectSelect').selectOption({ index: 2 });
    await setRange(page, '#scenarioReduceRange', 25);
    const after = await page.evaluate(() => window.FamilyModule.getState());
    expect(after.analysisMode).toBe('subject');
    expect(after.scenarioShare).toBe(25);
    expect(after.selectedTerritoryId).not.toBe(before.selectedTerritoryId);
    expect(after.kpiScenarioText).not.toBe(before.kpiScenarioText);
    expect(after.mapEngine).toBe('svg-geojson');
    expect(after.mapRenderedPaths).toBe(before.mapRenderedPaths);
    await expectCleanRuntime(runtime);
  });

  test('Аборты: данные, графики и сценарий работают локально', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/abortions.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.AbortionsModule?.getState?.().loaded);
    const before = await page.evaluate(() => window.AbortionsModule.getState());
    expect(before.runtimeExternalFetch).toBe(false);
    expect(before.seriesCount).toBeGreaterThan(1000);
    expect(before.geoFeatureCount).toBeGreaterThan(70);
    expect(before.mapEngine).toBe('svg-geojson');
    expect(before.mapRenderedPaths).toBeGreaterThanOrEqual(83);
    expect(before.mapValueCount).toBeGreaterThanOrEqual(80);
    expect(before.mapDomain.max).toBeGreaterThan(before.mapDomain.min);
    expect(before.renderedCharts).toEqual(expect.arrayContaining(before.chartIds));
    expect(before.rf2018Abortions).toBe(567183);
    expect(before.rf2018RateWomen).toBeGreaterThan(0);
    expect(before.rf2018RateBirths).toBeGreaterThan(0);
    const savedYears = await page.evaluate(() => document.getElementById('savedBirthsPlot').data[0].x.map(Number));
    expect(savedYears).toContain(2018);
    expect(before.territoryTableRows).toBeGreaterThan(0);
    await page.locator('#territoryMode').selectOption('subject');
    await page.locator('#subjectSelect').selectOption({ index: 2 });
    await setRange(page, '#savedShareRange', 25);
    const after = await page.evaluate(() => window.AbortionsModule.getState());
    expect(after.analysisMode).toBe('subject');
    expect(after.scenarioShare).toBe(25);
    expect(after.selectedTerritoryId).not.toBe(before.selectedTerritoryId);
    expect(after.kpiPotentialText).not.toBe(before.kpiPotentialText);
    expect(after.mapEngine).toBe('svg-geojson');
    expect(after.mapRenderedPaths).toBe(before.mapRenderedPaths);
    await expectCleanRuntime(runtime);
  });

});
