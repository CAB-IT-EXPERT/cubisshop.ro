const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 700,
    height: 650,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      partition: 'cubisshop-startup-qa',
    },
  });

  win.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
    callback({ cancel: new URL(details.url).pathname.endsWith('.js') });
  });

  const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
  await win.loadFile(indexPath);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const layout = await win.webContents.executeJavaScript(`(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, width: bounds.width, height: bounds.height };
    };
    return {
      card: rect('.startup-card'),
      logo: rect('.startup-wordmark'),
      progress: rect('.startup-progress'),
      subtitle: rect('.startup-subtitle'),
      startupImages: document.querySelectorAll('.startup-card img').length,
      bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-startup');
  fs.mkdirSync(outputDir, { recursive: true });
  const screenshotPath = path.join(outputDir, 'desktop-startup.png');
  fs.writeFileSync(screenshotPath, (await win.webContents.capturePage()).toPNG());

  const passed = layout.startupImages === 1
    && layout.logo.bottom < layout.progress.top
    && layout.progress.bottom < layout.subtitle.top
    && layout.subtitle.bottom < layout.card.bottom
    && !layout.bodyOverflow;

  console.log(JSON.stringify({ passed, layout, screenshotPath }, null, 2));
  await win.destroy();
  app.exit(passed ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
