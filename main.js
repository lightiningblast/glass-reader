// Glass Reader — Electron main process: windows, files, settings, GPU, Windows 11 integration, silent updates.
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

/* ---------- Windows ---------- */
const wins = new Set();
const startDocs = new Map(); // webContents id → document the window should open first
let lastFocused = null;
let launchFile = findPdfArg(process.argv);
let pendingDialog = process.argv.includes('--open-dialog');
const alive = w => w && !w.isDestroyed();
const allWins = () => [...wins].filter(alive);
const mainWin = () => (alive(BrowserWindow.getFocusedWindow()) && wins.has(BrowserWindow.getFocusedWindow()) ? BrowserWindow.getFocusedWindow() : null) || (alive(lastFocused) ? lastFocused : null) || allWins()[0] || null;
const winOf = e => BrowserWindow.fromWebContents(e.sender) || mainWin();

function findPdfArg(argv) {
  return argv.slice(1).find(a => /\.pdf$/i.test(a) && fs.existsSync(a)) || null;
}

// Only one copy runs; opening another PDF sends it to the open window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const w = mainWin(); if (!w) return;
    if (w.isMinimized()) w.restore();
    w.focus();
    const file = findPdfArg(argv);
    if (file) sendFile(file, w.webContents);
    else if (argv.includes('--open-dialog')) openDialog(w.webContents, w);
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null); // no hidden menu: Ctrl+W closes a tab, not the window
    setJumpList();
    systemPreferences.on('accent-color-changed', (_e, color) => allWins().forEach(w => w.webContents.send('accent', color)));
    createWindow();
    setupUpdates();
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
function saveBounds(w) {
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...w.getNormalBounds(), maximized: w.isMaximized() })); } catch {}
}
function overlayColors(dark) {
  return { color: '#00000000', symbolColor: dark ? '#f5f5f7' : '#1c1c1e', height: 42 };
}

// opts.doc: a document to open first (a torn-off tab); opts.at: screen point to place the window near.
function createWindow(opts = {}) {
  const dark = nativeTheme.shouldUseDarkColors;
  let b = loadBounds();
  if (opts.at) {
    const area = screen.getDisplayNearestPoint(opts.at).workArea;
    const w = Math.min(b.width || 1100, Math.round(area.width * .6)), h = Math.min(b.height || 800, area.height);
    b = { width: w, height: h, x: Math.max(area.x, Math.min(area.x + area.width - w, opts.at.x - 140)), y: Math.max(area.y, Math.min(area.y + area.height - h, opts.at.y - 20)) };
  } else if (allWins().length) {
    b = { ...b, x: (b.x ?? 100) + 32 * allWins().length, y: (b.y ?? 80) + 32 * allWins().length, maximized: false };
  }
  const w = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 420, minHeight: 480, show: false, title: 'Glass Reader',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundMaterial: HAS_MICA ? 'mica' : undefined,
    backgroundColor: HAS_MICA ? '#00000000' : (dark ? '#0d0e12' : '#e6e9f0'),
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(dark), // keeps Windows 11 snap layouts on the maximize button
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      nodeIntegrationInSubFrames: true, // the split view's right pane gets the same safe bridge (preload)
      spellcheck: false, backgroundThrottling: false,
      additionalArguments: [`--gr-mica=${HAS_MICA ? 1 : 0}`, `--gr-win11=${IS_WIN11 ? 1 : 0}`]
    }
  });
  wins.add(w);
  const id = w.webContents.id;
  if (opts.doc) startDocs.set(id, opts.doc);
  if (b.maximized && !opts.at) w.maximize();
  w.loadFile(path.join(__dirname, 'src', 'index.html'));
  w.once('ready-to-show', () => {
    w.show();
    if (pendingDialog) { pendingDialog = false; openDialog(w.webContents, w); }
  });
  w.on('focus', () => { lastFocused = w; });
  w.on('close', () => saveBounds(w));
  w.on('closed', () => { wins.delete(w); startDocs.delete(id); });
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', e => e.preventDefault());
  lastFocused = w;
  return w;
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

// `target` is the pane that asked (a window, or a split view's right pane).
function sendFile(file, target) {
  try { (target || mainWin().webContents).send('open-file', readPdf(file)); }
  catch { dialog.showErrorBox('Glass Reader', `This file couldn't be opened:\n${file}`); }
}
async function openDialog(target, parent) {
  const r = await dialog.showOpenDialog(parent || mainWin(), { title: 'Open PDF', filters: [{ name: 'PDF documents', extensions: ['pdf'] }], properties: ['openFile', 'multiSelections'] });
  if (!r.canceled) for (const f of r.filePaths) sendFile(f, target); // each file opens in its own tab
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

ipcMain.handle('save-file', async (e, name, data) => {
  const ext = path.extname(name).slice(1).toLowerCase() || 'pdf';
  const r = await dialog.showSaveDialog(winOf(e), {
    title: 'Save', defaultPath: path.join(app.getPath('documents'), safeName(name)),
    filters: [{ name: ext.toUpperCase() + ' file', extensions: [ext] }]
  });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  if (ext === 'pdf') app.addRecentDocument(r.filePath);
  return path.basename(r.filePath);
});
ipcMain.handle('save-files', async (e, files) => {
  const r = await dialog.showOpenDialog(winOf(e), { title: 'Choose a folder to save into', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  for (const f of files) fs.writeFileSync(path.join(r.filePaths[0], safeName(f.name)), Buffer.from(f.data));
  shell.openPath(r.filePaths[0]);
  return path.basename(r.filePaths[0]);
});

// The first file a window should show: a torn-off tab, or the PDF Glass Reader was launched with.
ipcMain.handle('initial-file', e => {
  if (e.senderFrame && e.senderFrame.parent) return null; // split view's right pane starts on Home
  const id = e.sender.id;
  if (startDocs.has(id)) { const d = startDocs.get(id); startDocs.delete(id); return d; }
  if (!launchFile) return null;
  const file = launchFile; launchFile = null;
  try { return readPdf(file); } catch { return null; }
});
// Tear-off: a tab dragged out of a window becomes its own window at the drop point.
ipcMain.on('tear-off', (_e, doc, at) => {
  if (!doc || !doc.data) return;
  const pt = at && Number.isFinite(at.x) ? { x: Math.round(at.x), y: Math.round(at.y) } : screen.getCursorScreenPoint();
  createWindow({ doc, at: pt });
});
ipcMain.on('new-window', () => createWindow());
ipcMain.on('open-dialog', e => openDialog(e.senderFrame, winOf(e)));
ipcMain.on('add-recent', (_e, file) => { if (file && /\.pdf$/i.test(file)) app.addRecentDocument(file); });
ipcMain.handle('accent', () => { try { return systemPreferences.getAccentColor(); } catch { return null; } });
ipcMain.handle('cursor', () => screen.getCursorScreenPoint());

function applyTheme() {
  const dark = nativeTheme.shouldUseDarkColors;
  for (const w of allWins()) {
    w.setTitleBarOverlay(overlayColors(dark));
    if (!HAS_MICA) w.setBackgroundColor(dark ? '#0d0e12' : '#e6e9f0');
  }
}
ipcMain.on('theme', (_e, mode) => {
  nativeTheme.themeSource = mode === 'light' || mode === 'dark' ? mode : 'system';
  applyTheme();
});
nativeTheme.on('updated', applyTheme);

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
const sendStatus = s => allWins().forEach(w => w.webContents.send('update-status', s));
const progress = v => allWins().forEach(w => w.setProgressBar(v));
function setupUpdates() {
  if (!app.isPackaged) return;
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => sendStatus({ state: 'checking' }));
    updater.on('update-available', i => sendStatus({ state: 'downloading', version: i.version }));
    updater.on('update-not-available', () => sendStatus({ state: 'none' }));
    updater.on('download-progress', p => { progress(p.percent / 100); sendStatus({ state: 'downloading', percent: p.percent }); });
    updater.on('update-downloaded', i => {
      progress(-1);
      const w = mainWin(); if (w && !w.isFocused()) w.flashFrame(true);
      sendStatus({ state: 'ready', version: i.version });
    });
    updater.on('error', () => { progress(-1); sendStatus({ state: 'error' }); });
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
