const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
app.commandLine.appendSwitch('force-device-scale-factor', '1');

async function waitForSelector(win, selector, timeout = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await sleep(100);
  }
  throw new Error(`Elementul QA nu a apărut: ${selector}`);
}

app.whenReady().then(async () => {
  const rendererErrors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch') && !message.includes('getSmartBillSettings is not a function')) rendererErrors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setZoomFactor(0.5);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22240%22%3E%3Crect width=%22240%22 height=%22240%22 rx=%2240%22 fill=%22%23eaf3ff%22/%3E%3Cpath d=%22M58 126h124M82 92h76M93 160h54%22 stroke=%22%230b6bcf%22 stroke-width=%2216%22 stroke-linecap=%22round%22/%3E%3C/svg%3E';
    const summary = {
      id:'inv-qa-1', provider:'smartbill', display_number:'CSH 1042', status:'unpaid', theme:'smartbill',
      order_number:'CS-20261011-001', issue_date:'2026-10-11', buyer_name:'Atelier Urban SRL', buyer_cui:'RO45881230',
      customer_email:'contabilitate@atelierurban.ro', email_sent_at:null, total:1248.90, currency:'RON', can_delete:false,
    };
    const detail = {
      ...summary,
      issued_by:'Administrator Cubis',
      payload:{
        currency:'RON', issue_date:'2026-10-11', due_date:'2026-10-25', notes:'Factura a fost emisă și numerotată direct în SmartBill.',
        seller:{ name:'Cubis Shop România', cui:'RO12345678', registration_number:'J40/1000/2024', address:'Strada Comerțului 10', city:'București', county:'București', postal_code:'010101', email:'office@cubisshop.ro', phone:'0700 000 000' },
        buyer:{ name:'Atelier Urban SRL', cui:'RO45881230', registration_number:'J23/782/2021', address:'Bulevardul Unirii 24', city:'București', county:'București', postal_code:'030823', email:'contabilitate@atelierurban.ro', phone:'0722 123 456' },
        payment:{ method:'Transfer bancar' },
        items:[
          { product_id:'p1', name:'Pachet demonstrativ Cubis', sku:'CUBIS-DEMO-01', quantity:2, unit:'buc.', unit_price:480, vat_rate:19, discount_percent:10, image_path:image },
          { product_id:null, name:'Transport și manipulare', sku:'TRANSPORT', quantity:1, unit:'serv.', unit_price:120.7563, vat_rate:19, discount_percent:0 },
        ],
      },
    };
    window.SHOP_API = {
      listInvoices: async () => [summary],
      getInvoice: async () => detail,
      getInvoicePublicLink: async () => ({ url:'https://example.invalid/invoice.pdf' }),
      getDashboardStats: async () => ({ revenue:0, orders_count:0, new_orders_count:0, acquisitions:0, profit:0, products_count:0, recent_orders:[] }),
      getSmartBillSettings: async () => ({ read_enabled:true, issuing_enabled:true, issuing_ready:true, warehouses:[], series:[], capabilities:[] }),
      listOrders: async () => [], listProducts: async () => [], listInventory: async () => [], listInventoryMovements: async () => [],
      listCategories: async () => [], listBrands: async () => [], listManufacturers: async () => [], listProductSources: async () => [],
      listShippingMethods: async () => [], listCustomers: async () => [], listNewsletterSubscribers: async () => [], listDiscounts: async () => [],
      getPaymentSettings: async () => ({ card_enabled:true, cash_on_delivery_enabled:true }),
    };
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn:() => true, getToken:() => 'qa-local' };
    window.selectAppModule('shop');
    window.dispatchEvent(new CustomEvent('auth-change', { detail:{ token:'qa-local', user:{ id:'qa-admin', username:'admin', role:'admin' } } }));
  })()`);

  await sleep(450);
  await win.webContents.executeJavaScript(`window.switchTab('shop-invoices')`);
  await waitForSelector(win, '#shop-invoices-content [data-invoice-open]');
  await win.webContents.executeJavaScript(`document.getElementById('business-toast-stack').replaceChildren()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-shop-invoices');
  fs.mkdirSync(outputDir, { recursive: true });
  const listPath = path.join(outputDir, 'invoice-list.png');
  fs.writeFileSync(listPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('#shop-invoices-content [data-invoice-open]').click()`);
  await waitForSelector(win, '#shop-invoice-detail-modal:not([hidden]) .shop-invoice-detail-hero');
  await sleep(220);
  await win.webContents.executeJavaScript(`document.getElementById('business-toast-stack').replaceChildren()`);
  const detailPath = path.join(outputDir, 'invoice-detail.png');
  fs.writeFileSync(detailPath, (await win.webContents.capturePage()).toPNG());

  const detailMetrics = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('#shop-invoice-detail-modal .shop-invoice-detail-modal');
    const content = document.getElementById('shop-invoice-detail-content');
    const footer = modal.querySelector(':scope > footer');
    return {
      modalBottom:Math.round(modal.getBoundingClientRect().bottom),
      viewportHeight:window.innerHeight,
      contentClientHeight:content.clientHeight,
      contentScrollHeight:content.scrollHeight,
      footerBottom:Math.round(footer.getBoundingClientRect().bottom),
      horizontalOverflow:modal.scrollWidth > modal.clientWidth,
      darkPanels:[...modal.querySelectorAll('section, article')].filter(node => getComputedStyle(node).backgroundColor === 'rgb(30, 28, 33)').length,
      actionCount:footer.querySelectorAll('button:not([hidden])').length,
    };
  })()`);

  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#shop-invoice-detail-modal [data-commerce-close]').click();
    const modal = document.getElementById('shop-invoice-issue-modal');
    document.getElementById('shop-invoice-issue-order').textContent = 'CS-20261011-001';
    document.getElementById('shop-invoice-issue-client').textContent = 'Atelier Urban SRL';
    document.getElementById('shop-invoice-issue-total').textContent = '1.248,90 RON';
    document.getElementById('shop-invoice-issue-email').textContent = 'contabilitate@atelierurban.ro';
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
  })()`);
  await sleep(220);
  await win.webContents.executeJavaScript(`document.getElementById('business-toast-stack').replaceChildren()`);
  const issuePath = path.join(outputDir, 'invoice-issue.png');
  fs.writeFileSync(issuePath, (await win.webContents.capturePage()).toPNG());

  const result = { rendererErrors, detailMetrics, screenshots:{ listPath, detailPath, issuePath } };
  console.log(JSON.stringify(result, null, 2));
  if (rendererErrors.length) throw new Error(`Erori în renderer: ${rendererErrors.join(' | ')}`);
  if (detailMetrics.horizontalOverflow) throw new Error('Fișa facturii are overflow orizontal.');
  if (detailMetrics.footerBottom > detailMetrics.viewportHeight) throw new Error('Acțiunile fișei ies din viewport.');
  if (detailMetrics.darkPanels) throw new Error('Au rămas panouri întunecate în fișa luminoasă.');
  if (detailMetrics.actionCount < 3) throw new Error('Lipsesc acțiunile principale din fișa facturii.');

  await win.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
