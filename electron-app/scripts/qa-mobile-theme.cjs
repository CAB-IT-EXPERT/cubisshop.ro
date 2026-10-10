const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const outputDir = path.resolve(__dirname, '..', '..', 'tmp', 'qa-mobile-theme');
const appUrl = process.env.CUBIS_MOBILE_QA_URL || 'http://localhost:8081/';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setInputAndDispatch(window, index, value) {
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelectorAll('input')[${index}];
    if (!input) throw new Error('Lipsește inputul mobil ${index}.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function clickText(window, label) {
  return window.webContents.executeJavaScript(`(() => {
    const leaf = [...document.querySelectorAll('button,[role="button"],div,span')]
      .filter((element) => element.children.length === 0)
      .find((element) => element.textContent.trim() === ${JSON.stringify(label)});
    const target = leaf?.closest('button,[role="button"]') || leaf;
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function clickLastText(window, label) {
  return window.webContents.executeJavaScript(`(() => {
    const matches = [...document.querySelectorAll('button,[role="button"],div,span')]
      .filter((element) => element.children.length === 0 && element.textContent.trim() === ${JSON.stringify(label)});
    const leaf = matches.at(-1);
    const target = leaf?.closest('button,[role="button"]') || leaf;
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function clickAria(window, label) {
  return window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('[aria-label=${JSON.stringify(label)}]');
    if (!target) return false;
    target.click();
    return true;
  })()`);
}

async function capture(window, filename) {
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, filename), image.toPNG());
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const window = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Download the React DevTools')) errors.push(message);
  });

  await window.loadURL(appUrl);
  await wait(1800);
  await window.webContents.executeJavaScript(`(() => {
    const user = { id: 'qa-admin', username: 'qa-admin', display_name: 'Administrator Cubis', role: 'admin', platform_access: 'both', is_active: true };
    const dashboard = {
      revenue: 18420.5, collected_revenue: 14310.5, pending_cash: 4110,
      gross_revenue: 18420.5, returns_count: 2, returns_total: 359,
      orders_count: 37, new_orders_count: 6, acquisitions: 6420,
      cost_of_goods_sold: 8610, profit: 5810.5, products_count: 124,
      daily_stats: [
        { date: '2026-10-04', orders_count: 4, collected_revenue: 1800, pending_cash: 350, gross_revenue: 2150, returns_count: 0, returns_total: 0, revenue: 2150, acquisitions: 720, cost_of_goods_sold: 950, profit: 480 },
        { date: '2026-10-05', orders_count: 7, collected_revenue: 2410, pending_cash: 680, gross_revenue: 3090, returns_count: 1, returns_total: 149, revenue: 2941, acquisitions: 980, cost_of_goods_sold: 1360, profit: 601 },
        { date: '2026-10-06', orders_count: 5, collected_revenue: 2210, pending_cash: 420, gross_revenue: 2630, returns_count: 0, returns_total: 0, revenue: 2630, acquisitions: 810, cost_of_goods_sold: 1220, profit: 600 },
        { date: '2026-10-07', orders_count: 6, collected_revenue: 2600, pending_cash: 790, gross_revenue: 3390, returns_count: 0, returns_total: 0, revenue: 3390, acquisitions: 1040, cost_of_goods_sold: 1580, profit: 770 },
        { date: '2026-10-08', orders_count: 8, collected_revenue: 3010, pending_cash: 1020, gross_revenue: 4030, returns_count: 1, returns_total: 210, revenue: 3820, acquisitions: 1370, cost_of_goods_sold: 1890, profit: 560 },
        { date: '2026-10-09', orders_count: 7, collected_revenue: 2280.5, pending_cash: 850, gross_revenue: 3130.5, returns_count: 0, returns_total: 0, revenue: 3130.5, acquisitions: 1500, cost_of_goods_sold: 1610, profit: 20.5 }
      ],
      range: { period: '7d', start: '2026-10-04', end: '2026-10-10', granularity: 'day' },
      recent_orders: []
    };
    const qaOrder = {
      id: 'qa-order-invoiced', order_number: 'CS-QA-INVOICE', created_at: '2026-10-09 12:00:00',
      customer_type: 'individual', customer_name: 'CLIENT QA', customer_phone: '0700000000', customer_email: 'client@example.test',
      address: 'Strada Test 1', city: 'București', county: 'București', postal_code: '010101',
      shipping_method_name: 'Curier QA', shipping_cost: 20, subtotal: 100, discount_total: 0, total: 120, currency: 'RON',
      payment_method: 'card', payment_status: 'paid', status: 'confirmed', admin_notes: '', customer_notes: '', status_history: [],
      invoice: { id: 'qa-invoice-1', provider: 'smartbill', display_number: 'CUB 1001', status: 'issued', spv_status: 'not_sent', total: 120, currency: 'RON' },
      items: [{ id: 'qa-order-item-1', product_id: 'qa-product-1', product_name: 'Produs QA', product_sku: 'QA-001', quantity: 1, unit_price: 100, line_total: 100 }]
    };
    window.__qaActions = [];
    window.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const action = url.searchParams.get('action') || '';
      window.__qaActions.push(action);
      let payload = {};
      if (action === 'login') payload = { success: true, token: 'qa-token', user };
      else if (action === 'getCurrentUser') payload = user;
      else if (action === 'getDashboardStats') payload = dashboard;
      else if (action === 'listOrdersPage') payload = { orders: [qaOrder], total: 1, page: 1, page_size: 10, total_pages: 1, summary: { orders_count: 1, new_count: 0, processing_count: 1, returns_count: 0, card_count: 1, cash_count: 0 } };
      else if (action === 'getOrder') payload = qaOrder;
      else if (action === 'productManagerBootstrap') payload = { products: [], total: 0, page: 1, page_size: 10, categories: [], brands: [], manufacturers: [], sources: [] };
      else if (action.startsWith('list') || action.startsWith('getNotifications')) payload = [];
      else if (action === 'getSmartBillSettings') payload = {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  })()`);

  await setInputAndDispatch(window, 0, 'qa-admin');
  await setInputAndDispatch(window, 1, 'qa-password');
  if (!(await clickText(window, 'Intra in aplicatie'))) throw new Error('Butonul de autentificare nu a fost găsit.');
  await wait(5200);
  await capture(window, 'dashboard.png');

  const chartPoint = await window.webContents.executeJavaScript(`(() => {
    const svg = [...document.querySelectorAll('svg')].find((element) => / 176$/.test(element.getAttribute('viewBox') || ''));
    if (!svg) return null;
    svg.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = svg.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width * 0.62), y: Math.round(rect.top + rect.height * 0.5) };
  })()`);
  if (chartPoint) {
    window.webContents.sendInputEvent({ type: 'mouseDown', x: chartPoint.x, y: chartPoint.y, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseMove', x: chartPoint.x + 14, y: chartPoint.y, button: 'left' });
    window.webContents.sendInputEvent({ type: 'mouseUp', x: chartPoint.x + 14, y: chartPoint.y, button: 'left', clickCount: 1 });
    await wait(450);
    await capture(window, 'dashboard-tooltip.png');
  }

  const ordersOpened = await clickLastText(window, 'Comenzi');
  await wait(1800);
  if (ordersOpened) await capture(window, 'orders.png');
  const invoicedOrderOpened = ordersOpened && await clickText(window, 'CS-QA-INVOICE');
  await wait(1200);
  if (invoicedOrderOpened) {
    await window.webContents.executeJavaScript(`(() => {
      const text = document.body.innerText;
      window.__qaInvoicedOrderLocks = (text.match(/BLOCATĂ DUPĂ FACTURARE/g) || []).length;
      window.__qaInvoicedOrderEditActions = [...document.querySelectorAll('button,[role="button"]')].filter((node) => node.textContent.trim() === 'Editează').length;
    })()`);
    await capture(window, 'order-invoice-locked.png');
    await window.webContents.executeJavaScript(`(() => {
      const delivery = [...document.querySelectorAll('div,span')].find((node) => node.children.length === 0 && node.textContent.trim() === 'LIVRARE');
      delivery?.scrollIntoView({ block: 'center' });
    })()`);
    await wait(350);
    await capture(window, 'order-invoice-delivery-locked.png');
    await clickAria(window, 'Închide comanda');
    await wait(650);
  }

  const moreOpened = await clickText(window, 'Mai multe');
  await wait(900);
  if (moreOpened) await capture(window, 'more.png');

  const invoicesOpened = moreOpened && await clickText(window, 'Facturi emise');
  await wait(1300);
  if (invoicesOpened) await capture(window, 'invoices.png');

  if (invoicesOpened) {
    await clickText(window, 'Mai multe');
    await wait(550);
  }

  const settingsOpened = await clickText(window, 'Configurator factură');
  await wait(1300);
  if (settingsOpened) await capture(window, 'smartbill-settings.png');

  const productsOpened = await clickText(window, 'Produse');
  await wait(3500);
  if (productsOpened) await capture(window, 'products.png');
  const editorOpened = await clickAria(window, 'Adaugă produs');
  await wait(1000);
  if (editorOpened) await capture(window, 'product-editor.png');

  const metrics = await window.webContents.executeJavaScript(`(() => ({
    title: document.title,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: innerWidth,
    visibleText: document.body.innerText.slice(0, 500),
    actions: window.__qaActions || [],
    invoicedOrderLocks: Number(window.__qaInvoicedOrderLocks || 0),
    invoicedOrderEditActions: Number(window.__qaInvoicedOrderEditActions || 0),
    pages: ${JSON.stringify({})},
  }))()`);
  metrics.pages = { ordersOpened, invoicedOrderOpened, moreOpened, invoicesOpened, settingsOpened, productsOpened, editorOpened };
  process.stdout.write(JSON.stringify({ metrics, errors, outputDir }, null, 2));
  window.destroy();
  app.quit();
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  app.exit(1);
});
