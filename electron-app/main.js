const { app, BrowserWindow, ipcMain, dialog, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { clampWindowBounds } = require('./window-bounds');

let mainWindow = null;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updateCheckTimer = null;
const updateStartupTimers = [];
let pendingOrderDeepLink = null;
const DESKTOP_READABILITY_ZOOM = 1.08;
const DESKTOP_UPDATES_ENABLED = false;
const updateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: '',
  percent: 0,
  message: 'Poti verifica daca exista o versiune noua.',
};

const ownsPrimaryInstance = app.requestSingleInstanceLock();
if (!ownsPrimaryInstance) app.quit();

function orderDeepLinkFromValue(value) {
  const match = String(value || '').match(/^cubisshop:\/\/(?:order|orders)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[/?#]|$)/i);
  return match?.[1]?.toLowerCase() || null;
}

function orderDeepLinkFromArgs(args) {
  for (const value of Array.isArray(args) ? args : []) {
    const orderId = orderDeepLinkFromValue(value);
    if (orderId) return orderId;
  }
  return null;
}

function dispatchPendingOrderDeepLink() {
  if (!pendingOrderDeepLink || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
  const orderId = pendingOrderDeepLink;
  pendingOrderDeepLink = null;
  mainWindow.webContents.send('app-deep-link', { type: 'order', orderId });
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function queueOrderDeepLink(value) {
  const orderId = orderDeepLinkFromValue(value) || orderDeepLinkFromArgs(value);
  if (!orderId) return;
  pendingOrderDeepLink = orderId;
  dispatchPendingOrderDeepLink();
}

if (ownsPrimaryInstance) {
  pendingOrderDeepLink = orderDeepLinkFromArgs(process.argv);
  app.on('second-instance', (_event, commandLine) => queueOrderDeepLink(commandLine));
  app.on('open-url', (event, url) => {
    event.preventDefault();
    queueOrderDeepLink(url);
  });
}

// Hardware acceleration is essential for the blurred/translucent desktop UI.
// Keep an explicit safe-mode escape hatch for PCs with problematic GPU drivers:
// launch with --disable-gpu or set CUBIS_DISABLE_GPU=1.
const useSoftwareRendering =
  process.argv.includes('--disable-gpu')
  || process.env.CUBIS_DISABLE_GPU === '1';
if (useSoftwareRendering) {
  app.disableHardwareAcceleration();
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    const bounds = state?.bounds;
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return {};
    const primaryWorkArea = screen.getPrimaryDisplay()?.workArea;
    const workAreas = screen.getAllDisplays().map(({ workArea }) => workArea);
    if (primaryWorkArea) {
      const primaryIndex = workAreas.findIndex((area) => (
        area.x === primaryWorkArea.x
        && area.y === primaryWorkArea.y
        && area.width === primaryWorkArea.width
        && area.height === primaryWorkArea.height
      ));
      if (primaryIndex > 0) workAreas.unshift(workAreas.splice(primaryIndex, 1)[0]);
    }
    const safeBounds = clampWindowBounds(bounds, workAreas, { minWidth: 720, minHeight: 560 });
    return safeBounds ? { ...state, bounds: safeBounds } : {};
  } catch (_error) {
    return {};
  }
}

function constrainWindowToWorkArea(win) {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
  const primaryWorkArea = screen.getPrimaryDisplay()?.workArea;
  const workAreas = screen.getAllDisplays().map(({ workArea }) => workArea);
  if (primaryWorkArea) {
    const primaryIndex = workAreas.findIndex((area) => (
      area.x === primaryWorkArea.x
      && area.y === primaryWorkArea.y
      && area.width === primaryWorkArea.width
      && area.height === primaryWorkArea.height
    ));
    if (primaryIndex > 0) workAreas.unshift(workAreas.splice(primaryIndex, 1)[0]);
  }
  const current = win.getBounds();
  const safe = clampWindowBounds(current, workAreas, { minWidth: 720, minHeight: 560 });
  if (!safe) return;
  if (safe.x !== current.x || safe.y !== current.y || safe.width !== current.width || safe.height !== current.height) {
    win.setBounds(safe);
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const state = {
    bounds: win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds(),
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
  };
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    log.warn('[Cubis Shop window state]', error?.message || error);
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'cubis-shop-icon.ico' : 'cubis-shop-icon.png');
  const savedState = readWindowState();
  const win = new BrowserWindow({
    width: savedState.bounds?.width || 1280,
    height: savedState.bounds?.height || 820,
    x: savedState.bounds?.x,
    y: savedState.bounds?.y,
    minWidth: 720,
    minHeight: 560,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#080706',
    title: 'Cubis Shop CRM',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      defaultFontSize: 17,
      defaultMonospaceFontSize: 15,
      minimumFontSize: 12,
    },
  });
  mainWindow = win;
  win.webContents.setZoomFactor(DESKTOP_READABILITY_ZOOM);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      if (savedState.maximized) win.maximize();
      if (savedState.fullScreen) win.setFullScreen(true);
      constrainWindowToWorkArea(win);
      win.show();
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.setZoomFactor(DESKTOP_READABILITY_ZOOM);
      win.webContents.send('rendering-mode', {
        software: useSoftwareRendering,
      });
      dispatchPendingOrderDeepLink();
    }
  });

  win.webContents.on('did-fail-load', () => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Cubis Shop] Renderer process stopped:', details.reason, details.exitCode);
  });

  let saveStateTimer = null;
  const scheduleStateSave = () => {
    clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => saveWindowState(win), 180);
  };
  win.on('resize', scheduleStateSave);
  win.on('move', scheduleStateSave);
  win.on('maximize', scheduleStateSave);
  win.on('unmaximize', scheduleStateSave);
  win.on('enter-full-screen', scheduleStateSave);
  win.on('leave-full-screen', scheduleStateSave);
  const keepInsideWorkArea = () => constrainWindowToWorkArea(win);
  screen.on('display-metrics-changed', keepInsideWorkArea);
  screen.on('display-removed', keepInsideWorkArea);
  win.on('close', () => saveWindowState(win));
  win.on('closed', () => {
    clearTimeout(saveStateTimer);
    screen.removeListener('display-metrics-changed', keepInsideWorkArea);
    screen.removeListener('display-removed', keepInsideWorkArea);
    if (mainWindow === win) mainWindow = null;
  });
}

app.on('child-process-gone', (_event, details) => {
  console.error('[Cubis Shop] Child process stopped:', details.type, details.reason, details.exitCode);
});

// Handle save-file dialog for Excel export
ipcMain.handle('save-excel', async (_event, { defaultName, buffer }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return { success: true, filePath };
});

ipcMain.handle('save-pdf', async (_event, { defaultName, buffer }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { success: false };
  fs.writeFileSync(filePath, Buffer.from(buffer));
  return { success: true, filePath };
});

function safeDownloadedName(value, fallback = 'document') {
  return String(value || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim() || fallback;
}

async function fetchLegacyNirAttachment(url) {
  const parsed = new URL(String(url || ''));
  if (parsed.protocol !== 'https:' || !['cubisshop.ro', 'www.cubisshop.ro'].includes(parsed.hostname) || !/^\/shop-api\/uploads\/nir\/\d{4}\/\d{2}\/[a-f0-9]+\.[a-z0-9]+$/i.test(parsed.pathname)) {
    throw new Error('Adresa documentului nu este permisă.');
  }
  const response = await fetch(parsed.toString(), { redirect: 'error' });
  if (!response.ok) throw new Error(`Documentul nu mai este disponibil (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

ipcMain.handle('save-remote-files', async (_event, { files }) => {
  const requested = Array.isArray(files) ? files.filter(file => file?.url) : [];
  if (!requested.length) return { success: false, error: 'Nu există documente de descărcat.' };
  if (requested.length === 1) {
    const fileName = safeDownloadedName(requested[0].fileName, 'document');
    const selection = await dialog.showSaveDialog({ defaultPath: fileName });
    if (selection.canceled || !selection.filePath) return { success: false, canceled: true };
    fs.writeFileSync(selection.filePath, await fetchLegacyNirAttachment(requested[0].url));
    return { success: true, count: 1, path: selection.filePath };
  }
  const selection = await dialog.showOpenDialog({ title: 'Alege folderul pentru documentele NIR', properties: ['openDirectory', 'createDirectory'] });
  if (selection.canceled || !selection.filePaths?.[0]) return { success: false, canceled: true };
  const destination = selection.filePaths[0];
  const used = new Set();
  const savedPaths = [];
  for (const [index, file] of requested.entries()) {
    const original = safeDownloadedName(file.fileName, `document-${index + 1}`);
    const extension = path.extname(original);
    const base = path.basename(original, extension);
    let candidate = original;
    let suffix = 2;
    while (used.has(candidate.toLowerCase()) || fs.existsSync(path.join(destination, candidate))) candidate = `${base}-${suffix++}${extension}`;
    used.add(candidate.toLowerCase());
    const savedPath = path.join(destination, candidate);
    fs.writeFileSync(savedPath, await fetchLegacyNirAttachment(file.url));
    savedPaths.push(savedPath);
  }
  shell.showItemInFolder(savedPaths[0]);
  return { success: true, count: requested.length, path: destination };
});


function broadcastUpdateState(patch = {}) {
  Object.assign(updateState, patch, { currentVersion: app.getVersion() });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('app-update-state', { ...updateState });
    }
  }
  return { ...updateState };
}

function setupAutoUpdater() {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';
  // A packaged GUI can be launched without a live stdout pipe (for example
  // through Explorer or a silent updater). Keep production logs in the file
  // transport only, otherwise Windows may surface an uncaught EPIPE dialog.
  log.transports.console.level = app.isPackaged ? false : 'info';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({
      status: 'checking',
      percent: 0,
      message: 'Se verifica daca exista o versiune noua...',
    });
  });

  autoUpdater.on('update-available', (info) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = true;
    broadcastUpdateState({
      status: 'available',
      availableVersion: info.version || '',
      percent: 0,
      message: `Versiunea ${info.version} este disponibila. Descarcarea porneste automat.`,
    });
  });

  autoUpdater.on('update-not-available', () => {
    updateCheckInFlight = false;
    broadcastUpdateState({
      status: 'current',
      availableVersion: '',
      percent: 100,
      message: `Ai deja cea mai noua versiune (${app.getVersion()}).`,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    broadcastUpdateState({
      status: 'downloading',
      percent,
      message: `Se descarca actualizarea... ${percent.toFixed(0)}%`,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloadInFlight = false;
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info.version || updateState.availableVersion,
      percent: 100,
      message: `Versiunea ${info.version || updateState.availableVersion} este pregatita pentru instalare.`,
    });
  });

  autoUpdater.on('error', (error) => {
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
    log.error('[Cubis Shop updater]', error);
    broadcastUpdateState({
      status: 'error',
      percent: 0,
      message: error?.message || 'Actualizarea nu a putut fi verificata.',
    });
  });
}

function runAutomaticUpdateCheck(source = 'periodic') {
  if (!DESKTOP_UPDATES_ENABLED) return;
  if (!app.isPackaged || updateCheckInFlight || updateDownloadInFlight) return;
  if (['available', 'downloading', 'downloaded', 'installing'].includes(updateState.status)) return;
  updateCheckInFlight = true;
  autoUpdater.checkForUpdates().catch((error) => {
    updateCheckInFlight = false;
    log.warn(`[Cubis Shop updater ${source} check]`, error?.message || error);
  });
}

ipcMain.handle('app-update:get-state', () => ({ ...updateState, currentVersion: app.getVersion() }));

ipcMain.handle('app-update:check', async () => {
  if (!DESKTOP_UPDATES_ENABLED) {
    return broadcastUpdateState({ status: 'disabled', message: 'Actualizările sunt dezactivate în copia izolată Cubis Shop.' });
  }
  if (!app.isPackaged) {
    return broadcastUpdateState({
      status: 'development',
      message: 'Verificarea update-ului functioneaza in aplicatia instalata.',
    });
  }
  if (updateCheckInFlight) return { ...updateState };
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckInFlight = false;
    return broadcastUpdateState({
      status: 'error',
      message: error?.message || 'Serverul de actualizari nu poate fi contactat.',
    });
  }
  return { ...updateState };
});

ipcMain.handle('app-update:download', async () => {
  if (!DESKTOP_UPDATES_ENABLED) return { status: 'disabled', message: 'Actualizările sunt dezactivate în copia izolată Cubis Shop.' };
  if (updateDownloadInFlight || updateState.status === 'downloaded') return { ...updateState };
  if (updateState.status !== 'available') {
    return broadcastUpdateState({
      status: 'error',
      message: 'Verifica mai intai daca exista o versiune noua.',
    });
  }
  updateDownloadInFlight = true;
  broadcastUpdateState({
    status: 'downloading',
    percent: 0,
    message: 'Se pregateste descarcarea actualizarii...',
  });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    updateDownloadInFlight = false;
    return broadcastUpdateState({
      status: 'error',
      message: error?.message || 'Actualizarea nu a putut fi descarcata.',
    });
  }
  return { ...updateState };
});

ipcMain.handle('app-update:install', () => {
  if (!DESKTOP_UPDATES_ENABLED) return { success: false, message: 'Actualizările sunt dezactivate în copia izolată Cubis Shop.' };
  if (updateState.status !== 'downloaded') {
    return { success: false, message: 'Actualizarea nu este inca descarcata.' };
  }
  broadcastUpdateState({
    status: 'installing',
    percent: 100,
    message: 'Se instaleaza actualizarea. Aplicatia va reporni automat...',
  });
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { success: true };
});

app.whenReady().then(() => {
  app.setAppUserModelId('ro.cabit.cubisshop.desktop');
  if (app.isPackaged) app.setAsDefaultProtocolClient('cubisshop');
  if (DESKTOP_UPDATES_ENABLED) setupAutoUpdater();
  createWindow();
  if (app.isPackaged && DESKTOP_UPDATES_ENABLED) {
    // GitHub poate servi pentru câteva secunde metadatele vechi imediat după
    // publicarea unui release. Verificările scurte de după pornire elimină
    // dependența de butonul manual fără a întrerupe activitatea utilizatorului.
    [4000, 25000, 90000].forEach((delay, index) => {
      updateStartupTimers.push(setTimeout(() => runAutomaticUpdateCheck(`startup-${index + 1}`), delay));
    });
    updateCheckTimer = setInterval(() => {
      runAutomaticUpdateCheck('periodic');
    }, 5 * 60 * 1000);
  }
});
app.on('window-all-closed', () => {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateStartupTimers.splice(0).forEach(timer => clearTimeout(timer));
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
