const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Failed to fetch') && !message.includes('Security Warning')) errors.push(message);
  });

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setZoomFactor(1);
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const users = [
      { id:'qa-admin', username:'admin', display_name:'Administrator Cubis', role:'admin', platform_access:'both', is_active:true },
      { id:'qa-manager', username:'maria', display_name:'Maria Popescu', role:'manager', platform_access:'desktop', is_active:true },
      { id:'qa-user', username:'andrei', display_name:'Andrei Ionescu', role:'user', platform_access:'mobile', is_active:false },
      ...Array.from({ length:7 }, (_, index) => ({ id:'qa-team-' + index, username:'coleg' + (index + 1), display_name:'Coleg Cubis ' + (index + 1), role:'user', platform_access:index % 2 ? 'mobile' : 'both', is_active:index !== 5 })),
    ];
    window.AUTH = { ...(window.AUTH || {}), isLoggedIn:() => true, isAdmin:() => true, getToken:() => 'qa-local', getUser:() => users[0] };
    window.API = { ...(window.API || {}), getUsers:async () => users, createUser:async (_token, value) => value, updateUser:async (_token, _id, value) => value, deleteUser:async () => ({ success:true }) };
    document.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = false; element.style.display = ''; });
    window.switchTab('settings');
    window.dispatchEvent(new CustomEvent('auth-change', { detail:{ token:'qa-local', user:users[0] } }));
  })()`);
  await sleep(350);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-settings-ui');
  fs.mkdirSync(outputDir, { recursive: true });
  const topScreenshot = path.join(outputDir, 'settings-top.png');
  fs.writeFileSync(topScreenshot, (await win.webContents.capturePage()).toPNG());

  const scrollStart = await win.webContents.executeJavaScript(`(() => {
    const scroller = document.querySelector('.settings-page-scroll');
    const before = scroller.scrollTop;
    scroller.scrollTo({ top:scroller.scrollHeight, behavior:'auto' });
    return {
      activeTab: document.querySelector('.tab-panel.active')?.id,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      before,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      userRows: document.querySelectorAll('#users-list .user-row').length,
    };
  })()`);
  await sleep(350);
  const scrollMetrics = await win.webContents.executeJavaScript(`(() => {
    const scroller = document.querySelector('.settings-page-scroll');
    return {
      after: scroller.scrollTop,
      canScroll: scroller.scrollHeight > scroller.clientHeight && scroller.scrollTop > 0,
    };
  })()`);
  Object.assign(scrollMetrics, scrollStart);
  const bottomScreenshot = path.join(outputDir, 'settings-bottom.png');
  fs.writeFileSync(bottomScreenshot, (await win.webContents.capturePage()).toPNG());

  console.log(JSON.stringify({ scrollMetrics, errors, screenshots: { topScreenshot, bottomScreenshot } }, null, 2));
  const failed = !scrollMetrics.canScroll || scrollMetrics.horizontalOverflow || scrollMetrics.userRows !== 10 || errors.length;
  await win.destroy();
  if (failed) app.exit(1);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
