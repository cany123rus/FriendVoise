const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopInfo', {
  isDesktop: true,
})

contextBridge.exposeInMainWorld('desktopWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  close: () => ipcRenderer.invoke('window:close'),
})
