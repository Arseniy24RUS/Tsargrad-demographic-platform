const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const pages = [
  { path: '/index.html', slug: '00-home', title: 'Россия 2050' },
  { path: '/skr.html', slug: '01-skr', title: 'Рождаемость', ready: () => Boolean(window.SkrModule?.getState?.().policyStart && document.querySelector('#tfrChart')) },
  { path: '/settlement.html', slug: '02-settlement', title: 'Расселение', ready: () => Boolean(window.SettlementModule?.getState?.().chartTraceCount >= 3 || document.querySelector('#settlementTfrChart .main-svg')) },
  { path: '/infrastructure.html', slug: '03-infrastructure', title: 'Инфраструктура', ready: () => window.InfrastructureModule?.getState?.().loaded },
  { path: '/estate.html', slug: '04-estate', title: 'Свой дом', ready: () => Boolean(window.Estate3D?.getViewState?.()) },
  { path: '/capital.html', slug: '05-capital', title: 'Маткапитал', ready: () => window.CapitalModule?.getState?.().chartCount >= 4 },
  { path: '/mortgage.html', slug: '06-mortgage', title: 'Ипотека', ready: () => document.querySelectorAll('.js-plotly-plot').length >= 4 },
  { path: '/payments.html', slug: '07-payments', title: 'Выплаты', ready: () => document.querySelector('#paymentsSummaryLine')?.textContent?.includes('При текущих настройках') },
  { path: '/family.html', slug: '08-family', title: 'Браки', ready: () => window.FamilyModule?.getState?.().loaded },
  { path: '/abortions.html', slug: '09-abortions', title: 'Аборты', ready: () => window.AbortionsModule?.getState?.().loaded }
];

const coreViewports = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '834x1194', width: 834, height: 1194 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '1180x820', width: 1180, height: 820 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x1000', width: 1440, height: 1000 },
  { name: '1920x1080', width: 1920, height: 1080 }
];

const sweepWidths = [379, 380, 639, 640, 679, 680, 699, 700, 719, 720, 759, 760, 899, 900, 1099, 1100, 1259, 1260]
  .map(width => ({ name: `sweep-${width}`, width, height: width < 760 ? 740 : width < 1100 ? 900 : 820 }));

const screenshotRoot = path.join('artifacts', 'responsive', 'screenshots');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

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

async function waitForPageReady(page, target) {
  if (target.ready) {
    await page.waitForFunction(target.ready, null, { timeout: 20_000 });
  }
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function runGeometryGate(page, target, viewport) {
  const report = await page.evaluate(({ targetSlug, width, height }) => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const visible = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const simpleName = el => {
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 4).join('.') : '';
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`;
    };
    const allowedOverflow = el => Boolean(el.closest('.table-wrap,.table-scroll,.nav-tabs.is-open,.plot-container,.js-plotly-plot'));
    const candidateSelector = [
      'h1', 'h2', 'h3',
      '.hero-main', '.card', '.kpi-card', '.kpi-value', '.kpi-note',
      '.metric', '.metric b', '.pill', '.scenario-chip', 'button', 'select',
      '.summary-line', '.infra-kpi', '.family-kpi', '.abortion-kpi',
      '.module', '.thesis', '.hero-card', '.claim', '.capital-total-chip',
      '.toggle-row span'
    ].join(',');
    const elementIssues = [...document.querySelectorAll(candidateSelector)].filter(visible).flatMap(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const issues = [];
      if (!allowedOverflow(el) && rect.right > clientWidth + 2) {
        issues.push({ type: 'over-x', node: simpleName(el), right: Math.round(rect.right), viewport: clientWidth, text: text(el).slice(0, 90) });
      }
      if (!allowedOverflow(el) && rect.left < -2) {
        issues.push({ type: 'under-x', node: simpleName(el), left: Math.round(rect.left), text: text(el).slice(0, 90) });
      }
      const hasOwnText = [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (hasOwnText && !allowedOverflow(el) && el.scrollWidth > el.clientWidth + 2) {
        issues.push({ type: 'scroll-width', node: simpleName(el), client: el.clientWidth, scroll: el.scrollWidth, text: text(el).slice(0, 90) });
      }
      if (hasOwnText && style.overflow !== 'visible' && el.scrollHeight > el.clientHeight + 3) {
        issues.push({ type: 'scroll-height', node: simpleName(el), client: el.clientHeight, scroll: el.scrollHeight, text: text(el).slice(0, 90) });
      }
      return issues;
    }).slice(0, 16);

    const splitIssues = [];
    const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible);
    for (const heading of headings) {
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const raw = node.textContent || '';
        const matches = [...raw.matchAll(/[А-ЯЁа-яёA-Za-z0-9][А-ЯЁа-яёA-Za-z0-9‑-]{4,}/g)];
        for (const match of matches) {
          const word = match[0];
          if (!/[А-ЯЁа-яё]/.test(word)) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + word.length);
          const rects = [...range.getClientRects()].filter(rect => rect.width > 1 && rect.height > 1);
          if (rects.length > 1) {
            splitIssues.push({ type: 'split-word', node: simpleName(heading), word, rects: rects.length, heading: text(heading).slice(0, 110) });
          }
          range.detach();
        }
      }
    }

    const header = document.querySelector('header,.topbar');
    let headerIssue = null;
    if (header && visible(header) && width <= 700) {
      const bg = getComputedStyle(header).backgroundColor;
      const alphaMatch = bg.match(/rgba?\(([^)]+)\)/);
      const parts = alphaMatch ? alphaMatch[1].split(',').map(item => Number.parseFloat(item.trim())) : [];
      const alpha = parts.length > 3 ? parts[3] : 1;
      if (alpha < 0.96) headerIssue = { type: 'header-alpha', alpha, bg };
    }

    const main = document.querySelector('main');
    let headerOverlap = null;
    if (header && main && visible(header) && window.scrollY <= 2) {
      const headerRect = header.getBoundingClientRect();
      const first = main.querySelector('.hero,section,.wrap.hero');
      if (first) {
        const firstRect = first.getBoundingClientRect();
        if (firstRect.top < headerRect.bottom - 2) {
          headerOverlap = { type: 'header-overlap', headerBottom: Math.round(headerRect.bottom), firstTop: Math.round(firstRect.top) };
        }
      }
    }

    const tableIssues = [...document.querySelectorAll('table')].filter(visible).flatMap(table => {
      const rect = table.getBoundingClientRect();
      if (rect.width <= clientWidth + 2 || table.closest('.table-wrap,.table-scroll')) return [];
      return [{ type: 'table-page-overflow', node: simpleName(table), width: Math.round(rect.width), viewport: clientWidth }];
    });

    const bottomPaddingIssues = [];
    if (width <= 700) {
      const bodyPad = Number.parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      const pageWrap = document.querySelector('.page-wrap,.page');
      const pagePad = pageWrap ? Number.parseFloat(getComputedStyle(pageWrap).paddingBottom) || 0 : bodyPad;
      if (Math.max(bodyPad, pagePad) < 96) bottomPaddingIssues.push({ type: 'bottom-safe-area', bodyPad, pagePad });
    }

    const chartIssues = [...document.querySelectorAll('.js-plotly-plot')].filter(visible).flatMap(chart => {
      const rect = chart.getBoundingClientRect();
      const svg = chart.querySelector('.main-svg');
      const texts = [...chart.querySelectorAll('svg text')].filter(visible).map(el => {
        const r = el.getBoundingClientRect();
        return { text: text(el), left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }).filter(item => item.text.length > 2);
      const overlaps = [];
      for (let i = 0; i < texts.length; i += 1) {
        for (let j = i + 1; j < texts.length; j += 1) {
          if (texts[i].text === texts[j].text) continue;
          const dx = Math.max(0, Math.min(texts[i].right, texts[j].right) - Math.max(texts[i].left, texts[j].left));
          const dy = Math.max(0, Math.min(texts[i].bottom, texts[j].bottom) - Math.max(texts[i].top, texts[j].top));
          const area = dx * dy;
          if (area > 1800) overlaps.push({ a: texts[i].text.slice(0, 45), b: texts[j].text.slice(0, 45), area: Math.round(area) });
        }
      }
      if (!svg || rect.width < 220 || rect.height < 220) return [{ type: 'plotly-empty', node: simpleName(chart), width: Math.round(rect.width), height: Math.round(rect.height) }];
      return overlaps.slice(0, 4).map(item => Object.assign({ type: 'plotly-label-overlap', node: simpleName(chart) }, item));
    }).slice(0, 8);

    const canvasIssues = [...document.querySelectorAll('canvas')].filter(visible).flatMap(canvas => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) return [{ type: 'canvas-small', node: simpleName(canvas), width: Math.round(rect.width), height: Math.round(rect.height) }];
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return [];
      let alpha = 0;
      let variety = new Set();
      const sampleSize = 48;
      for (let gy = 0; gy < 6; gy += 1) {
        for (let gx = 0; gx < 6; gx += 1) {
          const x = Math.max(0, Math.min(canvas.width - sampleSize, Math.round((canvas.width - sampleSize) * gx / 5)));
          const y = Math.max(0, Math.min(canvas.height - sampleSize, Math.round((canvas.height - sampleSize) * gy / 5)));
          const image = ctx.getImageData(x, y, sampleSize, sampleSize).data;
          for (let i = 0; i < image.length; i += 64) {
            if (image[i + 3] > 8) alpha += 1;
            variety.add(`${image[i] >> 4}-${image[i + 1] >> 4}-${image[i + 2] >> 4}`);
          }
        }
      }
      if (alpha < 40 && targetSlug !== '04-estate') return [{ type: 'canvas-blank', node: simpleName(canvas), alpha, variety: variety.size }];
      return [];
    });

    let estateOverlayIssue = null;
    if (targetSlug === '04-estate' && width <= 700) {
      const scene = document.querySelector('#estateThree');
      const overlay = document.querySelector('.estate-canvas-overlay');
      if (scene && overlay && visible(scene) && visible(overlay)) {
        const sceneRect = scene.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        if (overlayRect.top < sceneRect.bottom - 2) {
          estateOverlayIssue = { type: 'estate-overlay-over-canvas', sceneBottom: Math.round(sceneRect.bottom), overlayTop: Math.round(overlayRect.top) };
        }
      }
    }

    return {
      targetSlug,
      viewport: `${width}x${height}`,
      pageOverflow: scrollWidth - clientWidth,
      elementIssues,
      splitIssues,
      headerIssue,
      headerOverlap,
      tableIssues,
      bottomPaddingIssues,
      chartIssues,
      canvasIssues,
      estateOverlayIssue
    };
  }, { targetSlug: target.slug, width: viewport.width, height: viewport.height });

  expect(report.pageOverflow, `${target.slug} ${viewport.name} page overflow`).toBeLessThanOrEqual(2);
  expect(report.elementIssues, `${target.slug} ${viewport.name} geometry issues`).toEqual([]);
  expect(report.splitIssues, `${target.slug} ${viewport.name} split heading words`).toEqual([]);
  expect(report.headerIssue, `${target.slug} ${viewport.name} header alpha`).toBeNull();
  expect(report.headerOverlap, `${target.slug} ${viewport.name} header overlap`).toBeNull();
  expect(report.tableIssues, `${target.slug} ${viewport.name} table issues`).toEqual([]);
  expect(report.bottomPaddingIssues, `${target.slug} ${viewport.name} bottom safe-area`).toEqual([]);
  expect(report.chartIssues, `${target.slug} ${viewport.name} chart issues`).toEqual([]);
  expect(report.canvasIssues, `${target.slug} ${viewport.name} canvas issues`).toEqual([]);
  expect(report.estateOverlayIssue, `${target.slug} ${viewport.name} estate overlay`).toBeNull();
}

async function expectHeaderContract(page, target, viewport) {
  await expect(page.locator('.brand-title').first(), `${target.slug} ${viewport.name} brand title`).toHaveText('Россия 2050');
  await expect(page.locator('.brand-subtitle, .brand-sub').first(), `${target.slug} ${viewport.name} brand subtitle`).toHaveText('демографическая платформа');
  if (viewport.width <= 700) {
    const toggle = page.locator('.menu-toggle');
    await expect(toggle, `${target.slug} ${viewport.name} mobile menu toggle`).toBeVisible();
    await expect(toggle, `${target.slug} ${viewport.name} no menu word`).not.toContainText('Меню');
  }
}

async function captureScreens(page, target, viewport, includeSections) {
  const dir = path.join(screenshotRoot, target.slug);
  ensureDir(dir);
  await page.screenshot({ path: path.join(dir, `${viewport.name}-first.png`), fullPage: false });
  await page.screenshot({ path: path.join(dir, `${viewport.name}-full.png`), fullPage: true });
  if (!includeSections) return;
  const sections = page.locator('main > .wrap.hero, main > section');
  const count = await sections.count();
  const sectionDir = path.join(dir, `${viewport.name}-sections`);
  ensureDir(sectionDir);
  for (let index = 0; index < count; index += 1) {
    const section = sections.nth(index);
    if (!(await section.isVisible())) continue;
    await section.scrollIntoViewIfNeeded();
    await section.evaluate((el) => {
      const header = document.querySelector('.topbar');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const targetTop = el.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo({ top: Math.max(0, targetTop), left: 0, behavior: 'instant' });
      root.style.scrollBehavior = previousScrollBehavior;
    });
    await page.waitForTimeout(80);
    const box = await section.boundingBox();
    if (box && box.width > 80 && box.height > 40) {
      const headerGap = await section.evaluate((el) => {
        const header = document.querySelector('.topbar');
        if (!header) return 999;
        return Math.round(el.getBoundingClientRect().top || 0) - Math.round(header.getBoundingClientRect().bottom || 0);
      });
      if (viewport.width <= 700 && index > 0) {
        expect(headerGap, `${target.slug} ${viewport.name} section ${index + 1} sticky-header offset`).toBeGreaterThanOrEqual(8);
      }
      await section.screenshot({ path: path.join(sectionDir, `section-${String(index + 1).padStart(2, '0')}.png`) });
    }
  }
}

async function captureMobileMenu(page, target, viewport) {
  if (viewport.width > 700) return;
  const toggle = page.locator('.menu-toggle');
  await expect(toggle, `${target.slug} ${viewport.name} menu toggle`).toBeVisible();
  await expect(toggle).not.toContainText('Меню');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#siteNav')).toHaveClass(/is-open/);
  await expect(page.locator('#siteNav a')).toHaveCount(9);
  await expect(page.locator('#siteNav a').first()).toBeVisible();
  const dir = path.join(screenshotRoot, target.slug);
  await page.screenshot({ path: path.join(dir, `${viewport.name}-menu-open.png`), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}

async function scrollTopNow(page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousScrollBehavior = root.style.scrollBehavior;
    const previousBodyScrollBehavior = body.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousScrollBehavior;
    body.style.scrollBehavior = previousBodyScrollBehavior;
  });
  await page.waitForTimeout(100);
}

async function checkSkrDetailMode(page, target, viewport, captureScreenshots) {
  if (target.slug !== '01-skr') return;
  await scrollTopNow(page);
  await page.locator('[data-view-mode="detail"]').click();
  await expect(page.locator('[data-view-mode="detail"]'), `${target.slug} ${viewport.name} detail mode active`).toHaveClass(/active/);
  await page.waitForFunction(() => {
    const visible = el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const sections = [...document.querySelectorAll('[data-detail-section]')];
    return !document.body.classList.contains('view-brief') &&
      sections.length >= 4 &&
      sections.every(visible) &&
      document.querySelectorAll('[data-detail-section] .js-plotly-plot .main-svg').length >= 7;
  }, null, { timeout: 20_000 });
  await scrollTopNow(page);
  await page.waitForTimeout(350);
  await runGeometryGate(page, target, viewport);
  if (!captureScreenshots) return;
  const dir = path.join(screenshotRoot, target.slug);
  ensureDir(dir);
  await page.screenshot({ path: path.join(dir, `${viewport.name}-detail-first.png`), fullPage: false });
  await page.screenshot({ path: path.join(dir, `${viewport.name}-detail-full.png`), fullPage: true });
}

test.beforeAll(() => {
  ensureDir(screenshotRoot);
});

test.describe('responsive QA matrix', () => {
  test.setTimeout(600_000);

  for (const target of pages) {
    test(`${target.title}: core responsive screenshots and geometry`, async ({ page }) => {
      const runtime = await guardRuntime(page);
      for (const viewport of coreViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        await waitForPageReady(page, target);
        await expect(page.locator('body')).toContainText(target.title);
        await expectHeaderContract(page, target, viewport);
        await runGeometryGate(page, target, viewport);
        await captureScreens(page, target, viewport, true);
        await captureMobileMenu(page, target, viewport);
        await checkSkrDetailMode(page, target, viewport, true);
      }
      expect(runtime.external, `${target.slug} external runtime requests`).toEqual([]);
      expect(runtime.consoleErrors, `${target.slug} console errors`).toEqual([]);
    });

    test(`${target.title}: breakpoint sweep`, async ({ page }) => {
      const runtime = await guardRuntime(page);
      for (const viewport of sweepWidths) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(target.path, { waitUntil: 'domcontentloaded' });
        await waitForPageReady(page, target);
        await expectHeaderContract(page, target, viewport);
        await runGeometryGate(page, target, viewport);
        await checkSkrDetailMode(page, target, viewport, false);
      }
      expect(runtime.external, `${target.slug} sweep external runtime requests`).toEqual([]);
      expect(runtime.consoleErrors, `${target.slug} sweep console errors`).toEqual([]);
    });
  }
});
