// Glass Reader — Electron main process: window, files, settings, GPU, Windows 11 integration, silent updates.
const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog, systemPreferences, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Windows 11 is build 22000 or later; Mica needs 22621 (22H2) or later.
const BUILD = process.platform === 'win32' ? parseInt(os.release().split('.')[2] || '0', 10) : 0;
const IS_WIN11 = BUILD >= 22000;
const HAS_MICA = BUILD >= 22621;

/* ---------- Settings (read before the app starts: GPU flags must be set early) ---------- */
const DEFAULTS = { hardwareAcceleration: true, autoUpdate: true, smoothScroll: true, glass: 'high', reduceMotion: false };
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch {}
function saveSettings() { try { fs.mkdirSync(path.dirname(settingsFile), { recursive: true }); fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2)); } catch {} }

app.setAppUserModelId('com.glassreader.app');
if (settings.hardwareAcceleration) {
  // Draw pages, canvases and glass on the graphics card, even on drivers Chromium is unsure about.
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization,UseSkiaRenderer');
  app.commandLine.appendSwitch('force_high_performance_gpu');
} else {
  app.disableHardwareAcceleration();
}

let win = null;
let pendingFile = findPdfArg(process.argv);
let pendingDialog = process.argv.includes('--open-dialog');

function findPdfArg(argv) {
  return argv.slice(1).find(a => /\.pdf$/i.test(a) && fs.existsSync(a)) || null;
}

// Only one copy runs; opening another PDF sends it to the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const file = findPdfArg(argv);
    if (file) sendFile(file);
    else if (argv.includes('--open-dialog')) openDialog();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // no hidden menu: Ctrl+W closes a tab, not the window
    setJumpList();
    createWindow();
  });
}

/* ---------- Window size and position are remembered between launches ---------- */
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const area = screen.getDisplayMatching(s).workArea;
    const visible = s.x < area.x + area.width - 80 && s.x + s.width > area.x + 80 && s.y >= area.y - 10 && s.y < area.y + area.height - 80;
    return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
  } catch { return { width: 1280, height: 860 }; }
}
function saveBounds() {
  if (!win) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
}

function overlayColors(dark) {
  return { color: '#00000000', symbolColor: dark ? '#f5f5f7' : '#1c1c1e', height: 42 };
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  const b = loadBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 420,
    minHeight: 480,
    show: false,
    title: 'Glass Reader',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundMaterial: HAS_MICA ? 'mica' : undefined,
    backgroundColor: HAS_MICA ? '#00000000' : (dark ? '#0d0e12' : '#e6e9f0'),
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(dark), // keeps Windows 11 snap layouts on the maximize button
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
      additionalArguments: [`--gr-mica=${HAS_MICA ? 1 : 0}`, `--gr-win11=${IS_WIN11 ? 1 : 0}`]
    }
  });
  if (b.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (pendingDialog) { pendingDialog = false; openDialog(); }
  });
  win.on('close', saveBounds);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());

  systemPreferences.on('accent-color-changed', (_e, color) => win && win.webContents.send('accent', color));
  setupUpdates();
}

/* ---------- Opening and saving files ---------- */
function readPdf(file) {
  const data = fs.readFileSync(file);
  app.addRecentDocument(file);
  touchRecent(file, {});
  return { name: path.basename(file, path.extname(file)), data, path: file };
}

/* ---------- Recent files (shown on the Home page) ---------- */
const recentsFile = path.join(app.getPath('userData'), 'recents.json');
let recents = [];
try { recents = JSON.parse(fs.readFileSync(recentsFile, 'utf8')); } catch {}
function saveRecents() { try { fs.writeFileSync(recentsFile, JSON.stringify(recents)); } catch {} }
function touchRecent(file, patch) {
  const i = recents.findIndex(r => r.path.toLowerCase() === file.toLowerCase());
  const prev = i >= 0 ? recents.splice(i, 1)[0] : { path: file, name: path.basename(file, path.extname(file)) };
  recents.unshift({ ...prev, ...patch, path: file, openedAt: Date.now() });
  recents = recents.slice(0, 40);
  saveRecents();
}
ipcMain.handle('get-recents', () => recents.filter(r => fs.existsSync(r.path)));
ipcMain.handle('update-recent', (_e, file, patch) => { if (file) touchRecent(file, patch || {}); return true; });
ipcMain.handle('remove-recent', (_e, file) => { recents = recents.filter(r => r.path !== file); saveRecents(); return true; });
ipcMain.handle('clear-recents', () => { recents = []; saveRecents(); app.clearRecentDocuments(); return true; });
ipcMain.handle('open-path', (_e, file) => { try { return readPdf(file); } catch { return null; } });
function sendFile(file) {
  try { win.webContents.send('open-file', readPdf(file)); }
  catch { dialog.showErrorBox('Glass Reader', `This file couldn't be opened:\n${file}`); }
}
async function openDialog() {
  if (!win) return;
  const r = await dialog.showOpenDialog(win, { title: 'Open PDF', filters: [{ name: 'PDF documents', extensions: ['pdf'] }], properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) for (const f of r.filePaths) sendFile(f); // each file opens in its own tab
}
function setJumpList() {
  if (process.platform !== 'win32') return;
  app.setUserTasks([{
    program: process.execPath,
    arguments: app.isPackaged ? '--open-dialog' : `"${app.getAppPath()}" --open-dialog`,
    iconPath: process.execPath, iconIndex: 0,
    title: 'Open PDF…', description: 'Choose a PDF to open'
  }]);
}
const safeName = n => String(n).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180);

ipcMain.handle('save-file', async (_e, name, data) => {
  const ext = path.extname(name).slice(1).toLowerCase() || 'pdf';
  const r = await dialog.showSaveDialog(win, {
    title: 'Save', defaultPath: path.join(app.getPath('documents'), safeName(name)),
    filters: [{ name: ext.toUpperCase() + ' file', extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  if (ext === 'pdf') app.addRecentDocument(r.filePath);
  return path.basename(r.filePath);
});
ipcMain.handle('save-files', async (_e, files) => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder to save into', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  for (const f of files) fs.writeFileSync(path.join(r.filePaths[0], safeName(f.name)), Buffer.from(f.data));
  shell.openPath(r.filePaths[0]);
  return path.basename(r.filePaths[0]);
});

ipcMain.handle('initial-file', () => {
  if (!pendingFile) return null;
  const file = pendingFile; pendingFile = null;
  try { return readPdf(file); } catch { return null; }
});
ipcMain.on('open-dialog', openDialog);
ipcMain.on('add-recent', (_e, file) => { if (file && /\.pdf$/i.test(file)) app.addRecentDocument(file); });
ipcMain.handle('accent', () => { try { return systemPreferences.getAccentColor(); } catch { return null; } });

ipcMain.on('theme', (_e, mode) => {
  if (!win) return;
  nativeTheme.themeSource = mode === 'light' || mode === 'dark' ? mode : 'system';
  const dark = nativeTheme.shouldUseDarkColors;
  win.setTitleBarOverlay(overlayColors(dark));
  if (!HAS_MICA) win.setBackgroundColor(dark ? '#0d0e12' : '#e6e9f0');
});
nativeTheme.on('updated', () => {
  if (win && nativeTheme.themeSource === 'system') win.setTitleBarOverlay(overlayColors(nativeTheme.shouldUseDarkColors));
});

/* ---------- Settings and GPU status ---------- */
ipcMain.handle('get-settings', () => settings);
ipcMain.on('set-setting', (_e, k, v) => {
  if (!(k in DEFAULTS)) return;
  settings[k] = v; saveSettings();
  if (k === 'autoUpdate') setupUpdates();
});
ipcMain.handle('gpu-info', async () => {
  const status = app.getGPUFeatureStatus();
  let renderer = '';
  try { const info = await app.getGPUInfo('complete'); renderer = (info.auxAttributes && info.auxAttributes.glRenderer) || ''; } catch {}
  const active = settings.hardwareAcceleration && /^enabled/.test(status.gpu_compositing || '') && /^enabled/.test(status.rasterization || '');
  return { active, renderer, status };
});
ipcMain.on('relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.on('open-default-apps', () => shell.openExternal('ms-settings:defaultapps'));
ipcMain.handle('app-version', () => app.getVersion());

/* ---------- Silent background updates (GitHub Releases) ----------
   Updates download quietly. They install silently (no setup window) when the app closes,
   or right away if you choose "Restart now". */
let updater = null, updateTimer = null;
const sendStatus = s => win && !win.isDestroyed() && win.webContents.send('update-status', s);
function setupUpdates() {
  if (!app.isPackaged) return;
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => sendStatus({ state: 'checking' }));
    updater.on('update-available', i => sendStatus({ state: 'downloading', version: i.version }));
    updater.on('update-not-available', () => sendStatus({ state: 'none' }));
    updater.on('download-progress', p => { win && win.setProgressBar(p.percent / 100); sendStatus({ state: 'downloading', percent: p.percent }); });
    updater.on('update-downloaded', i => {
      if (win) { win.setProgressBar(-1); if (!win.isFocused()) win.flashFrame(true); }
      sendStatus({ state: 'ready', version: i.version });
    });
    updater.on('error', () => { win && win.setProgressBar(-1); sendStatus({ state: 'error' }); });
  }
  clearInterval(updateTimer);
  if (!settings.autoUpdate) return;
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  updateTimer = setInterval(check, 4 * 60 * 60 * 1000);
}
ipcMain.on('check-updates', () => { if (!app.isPackaged) { sendStatus({ state: 'none' }); return; } setupUpdates(); updater && updater.checkForUpdates().catch(() => sendStatus({ state: 'error' })); });
ipcMain.on('restart-to-update', () => { if (updater) updater.quitAndInstall(true, true); }); // silent install, then reopen

app.on('window-all-closed', () => app.quit());
