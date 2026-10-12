const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, selector, timeoutMs = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(90);
  }
  throw new Error(`Elementul QA nu a apărut: ${selector}`);
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1500,
    height: 1000,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch')) errors.push(message);
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const promotion = {
      id: 'promotion-test', code: 'CUBIS10', title: 'Test', description: 'Reducere de test pentru clienții Cubis Shop.',
      discount_type: 'percent', discount_value: 10, scope: 'global', product_ids: [], audience: 'all', customer_count: 0,
      is_active: true, auto_apply: true, show_banner: true, valid_from: '2026-10-01 00:00:00', valid_until: '2026-12-31 23:59:59',
      application_count: 3, total_discount_given: 62.45,
    };
    window.SHOP_API = new Proxy({
      listPromotions: async () => [promotion],
      getPromotionStats: async () => ({
        promotion,
        summary: { application_count: 3, total_discount_given: 62.45, average_discount: 20.82, orders_total: 624.50 },
        applications: [
          { id:'order-1', order_number:'CS-20261012-001', customer_display_name:'Client Test Cubis', created_at:'2026-10-12 13:37:00', discount_total:16.25, total:146.25, is_counted:true },
          { id:'order-2', order_number:'CS-20261011-002', customer_display_name:'Maria Ionescu', created_at:'2026-10-11 10:15:00', discount_total:12.50, total:112.50, is_counted:false },
        ],
      }),
      getDashboardStats: async () => ({ revenue:0, orders_count:0, new_orders_count:0, acquisitions:0, profit:0, products_count:0, recent_orders:[] }),
    }, { get: (target, property) => target[property] || (async () => []) });
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.dispatchEvent(new CustomEvent('auth-change', { detail:{ token:'qa-local', user:{ id:'qa-admin', username:'admin', role:'admin' } } }));
    window.switchTab('shop-discounts');
  })()`);
  await waitFor(win, '#shop-discounts-content .shop-promotions-overview');
  await waitFor(win, '#shop-discounts-content [data-promotion-open]');
  await sleep(300);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-discounts-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const pageScreenshotPath = path.join(outputDir, 'discounts-material-3.png');
  fs.writeFileSync(pageScreenshotPath, (await win.webContents.capturePage()).toPNG());

  const pageMetrics = await win.webContents.executeJavaScript(`(() => ({
    overview: document.querySelectorAll('#shop-discounts-content .shop-promotions-overview').length,
    metrics: document.querySelectorAll('#shop-discounts-content .shop-promotion-metrics article').length,
    cards: document.querySelectorAll('#shop-discounts-content [data-promotion-open]').length,
    animatedHeroIcon: getComputedStyle(document.querySelector('#tab-shop-discounts .shop-discount-hero-badge')).animationName,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);

  await win.webContents.executeJavaScript(`document.querySelector('#shop-discounts-content [data-promotion-open]').click()`);
  await waitFor(win, '#shop-promotion-stats-modal:not([hidden]) .shop-promotion-stats-facts');
  await sleep(260);
  const statsScreenshotPath = path.join(outputDir, 'discounts-stats-material-3.png');
  fs.writeFileSync(statsScreenshotPath, (await win.webContents.capturePage()).toPNG());
  const statsMetrics = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('#shop-promotion-stats-modal .shop-promotion-stats-modal');
    const fact = document.querySelector('#shop-promotion-stats-modal .shop-promotion-stats-facts article');
    const application = document.querySelector('#shop-promotion-stats-modal .shop-promotion-application');
    const brightness = (node) => (getComputedStyle(node).backgroundColor.match(/[\\d.]+/g) || []).slice(0, 3).map(Number).reduce((sum, value) => sum + value, 0);
    return {
      metrics: document.querySelectorAll('#shop-promotion-stats-modal .shop-promotion-stats-metrics article').length,
      facts: document.querySelectorAll('#shop-promotion-stats-modal .shop-promotion-stats-facts article').length,
      applications: document.querySelectorAll('#shop-promotion-stats-modal .shop-promotion-application').length,
      lightFact: brightness(fact) > 600,
      lightApplication: brightness(application) > 600,
      horizontalOverflow: modal.scrollWidth > modal.clientWidth,
      insideViewport: modal.getBoundingClientRect().top >= 0 && modal.getBoundingClientRect().bottom <= innerHeight,
    };
  })()`);
  await win.webContents.executeJavaScript(`document.querySelector('#shop-promotion-stats-modal [data-commerce-close="shop-promotion-stats-modal"]').click()`);
  await sleep(220);
  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-add="shop-discounts-content"]').click()`);
  await waitFor(win, '#shop-promotion-modal:not([hidden])');
  await sleep(260);
  const editorScreenshotPath = path.join(outputDir, 'discounts-editor-material-3.png');
  fs.writeFileSync(editorScreenshotPath, (await win.webContents.capturePage()).toPNG());

  const editorMetrics = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('#shop-promotion-modal .shop-promotion-modal');
    const body = document.querySelector('#shop-promotion-modal .shop-promotion-editor-body');
    const footer = document.querySelector('#shop-promotion-modal .shop-promotion-editor-footer');
    const rect = (node) => node ? Object.fromEntries(['top','bottom','left','right','height'].map((key) => [key, Math.round(node.getBoundingClientRect()[key])])) : null;
    return {
      sections: document.querySelectorAll('#shop-promotion-modal .shop-promotion-editor-section').length,
      fields: ['shop-promotion-code','shop-promotion-name','shop-promotion-type','shop-promotion-value','shop-promotion-audience','shop-promotion-scope','shop-promotion-from','shop-promotion-until'].filter((id) => document.getElementById(id)).length,
      toggles: document.querySelectorAll('#shop-promotion-modal .shop-promotion-editor-toggles input').length,
      modal: rect(modal),
      footer: rect(footer),
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      modalHorizontalOverflow: modal.scrollWidth > modal.clientWidth,
    };
  })()`);

  if (pageMetrics.overview !== 1 || pageMetrics.metrics !== 4 || pageMetrics.cards !== 1 || pageMetrics.animatedHeroIcon === 'none') throw new Error(`Pagina de reduceri este incompletă: ${JSON.stringify(pageMetrics)}`);
  if (pageMetrics.horizontalOverflow) throw new Error('Pagina de reduceri are overflow orizontal.');
  if (statsMetrics.metrics !== 4 || statsMetrics.facts !== 3 || statsMetrics.applications !== 2 || !statsMetrics.lightFact || !statsMetrics.lightApplication) throw new Error(`Rezultatele campaniei sunt incomplete sau întunecate: ${JSON.stringify(statsMetrics)}`);
  if (statsMetrics.horizontalOverflow || !statsMetrics.insideViewport) throw new Error(`Modalul de rezultate nu încape corect: ${JSON.stringify(statsMetrics)}`);
  if (editorMetrics.sections !== 3 || editorMetrics.fields !== 8 || editorMetrics.toggles !== 3) throw new Error(`Editorul de reduceri este incomplet: ${JSON.stringify(editorMetrics)}`);
  if (editorMetrics.modalHorizontalOverflow) throw new Error('Editorul de reduceri are overflow orizontal.');
  if (editorMetrics.footer.bottom > 1000 || editorMetrics.modal.top < 0) throw new Error(`Editorul nu încape corect în viewport: ${JSON.stringify(editorMetrics)}`);
  if (errors.length) throw new Error(`Erori în consolă: ${errors.join(' | ')}`);

  console.log(JSON.stringify({ pageMetrics, statsMetrics, editorMetrics, errors, pageScreenshotPath, statsScreenshotPath, editorScreenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
