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
    window.SHOP_API = new Proxy({
      listPromotions: async () => [],
      getDashboardStats: async () => ({ revenue:0, orders_count:0, new_orders_count:0, acquisitions:0, profit:0, products_count:0, recent_orders:[] }),
    }, { get: (target, property) => target[property] || (async () => []) });
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.dispatchEvent(new CustomEvent('auth-change', { detail:{ token:'qa-local', user:{ id:'qa-admin', username:'admin', role:'admin' } } }));
    window.switchTab('shop-discounts');
  })()`);
  await waitFor(win, '#shop-discounts-content .shop-promotions-overview');
  await waitFor(win, '#shop-discounts-content [data-promotion-empty-add]');
  await sleep(300);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-discounts-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const pageScreenshotPath = path.join(outputDir, 'discounts-material-3.png');
  fs.writeFileSync(pageScreenshotPath, (await win.webContents.capturePage()).toPNG());

  const pageMetrics = await win.webContents.executeJavaScript(`(() => ({
    overview: document.querySelectorAll('#shop-discounts-content .shop-promotions-overview').length,
    metrics: document.querySelectorAll('#shop-discounts-content .shop-promotion-metrics article').length,
    emptyCta: Boolean(document.querySelector('#shop-discounts-content [data-promotion-empty-add]')),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);

  await win.webContents.executeJavaScript(`document.querySelector('#shop-discounts-content [data-promotion-empty-add]').click()`);
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

  if (pageMetrics.overview !== 1 || pageMetrics.metrics !== 4 || !pageMetrics.emptyCta) throw new Error(`Pagina de reduceri este incompletă: ${JSON.stringify(pageMetrics)}`);
  if (pageMetrics.horizontalOverflow) throw new Error('Pagina de reduceri are overflow orizontal.');
  if (editorMetrics.sections !== 3 || editorMetrics.fields !== 8 || editorMetrics.toggles !== 3) throw new Error(`Editorul de reduceri este incomplet: ${JSON.stringify(editorMetrics)}`);
  if (editorMetrics.modalHorizontalOverflow) throw new Error('Editorul de reduceri are overflow orizontal.');
  if (editorMetrics.footer.bottom > 1000 || editorMetrics.modal.top < 0) throw new Error(`Editorul nu încape corect în viewport: ${JSON.stringify(editorMetrics)}`);
  if (errors.length) throw new Error(`Erori în consolă: ${errors.join(' | ')}`);

  console.log(JSON.stringify({ pageMetrics, editorMetrics, errors, pageScreenshotPath, editorScreenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
