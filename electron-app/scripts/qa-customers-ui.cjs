const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false, partition: `qa-customers-${Date.now()}` },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const orders = Array.from({ length: 7 }, (_, index) => ({
      id: 'order-' + (index + 1), order_number: 'CS-2026-' + String(index + 1).padStart(4, '0'),
      created_at: '2026-10-' + String(10 - index).padStart(2, '0') + ' 12:30:00',
      status: index < 2 ? 'new' : index < 5 ? 'completed' : 'processing', total: 249 + index * 38,
    }));
    const names = ['Andrei Popescu', 'Maria Ionescu', 'Darius Stoica', 'Ioana Marinescu', 'Radu Stan', 'Elena Dumitru', 'Mihai Georgescu', 'Sofia Matei', 'Victor Enache', 'Ana Preda', 'Paul Rusu', 'Bianca Pavel'];
    const customers = names.map((full_name, index) => ({
      id: 'customer-' + (index + 1), full_name, email: index === 0 ? 'alexie.popescu2007@gmail.com' : full_name.toLocaleLowerCase('ro').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/ /g, '.') + '@example.ro',
      phone: index % 3 ? '07' + String(22000111 + index) : '', is_active: index !== 3 && index !== 9,
      orders_count: index === 0 ? orders.length : index % 5, orders_total: index === 0 ? 2846 : index * 324.5,
      last_order_at: index % 4 ? '2026-10-08 14:20:00' : null, created_at: '2026-02-14 09:20:00', last_login_at: '2026-10-10 18:42:00',
    }));
    window.SHOP_API = {
      listCustomers: async () => customers,
      getCustomer: async id => ({ ...customers.find(customer => customer.id === id), orders: id === 'customer-1' ? orders : id === 'customer-10' ? [] : orders.slice(0, 2) }),
      updateCustomerStatus: async (id, next) => { const customer = customers.find(item => item.id === id); if (customer) customer.is_active = next; return { success: true }; },
      getDashboardStats: async () => ({ revenue: 0, orders_count: 0, new_orders_count: 0, acquisitions: 0, profit: 0, products_count: 0, recent_orders: [] }),
    };
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local' };
    window.selectAppModule('shop');
    window.switchTab('shop-customers');
  })()`);
  await wait(750);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-customers');
  fs.mkdirSync(outputDir, { recursive: true });
  const desktopPath = path.join(outputDir, 'customers-desktop.png');
  fs.writeFileSync(desktopPath, (await win.webContents.capturePage()).toPNG());
  const desktop = await win.webContents.executeJavaScript(`(() => {
    const content = document.getElementById('shop-customers-content');
    const cards = [...document.querySelectorAll('.shop-customer-card')];
    return {
      metrics: document.querySelectorAll('.shop-customer-metrics > article').length,
      cards: cards.length,
      filters: document.querySelectorAll('.shop-customer-filters button').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      contentWidth: Math.round(content.getBoundingClientRect().width),
      cardsInsideViewport: cards.every(card => card.getBoundingClientRect().right <= document.documentElement.clientWidth + 1),
    };
  })()`);

  await win.webContents.executeJavaScript(`document.querySelector('.shop-customer-card').click()`);
  await wait(300);
  const detailPath = path.join(outputDir, 'customer-detail-desktop.png');
  fs.writeFileSync(detailPath, (await win.webContents.capturePage()).toPNG());
  const detail = await win.webContents.executeJavaScript(`(() => ({
    visible: !document.getElementById('shop-customer-modal').hidden,
    contacts: document.querySelectorAll('.shop-customer-contact-grid article').length,
    orderCards: document.querySelectorAll('.shop-customer-order').length,
    fullEmail: document.querySelector('.shop-customer-contact-grid article[data-tone="mail"] strong')?.textContent === 'alexie.popescu2007@gmail.com',
    emailFits: (() => { const node = document.querySelector('.shop-customer-contact-grid article[data-tone="mail"] strong'); return !!node && node.scrollWidth <= node.clientWidth + 1; })(),
    modalHeight: Math.round(document.querySelector('.shop-customer-modal').getBoundingClientRect().height),
    viewportHeight: innerHeight,
  }))()`);

  await win.webContents.executeJavaScript(`document.getElementById('shop-customer-status').click()`);
  await wait(180);
  const confirmPath = path.join(outputDir, 'customer-status-confirm.png');
  fs.writeFileSync(confirmPath, (await win.webContents.capturePage()).toPNG());
  const confirmVisible = await win.webContents.executeJavaScript(`!document.getElementById('shop-customer-status-dialog').hidden`);
  await win.webContents.executeJavaScript(`document.getElementById('shop-customer-status-cancel').click(); document.querySelector('[data-commerce-close="shop-customer-modal"]').click()`);

  await win.webContents.executeJavaScript(`document.querySelector('[data-customer-open="customer-10"]').click()`);
  await wait(260);
  const emptyOrdersPath = path.join(outputDir, 'customer-empty-orders.png');
  fs.writeFileSync(emptyOrdersPath, (await win.webContents.capturePage()).toPNG());
  const emptyOrders = await win.webContents.executeJavaScript(`(() => ({
    visible: !!document.querySelector('.shop-customer-orders-empty'),
    lightText: getComputedStyle(document.querySelector('.shop-customer-orders-empty strong')).color !== 'rgb(0, 0, 0)',
    text: document.querySelector('.shop-customer-orders-empty strong')?.textContent || '',
  }))()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-close="shop-customer-modal"]').click()`);

  win.setSize(390, 844);
  await wait(350);
  const mobilePath = path.join(outputDir, 'customers-narrow.png');
  fs.writeFileSync(mobilePath, (await win.webContents.capturePage()).toPNG());
  const narrow = await win.webContents.executeJavaScript(`(() => {
    const cards = [...document.querySelectorAll('.shop-customer-card')];
    const viewportWidth = document.documentElement.clientWidth;
    return {
      horizontalOverflow: document.documentElement.scrollWidth > viewportWidth,
      metricsColumns: getComputedStyle(document.querySelector('.shop-customer-metrics')).gridTemplateColumns,
      cardsInsideViewport: cards.every(card => { const rect = card.getBoundingClientRect(); return rect.left >= -1 && rect.right <= viewportWidth + 1; }),
    };
  })()`);

  const passed = desktop.metrics === 4 && desktop.cards === 10 && desktop.filters === 3
    && !desktop.horizontalOverflow && desktop.cardsInsideViewport
    && detail.visible && detail.contacts === 4 && detail.orderCards === 5 && detail.fullEmail && detail.emailFits && detail.modalHeight <= detail.viewportHeight
    && confirmVisible && emptyOrders.visible && emptyOrders.text === 'Nicio comandă încă'
    && !narrow.horizontalOverflow && narrow.cardsInsideViewport && errors.length === 0;
  console.log(JSON.stringify({ passed, desktop, detail, confirmVisible, emptyOrders, narrow, errors, screenshots: { desktopPath, detailPath, confirmPath, emptyOrdersPath, mobilePath } }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
