const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
      partition: `qa-shipping-${Date.now()}`,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('app-update') && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const methods = [
      { id:'shipping-1', name:'Curier rapid național', description:'Livrare la adresă prin curier, oriunde în România.', cost:24.9, return_cost:19.9, free_above:350, eta_label:'1–2 zile lucrătoare', show_free_shipping_banner:true, is_active:true },
      { id:'shipping-2', name:'Ridicare din showroom', description:'Comanda este pregătită și poate fi ridicată personal.', cost:0, return_cost:0, free_above:null, eta_label:'În aceeași zi', show_free_shipping_banner:false, is_active:true }
    ];
    window.SHOP_API = {
      listShippingMethods: async () => methods,
      updateShippingMethod: async (id, payload) => ({ id, ...payload }),
      createShippingMethod: async payload => ({ id:'shipping-3', ...payload }),
      deleteShippingMethod: async () => ({ success:true })
    };
    window.selectAppModule('shop');
    window.switchTab('shop-shipping');
  })()`);
  await wait(650);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-shipping');
  fs.mkdirSync(outputDir, { recursive: true });
  const pagePath = path.join(outputDir, 'shipping-desktop.png');
  fs.writeFileSync(pagePath, (await win.webContents.capturePage()).toPNG());
  const pageLayout = await win.webContents.executeJavaScript(`(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cards: document.querySelectorAll('.shop-shipping-row').length,
    overview: Boolean(document.querySelector('.shop-shipping-overview')),
    titleIcon: Boolean(document.querySelector('#tab-shop-shipping .shop-commerce-title-icon'))
  }))()`);

  await win.webContents.executeJavaScript(`document.querySelector('[data-shipping-edit="shipping-1"]').click()`);
  await wait(300);
  const modalPath = path.join(outputDir, 'shipping-modal-desktop.png');
  fs.writeFileSync(modalPath, (await win.webContents.capturePage()).toPNG());
  const modalLayout = await win.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('#shop-shipping-modal .shop-shipping-modal');
    const rect = modal.getBoundingClientRect();
    return {
      visible: !document.getElementById('shop-shipping-modal').hidden,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      sections: modal.querySelectorAll('.shop-shipping-editor-section').length,
      fieldsPopulated: document.getElementById('shop-shipping-name').value === 'Curier rapid național',
      switchLayout: (() => { const card = modal.querySelector('.shop-shipping-switch-card'); const style = getComputedStyle(card); return { display: style.display, columns: style.gridTemplateColumns, direction: style.flexDirection }; })()
    };
  })()`);
  await win.webContents.executeJavaScript(`(() => { const body = document.querySelector('#shop-shipping-modal .shop-shipping-editor'); body.scrollTop = body.scrollHeight; })()`);
  await wait(160);
  const modalBottomPath = path.join(outputDir, 'shipping-modal-desktop-bottom.png');
  fs.writeFileSync(modalBottomPath, (await win.webContents.capturePage()).toPNG());

  const passed = !pageLayout.horizontalOverflow
    && pageLayout.cards === 2
    && pageLayout.overview
    && pageLayout.titleIcon
    && modalLayout.visible
    && modalLayout.withinViewport
    && modalLayout.sections === 3
    && modalLayout.fieldsPopulated
    && errors.length === 0;
  console.log(JSON.stringify({ passed, pageLayout, modalLayout, errors, screenshots: { pagePath, modalPath, modalBottomPath } }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); app.exit(1); });
