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
  accent: () => ipcRenderer.invoke('accent'),
  onAccent: cb => ipcRenderer.on('accent', (_e, c) => cb(c)),
  onUpdateReady: cb => ipcRenderer.on('update-ready', (_e, v) => cb(v)),
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  setTheme: mode => ipcRenderer.send('theme', mode),
  version: () => ipcRenderer.invoke('app-version')
});
