# Electron Crash Reproduction — `content::WebContentsImpl::GetDelegate`

**Issue:** [electron/electron#50102](https://github.com/electron/electron/issues/50102)  
**Crash:** `EXCEPTION_ACCESS_VIOLATION_READ / 0xd0` — Fatal crash on Windows  
**Regression:** Electron **37.x** → **40.x**  
**Platform:** Windows only (not reproducible on macOS)

---

## How to run in Electron Fiddle

1. Download [Electron Fiddle](https://www.electronjs.org/fiddle)
2. Click **File → Open Gist** (or use the Load Fiddle button)
3. Enter: `https://github.com/vaibhavagrawal2912/electron-crash-repro-50102`
4. Select **Electron 40.6.1** in the version picker
5. Click **Run**
6. Move your mouse to the purple popup window and keep it hovering during the open/close cycles
7. The app crash-exits within 1–15 cycles with `EXCEPTION_ACCESS_VIOLATION_READ`

---

## Root Cause

When a `BrowserWindow` with `frame: false` is closed or destroyed, the `FramelessView` / `WinFrameView` NonClientHitTest code path (exclusive to frameless windows) is reached **re-entrantly** via a Windows-synthesized mouse-move event:

```
WebContents::DeleteThisIfAlive → delete this
  InspectableWebContents::~InspectableWebContents   ← already freed here
  InspectableWebContentsView::~InspectableWebContentsView
  views::View::~View → parent_->RemoveChildView
  NativeViewHostAura::RemovedFromWidget → aura::Window::Hide()
  WindowEventDispatcher::PostSynthesizeMouseMove   ← re-enters Win32 pump
    WindowFromPoint()  →  KiUserCallbackDispatch
    LegacyRenderWidgetHostHWND → WM_NCHITTEST
  WinFrameView::NonClientHitTest          (only for frame:false windows)
  WebContentsView::NonClientHitTest
  content::WebContentsImpl::GetDelegate   ← ACCESS VIOLATION 💥
```

The crash was introduced between Electron 37.x and 40.x. The identical application
binary that ran without issues on 37.x now crashes on 40.x.

---

## Affected Application Pattern

The crash is observed in BrowserStack's *Low Code Automation* desktop app (Electron 40.6.1,
Windows 10 x64). The app creates frameless windows in two places:

| Window | Config | How closed |
|--------|--------|------------|
| Splash screen | `frame:false, transparent:true, alwaysOnTop:true` | `.destroy()` |
| Recorder panel | `frame:false, alwaysOnTop:true, skipTaskbar:true` | `.close()` |

Both patterns trigger the crash path. The `.destroy()` variant (splash screen) lands the
crash most reliably because it skips the graceful close sequence.

---

## Verified environment

| Version | Result |
|---------|--------|
| Electron 37.3.1 | ✅ No crash |
| Electron 40.6.1 | ❌ Fatal crash |

OS: Windows 10.0.19045 x64  
App version: 3.38.0  
Chromium: 144.0.7559.220  
Node: 24.13.1
