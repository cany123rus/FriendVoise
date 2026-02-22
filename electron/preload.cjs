const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktopInfo', {
  isDesktop: true,
})
