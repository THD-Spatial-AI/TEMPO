// Frameless-window support: IPC for the custom title bar plus a hidden native
// menu that only provides keyboard shortcuts.
const { app, ipcMain, shell, Menu, BrowserWindow } = require('electron');

const REPO = 'THD-Spatial-AI/TEMPO';
const win = (event) => (event && BrowserWindow.fromWebContents(event.sender)) || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

function runAction(w, action) {
  if (!w) return;
  const wc = w.webContents;
  switch (action) {
    case 'undo': case 'redo': case 'cut': case 'copy': case 'paste': case 'selectAll':
      wc[action](); break;
    case 'reload': wc.reload(); break;
    case 'devtools': wc.toggleDevTools(); break;
    case 'zoomIn': wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5)); break;
    case 'zoomOut': wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5)); break;
    case 'zoomReset': wc.setZoomLevel(0); break;
    case 'fullscreen': w.setFullScreen(!w.isFullScreen()); break;
    case 'minimize': w.minimize(); break;
    case 'maximize': (w.isMaximized() ? w.unmaximize() : w.maximize()); break;
    case 'close': w.close(); break;
    case 'quit': app.quit(); break;
    case 'releaseNotes': shell.openExternal(`https://github.com/${REPO}/releases`); break;
    default: wc.send('menu:command', action);
  }
}

function setHiddenMenu() {
  const item = (label, accelerator, action) => ({ label, accelerator, click: () => runAction(win(), action) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [item('New model', 'CmdOrCtrl+N', 'newModel'), item('Settings', 'CmdOrCtrl+,', 'settings'), item('Exit', 'CmdOrCtrl+Q', 'quit')] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        item('Reload', 'CmdOrCtrl+R', 'reload'), item('Developer tools', 'CmdOrCtrl+Shift+I', 'devtools'),
        item('Actual size', 'CmdOrCtrl+0', 'zoomReset'), item('Zoom in', 'CmdOrCtrl+=', 'zoomIn'),
        item('Zoom out', 'CmdOrCtrl+-', 'zoomOut'), item('Full screen', 'F11', 'fullscreen'),
      ],
    },
  ]));
}

function registerWindowControls() {
  app.whenReady().then(setHiddenMenu);
  ipcMain.on('window:action', (event, action) => runAction(win(event), action));
  ipcMain.handle('window:state', (event) => {
    const w = win(event);
    return { maximized: !!w?.isMaximized(), fullscreen: !!w?.isFullScreen(), platform: process.platform, version: app.getVersion() };
  });
}

// Forward maximise / full-screen changes so the title bar can swap its icon.
function attachWindowEvents(w) {
  const send = () => w.webContents.send('window:state-changed', { maximized: w.isMaximized(), fullscreen: w.isFullScreen() });
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach((e) => w.on(e, send));
}

module.exports = { registerWindowControls, attachWindowEvents };
