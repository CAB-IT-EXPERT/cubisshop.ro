const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 980,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
      partition: `qa-orders-${Date.now()}`,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setZoomFactor(1);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const image = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22%3E%3Crect width=%22160%22 height=%22160%22 rx=%2232%22 fill=%22%23ff8a00%22/%3E%3Ctext x=%2280%22 y=%2298%22 text-anchor=%22middle%22 font-size=%2260%22 font-family=%22Arial%22 font-weight=%22700%22 fill=%22white%22%3EGT%3C/text%3E%3C/svg%3E';
    const base = {
      id:'order-1', order_number:'CS-20261011-001', created_at:'2026-10-11 12:52:07',
      customer_type:'individual', customer_name:'Client Test Cubis', customer_phone:'0700000001', customer_email:'client@example.com',
      address:'Strada Victoriei 24, bloc B', city:'București', county:'București', postal_code:'010101',
      shipping_method_name:'Curier rapid', shipping_cost:18, subtotal:245.9, total:263.9,
      payment_method:'card', payment_status:'paid', status:'confirmed', admin_notes:'Prioritate normală.', customer_notes:'Livrare după ora 14:00.',
      status_history:[{ to_status:'new', created_at:'2026-10-11 12:52:07' }, { to_status:'confirmed', created_at:'2026-10-11 13:04:00' }],
      invoice:null, shipping_note:null, return_invoice:null, vat_payer:false,
      items:[
        { id:'item-1', product_id:'product-1', product_name:'Cască urbană Cubis Air', product_sku:'CUBIS-AIR-01', quantity:1, unit_price:189.9, line_total:189.9, image_url:image, unit_of_measure:'buc' },
        { id:'item-2', product_id:'product-2', product_name:'Set lumini LED', product_sku:'LED-SAFE-02', quantity:2, unit_price:28, line_total:56, image_url:'', unit_of_measure:'buc' }
      ]
    };
    const statuses = ['new','confirmed','processing','shipped','completed','cancelled','return_confirmed','refunded'];
    const orders = Array.from({ length: 12 }, (_, index) => ({
      ...base,
      id:'order-' + (index + 1),
      order_number:'CS-20261011-' + String(index + 1).padStart(3, '0'),
      created_at:'2026-10-' + String(11 - (index % 5)).padStart(2, '0') + ' ' + String(12 + (index % 7)).padStart(2, '0') + ':32:07',
      customer_name:index % 2 ? 'Atelier Urban SRL' : 'Client Test Cubis',
      customer_type:index % 2 ? 'company' : 'individual',
      company_name:index % 2 ? 'Atelier Urban SRL' : '', company_cui:index % 2 ? 'RO45881230' : '',
      payment_method:index % 3 === 0 ? 'cash_on_delivery' : 'card',
      payment_status:index % 4 === 0 ? 'pending' : (index % 5 === 0 ? 'failed' : 'paid'),
      status:statuses[index % statuses.length],
      total:263.9 + index * 17.5,
      invoice:index % 4 === 2 ? { id:'invoice-' + index, provider:'smartbill', display_number:'CUB ' + (1200 + index), status:'issued', spv_status:'not_sent', total:263.9 + index * 17.5, currency:'RON' } : null,
      return_invoice:index === 6 ? { id:'return-1', invoice_type:'return', display_number:'CUBR 12', total:-87.5, currency:'RON' } : null
    }));
    window.SHOP_API = {
      listOrders: async () => orders,
      getOrder: async id => orders.find(order => order.id === id) || base,
      updateOrder: async (id, payload) => ({ ...(orders.find(order => order.id === id) || base), ...payload }),
      listProducts: async () => [],
      getProduct: async () => null
    };
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.switchTab('shop-orders');
  })()`);
  await wait(750);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-orders-modern');
  fs.mkdirSync(outputDir, { recursive: true });
  const pagePath = path.join(outputDir, 'orders-desktop.png');
  fs.writeFileSync(pagePath, (await win.webContents.capturePage()).toPNG());
  const pageLayout = await win.webContents.executeJavaScript(`(() => {
    const hero = document.querySelector('#tab-shop-orders .shop-commerce-hero');
    const table = document.querySelector('#tab-shop-orders .shop-commerce-table-wrap');
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      titleIcon: Boolean(document.querySelector('#tab-shop-orders .shop-commerce-title-icon svg')),
      kpis: document.querySelectorAll('#tab-shop-orders .shop-order-kpi').length,
      filterFields: document.querySelectorAll('#tab-shop-orders .shop-order-filter-grid :is(input, select)').length,
      rows: document.querySelectorAll('#tab-shop-orders [data-order-open]').length,
      heroWithinViewport: hero && hero.getBoundingClientRect().right <= innerWidth,
      tableWithinViewport: table && table.getBoundingClientRect().right <= innerWidth,
      searchBackgroundRepeat: getComputedStyle(document.getElementById('shop-orders-search')).backgroundRepeat
    };
  })()`);

  await win.webContents.executeJavaScript(`document.querySelectorAll('#shop-orders-content [data-order-open]')[2].click()`);
  await wait(350);
  const modalPath = path.join(outputDir, 'order-modal-top.png');
  fs.writeFileSync(modalPath, (await win.webContents.capturePage()).toPNG());
  const modalLayout = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('#shop-order-modal .shop-commerce-modal');
    const scroll = document.getElementById('shop-order-details');
    const rect = modal.getBoundingClientRect();
    return {
      visible: !document.getElementById('shop-order-modal').hidden,
      withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      width: Math.round(rect.width), height: Math.round(rect.height),
      hasHeaderIcon: Boolean(modal.querySelector('.shop-order-modal-header-icon svg')),
      hasOverview: Boolean(scroll.querySelector('.shop-order-overview')),
      overviewMetrics: scroll.querySelectorAll('.shop-order-overview dl > div').length,
      summaryCards: scroll.querySelectorAll('.shop-order-summary-card').length,
      summaryCardIcons: scroll.querySelectorAll('.shop-order-card-title > span svg').length,
      lockedNotices: scroll.querySelectorAll('.shop-order-customer-locked').length,
      footerButtons: modal.querySelectorAll('.shop-order-modal-footer > button').length,
      scrollable: scroll.scrollHeight > scroll.clientHeight
    };
  })()`);

  await win.webContents.executeJavaScript(`(() => { const scroll = document.getElementById('shop-order-details'); const timeline = scroll.querySelector('.shop-order-timeline'); scroll.scrollTop = Math.max(0, timeline.offsetTop - 18); })()`);
  await wait(180);
  const workflowPath = path.join(outputDir, 'order-modal-workflow.png');
  fs.writeFileSync(workflowPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(() => { const scroll = document.getElementById('shop-order-details'); scroll.scrollTop = scroll.scrollHeight; })()`);
  await wait(180);
  const bottomPath = path.join(outputDir, 'order-modal-bottom.png');
  fs.writeFileSync(bottomPath, (await win.webContents.capturePage()).toPNG());

  const passed = !pageLayout.horizontalOverflow
    && pageLayout.titleIcon
    && pageLayout.kpis === 6
    && pageLayout.filterFields === 4
    && pageLayout.rows === 10
    && pageLayout.heroWithinViewport
    && pageLayout.tableWithinViewport
    && pageLayout.searchBackgroundRepeat === 'no-repeat'
    && modalLayout.visible
    && modalLayout.withinViewport
    && modalLayout.hasHeaderIcon
    && modalLayout.hasOverview
    && modalLayout.overviewMetrics === 4
    && modalLayout.summaryCards === 2
    && modalLayout.summaryCardIcons === 2
    && modalLayout.lockedNotices === 2
    && modalLayout.footerButtons === 2
    && modalLayout.scrollable
    && errors.length === 0;
  console.log(JSON.stringify({ passed, pageLayout, modalLayout, errors, screenshots: { pagePath, modalPath, workflowPath, bottomPath } }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
