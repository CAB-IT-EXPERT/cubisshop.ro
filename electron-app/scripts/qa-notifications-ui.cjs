const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    show: false,
    width: 1360,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  });

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn: () => true, getToken: () => 'qa-local', getUser: () => ({ id:'qa-admin', username:'admin', role:'admin' }) };
    window.SHOP_API = new Proxy({
      getShopNotificationSummary: async () => ({ unread_count:0 }),
      listShopNotifications: async () => ({ unread_count:0, items:[] }),
      markShopNotificationsReadAll: async () => ({ success:true }),
    }, { get: (target, property) => target[property] || (async () => []) });
    document.getElementById('topbar-notifications-btn').click();
    document.getElementById('topbar-open-shop-notifications').click();
  })()`);
  await sleep(450);

  const metrics = await win.webContents.executeJavaScript(`(() => {
    const menu = document.getElementById('topbar-notifications-menu');
    const panel = document.getElementById('topbar-shop-notifications-panel');
    const empty = panel.querySelector('.topbar-shop-notifications-empty');
    const readAll = document.getElementById('topbar-shop-notifications-read-all');
    const rect = menu.getBoundingClientRect();
    return {
      menuVisible: !menu.hidden,
      panelVisible: !panel.hidden,
      emptyTitle: empty?.querySelector('strong')?.textContent || '',
      emptyHasIcon: Boolean(empty?.querySelector('svg')),
      readAllHidden: readAll.hidden && getComputedStyle(readAll).display === 'none',
      menuBackground: getComputedStyle(menu).backgroundColor,
      panelBackground: getComputedStyle(panel).backgroundColor,
      bounds: { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height) },
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-notifications-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'notifications-material-3.png');
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage(metrics.bounds)).toPNG());

  if (!metrics.menuVisible || !metrics.panelVisible) throw new Error('Centrul de notificări nu s-a deschis.');
  if (!metrics.emptyHasIcon || metrics.emptyTitle !== 'Totul este în regulă') throw new Error('Starea goală Material 3 nu a fost randată.');
  if (!metrics.readAllHidden) throw new Error('Butonul „Toate citite” rămâne vizibil fără alerte.');
  if (errors.length) throw new Error(`Erori în consolă: ${errors.join(' | ')}`);

  console.log(JSON.stringify({ ...metrics, errors, screenshotPath }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
