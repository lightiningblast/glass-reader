// Glass Reader — Electron main process: window, file opening, Windows 11 integration, auto-updates.
const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog, systemPreferences, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Windows 11 is build 22000 or later; Mica needs 22621 (22H2) or later.
const BUILD = process.platform === 'win32' ? parseInt(os.release().split('.')[2] || '0', 10) : 0;
const IS_WIN11 = BUILD >= 22000;
const HAS_MICA = BUILD >= 22621;

app.setAppUserModelId('com.glassreader.app'); // taskbar grouping and jump list
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

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
  return { color: '#00000000', symbolColor: dark ? '#f5f5f7' : '#1c1c1e', height: 44 };
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
    // Mica lets the desktop wallpaper tint the window, like built-in Windows 11 apps.
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

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());

  systemPreferences.on('accent-color-changed', (_e, color) => win && win.webContents.send('accent', color));
  setupUpdates();
}

/* ---------- Opening files ---------- */
function readPdf(file) {
  const data = fs.readFileSync(file);
  app.addRecentDocument(file); // shows under "Recent" in the taskbar jump list
  return { name: path.basename(file, path.extname(file)), data };
}
function sendFile(file) {
  try { win.webContents.send('open-file', readPdf(file)); }
  catch { dialog.showErrorBox('Glass Reader', `This file couldn't be opened:\n${file}`); }
}
async function openDialog() {
  if (!win) return;
  const r = await dialog.showOpenDialog(win, {
    title: 'Open PDF',
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  if (!r.canceled && r.filePaths[0]) sendFile(r.filePaths[0]);
}
function setJumpList() {
  if (process.platform !== 'win32') return;
  app.setUserTasks([{
    program: process.execPath,
    arguments: app.isPackaged ? '--open-dialog' : `"${app.getAppPath()}" --open-dialog`,
    iconPath: process.execPath,
    iconIndex: 0,
    title: 'Open PDF…',
    description: 'Choose a PDF to open'
  }]);
}

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
  nativeTheme.themeSource = mode === 'light' || mode === 'dark' ? mode : 'system'; // also tints Mica
  const dark = nativeTheme.shouldUseDarkColors;
  win.setTitleBarOverlay(overlayColors(dark));
  if (!HAS_MICA) win.setBackgroundColor(dark ? '#0d0e12' : '#e6e9f0');
});
nativeTheme.on('updated', () => {
  if (win && nativeTheme.themeSource === 'system') win.setTitleBarOverlay(overlayColors(nativeTheme.shouldUseDarkColors));
});

/* ---------- Auto-updates (GitHub Releases) ---------- */
ipcMain.on('restart-to-update', () => {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall(false, true);
});
ipcMain.handle('app-version', () => app.getVersion());

function setupUpdates() {
  if (!app.isPackaged) return; // updates only run in the installed app
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', p => win && win.setProgressBar(p.percent / 100));
  autoUpdater.on('update-downloaded', info => {
    if (!win) return;
    win.setProgressBar(-1);
    win.webContents.send('update-ready', info.version);
    if (!win.isFocused()) win.flashFrame(true);
  });
  autoUpdater.on('error', () => { if (win) win.setProgressBar(-1); }); // offline or no release yet
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('window-all-closed', () => app.quit());
