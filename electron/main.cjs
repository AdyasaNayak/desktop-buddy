const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  screen,
} = require("electron");
const path = require("node:path");
const { setLongTimeout, clearLongTimeout } = require("./long-timer.cjs");
const { FORWARDS_MOUSE_MOVES, setClickThrough } = require("./click-through.cjs");
const { hideBuddy: hideBuddyWindow } = require("./hide-buddy.cjs");
const { showNotification } = require("./notifications.cjs");
const {
  createPointerTracker,
  toWindowPoint,
} = require("./pointer-tracker.cjs");
const { sendToRenderer } = require("./renderer-message.cjs");
const { notifyHiddenWaterNudge } = require("./water-reminder.cjs");
const {
  normalizeWorkStatus,
  trayTooltip,
  workStatusLabel,
} = require("./tray-status.cjs");
const {
  notifyWindowHidden,
  notifyWindowShown,
  notifyWindowWake,
} = require("./window-visibility.cjs");
const {
  clampToArea,
  displayForPoint,
  readWindowPosition,
  resolveWindowPosition,
  snapToArea,
  writeWindowPosition,
} = require("./window-position.cjs");
const {
  readAlwaysOnTop,
  writeAlwaysOnTop,
} = require("./window-preferences.cjs");
const {
  DEFAULT_LAUNCH_HIDDEN,
  applyLoginItemSettings,
  loginItemIsEnabled,
  loginItemWillLaunch,
  readLaunchHidden,
  reconcileLoginItem,
  wasLaunchedHidden,
  writeLaunchHidden,
} = require("./startup.cjs");

const PET_WINDOW = { width: 360, height: 260 };
const SETUP_WINDOW = { width: 460, height: 600 };
const POSITION_SAVE_DELAY = 250;

let sleepTimer;
let buddyWindow;
let pointerTracker;
let tray;
let trayHintShown = false;
let workStatus = null;
let pendingWindowPosition;
let positionSaveTimer;
let alwaysOnTop = true;
let launchHidden = DEFAULT_LAUNCH_HIDDEN;
let startHiddenThisRun = false;
const reminderTimers = new Map();
const windowModes = new WeakMap();
const petWindowBounds = new WeakMap();

function setupBounds(display) {
  const area = display.workArea;
  // never larger than the work area, so the setup card always fits on screen
  const width = Math.min(SETUP_WINDOW.width, area.width - 32);
  const height = Math.min(SETUP_WINDOW.height, area.height - 32);
  return {
    width,
    height,
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
  };
}

function displayForBounds(bounds) {
  const point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  // The centre, not the current display, decides where a drag can land. Using
  // the window's current monitor would clamp it before it could ever cross a
  // monitor boundary.
  return (
    displayForPoint(screen.getAllDisplays(), point) ??
    screen.getDisplayNearestPoint({
      x: Math.round(point.x),
      y: Math.round(point.y),
    })
  );
}

function clampToWorkArea(bounds) {
  return clampToArea(bounds, displayForBounds(bounds).workArea);
}

function fitToWorkArea(bounds, snap = false) {
  const area = displayForBounds(bounds).workArea;
  const clamped = clampToArea(bounds, area);
  return snap ? snapToArea(clamped, area) : clamped;
}

function pointerPosition(window) {
  if (!window || window.isDestroyed()) return { x: 0, y: 0, inside: false };
  return toWindowPoint(screen.getCursorScreenPoint(), window.getBounds());
}

function sendPointerPosition(window = buddyWindow) {
  if (!window || window.isDestroyed()) return;
  sendToRenderer(
    window.webContents,
    "window-pointer-changed",
    pointerPosition(window),
  );
}

// Forwarded moves already tell the renderer where the pointer is, so polling
// is only needed where they are unavailable. It also only runs for the pet
// view: setup is opaque and hidden windows need no pointer updates.
function startPointerPolling(window = buddyWindow) {
  if (FORWARDS_MOUSE_MOVES.has(process.platform)) return;
  if (!window || window.isDestroyed() || !window.isVisible()) return;
  if (windowModes.get(window) !== "pet") return;
  pointerTracker?.start();
}

function announcePetWindow(window) {
  // Forwarded moves may not arrive until the pointer moves again, so send the
  // current position immediately after the pet becomes visible.
  sendPointerPosition(window);
  setClickThrough(window, true);
  notifyWindowShown(window);
  startPointerPolling(window);
}

function windowPositionFile() {
  return path.join(app.getPath("userData"), "window-position.json");
}

function windowPreferencesFile() {
  return path.join(app.getPath("userData"), "window-preferences.json");
}

function startupPreferencesFile() {
  return path.join(app.getPath("userData"), "startup-preferences.json");
}

function loadAlwaysOnTop() {
  alwaysOnTop = readAlwaysOnTop(windowPreferencesFile());
}

function loadLaunchHidden() {
  launchHidden = readLaunchHidden(startupPreferencesFile());
}

function saveLaunchHidden(enabled) {
  const previous = launchHidden;
  launchHidden = enabled === true;
  if (!writeLaunchHidden(startupPreferencesFile(), launchHidden)) {
    console.error("Could not save the launch-hidden setting");
  }
  if (app.isPackaged) {
    // Keep an existing login item in sync even when it was registered by an
    // older version that did not know about the hidden argument.
    const openAtLogin = loginItemIsEnabled(app, previous);
    applyLoginItemSettings(app, {
      openAtLogin,
      launchHidden,
      enabled: openAtLogin ? loginItemWillLaunch(app, previous) : true,
    });
  }
  updateTrayMenu();
}

function setBuddyAlwaysOnTop(window, enabled) {
  alwaysOnTop = enabled === true;
  if (window && !window.isDestroyed()) {
    window.setAlwaysOnTop(alwaysOnTop);
    sendToRenderer(window.webContents, "always-on-top-changed", alwaysOnTop);
  }
  if (!writeAlwaysOnTop(windowPreferencesFile(), alwaysOnTop)) {
    console.error("Could not save the always-on-top setting");
  }
  updateTrayMenu();
}

function loadPetPosition() {
  const saved = readWindowPosition(windowPositionFile());
  if (!saved) return null;
  // prefer the monitor the buddy was left on, then fall back to the nearest
  // one when that monitor is gone or the layout changed
  return resolveWindowPosition(saved, screen.getAllDisplays(), PET_WINDOW);
}

function flushWindowPosition() {
  if (positionSaveTimer) {
    clearTimeout(positionSaveTimer);
    positionSaveTimer = undefined;
  }
  if (!pendingWindowPosition) return;

  const position = pendingWindowPosition;
  pendingWindowPosition = undefined;
  if (!writeWindowPosition(windowPositionFile(), position)) {
    console.error("Could not save the buddy window position");
  }
}

function savePetPosition(window, bounds = window.getBounds()) {
  if (!window || window.isDestroyed()) return;
  // the setup/rename window is centered on purpose, so only remember the pet
  if (windowModes.get(window) !== "pet") return;

  pendingWindowPosition = {
    x: bounds.x,
    y: bounds.y,
    displayId: displayForBounds(bounds).id,
  };
  // coalesce the many moves that arrive during a drag into occasional writes
  if (positionSaveTimer) return;
  positionSaveTimer = setTimeout(flushWindowPosition, POSITION_SAVE_DELAY);
}

function setBuddyBounds(window, bounds) {
  // setBounds is a programmatic resize; briefly lift the user-facing lock so
  // platforms that enforce resizable=false here still apply the new size
  const wasResizable = window.isResizable();
  if (!wasResizable) window.setResizable(true);
  window.setBounds(bounds, false);
  if (!wasResizable) window.setResizable(false);
}

// Native window moves (the setup window's title bar and OS-initiated moves)
// never reach move-window, so clamp every move the platform reports. The same
// centre-of-the-window display rule applies as for a renderer-driven drag.
function keepWindowInWorkArea(window) {
  if (!window || window.isDestroyed()) return;

  const bounds = window.getBounds();
  const clamped = clampToWorkArea(bounds);
  if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
    window.setPosition(clamped.x, clamped.y);
  }
  // remember moves inside the screen too, so a native move is restored after
  // a restart just like a renderer-driven drag (setup moves are ignored)
  savePetPosition(window, clamped);
}

// A monitor can disappear or change resolution while the buddy is running.
// Bring it back onto an available work area instead of leaving it off screen.
function keepWindowOnScreen() {
  const window = buddyWindow;
  if (!window || window.isDestroyed()) return;

  const bounds = window.getBounds();
  const fitted = clampToWorkArea(bounds);
  if (fitted.x !== bounds.x || fitted.y !== bounds.y) {
    setBuddyBounds(window, fitted);
  }
  if (windowModes.get(window) === "pet") {
    savePetPosition(window, fitted);
    flushWindowPosition();
  }
}

function showBuddy() {
  startHiddenThisRun = false;
  const wasSleeping = sleepTimer !== undefined;
  clearTimeout(sleepTimer);
  sleepTimer = undefined;
  if (!buddyWindow || buddyWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (buddyWindow.isMinimized()) buddyWindow.restore();
  buddyWindow.show();
  buddyWindow.focus();
  // a work timer paused for sleep starts counting again on wake
  if (wasSleeping) notifyWindowWake(buddyWindow);
}

function showTrayHint(hasTray) {
  return showNotification({
    Notification,
    title: "Desktop Buddy is still running",
    body: hasTray
      ? "Click the tray icon, or open Desktop Buddy again, to bring your buddy back."
      : "Open Desktop Buddy again to bring your buddy back.",
    failureMessage: "Could not show the tray hint",
  });
}

// Returns true when the buddy ended up hidden. Without a tray and without a
// notification explaining how to restore it, the window stays on screen.
function hideBuddy(window = buddyWindow) {
  // a tray that failed at launch is retried here, before deciding that there
  // is no reliable way back
  if (!tray) createTray();

  const result = hideBuddyWindow({
    window,
    hasTray: Boolean(tray),
    hintShown: trayHintShown,
    showHint: () => showTrayHint(Boolean(tray)),
  });
  trayHintShown = result.hintShown;
  return result.hidden;
}

function updateTrayMenu() {
  if (!tray) return;
  const visible = Boolean(
    buddyWindow && !buddyWindow.isDestroyed() && buddyWindow.isVisible(),
  );
  tray.setToolTip(trayTooltip({ visible, work: workStatus }));

  const template = [];
  if (workStatus) {
    // keep the running timer visible in the tray menu while the buddy hides
    template.push(
      { label: workStatusLabel(workStatus), enabled: false },
      { type: "separator" },
    );
  }
  template.push(
    { label: "Show Desktop Buddy", enabled: !visible, click: showBuddy },
    {
      label: "Hide Desktop Buddy",
      enabled: visible,
      click: () => hideBuddy(),
    },
    {
      label: "Always on top",
      type: "checkbox",
      checked: alwaysOnTop,
      click: (item) => setBuddyAlwaysOnTop(buddyWindow, item.checked),
    },
    {
      label: "Launch hidden at login",
      type: "checkbox",
      checked: launchHidden,
      click: (item) => saveLaunchHidden(item.checked),
    },
    { type: "separator" },
    { label: "Quit Desktop Buddy", click: () => app.quit() },
  );
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  if (tray) return;
  try {
    const icon = nativeImage.createFromPath(
      path.join(__dirname, "tray-icon.png"),
    );
    if (icon.isEmpty()) return;

    tray = new Tray(icon);
    tray.on("click", showBuddy);
    tray.on("double-click", showBuddy);
    updateTrayMenu();
  } catch (error) {
    // the pet must still start on systems without a tray; reopening the app
    // brings a hidden buddy back even without one
    console.error("Could not create the tray icon", error);
    if (tray) tray.destroy();
    tray = undefined;
  }
}

function createWindow() {
  const savedPosition = loadPetPosition();
  const window = new BrowserWindow({
    ...PET_WINDOW,
    ...(savedPosition ?? {}),
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Water nudges are checked by a timer in the renderer. A buddy hidden in
      // the tray still needs that timer to run on schedule.
      backgroundThrottling: false,
    },
  });

  // The renderer picks the window size once it knows whether this is a first
  // launch. Show the window anyway if that never arrives (for example a
  // renderer crash), so a normal launch can't start invisible.
  const revealTimer = setTimeout(() => {
    // A login launch deliberately stays out of the way. Opening the buddy from
    // the tray clears the flag, so the fallback still applies then.
    if (!startHiddenThisRun && !window.isDestroyed() && !window.isVisible()) {
      window.show();
    }
  }, 4000);
  // once the renderer has shown the window, the fallback is no longer needed
  // and must not undo a deliberate hide later on
  window.once("show", () => clearTimeout(revealTimer));
  // A reload starts on a blank, transparent page, so a pet window must not
  // catch clicks while the fresh renderer is still loading. Setup mode stays
  // fully interactive.
  window.webContents.on("did-start-loading", () => {
    setClickThrough(window, windowModes.get(window) === "pet");
    pointerTracker?.reset();
  });
  buddyWindow = window;
  pointerTracker = createPointerTracker({
    getWindow: () => buddyWindow,
    getCursor: () => screen.getCursorScreenPoint(),
    send: (point) =>
      sendToRenderer(window.webContents, "window-pointer-changed", point),
  });
  window.on("move", () => keepWindowInWorkArea(window));
  // some platforms only report the final position at the end of a drag
  window.on("moved", () => keepWindowInWorkArea(window));
  window.on("show", () => {
    startHiddenThisRun = false;
    updateTrayMenu();
    // never let a freshly shown pet block the desktop while the renderer
    // waits to find out where the pointer is
    if (windowModes.get(window) === "pet") announcePetWindow(window);
  });
  window.on("hide", () => {
    pointerTracker?.stop();
    updateTrayMenu();
    // close any menu or dialog the renderer still has open, so it does not
    // wait behind a hidden window and pop up again when it wakes
    notifyWindowHidden(window);
  });
  window.on("close", () => {
    savePetPosition(window);
    flushWindowPosition();
  });
  window.on("closed", () => {
    clearTimeout(revealTimer);
    clearTimeout(sleepTimer);
    sleepTimer = undefined;
    pointerTracker?.stop();
    pointerTracker = undefined;
    if (buddyWindow === window) buddyWindow = undefined;
    if (buddyWindow === undefined) workStatus = null;
    updateTrayMenu();
  });

  if (app.isPackaged || process.argv.includes("--production")) {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  } else {
    window.loadURL("http://localhost:5173");
  }
}

ipcMain.on("window-position", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = window?.getPosition() ?? [0, 0];
});

ipcMain.on("window-pointer", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = pointerPosition(window);
});

ipcMain.on("get-always-on-top", (event) => {
  event.returnValue = alwaysOnTop;
});

ipcMain.on("set-always-on-top", (event, enabled) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== buddyWindow || typeof enabled !== "boolean") return;
  setBuddyAlwaysOnTop(window, enabled);
});

ipcMain.on("move-window", (event, x, y) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(x) || !Number.isFinite(y)) return;

  const bounds = fitToWorkArea(
    {
      ...window.getBounds(),
      x: Math.round(x),
      y: Math.round(y),
    },
    true,
  );
  window.setPosition(bounds.x, bounds.y);
  savePetPosition(window, bounds);
});

ipcMain.on("sleep-window", (event, duration) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(duration)) return;

  clearTimeout(sleepTimer);
  sleepTimer = undefined;
  window.hide();
  sleepTimer = setTimeout(() => {
    sleepTimer = undefined;
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
      notifyWindowWake(window);
    }
  }, Math.max(1000, duration));
});

ipcMain.on("work-status", (event, status) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window !== buddyWindow) return;
  workStatus = normalizeWorkStatus(status);
  updateTrayMenu();
});

ipcMain.handle("hide-app", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? hideBuddy(window) : false;
});

ipcMain.on("set-click-through", (event, ignore) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  setClickThrough(window, ignore === true);
});

ipcMain.on("exit-app", () => app.quit());

ipcMain.on("window-mode", (event, mode) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed() || (mode !== "setup" && mode !== "pet")) return;

  const bounds = window.getBounds();
  const previousMode = windowModes.get(window);
  if (mode === "setup") {
    // a first-run login needs the setup card on screen, not a hidden window
    startHiddenThisRun = false;
    // the setup window is opaque, so it must catch every click
    setClickThrough(window, false);
    // remember where a visible buddy was so renaming can put it back
    if (previousMode === "pet") {
      petWindowBounds.set(window, bounds);
      savePetPosition(window, bounds);
    }
  }

  // Switch modes before resizing: setBounds can emit a synchronous move, and
  // the centered setup bounds must not be remembered as the pet position.
  windowModes.set(window, mode);
  if (mode === "setup") {
    setBuddyBounds(window, setupBounds(screen.getDisplayMatching(bounds)));
  } else {
    const saved = petWindowBounds.get(window);
    petWindowBounds.delete(window);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    setBuddyBounds(
      window,
      saved
        ? clampToWorkArea(saved)
        : {
            ...PET_WINDOW,
            x: Math.round(centerX - PET_WINDOW.width / 2),
            y: Math.round(centerY - PET_WINDOW.height / 2),
          },
    );
  }

  const wasVisible = window.isVisible();
  // A login launch stays in the tray until the user asks for the buddy.
  if (!wasVisible && !(mode === "pet" && startHiddenThisRun)) window.show();
  // the pet view is transparent until the renderer finds an interactive part;
  // the setup window is opaque and keeps every click
  setClickThrough(window, mode === "pet");
  if (mode === "pet") {
    // the show event covers a hidden window; this covers setup -> pet
    if (wasVisible) announcePetWindow(window);
    startPointerPolling(window);
  } else {
    pointerTracker?.stop();
  }
  pointerTracker?.reset();
  if (mode === "pet") savePetPosition(window);
});

ipcMain.on("is-packaged", (event) => {
  event.returnValue = app.isPackaged;
});

ipcMain.on("set-login-item", (event, openAtLogin, hiddenAtLogin) => {
  // login items only make sense for the installed app, not the dev runner
  if (!app.isPackaged) {
    event.returnValue = false;
    return;
  }
  const previous = launchHidden;
  launchHidden = hiddenAtLogin === true;
  if (!writeLaunchHidden(startupPreferencesFile(), launchHidden)) {
    console.error("Could not save the launch-hidden setting");
  }
  const alreadyEnabled = loginItemIsEnabled(app, previous);
  const enabled = openAtLogin === true || alreadyEnabled;
  event.returnValue = applyLoginItemSettings(app, {
    openAtLogin: enabled,
    launchHidden,
  });
  updateTrayMenu();
});

ipcMain.on("schedule-reminder", (event, id, text, remindAt) => {
  if (!Number.isInteger(id) || typeof text !== "string" || !Number.isFinite(remindAt)) return;

  clearLongTimeout(reminderTimers.get(id));

  // reminders can be months away, which plain setTimeout cannot handle
  const timer = setLongTimeout(remindAt, () => {
    reminderTimers.delete(id);
    showNotification({
      Notification,
      title: "Desktop Buddy reminder",
      body: text,
      failureMessage: "Could not show the reminder",
    });
    // the window can be gone by the time a long reminder comes due
    sendToRenderer(event.sender, "reminder-fired", id);
  });
  reminderTimers.set(id, timer);
});

ipcMain.on("cancel-reminder", (_event, id) => {
  clearLongTimeout(reminderTimers.get(id));
  reminderTimers.delete(id);
});

ipcMain.on("notify-water-reminder", (event, notice) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  notifyHiddenWaterNudge({
    window,
    notice,
    show: ({ title, body, onClick }) =>
      showNotification({
        Notification,
        title,
        body,
        onClick,
        failureMessage: "Could not show the water reminder",
      }),
    showBuddy,
  });
});

ipcMain.on("notify-work-reminder", (_event, notice) => {
  if (
    !notice ||
    typeof notice.title !== "string" ||
    typeof notice.body !== "string"
  )
    return;
  showNotification({
    Notification,
    title: notice.title,
    body: notice.body,
    onClick: showBuddy,
    failureMessage: "Could not show the work break reminder",
  });
});

ipcMain.on("notify-missed-reminders", (_event, notice) => {
  if (
    !notice ||
    typeof notice.title !== "string" ||
    typeof notice.body !== "string"
  )
    return;
  // one notification for the whole backlog, not one per missed reminder
  showNotification({
    Notification,
    title: notice.title,
    body: notice.body,
    failureMessage: "Could not show missed reminders",
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Reopening the app while the buddy is hidden should bring the existing one
  // back instead of starting a second copy.
  app.on("second-instance", () => {
    if (app.isReady()) showBuddy();
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.adyasa.desktopbuddy");
    }
    loadAlwaysOnTop();
    loadLaunchHidden();
    createTray();
    const openedAtLogin =
      process.platform === "darwin" &&
      app.getLoginItemSettings().wasOpenedAtLogin === true;
    // Without a tray there is no way back, so a hidden launch stays visible.
    startHiddenThisRun =
      wasLaunchedHidden({
        argv: process.argv,
        launchHidden,
        openedAtLogin,
      }) && Boolean(tray);
    if (app.isPackaged) reconcileLoginItem(app, launchHidden);
    createWindow();
    for (const event of [
      "display-added",
      "display-removed",
      "display-metrics-changed",
    ]) {
      screen.on(event, keepWindowOnScreen);
    }

    app.on("activate", showBuddy);
  });
}

app.on("before-quit", flushWindowPosition);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
