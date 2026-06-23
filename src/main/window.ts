import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

export function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width:           1200,
    height:          800,
    minWidth:        900,
    minHeight:       600,
    show:            false,   // shown after 'ready-to-show' to prevent white flash
    titleBarStyle:   'hidden',
    trafficLightPosition: { x: 16, y: 16 },  // macOS traffic lights

    // Frameless on Windows/Linux for custom titlebar;
    // keep native chrome on macOS (use titleBarStyle: 'hidden' instead)
    frame:           process.platform === 'darwin',
    titleBarOverlay: process.platform !== 'darwin' ? {
      color:        '#0e0e14',
      symbolColor:  '#a1a1aa',
      height:       40,
    } : undefined,

    webPreferences: {
      preload:           join(__dirname, '../preload/index.js'),
      contextIsolation:  true,    // Security: renderer cannot access Node.js APIs directly
      nodeIntegration:   false,   // Security: must be false when contextIsolation is true
      sandbox:           true,    // Security: further isolates the renderer process
      webSecurity:       true,
    },

    backgroundColor: '#0e0e14',  // match --surface-900 to prevent flash
    icon:            join(__dirname, '../../build/icon.png'),
  })

  // Show window only when fully loaded (no white flash)
  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev && process.env.DEVTOOLS_OPEN === 'true') {
      mainWindow!.webContents.openDevTools()
    }
  })

  // Open external links in the OS browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
