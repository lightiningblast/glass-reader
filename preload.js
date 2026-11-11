// Safe bridge between the reader page and the desktop app.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const flag = name => process.argv.includes(`--gr-${name}=1`);

contextBridge.exposeInMainWorld('desktop', {
  mica: flag('mica'),
  win11: flag('win11'),
  initialFile: () => ipcRenderer.invoke('initial-file'),
  openDialog: () => ipcRenderer.send('open-dialog'),
  addRecent: file => { try { ipcRenderer.send('add-recent', webUtils.getPathForFile(file)); } catch {} },
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
