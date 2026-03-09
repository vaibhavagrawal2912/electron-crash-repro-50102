// Renderer: receives cycle-update events from main process and updates the log
const { ipcRenderer } = require('electron');

const logEl = document.getElementById('log');

function appendLog(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  entry.textContent = `[${ts}] ${msg}`;
  logEl.prepend(entry);
  // Keep at most 60 entries
  while (logEl.children.length > 60) {
    logEl.removeChild(logEl.lastChild);
  }
}

ipcRenderer.on('cycle-update', (_event, cycleCount) => {
  appendLog(`Frameless window #${cycleCount} closed — cycling again. (Mouse over popup = higher crash chance)`, 'info');
});

appendLog('Repro started: splashScreen.destroy() → repeated frame:false BrowserWindow cycling...');
appendLog('Move mouse to the purple popup and keep it there to trigger the crash.');
