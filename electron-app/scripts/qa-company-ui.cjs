const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, selector, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(80);
  }
  throw new Error(`Elementul QA nu a apărut: ${selector}`);
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch')) errors.push(message);
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const company = {
      id:'company-qa', legal_name:'G-Trots România SRL', trade_name:'G-Trots România', cui:'', registration_number:'J40/1234/2026',
      address:'Strada Exemplu 10', city:'București', county:'București', postal_code:'010101', country:'România',
      physical_address:'București–Ilfov', email:'office@example.ro', phone:'0712 345 678', website:'https://cubisshop.ro',
      bank_name:'Banca Transilvania', iban:'', share_capital:'200 lei', stamp_url:null, is_default:true, vat_payer:false, vat_rate:19,
    };
    const methods = {
      listCompanySettings: async () => [company],
      createCompanySettings: async (payload) => ({ ...company, ...payload }),
      updateCompanySettings: async (_id, payload) => ({ ...company, ...payload }),
      deleteCompanySettings: async () => ({ success:true }),
      getDashboardStats: async () => ({ revenue:0, orders_count:0, new_orders_count:0, acquisitions:0, profit:0, products_count:0, recent_orders:[] }),
    };
    window.SHOP_API = new Proxy(methods, { get: (target, property) => target[property] || (async () => []) });
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.dispatchEvent(new CustomEvent('auth-change', { detail: { token:'qa-local', user:{ id:'qa-admin', username:'admin', role:'admin' } } }));
    window.switchTab('shop-company');
  })()`);
  await waitFor(win, '#shop-company-content .shop-company-card');
  await sleep(350);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-company-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'company-material-3.png');
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  const metrics = await win.webContents.executeJavaScript(`(() => ({
    title: document.querySelector('#tab-shop-company .shop-commerce-title h1')?.textContent.trim(),
    metrics: document.querySelectorAll('#shop-company-content .shop-company-metric').length,
    profileMetric: document.querySelector('#shop-company-content .shop-company-metric.attention strong, #shop-company-content .shop-company-metric.complete strong')?.textContent.trim(),
    cards: document.querySelectorAll('#shop-company-content .shop-company-card').length,
    heroHasSvg: Boolean(document.querySelector('#tab-shop-company .shop-commerce-hero-symbol svg')),
    receiptSectionPresent: Boolean(document.querySelector('#shop-company-content .shop-receipt-locations')),
    receiptModalPresent: Boolean(document.getElementById('shop-receipt-location-modal')),
    bodyHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pageHeight: Math.round(document.querySelector('#tab-shop-company .shop-commerce-page')?.getBoundingClientRect().height || 0),
  }))()`);

  await win.webContents.executeJavaScript(`document.querySelector('#shop-company-content [data-company-open]').click()`);
  await waitFor(win, '#shop-company-modal:not([hidden])');
  await sleep(250);
  const editorScreenshotPath = path.join(outputDir, 'company-editor-material-3.png');
  fs.writeFileSync(editorScreenshotPath, (await win.webContents.capturePage()).toPNG());
  const editorOpened = await win.webContents.executeJavaScript(`!document.getElementById('shop-company-modal').hidden`);
  console.log(JSON.stringify({ ...metrics, editorOpened, errors, screenshotPath, editorScreenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
