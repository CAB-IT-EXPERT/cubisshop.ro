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
    width: 1520,
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
    const settings = {
      read_enabled:true,
      issuing_enabled:true,
      issuing_ready:true,
      issuing_block_reason:'',
      invoice_series:'CS',
      due_days:7,
      default_notes:'Vă mulțumim pentru comandă.',
      archive_pdf_enabled:true,
      email_enabled:true,
      auto_sync_interval_seconds:300,
      series_last_synced_at:'acum 2 minute',
      warehouse_last_synced_at:'acum 2 minute',
      warehouses:[{ id:'wh-1', name:'Gestiune principală' }, { id:'wh-2', name:'Depozit secundar' }],
      series:[{ name:'CS', next_number:'1042' }, { name:'ONLINE', next_number:'288' }],
      capabilities:{
        catalog_read:{ status:'disponibil', detail:'Produsele și stocurile pot fi citite.' },
        invoice_issue:{ status:'disponibil', detail:'Emiterea fiscală este pregătită.' },
      },
    };
    window.SHOP_API = new Proxy({
      getSmartBillSettings: async () => settings,
      syncSmartBillReferences: async () => settings,
      updateSmartBillSettings: async (payload) => ({ ...settings, ...payload }),
      getDashboardStats: async () => ({ revenue:0, orders_count:0, new_orders_count:0, acquisitions:0, profit:0, products_count:0, recent_orders:[] }),
    }, { get: (target, property) => target[property] || (async () => []) });
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.dispatchEvent(new CustomEvent('auth-change', { detail:{ token:'qa-local', user:{ id:'qa-admin', username:'admin', role:'admin' } } }));
    window.switchTab('shop-invoice-configurator');
  })()`);
  await waitFor(win, '#shop-invoice-configurator-content .shop-smartbill-config-head');
  await sleep(350);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-smartbill-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'smartbill-material-3.png');
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`(() => {
    const page = document.querySelector('#tab-shop-invoice-configurator .shop-invoice-configurator-page');
    page.scrollTop = page.scrollHeight;
  })()`);
  await sleep(180);
  const bottomScreenshotPath = path.join(outputDir, 'smartbill-material-3-settings.png');
  fs.writeFileSync(bottomScreenshotPath, (await win.webContents.capturePage()).toPNG());

  const metrics = await win.webContents.executeJavaScript(`(() => ({
    logoCount: document.querySelectorAll('#tab-shop-invoice-configurator img[src$="smartbill-logo.png"]').length,
    overviewCards: document.querySelectorAll('#shop-invoice-configurator-content .shop-smartbill-overview article').length,
    seriesCards: document.querySelectorAll('#shop-invoice-configurator-content [data-smartbill-series]').length,
    capabilityCards: document.querySelectorAll('#shop-invoice-configurator-content .shop-smartbill-capabilities article').length,
    issuingChecked: document.getElementById('shop-smartbill-issuing')?.getAttribute('aria-checked'),
    horizontalOverflow: document.querySelector('#tab-shop-invoice-configurator .shop-invoice-configurator-page').scrollWidth > document.querySelector('#tab-shop-invoice-configurator .shop-invoice-configurator-page').clientWidth,
  }))()`);

  if (metrics.logoCount < 2) throw new Error('Logo-ul SmartBill nu apare în hero și în panoul de configurare.');
  if (metrics.overviewCards !== 3 || metrics.seriesCards !== 2) throw new Error(`Structura Material 3 este incompletă: ${JSON.stringify(metrics)}`);
  if (metrics.horizontalOverflow) throw new Error('Pagina SmartBill are overflow orizontal.');
  if (errors.length) throw new Error(`Erori în consolă: ${errors.join(' | ')}`);

  console.log(JSON.stringify({ ...metrics, errors, screenshotPath, bottomScreenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
