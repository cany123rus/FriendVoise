const { app, BrowserWindow, shell, session, desktopCapturer, ipcMain } = require('electron')
const path = require('path')

const isDev = !app.isPackaged
const PROD_WEB_URL = process.env.DESKTOP_APP_URL || 'https://voice-d76eb.web.app'

let mainWindow = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundMaterial: 'none',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow = win

  if (isDev) {
    win.loadURL('http://localhost:3000')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadURL(PROD_WEB_URL).catch(() => {
      win.loadFile(path.join(__dirname, '..', 'out', 'index.html'))
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // Enable screen sharing in Electron (Windows/macOS/Linux)
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
      const screenSource = sources.find((s) => s.id.startsWith('screen:')) || sources[0]
      callback({ video: screenSource, audio: 'loopback' })
    } catch {
      callback({})
    }
  })

  // Allow camera/mic/display-capture permissions for app web contents
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allow = ['media', 'display-capture', 'fullscreen', 'notifications'].includes(permission)
    callback(allow)
  })


  ipcMain.handle('window:minimize', () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow
    if (w) w.minimize()
  })
  ipcMain.handle('window:maximize-toggle', () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle('window:close', () => {
    const w = BrowserWindow.getFocusedWindow() || mainWindow
    if (w) w.close()
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
