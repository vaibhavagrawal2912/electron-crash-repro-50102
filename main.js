// Reproduction for: https://github.com/electron/electron/issues/50102
// Crash: EXCEPTION_ACCESS_VIOLATION_READ at content::WebContentsImpl::GetDelegate
// Regression: Electron 37.x → 40.x  |  Platform: Windows only
//
// Root cause: When a BrowserWindow with frame:false is closed/destroyed, the
// FramelessView::NonClientHitTest code path (specific to frameless windows) is
// entered re-entrantly via a Windows-synthesized mouse move (PostSynthesizeMouseMove)
// triggered by the Aura window visibility change.  The NCHITTEST handler calls
// WebContentsView::NonClientHitTest which dereferences the already-freed
// InspectableWebContentsView → use-after-free → fatal crash.
//
// How to reproduce:
//   1. Open this fiddle on a Windows machine running Electron 40.x
//   2. Move your mouse to the purple popup window ("Frameless Window")
//   3. Keep it hovering there as the window cycles open/close
//   4. Crash should occur within a few cycles (1–15 cycles typically)

const { app, BrowserWindow } = require('electron');

let mainWindow = null;
let cycleCount = 0;

// ─── Main window ─────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

// ─── Frameless window (mirrors LCA splash screen + recorder window) ───────────
//   - frame:false        → forces WinFrameView / FramelessView path on Windows
//   - alwaysOnTop:true   → matches LCA recorder window config
//   - skipTaskbar:true   → matches LCA recorder window config
//
// The crash manifests during .close() / .destroy() of this kind of window
// because the teardown calls InspectableWebContentsView::~() while Windows
// is still dispatching WM_NCHITTEST to the legacy HWND of the same window.
function createFramelessWindow(label) {
  const win = new BrowserWindow({
    width: 580,
    height: 380,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  win.loadFile('frameless.html');
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cycle-update', cycleCount);
    }
  });
  return win;
}

// ─── Simulate LCA: Splash destroy() then repeated recorder open/close ─────────
app.whenReady().then(() => {
  createMainWindow();

  // --- Phase 1: Splash screen pattern ---
  // LCA calls splashScreen.destroy() from the 'ready-to-show' handler of
  // the main window (registerMainWindowListeners.js:72).
  const splashWin = createFramelessWindow('Splash');
  setTimeout(() => {
    if (splashWin && !splashWin.isDestroyed()) {
      // .destroy() is more abrupt than .close() - higher crash probability
      splashWin.destroy();
    }

    // --- Phase 2: Recorder window cycling ---
    // LCA cycles the recorder window (frame:false, alwaysOnTop:true) each
    // test session. The crash is most frequent during rapid close/reopen.
    function cycleRecorderWindow() {
      if (!mainWindow || mainWindow.isDestroyed()) return;

      cycleCount++;
      const recorderWin = createFramelessWindow(`Recorder #${cycleCount}`);

      // Close after a short display interval (vary to increase crash odds)
      const closeDelay = 800 + Math.random() * 600;
      setTimeout(() => {
        if (!recorderWin.isDestroyed()) {
          recorderWin.close();
        }
        // Schedule next cycle
        setTimeout(cycleRecorderWindow, 200);
      }, closeDelay);
    }

    setTimeout(cycleRecorderWindow, 500);
  }, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
