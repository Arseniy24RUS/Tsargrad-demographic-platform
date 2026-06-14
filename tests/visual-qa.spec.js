const fs = require('fs');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/index.html', slug: '00-home', title: 'Россия 2050' },
  { path: '/skr.html', slug: '01-skr', title: 'СКР' },
  { path: '/settlement.html', slug: '02-settlement', title: 'Расселение' },
  { path: '/estate.html', slug: '03-estate', title: 'Усадьба' },
  { path: '/capital.html', slug: '04-capital', title: 'Маткапитал' },
  { path: '/mortgage.html', slug: '05-mortgage', title: 'Ипотека' },
  { path: '/payments.html', slug: '06-payments', title: 'Выплаты' },
  { path: '/family.html', slug: '07-family', title: 'Семья' },
  { path: '/abortions.html', slug: '08-abortions', title: 'Аборты' }
];

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 }
];

const fullPageViewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'wide', width: 1920, height: 1080 },
  { name: 'mobile', width: 390, height: 844 }
];

const fullPageTargets = [
  {
    slug: 'home',
    path: '/index.html',
    title: 'Россия 2050',
    sections: [
      ['header', 'header'],
      ['hero', '.hero'],
      ['logic', '#logic'],
      ['evidence', '#evidence'],
      ['structure', '#structure'],
      ['footer', '.footer']
    ],
    contrastSelectors: ['.hero-card h2', '.metric .num', '.metric .label', '.section-title h2', '.module h3', '.module p', '.quote h3', '.quote p']
  },
  {
    slug: 'family',
    path: '/family.html',
    title: 'Семья',
    waitFor: () => window.FamilyModule?.getState?.().loaded,
    moduleName: 'FamilyModule',
    mapId: 'familyMap',
    sections: [
      ['hero', '.family-hero'],
      ['purpose', '.family-purpose'],
      ['controls', 'section.card.white:has-text("Параметры анализа")'],
      ['map', '.map-card'],
      ['scenario', 'section.grid.two .card.white:has-text("Сценарная оценка")'],
      ['trends', 'section.grid.three'],
      ['rating', 'section.grid.two .card.white:has-text("Рейтинг субъектов")'],
      ['territory-passport', 'section.grid.two .card.white:has-text("Паспорт выбранной территории")'],
      ['method', 'section.card.white:has-text("Методика")']
    ],
    contrastSelectors: ['.family-hero h1', '.family-hero .lead', '.family-purpose h2', '.family-purpose .lead', '.family-kpi b', '.family-kpi small', '.map-card h2']
  },
  {
    slug: 'abortions',
    path: '/abortions.html',
    title: 'Аборты',
    waitFor: () => window.AbortionsModule?.getState?.().loaded,
    moduleName: 'AbortionsModule',
    mapId: 'abortionsMap',
    sections: [
      ['hero', '.abortions-hero'],
      ['purpose', '.abortions-purpose'],
      ['controls', 'section.card.white:has-text("Параметры анализа")'],
      ['map', '.map-card'],
      ['scenario', 'section.grid.two .card.white:has-text("Сценарная оценка")'],
      ['trends', 'section.grid.three'],
      ['rating', 'section.grid.two .card.white:has-text("Рейтинг субъектов")'],
      ['territory-passport', 'section.grid.two .card.white:has-text("Паспорт выбранной территории")'],
      ['method', 'section.card.white:has-text("Методика")']
    ],
    contrastSelectors: ['.abortions-hero h1', '.abortions-hero .lead', '.abortions-purpose h2', '.abortions-purpose .lead', '.abortion-kpi b', '.abortion-kpi small', '.map-card h2']
  }
];

async function guardRuntime(page) {
  const external = [];
  const consoleErrors = [];
  page.on('request', request => {
    const url = request.url();
    if (/^https?:\/\//.test(url) && !url.startsWith('http://127.0.0.1:8000') && !url.startsWith('http://localhost:8000')) {
      external.push(url);
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { external, consoleErrors };
}

async function dragPolicyLagBandToMonth(page, month) {
  await page.locator('#policyLagDragBand').waitFor({ state: 'visible' });
  await page.locator('#tfrChart').scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const plotBox = await page.locator('#tfrChart .nsewdrag').boundingBox();
  const bandBox = await page.locator('#policyLagDragBand').boundingBox();
  expect(plotBox, 'область графика СКР').toBeTruthy();
  expect(bandBox, 'лаг-зона на графике СКР').toBeTruthy();
  const axisStart = Date.UTC(2025, 0, 1);
  const axisEnd = Date.UTC(2050, 11, 1);
  const target = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  const x = plotBox.x + ((target - axisStart) / (axisEnd - axisStart)) * plotBox.width;
  const y = plotBox.y + plotBox.height * 0.52;
  const grabOffset = Math.min(6, Math.max(2, bandBox.width / 4));
  await page.mouse.move(bandBox.x + grabOffset, bandBox.y + bandBox.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(x + grabOffset, y, { steps: 16 });
  await page.mouse.up();
}

async function visibleChartOverlapReport(page) {
  return page.evaluate(() => {
    const visible = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    return [...document.querySelectorAll('.js-plotly-plot')].map(chart => {
      const chartRect = chart.getBoundingClientRect();
      if (chartRect.width < 20 || chartRect.height < 20) return null;
      const texts = [...chart.querySelectorAll('svg text')].filter(visible).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim(),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        };
      }).filter(item => item.text);
      const overlaps = [];
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i], b = texts[j];
          const dx = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const dy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const area = dx * dy;
          if (area > 700) overlaps.push({ a: a.text.slice(0, 60), b: b.text.slice(0, 60), area: Math.round(area) });
        }
      }
      return { id: chart.id, width: Math.round(chartRect.width), height: Math.round(chartRect.height), overlaps };
    }).filter(Boolean);
  });
}

async function expectNoHorizontalOverflow(page, context) {
  const report = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const visible = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const offenders = [...document.querySelectorAll('body *')].filter(visible).map(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right <= clientWidth + 2 || rect.width > clientWidth * 2) return null;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (cls.includes('modebar') || cls.includes('table-scroll')) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: cls.split(/\s+/).slice(0, 3).join('.'),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      };
    }).filter(Boolean).slice(0, 8);
    return { clientWidth, scrollWidth, overflow: scrollWidth - clientWidth, offenders };
  });
  expect(report.overflow, `${context} horizontal overflow: ${JSON.stringify(report.offenders)}`).toBeLessThanOrEqual(2);
}

async function expectHeroKpiValuesOneLine(page, target, context) {
  const selector = target.slug === 'family'
    ? '.family-hero-kpis .kpi-value'
    : target.slug === 'abortions'
      ? '.abortions-hero-kpis .kpi-value'
      : null;
  if (!selector) return;
  const failures = await page.evaluate((kpiSelector) => {
    return [...document.querySelectorAll(kpiSelector)].map(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const lineHeight = Number.parseFloat(style.lineHeight);
      const maxHeight = Number.isFinite(lineHeight) ? lineHeight * 1.25 : rect.height + 1;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const ok = style.whiteSpace === 'nowrap'
        && el.scrollWidth <= el.clientWidth + 1
        && rect.height <= maxHeight + 1;
      return ok ? null : {
        text,
        whiteSpace: style.whiteSpace,
        clientWidth: Math.round(el.clientWidth),
        scrollWidth: Math.round(el.scrollWidth),
        height: Math.round(rect.height),
        maxHeight: Math.round(maxHeight),
      };
    }).filter(Boolean);
  }, selector);
  expect(failures, `${context} hero KPI values should stay on one line`).toEqual([]);
}

async function expectFamilyRf2010Data(page, context) {
  await page.waitForFunction(() => document.getElementById('eventsTrend')?.data?.length);
  const check = await page.evaluate(() => {
    const state = window.FamilyModule.getState();
    const chart = document.getElementById('eventsTrend');
    const divorceTrace = (chart.data || []).find(trace => String(trace.name || '').includes('разводы'));
    const idx = divorceTrace ? divorceTrace.x.findIndex(year => Number(year) === 2010) : -1;
    return {
      stateDivorces: state.dataChecks?.rf2010Divorces,
      stateIndex: state.dataChecks?.rf2010DivorceIndex,
      chartDivorces: idx >= 0 ? Number(divorceTrace.y[idx]) : null,
    };
  });
  expect(check.stateDivorces, `${context} RF 2010 divorces state`).toBe(639321);
  expect(check.stateIndex, `${context} RF 2010 divorce index`).toBeCloseTo(52.6162, 3);
  expect(check.chartDivorces, `${context} RF 2010 chart point`).toBe(639321);
}

async function expectSelectorsReadable(page, selectors, context) {
  const failures = await page.evaluate((items) => {
    function rgb(value) {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map(v => Number.parseFloat(v.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    function blend(fg, bg) {
      const a = fg.a == null ? 1 : fg.a;
      return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1
      };
    }
    function luminance(c) {
      return [c.r, c.g, c.b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
    }
    function contrast(a, b) {
      const l1 = luminance(a), l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function effectiveBg(el) {
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      const stack = [];
      let node = el;
      while (node && node.nodeType === 1) {
        stack.push(node);
        node = node.parentElement;
      }
      stack.reverse().forEach(item => {
        const color = rgb(getComputedStyle(item).backgroundColor);
        if (color && color.a > 0) bg = blend(color, bg);
      });
      return bg;
    }
    return items.flatMap(selector => [...document.querySelectorAll(selector)].map(el => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const style = getComputedStyle(el);
      const color = rgb(style.color);
      if (!color) return null;
      const ratio = contrast(color, effectiveBg(el));
      const fontSize = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
      const min = large ? 3 : 4.5;
      if (ratio >= min) return null;
      return { selector, text: text.slice(0, 90), ratio: Number(ratio.toFixed(2)), min };
    }).filter(Boolean));
  }, selectors);
  expect(failures, `${context} contrast failures`).toEqual([]);
}

async function captureAndCheckSections(page, target, viewportName) {
  for (const [name, selector] of target.sections) {
    const section = page.locator(selector).first();
    await expect(section, `${target.slug} ${name}`).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const box = await section.boundingBox();
    expect(box, `${target.slug} ${name} box`).toBeTruthy();
    expect(box.width, `${target.slug} ${name} width`).toBeGreaterThan(220);
    expect(box.height, `${target.slug} ${name} height`).toBeGreaterThan(36);
    await section.screenshot({ path: `artifacts/visual-qa/${target.slug}-${viewportName}-${name}.png` });
    await expectNoHorizontalOverflow(page, `${target.slug} ${viewportName} after ${name}`);
  }
}

async function expectLocalGeoMap(page, target) {
  if (!target.mapId) return;
  const state = await page.evaluate((moduleName) => window[moduleName].getState(), target.moduleName);
  expect(state.mapEngine, `${target.slug} map engine`).toBe('svg-geojson');
  expect(state.mapRenderedPaths, `${target.slug} rendered map paths`).toBeGreaterThanOrEqual(83);
  expect(state.mapValueCount, `${target.slug} map values`).toBeGreaterThanOrEqual(80);
  expect(state.mapDomain.max, `${target.slug} map domain`).toBeGreaterThan(state.mapDomain.min);
  const mapBox = await page.locator(`#${target.mapId} .geo-map svg`).evaluate(svg => {
    const boxes = [...svg.querySelectorAll('path')].map(path => path.getBBox()).filter(box => box.width > 0 && box.height > 0);
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    const view = svg.viewBox.baseVal;
    return {
      paths: boxes.length,
      widthRatio: (right - left) / view.width,
      heightRatio: (bottom - top) / view.height
    };
  });
  expect(mapBox.paths, `${target.slug} svg paths`).toBeGreaterThanOrEqual(83);
  expect(mapBox.widthRatio, `${target.slug} map width fill`).toBeGreaterThan(0.72);
  expect(mapBox.heightRatio, `${target.slug} map height fill`).toBeGreaterThan(0.55);
}

function expectEstateFrame(state, context) {
  expect(state, `${context} state`).toBeTruthy();
  expect(state.screenBox, `${context} screenBox`).toBeTruthy();
  const box = state.screenBox;
  const mobile = /mobile/.test(context);
  const floors = state.floors || 2;
  const minWidth = floors >= 4 ? 0.34 : floors >= 3 ? 0.46 : mobile ? 0.48 : 0.54;
  const minHeight = floors >= 3 ? 0.62 : mobile ? 0.42 : 0.58;
  expect(box.left, `${context} house left edge`).toBeGreaterThan(0.01);
  expect(box.top, `${context} house top edge`).toBeGreaterThan(0.04);
  expect(box.right, `${context} house right edge`).toBeLessThan(0.99);
  expect(box.bottom, `${context} house bottom edge`).toBeLessThan(0.98);
  expect(box.width, `${context} house width`).toBeGreaterThan(minWidth);
  expect(box.height, `${context} house height`).toBeGreaterThan(minHeight);
  expect(box.width, `${context} width`).toBeLessThan(0.98);
  expect(box.height, `${context} height`).toBeLessThan(0.98);
}

function expectEstateFrontView(state, context) {
  expect(state.camera.z, `${context} camera faces front side`).toBeLessThan(state.target.z);
}

function expectRearWindowsOriented(state, context) {
  const diag = state.windowOrientationDiagnostics;
  expect(diag, `${context} window orientation diagnostics`).toBeTruthy();
  expect(diag.frontPanels, `${context} front window panels`).toBeGreaterThan(0);
  expect(diag.rearPanels, `${context} rear window panels`).toBeGreaterThan(0);
  expect(diag.frontNormalZ, `${context} front window normal`).toBeLessThan(-0.7);
  expect(diag.rearNormalZ, `${context} rear window normal`).toBeGreaterThan(0.7);
  expect(diag.frontGlassOutside, `${context} front glass outside`).toBe(true);
  expect(diag.rearGlassOutside, `${context} rear glass outside`).toBe(true);
  expect(diag.frontGlassMaxZ, `${context} front glass z`).toBeLessThan(diag.frontFaceZ);
  expect(diag.rearGlassMinZ, `${context} rear glass z`).toBeGreaterThan(diag.rearFaceZ);
}

function expectCameraUnchanged(before, after, context) {
  expect(Math.abs(before.camera.x - after.camera.x), `${context} camera x`).toBeLessThan(0.001);
  expect(Math.abs(before.camera.y - after.camera.y), `${context} camera y`).toBeLessThan(0.001);
  expect(Math.abs(before.camera.z - after.camera.z), `${context} camera z`).toBeLessThan(0.001);
  expect(Math.abs(before.target.x - after.target.x), `${context} target x`).toBeLessThan(0.001);
  expect(Math.abs(before.target.y - after.target.y), `${context} target y`).toBeLessThan(0.001);
  expect(Math.abs(before.target.z - after.target.z), `${context} target z`).toBeLessThan(0.001);
  expect(Math.abs(before.distance - after.distance), `${context} distance`).toBeLessThan(0.001);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = '89504e470d0a1a0a';
  expect(buffer.subarray(0, 8).toString('hex'), 'png signature').toBe(signature);
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  expect(bitDepth, 'png bit depth').toBe(8);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  expect(channels, `png color type ${colorType}`).toBeGreaterThan(0);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * channels);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOffset++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const up = y > 0 ? pixels[prevStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prevStart + x - channels] : 0;
      const value = raw[rawOffset++];
      let reconstructed = value;
      if (filter === 1) reconstructed = value + left;
      if (filter === 2) reconstructed = value + up;
      if (filter === 3) reconstructed = value + Math.floor((left + up) / 2);
      if (filter === 4) reconstructed = value + paethPredictor(left, up, upLeft);
      pixels[rowStart + x] = reconstructed & 255;
    }
  }
  return { width, height, channels, pixels };
}

function analyzeEstateCanvasPng(buffer) {
  const png = decodePng(buffer);
  const corner = 26;
  const edgePad = Math.ceil(Math.min(png.width, png.height) * 0.025);
  const samples = [];
  const addSample = (x, y) => {
    const i = (y * png.width + x) * png.channels;
    samples.push([png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]]);
  };
  for (let y = 0; y < corner; y++) {
    for (let x = 0; x < corner; x++) {
      addSample(edgePad + x, edgePad + y);
      addSample(png.width - 1 - edgePad - x, edgePad + y);
      addSample(edgePad + x, png.height - 1 - edgePad - y);
      addSample(png.width - 1 - edgePad - x, png.height - 1 - edgePad - y);
    }
  }
  const bg = samples.reduce((acc, rgb) => {
    acc[0] += rgb[0]; acc[1] += rgb[1]; acc[2] += rgb[2];
    return acc;
  }, [0, 0, 0]).map(v => v / samples.length);

  let minX = png.width, minY = png.height, maxX = -1, maxY = -1, count = 0;
  for (let y = edgePad; y < png.height - edgePad; y++) {
    for (let x = edgePad; x < png.width - edgePad; x++) {
      const i = (y * png.width + x) * png.channels;
      const r = png.pixels[i], g = png.pixels[i + 1], b = png.pixels[i + 2];
      const delta = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
      const saturated = Math.max(r, g, b) - Math.min(r, g, b);
      if (delta > 34 && saturated > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count += 1;
      }
    }
  }
  const box = maxX >= 0 ? {
    left: minX / png.width,
    top: minY / png.height,
    right: (maxX + 1) / png.width,
    bottom: (maxY + 1) / png.height
  } : { left: 0, top: 0, right: 0, bottom: 0 };
  box.width = box.right - box.left;
  box.height = box.bottom - box.top;
  return {
    image: { width: png.width, height: png.height },
    background: bg.map(v => Math.round(v)),
    pixelCount: count,
    coverage: count / (png.width * png.height),
    box,
    centerX: (box.left + box.right) / 2,
    centerY: (box.top + box.bottom) / 2
  };
}

async function captureEstatePixels(page, fileName) {
  await page.evaluate(() => {
    document.getElementById('estatePixelQaStyle')?.remove();
    const style = document.createElement('style');
    style.id = 'estatePixelQaStyle';
    style.textContent = '.estate-canvas-overlay{display:none!important}';
    document.head.appendChild(style);
  });
  const path = `artifacts/visual-qa/${fileName}`;
  try {
    await page.locator('#estateThree').screenshot({ path });
    return analyzeEstateCanvasPng(fs.readFileSync(path));
  } finally {
    await page.evaluate(() => document.getElementById('estatePixelQaStyle')?.remove());
  }
}

async function captureEstatePng(page, fileName) {
  await page.evaluate(() => {
    document.getElementById('estatePixelQaStyle')?.remove();
    const style = document.createElement('style');
    style.id = 'estatePixelQaStyle';
    style.textContent = '.estate-canvas-overlay{display:none!important}';
    document.head.appendChild(style);
  });
  const path = `artifacts/visual-qa/${fileName}`;
  try {
    await page.locator('#estateThree').screenshot({ path });
    return fs.readFileSync(path);
  } finally {
    await page.evaluate(() => document.getElementById('estatePixelQaStyle')?.remove());
  }
}

function comparePngFrames(beforeBuffer, afterBuffer) {
  const before = decodePng(beforeBuffer);
  const after = decodePng(afterBuffer);
  expect(after.width, 'stable frame width').toBe(before.width);
  expect(after.height, 'stable frame height').toBe(before.height);
  expect(after.channels, 'stable frame channels').toBe(before.channels);
  let changed = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  const pixels = before.width * before.height;
  for (let i = 0; i < pixels; i++) {
    const offset = i * before.channels;
    const delta = Math.max(
      Math.abs(before.pixels[offset] - after.pixels[offset]),
      Math.abs(before.pixels[offset + 1] - after.pixels[offset + 1]),
      Math.abs(before.pixels[offset + 2] - after.pixels[offset + 2])
    );
    if (delta > 8) changed += 1;
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
  }
  return { changedRatio: changed / pixels, averageDelta: totalDelta / pixels, maxDelta };
}

async function expectEstateRenderStable(page, context) {
  await page.waitForTimeout(800);
  const before = await captureEstatePng(page, `${context}-before.png`);
  await page.waitForTimeout(500);
  const after = await captureEstatePng(page, `${context}-after.png`);
  const delta = comparePngFrames(before, after);
  expect(delta.changedRatio, `${context} changed pixel ratio`).toBeLessThan(0.0015);
  expect(delta.averageDelta, `${context} average pixel delta`).toBeLessThan(0.05);
}

function expectEstatePixels(analysis, context, options = {}) {
  const mobile = Boolean(options.mobile);
  expect(analysis.pixelCount, `${context} model pixels`).toBeGreaterThan(mobile ? 5000 : 9000);
  expect(analysis.coverage, `${context} model coverage`).toBeGreaterThan(mobile ? 0.08 : 0.12);
  expect(analysis.box.width, `${context} pixel width`).toBeGreaterThan(mobile ? 0.65 : 0.74);
  expect(analysis.box.height, `${context} pixel height`).toBeGreaterThan(mobile ? 0.30 : 0.52);
  expect(analysis.box.left, `${context} not only on right`).toBeLessThan(0.48);
  expect(analysis.box.top, `${context} not only at bottom`).toBeLessThan(0.60);
  expect(analysis.box.right, `${context} right crop guard`).toBeLessThan(0.995);
  expect(analysis.box.bottom, `${context} bottom crop guard`).toBeLessThan(0.995);
  expect(analysis.centerX, `${context} centerX`).toBeGreaterThan(0.34);
  expect(analysis.centerX, `${context} centerX`).toBeLessThan(0.66);
  expect(analysis.centerY, `${context} centerY`).toBeGreaterThan(0.36);
  expect(analysis.centerY, `${context} centerY`).toBeLessThan(mobile ? 0.78 : 0.74);
}

test.beforeAll(() => {
  fs.mkdirSync('artifacts/visual-qa', { recursive: true });
});

test.describe('Playwright visual QA', () => {
  for (const p of pages) {
    for (const viewport of viewports) {
      test(`${p.slug} ${viewport.name}: страница и графики без грубых визуальных дефектов`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const runtime = await guardRuntime(page);
        await page.goto(p.path, { waitUntil: 'networkidle' });
        await expect(page.locator('body')).toContainText(p.title);
        await page.screenshot({ path: `artifacts/visual-qa/${p.slug}-${viewport.name}.png`, fullPage: false });
        const charts = await visibleChartOverlapReport(page);
        for (const chart of charts) {
          expect(chart.width, `${p.slug} ${chart.id} width`).toBeGreaterThan(250);
          expect(chart.height, `${p.slug} ${chart.id} height`).toBeGreaterThan(350);
          expect(chart.overlaps, `${p.slug} ${viewport.name} ${chart.id} overlaps`).toEqual([]);
        }
        expect(runtime.external, 'external runtime requests').toEqual([]);
        expect(runtime.consoleErrors, 'console errors').toEqual([]);
      });
    }
  }

  for (const target of fullPageTargets) {
    for (const viewport of fullPageViewports) {
      test(`${target.slug} ${viewport.name}: вся страница и секции проходят visual QA`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const runtime = await guardRuntime(page);
        await page.goto(target.path, { waitUntil: 'networkidle' });
        await expect(page.locator('body')).toContainText(target.title);
        if (target.moduleName) {
          await page.waitForFunction((moduleName) => window[moduleName]?.getState?.().loaded, target.moduleName);
        }
        await expectNoHorizontalOverflow(page, `${target.slug} ${viewport.name} initial`);
        await expectHeroKpiValuesOneLine(page, target, `${target.slug} ${viewport.name}`);
        await expectSelectorsReadable(page, target.contrastSelectors, `${target.slug} ${viewport.name}`);
        await page.screenshot({ path: `artifacts/visual-qa/${target.slug}-${viewport.name}-full-page.png`, fullPage: true });
        await captureAndCheckSections(page, target, viewport.name);
        await expectLocalGeoMap(page, target);
        if (target.slug === 'family') await expectFamilyRf2010Data(page, `${target.slug} ${viewport.name}`);
        expect(runtime.external, 'external runtime requests').toEqual([]);
        expect(runtime.consoleErrors, 'console errors').toEqual([]);
      });
    }
  }

  test('Главная: все переходы в структуре ведут на рабочие разделы', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    const hrefs = await page.locator('#structure .module').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    expect(hrefs).toEqual([
      'skr.html',
      'settlement.html',
      'estate.html',
      'capital.html',
      'mortgage.html',
      'payments.html',
      'family.html',
      'abortions.html'
    ]);
  });

  test('Семья: интерактивность обновляет KPI, SVG-карту, графики и таблицы', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/family.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.FamilyModule?.getState?.().loaded);
    const before = await page.evaluate(() => window.FamilyModule.getState());
    await page.locator('#territoryMode').selectOption('subject');
    await page.locator('#subjectSelect').selectOption({ index: 4 });
    await page.locator('#indicatorSelect').selectOption('marriage_rate_per_1000');
    await page.locator('#yearSelect').selectOption({ index: 2 });
    await page.locator('#scenarioReduceRange').evaluate(el => {
      el.value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = await page.evaluate(() => window.FamilyModule.getState());
    expect(after.analysisMode).toBe('subject');
    expect(after.indicator).toBe('marriage_rate_per_1000');
    expect(after.scenarioShare).toBe(31);
    expect(after.selectedTerritoryId).not.toBe(before.selectedTerritoryId);
    expect(after.kpiScenarioText).not.toBe(before.kpiScenarioText);
    expect(after.mapEngine).toBe('svg-geojson');
    expect(after.mapRenderedPaths).toBeGreaterThanOrEqual(83);
    expect(after.mapDomain.max).not.toBe(before.mapDomain.max);
    expect(after.renderedCharts).toEqual(expect.arrayContaining(after.chartIds));
    expect(after.topTableRows).toBeGreaterThan(0);
    expect(after.territoryTableRows).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, 'family interactive');
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });

  test('Аборты: интерактивность обновляет KPI, SVG-карту, графики и таблицы', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/abortions.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.AbortionsModule?.getState?.().loaded);
    const before = await page.evaluate(() => window.AbortionsModule.getState());
    await page.locator('#territoryMode').selectOption('subject');
    await page.locator('#subjectSelect').selectOption({ index: 4 });
    await page.locator('#indicatorSelect').selectOption('abortions_per_1000_women_15_49');
    await page.locator('#yearSelect').selectOption({ index: 2 });
    await page.locator('#savedShareRange').evaluate(el => {
      el.value = '31';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = await page.evaluate(() => window.AbortionsModule.getState());
    expect(after.analysisMode).toBe('subject');
    expect(after.indicator).toBe('abortions_per_1000_women_15_49');
    expect(after.scenarioShare).toBe(31);
    expect(after.selectedTerritoryId).not.toBe(before.selectedTerritoryId);
    expect(after.kpiPotentialText).not.toBe(before.kpiPotentialText);
    expect(after.mapEngine).toBe('svg-geojson');
    expect(after.mapRenderedPaths).toBeGreaterThanOrEqual(83);
    expect(after.mapDomain.max).not.toBe(before.mapDomain.max);
    expect(after.renderedCharts).toEqual(expect.arrayContaining(after.chartIds));
    expect(after.topTableRows).toBeGreaterThan(0);
    expect(after.territoryTableRows).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, 'abortions interactive');
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });

  test('СКР: ВЦИОМ-блок на мобильном не ломает ширину страницы и lag-band сохранён', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const runtime = await guardRuntime(page);
    await page.goto('/skr.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#policyStartDragHandle')).toHaveCount(0);
    await expect(page.locator('#policyLagDragBand')).toBeVisible();
    await page.waitForFunction(() => window.SkrModule?.getState?.().interactionMode === 'lag-band');
    await page.waitForFunction(() => window.VciomFertilityBlock?.getState?.().loaded);
    await page.locator('#vciom-2025-intentions').scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page, 'skr mobile vciom');
    const chartBox = await page.locator('#vciom-2025-intentions .vciom-chart').boundingBox();
    const svgBox = await page.locator('#vciom-2025-intentions .vciom-chart svg').boundingBox();
    expect(chartBox).toBeTruthy();
    expect(svgBox).toBeTruthy();
    expect(svgBox.x + svgBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width + 1);
    await page.locator('#vciom-2025-intentions').screenshot({ path: 'artifacts/visual-qa/01-skr-mobile-vciom-section.png' });
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });

  test('СКР: картограмма занимает рабочую область, а лаг-зона синхронизирована с графиком', async ({ page }) => {
    await page.goto('/skr.html', { waitUntil: 'networkidle' });
    const map = await page.locator('#map svg').evaluate(svg => {
      const boxes = [...svg.querySelectorAll('path')].map(path => path.getBBox());
      const left = Math.min(...boxes.map(b => b.x));
      const top = Math.min(...boxes.map(b => b.y));
      const right = Math.max(...boxes.map(b => b.x + b.width));
      const bottom = Math.max(...boxes.map(b => b.y + b.height));
      return { paths: boxes.length, width: right - left, height: bottom - top };
    });
    expect(map.paths).toBeGreaterThan(80);
    expect(map.width).toBeGreaterThan(760);
    expect(map.height).toBeGreaterThan(280);

    await expect(page.locator('#policyMonthRange')).toHaveCount(0);
    await expect(page.locator('#policyMonthChartRange')).toHaveCount(0);
    await expect(page.locator('#policyStartDragHandle')).toHaveCount(0);
    await expect(page.locator('#policyLagDragBand')).toBeVisible();
    await expect(page.locator('#tfrChart')).not.toContainText('запуск мер');
    await page.waitForFunction(() => window.SkrModule?.getState?.().policyStart === '2026-06');
    const initialPolicy = await page.evaluate(() => window.SkrModule.getState());
    expect(initialPolicy.interactionMode).toBe('lag-band');
    expect(initialPolicy.effectMonth).toBe('2027-03');
    expect(initialPolicy.forecastMonthsAreContinuous).toBe(true);
    expect(initialPolicy.targetTrajectoryStartMonth).toBe('2027-03');
    await dragPolicyLagBandToMonth(page, '2030-01');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe('2030-01');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().effectMonth)).toBe('2030-10');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().targetTrajectoryStartMonth)).toBe('2030-10');
    await expect(page.locator('#policyMonthLabel')).toContainText('2030-01');
    await expect(page.locator('#chartPolicyMonthLabel')).toContainText('2030-01');
    await expect(page.locator('#effectMonthLabel')).toContainText('2030-10');
    await expect(page.locator('#chartEffectMonthLabel')).toContainText('2030-10');
    const traceCheck = await page.evaluate(() => {
      const chart = document.getElementById('tfrChart');
      const required = chart.data.find(trace => trace.name === 'Требуемая траектория России');
      const forecast = chart.data.find(trace => trace.name === 'СКР прогноз — Россия');
      const toMonth = value => {
        const date = new Date(value);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      };
      const finiteTargetIndex = required.y.findIndex(value => value !== null && value !== undefined && Number.isFinite(value));
      let maxForecastGap = 0;
      for (let i = 1; i < forecast.x.length; i++) {
        const prev = new Date(forecast.x[i - 1]);
        const next = new Date(forecast.x[i]);
        maxForecastGap = Math.max(maxForecastGap, (next.getFullYear() - prev.getFullYear()) * 12 + next.getMonth() - prev.getMonth());
      }
      return {
        firstTargetMonth: toMonth(required.x[finiteTargetIndex]),
        maxForecastGap,
        firstForecastMonth: toMonth(forecast.x[1]),
        anchorMonth: toMonth(forecast.x[0])
      };
    });
    expect(traceCheck.anchorMonth).toBe('2026-05');
    expect(traceCheck.firstForecastMonth).toBe('2026-06');
    expect(traceCheck.maxForecastGap).toBe(1);
    expect(traceCheck.firstTargetMonth).toBe('2030-10');
    await page.locator('#policyLagDragBand').focus();
    await page.keyboard.press('Home');
    await expect.poll(() => page.evaluate(() => window.SkrModule.getState().policyStart)).toBe('2026-06');
  });

  test('Расселение: прогноз городского и сельского СКР использует локальную модель', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.goto('/settlement.html', { waitUntil: 'networkidle' });
    await page.locator('#settlementTfrChart .main-svg').first().waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.SettlementModule?.getState?.().tfrForecastLoaded);
    const initial = await page.evaluate(() => window.SettlementModule.getState());
    expect(initial.forecastMethod).toBe('local_gp_ucm_ensemble');
    expect(initial.negativeForecastGapCount).toBe(0);
    expect(initial.minForecastGap).toBeGreaterThan(0);
    expect(initial.positiveShareShiftNonNegative).toBe(true);
    expect(initial.chartTraceCount).toBeGreaterThanOrEqual(7);
    expect(initial.rows).toHaveLength(25);
    expect(Math.min(...initial.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeGreaterThan(0.3);
    expect(Math.max(...initial.rows.flatMap(r => [r.baselineTfr, r.urbanTfr, r.ruralTfr, r.scenarioTfr]))).toBeLessThan(4.8);

    await page.locator('[data-preset="fix"]').click();
    const fixed = await page.evaluate(() => window.SettlementModule.getState());
    const maxFixedDelta = Math.max(...fixed.rows.map(r => Math.abs(r.scenarioTfr - r.baselineTfr)));
    expect(maxFixedDelta).toBeLessThan(0.001);

    await page.locator('#delta2050').evaluate(el => {
      el.value = '15';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const shifted = await page.evaluate(() => window.SettlementModule.getState());
    expect(shifted.kpis.baselineTfr2050).toBeCloseTo(fixed.kpis.baselineTfr2050, 5);
    expect(shifted.negativeForecastGapCount).toBe(0);
    expect(shifted.minForecastGap).toBeGreaterThan(0);
    expect(shifted.positiveShareShiftNonNegative).toBe(true);
    expect(shifted.kpis.scenarioTfr2050).toBeGreaterThan(shifted.kpis.baselineTfr2050);
    for (const territoryId of ['terr_rf_bez_novyh_subektov', 'terr_moskovskaya_oblast', 'terr_sibirskiy_federalnyy_okrug']) {
      await page.locator('#settlementTerritorySelect').selectOption(territoryId);
      await page.locator('#delta2050').evaluate(el => {
        el.value = '15';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const territoryState = await page.evaluate(() => window.SettlementModule.getState());
      expect(territoryState.negativeForecastGapCount, territoryId).toBe(0);
      expect(territoryState.minForecastGap, territoryId).toBeGreaterThan(0);
      expect(territoryState.positiveShareShiftNonNegative, territoryId).toBe(true);
      expect(territoryState.kpis.scenarioTfr2050, territoryId).toBeGreaterThanOrEqual(territoryState.kpis.baselineTfr2050);
    }
    await page.screenshot({ path: 'artifacts/visual-qa/02-settlement-local-forecast.png', fullPage: false });
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });

  test('Маткапитал: Plotly-графики непустые, KPI и таблица читаются', async ({ page }) => {
    const runtime = await guardRuntime(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/capital.html', { waitUntil: 'networkidle' });
    await page.locator('#chartArguments .main-svg').first().waitFor({ state: 'visible' });
    await page.locator('#chartByOrder .main-svg').first().waitFor({ state: 'visible' });
    await page.locator('#chartHousingCoverage .main-svg').first().waitFor({ state: 'visible' });
    await page.locator('#chartBudget .main-svg').first().waitFor({ state: 'visible' });
    const state = await page.evaluate(() => window.CapitalModule.getState());
    expect(state.runtimeExternalFetch).toBe(false);
    expect(state.chartCount).toBe(4);
    expect(state.tableRows).toBeGreaterThanOrEqual(5);
    for (const chart of state.charts) {
      expect(chart.engine, `${chart.id} engine`).toBe('plotly');
      expect(chart.visible, `${chart.id} visible`).toBe(true);
      expect(chart.width, `${chart.id} width`).toBeGreaterThan(320);
      expect(chart.height, `${chart.id} height`).toBeGreaterThan(280);
      expect(chart.textCount, `${chart.id} text`).toBeGreaterThan(6);
      expect(chart.shapeCount, `${chart.id} shapes`).toBeGreaterThan(6);
    }
    const labels = await page.locator('[data-page="capital"] svg text').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { text: (node.textContent || '').trim(), width: rect.width, height: rect.height };
    }).filter(item => item.text));
    expect(labels.length).toBeGreaterThan(30);
    for (const label of labels.filter(item => item.text.length > 3).slice(0, 40)) {
      expect(label.width, `capital label ${label.text}`).toBeGreaterThan(8);
      expect(label.height, `capital label ${label.text}`).toBeGreaterThanOrEqual(7);
    }
    await page.screenshot({ path: 'artifacts/visual-qa/04-capital-plotly-charts.png', fullPage: false });
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });

  test('Усадьба: 3D камера после загрузки и сброса направлена на рассчитанный центр модели', async ({ page }) => {
    await page.goto('/estate.html', { waitUntil: 'networkidle' });
    await expect(page.locator('#estateThree canvas')).toBeVisible();
    const initial = await page.waitForFunction(() => window.Estate3D?.getViewState?.());
    const initialState = await initial.jsonValue();
    expect(initialState.version).toBe('20260613-estate-groundplan1');
    expect(initialState.roofPolicy).toBe('faceted-opaque-no-shadow-receive');
    expect(initialState.roofMeshCount).toBeGreaterThanOrEqual(1);
    expect(initialState.roofDetailMeshCount).toBeGreaterThanOrEqual(4);
    expect(initialState.roofReceiveShadowCount).toBe(0);
    expectRearWindowsOriented(initialState, 'estate initial');
    expect(initialState.fitCount).toBeGreaterThan(0);
    expect(initialState.distance).toBeGreaterThan(6);
    expect(initialState.distance).toBeLessThan(56);
    expectEstateFrame(initialState, 'estate initial');
    expectEstateFrontView(initialState, 'estate initial');
    const initialPixels = await captureEstatePixels(page, 'estate-canvas-initial.png');
    expectEstatePixels(initialPixels, 'estate initial pixels');

    await page.mouse.move(620, 440);
    await page.mouse.down();
    await page.mouse.move(780, 520);
    await page.mouse.up();
    await page.locator('#estateViewReset').click();
    const resetState = await page.evaluate(() => window.Estate3D.getViewState());
    expect(Math.abs(resetState.camera.x - resetState.defaultCamera.x)).toBeLessThan(0.01);
    expect(Math.abs(resetState.camera.y - resetState.defaultCamera.y)).toBeLessThan(0.01);
    expect(Math.abs(resetState.camera.z - resetState.defaultCamera.z)).toBeLessThan(0.01);
    expectEstateFrame(resetState, 'estate reset');
    expectEstateFrontView(resetState, 'estate reset');
    expectRearWindowsOriented(resetState, 'estate reset');
    const resetPixels = await captureEstatePixels(page, 'estate-canvas-reset-basic.png');
    expectEstatePixels(resetPixels, 'estate reset pixels');
  });

  test('Усадьба: этажность, размерные линии и проходы в заборе работают', async ({ page }) => {
    await page.goto('/estate.html', { waitUntil: 'networkidle' });
    await page.locator('#estateThree canvas').waitFor({ state: 'visible' });
    const initialState = await page.waitForFunction(() => window.Estate3D?.getViewState?.());
    const initial = await initialState.jsonValue();
    expect(initial.dimensionOverlayVisible).toBe(false);
    expect(initial.dimensionOverlayMode).toBe('ground-plan');
    expect(initial.dimensionLayerVisible).toBe(false);
    expect(initial.dimensionLabelCount).toBeGreaterThanOrEqual(6);
    expect(initial.dimension3dLabelCount).toBeGreaterThanOrEqual(6);
    expect(initial.dimensionArrowCount).toBeGreaterThanOrEqual(12);
    expect(initial.dimensionEndCapCount).toBeGreaterThanOrEqual(12);
    expect(initial.dimensionGroundLabelCount).toBeGreaterThanOrEqual(5);
    expect(initial.dimensionWhiteLabelCount).toBe(0);
    expect(initial.dimensionHeightLinePresent).toBe(true);
    expect(initial.dimensionSvgLabelCount).toBe(0);
    expect(initial.fenceGateCount).toBe(1);
    expect(initial.mainDoorCount).toBe(1);
    expect(initial.separateElderHouse).toBe(false);
    expect(initial.elderHousePresent).toBe(false);
    expect(initial.treeCollisionCount).toBe(0);
    expect(initial.treeCount).toBeGreaterThan(0);
    expect(initial.minTreeClearanceM).toBeGreaterThan(0);
    expect(initial.doorMetrics.widthM).toBeCloseTo(1.05, 2);
    expect(initial.doorMetrics.heightM).toBeCloseTo(2.15, 2);
    expect(initial.windowMetrics.widthM).toBeCloseTo(1.35, 2);
    expect(initial.windowMetrics.heightM).toBeCloseTo(1.40, 2);
    expectRearWindowsOriented(initial, 'estate windows');
    await expect(page.locator('#estateDimensionsToggle')).not.toBeChecked();
    await expect(page.locator('label[for="estateAdults"]')).toContainText('Родители');
    await expect(page.locator('label[for="estateElders"]')).toContainText('Прародители рядом');
    await expect(page.locator('label[for="estateSiteArea"]')).toContainText('Участок (соток)');
    await expect(page.locator('#estateSeparateElderHouse')).not.toBeChecked();
    await expect(page.locator('[data-estate-preset]')).toHaveCount(0);
    await expect(page.locator('#estateWorkModule')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('микробизнес');
    await expect(page.locator('#estateAdults')).toHaveAttribute('max', '2');
    await expect(page.locator('#estateFloors')).toHaveAttribute('max', '3');
    await expect(page.locator('.estate-stepper-grid .estate-stepper-card')).toHaveCount(4);
    await expect(page.locator('.estate-stepper-echo')).toHaveCount(5);
    for (let i = 0; i < 5; i++) await expect(page.locator('.estate-stepper-echo').nth(i)).toBeHidden();
    await page.locator('[data-step-target="estateChildren"][data-step-delta="1"]').click();
    await expect(page.locator('#estateChildren')).toHaveValue('4');
    await page.locator('[data-step-target="estateChildren"][data-step-delta="-1"]').click();
    await expect(page.locator('#estateChildren')).toHaveValue('3');
    const siteBefore = initial.siteDimensions.areaM2;
    await page.locator('[data-step-target="estateSiteArea"][data-step-delta="1"]').click();
    await expect(page.locator('#estateSiteArea')).toHaveValue('13');
    await page.waitForTimeout(650);
    const siteAfter = await page.evaluate(() => window.Estate3D.getViewState());
    expect(siteAfter.siteDimensions.areaM2).toBeGreaterThan(siteBefore);
    for (const sotka of [4, 12, 30]) {
      await page.locator('#estateSiteArea').evaluate((el, value) => {
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, sotka);
      await expect(page.locator('#estateSiteArea')).toHaveValue(String(sotka));
      await page.waitForTimeout(550);
      const treeState = await page.evaluate(() => window.Estate3D.getViewState());
      expect(treeState.treeCollisionCount, `tree collisions at ${sotka} sotka`).toBe(0);
      expect(treeState.treeCount, `tree count at ${sotka} sotka`).toBeGreaterThan(0);
      expect(treeState.minTreeClearanceM, `tree clearance at ${sotka} sotka`).toBeGreaterThan(0);
    }
    await page.locator('#estateSiteArea').evaluate(el => {
      el.value = '12';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.locator('#estateSeparateElderHouse').check();
    await page.waitForTimeout(650);
    const withSeparateElders = await page.evaluate(() => window.Estate3D.getViewState());
    expect(withSeparateElders.separateElderHouse).toBe(true);
    expect(withSeparateElders.elderHousePresent).toBe(true);
    expect(withSeparateElders.fenceGateCount).toBe(2);
    expect(withSeparateElders.treeCollisionCount).toBe(0);

    const floorStates = [];
    for (const floor of [1, 2, 3]) {
      await page.locator('#estateFloors').evaluate((el, value) => {
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, floor);
      await expect(page.locator('#estateFloors')).toHaveValue(String(floor));
      await page.waitForTimeout(450);
      const state = await page.evaluate(() => window.Estate3D.getViewState());
      expect(state.floors).toBe(floor);
      expectEstateFrame(state, `estate floor ${floor}`);
      expectEstateFrontView(state, `estate floor ${floor}`);
      floorStates.push(state);
    }
    await page.locator('#estateFloors').evaluate(el => {
      el.value = '4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#estateFloors')).toHaveValue('3');
    const clampedFloorState = await page.evaluate(() => window.Estate3D.getViewState());
    expect(clampedFloorState.floors).toBe(3);
    for (let i = 1; i < floorStates.length; i++) {
      expect(floorStates[i].mainHouseBoundsSize.y, `floor ${i+1} height grows`).toBeGreaterThan(floorStates[i-1].mainHouseBoundsSize.y);
      expect(floorStates[i].mainFootprintM2, `floor ${i+1} footprint shrinks`).toBeLessThan(floorStates[i-1].mainFootprintM2);
    }

    const beforeDimensionsToggle = await page.evaluate(() => window.Estate3D.getViewState());
    await page.locator('#estateDimensionsToggle').check();
    await page.waitForTimeout(900);
    const withDimensions = await page.evaluate(() => window.Estate3D.getViewState());
    expect(withDimensions.dimensionOverlayVisible).toBe(true);
    expect(withDimensions.dimensionOverlayMode).toBe('ground-plan');
    expect(withDimensions.dimensionLayerVisible).toBe(true);
    expect(withDimensions.dimension3dLabelCount).toBeGreaterThanOrEqual(8);
    expect(withDimensions.dimensionArrowCount).toBeGreaterThanOrEqual(16);
    expect(withDimensions.dimensionEndCapCount).toBeGreaterThanOrEqual(16);
    expect(withDimensions.dimensionGroundLabelCount).toBeGreaterThanOrEqual(7);
    expect(withDimensions.dimensionWhiteLabelCount).toBe(0);
    expect(withDimensions.dimensionHeightLinePresent).toBe(true);
    expect(withDimensions.dimensionSvgLabelCount).toBe(0);
    expect(withDimensions.lastDimensionTogglePreservedCamera).toBe(true);
    expectCameraUnchanged(beforeDimensionsToggle, withDimensions, 'estate dimensions on');
    await expect(page.locator('#estateDimensionPlan')).toBeHidden();
    expect(withDimensions.viewScreenBox.width).toBeGreaterThan(0.34);
    const beforeDimensionsOff = await page.evaluate(() => window.Estate3D.getViewState());
    await page.locator('#estateDimensionsToggle').uncheck();
    await page.waitForTimeout(450);
    const withoutDimensions = await page.evaluate(() => window.Estate3D.getViewState());
    expect(withoutDimensions.dimensionOverlayVisible).toBe(false);
    expect(withoutDimensions.dimensionLayerVisible).toBe(false);
    expect(withoutDimensions.lastDimensionTogglePreservedCamera).toBe(true);
    expectCameraUnchanged(beforeDimensionsOff, withoutDimensions, 'estate dimensions off');

    await page.locator('#estateElders').evaluate(el => {
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    const noElders = await page.evaluate(() => window.Estate3D.getViewState());
    expect(noElders.separateElderHouse).toBe(false);
    expect(noElders.elderHousePresent).toBe(false);
    expect(noElders.fenceGateCount).toBe(1);
    expect(noElders.mainDoorCount).toBe(1);
  });

  test('Усадьба: 3D модель остаётся в кадре на широком экране, после resize и сброса', async ({ page }) => {
    await page.setViewportSize({ width: 2048, height: 1000 });
    const runtime = await guardRuntime(page);
    await page.goto('/estate.html?qa=wide-estate-pixels', { waitUntil: 'networkidle' });
    await page.mouse.wheel(0, 560);
    await page.locator('#estateThree canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.Estate3D?.getViewState?.()?.screenBox?.width > 0.38);
    const wideState = await page.evaluate(() => window.Estate3D.getViewState());
    expect(wideState.version).toBe('20260613-estate-groundplan1');
    expect(wideState.roofPolicy).toBe('faceted-opaque-no-shadow-receive');
    expect(wideState.roofDetailMeshCount).toBeGreaterThanOrEqual(4);
    expect(wideState.roofReceiveShadowCount).toBe(0);
    expectRearWindowsOriented(wideState, 'estate wide windows');
    expect(wideState.fitCount).toBeGreaterThan(0);
    expectEstateFrame(wideState, 'estate wide');
    expectEstateFrontView(wideState, 'estate wide');
    await page.screenshot({ path: 'artifacts/visual-qa/estate-viewport-wide-after.png', fullPage: false });
    const widePixels = await captureEstatePixels(page, 'estate-canvas-wide-after.png');
    expectEstatePixels(widePixels, 'estate wide pixels');
    await expectEstateRenderStable(page, 'estate-roof-stability-wide');

    await page.locator('#estateViewReset').click();
    await page.waitForTimeout(350);
    const resetState = await page.evaluate(() => window.Estate3D.getViewState());
    expectEstateFrame(resetState, 'estate wide reset');
    expectEstateFrontView(resetState, 'estate wide reset');
    const resetPixels = await captureEstatePixels(page, 'estate-canvas-after-reset.png');
    expectEstatePixels(resetPixels, 'estate wide reset pixels');

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.waitForTimeout(900);
    await page.locator('#estateViewReset').click();
    await page.waitForTimeout(350);
    const mediumState = await page.evaluate(() => window.Estate3D.getViewState());
    expectEstateFrame(mediumState, 'estate medium reset');
    expectEstateFrontView(mediumState, 'estate medium reset');
    const mediumPixels = await captureEstatePixels(page, 'estate-canvas-resize-1366-after.png');
    expectEstatePixels(mediumPixels, 'estate medium pixels');

    await page.evaluate(() => {
      document.documentElement.style.zoom = '92%';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(1400);
    await page.locator('#estateViewReset').click();
    await page.waitForTimeout(350);
    const zoomState = await page.evaluate(() => window.Estate3D.getViewState());
    expectEstateFrame(zoomState, 'estate css zoom reset');
    expectEstateFrontView(zoomState, 'estate css zoom reset');
    const zoomPixels = await captureEstatePixels(page, 'estate-canvas-css-zoom-after.png');
    expectEstatePixels(zoomPixels, 'estate css zoom pixels');

    await page.evaluate(() => {
      document.documentElement.style.zoom = '';
      window.dispatchEvent(new Event('resize'));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.estate-view-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.locator('#estateViewReset').click();
    await page.waitForTimeout(350);
    const mobileState = await page.evaluate(() => window.Estate3D.getViewState());
    expectEstateFrame(mobileState, 'estate mobile reset');
    expectEstateFrontView(mobileState, 'estate mobile reset');
    const mobilePixels = await captureEstatePixels(page, 'estate-canvas-mobile-after.png');
    expectEstatePixels(mobilePixels, 'estate mobile pixels', { mobile: true });
    expect(runtime.external, 'external runtime requests').toEqual([]);
    expect(runtime.consoleErrors, 'console errors').toEqual([]);
  });
});
