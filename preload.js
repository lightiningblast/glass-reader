// Safe bridge between the reader page and the desktop app.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const flag = name => process.argv.includes(`--gr-${name}=1`);

contextBridge.exposeInMainWorld('desktop', {
  mica: flag('mica'),
  win11: flag('win11'),
  initialFile: () => ipcRenderer.invoke('initial-file'),
  openDialog: () => ipcRenderer.send('open-dialog'),
  addRecent: file => { try { ipcRenderer.send('add-recent', webUtils.getPathForFile(file)); } catch {} },
  pathFor: file => { try { return webUtils.getPathForFile(file) || null; } catch { return null; } },
  getRecents: () => ipcRenderer.invoke('get-recents'),
  updateRecent: (file, patch) => ipcRenderer.invoke('update-recent', file, patch),
  removeRecent: file => ipcRenderer.invoke('remove-recent', file),
  clearRecents: () => ipcRenderer.invoke('clear-recents'),
  openPath: file => ipcRenderer.invoke('open-path', file),
  tearOff: (doc, at) => ipcRenderer.send('tear-off', doc, at),
  newWindow: () => ipcRenderer.send('new-window'),
  cursor: () => ipcRenderer.invoke('cursor'),
  // Moving a tab between windows: the target asks for it, the source hands it over.
  winId: () => ipcRenderer.invoke('win-id'),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pullTab: src => ipcRenderer.send('pull-tab', src),
  tabData: (req, doc) => ipcRenderer.send('tab-data', req, doc),
  onGiveTab: cb => ipcRenderer.on('give-tab', (_e, m) => cb(m)),
  onTakeTab: cb => ipcRenderer.on('take-tab', (_e, doc) => cb(doc)),
  closeWindowIfOthers: () => ipcRenderer.invoke('close-window-if-others'),
  onOpenFile: cb => ipcRenderer.on('open-file', (_e, f) => cb(f)),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', name, data),
  saveFiles: files => ipcRenderer.invoke('save-files', files),
  accent: () => ipcRenderer.invoke('accent'),
  onAccent: cb => ipcRenderer.on('accent', (_e, c) => cb(c)),
  setTheme: mode => ipcRenderer.send('theme', mode),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (k, v) => ipcRenderer.send('set-setting', k, v),
  gpuInfo: () => ipcRenderer.invoke('gpu-info'),
  relaunch: () => ipcRenderer.send('relaunch'),
  openDefaultApps: () => ipcRenderer.send('open-default-apps'),
  checkForUpdates: () => ipcRenderer.send('check-updates'),
  onUpdateStatus: cb => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  version: () => ipcRenderer.invoke('app-version')
});
