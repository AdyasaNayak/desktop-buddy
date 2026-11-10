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
const { setClickThrough } = require("./click-through.cjs");
const { hideBuddy: hideBuddyWindow } = require("./hide-buddy.cjs");
const { notifyHiddenWaterNudge } = require("./water-reminder.cjs");
const { notifyWindowHidden } = require("./window-visibility.cjs");
const {
  clampToArea,
  readWindowPosition,
  writeWindowPosition,
} = require("./window-position.cjs");

const PET_WINDOW = { width: 360, height: 260 };
const SETUP_WINDOW = { width: 460, height: 600 };
const POSITION_SAVE_DELAY = 250;
// Reminders already past this instant were missed while the app was closed.
// Kept separate from renderer load time so a reload cannot re-classify a
// reminder that came due while the app was running.
const appStartedAt = Date.now();

let sleepTimer;
let buddyWindow;
let tray;
let trayHintShown = false;
let pendingWindowPosition;
let positionSaveTimer;
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

function clampToWorkArea(bounds) {
  return clampToArea(bounds, screen.getDisplayMatching(bounds).workArea);
}

function windowPositionFile() {
  return path.join(app.getPath("userData"), "window-position.json");
}

function loadPetPosition() {
  const saved = readWindowPosition(windowPositionFile());
  if (!saved) return null;
  // the monitor the buddy was left on may be gone since the last run
  const bounds = clampToWorkArea({ ...PET_WINDOW, ...saved });
  return { x: bounds.x, y: bounds.y };
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

  pendingWindowPosition = { x: bounds.x, y: bounds.y };
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

function showBuddy() {
  clearTimeout(sleepTimer);
  if (!buddyWindow || buddyWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (buddyWindow.isMinimized()) buddyWindow.restore();
  buddyWindow.show();
  buddyWindow.focus();
}

function showTrayHint(hasTray) {
  if (!Notification.isSupported()) return false;
  try {
    new Notification({
      title: "Desktop Buddy is still running",
      body: hasTray
        ? "Click the tray icon, or open Desktop Buddy again, to bring your buddy back."
        : "Open Desktop Buddy again to bring your buddy back.",
    }).show();
    return true;
  } catch (error) {
    console.error("Could not show the tray hint", error);
    return false;
  }
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
  tray.setToolTip(
    visible ? "Desktop Buddy" : "Desktop Buddy — click to bring me back",
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Desktop Buddy", enabled: !visible, click: showBuddy },
      {
        label: "Hide Desktop Buddy",
        enabled: visible,
        click: () => hideBuddy(),
      },
      { type: "separator" },
      { label: "Quit Desktop Buddy", click: () => app.quit() },
    ]),
  );
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
    alwaysOnTop: true,
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
  // renderer crash), so the app can't start invisible.
  const revealTimer = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) window.show();
  }, 4000);
  // once the renderer has shown the window, the fallback is no longer needed
  // and must not undo a deliberate hide later on
  window.once("show", () => clearTimeout(revealTimer));
  // a reload starts fully interactive; the fresh renderer asks for
  // click-through again once it knows where the buddy is drawn
  window.webContents.on("did-start-loading", () =>
    setClickThrough(window, false),
  );
  buddyWindow = window;
  window.on("show", updateTrayMenu);
  window.on("hide", () => {
    updateTrayMenu();
    // close any menu or dialog the renderer still has open, so it does not
    // wait behind a hidden window and pop up again on wake
    notifyWindowHidden(window);
  });
  window.on("close", () => {
    savePetPosition(window);
    flushWindowPosition();
  });
  window.on("closed", () => {
    clearTimeout(revealTimer);
    if (buddyWindow === window) buddyWindow = undefined;
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

ipcMain.on("move-window", (event, x, y) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(x) || !Number.isFinite(y)) return;

  const bounds = clampToWorkArea({
    ...window.getBounds(),
    x: Math.round(x),
    y: Math.round(y),
  });
  window.setPosition(bounds.x, bounds.y);
  savePetPosition(window, bounds);
});

ipcMain.on("sleep-window", (event, duration) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(duration)) return;

  clearTimeout(sleepTimer);
  window.hide();
  sleepTimer = setTimeout(() => {
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  }, Math.max(1000, duration));
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
  if (mode === "setup") {
    // the setup window is opaque, so it must catch every click
    setClickThrough(window, false);
    // remember where a visible buddy was so renaming can put it back
    if (windowModes.get(window) === "pet") {
      petWindowBounds.set(window, bounds);
      savePetPosition(window, bounds);
    }
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

  windowModes.set(window, mode);
  if (!window.isVisible()) window.show();
  if (mode === "pet") savePetPosition(window);
});

ipcMain.on("is-packaged", (event) => {
  event.returnValue = app.isPackaged;
});

ipcMain.on("app-started-at", (event) => {
  event.returnValue = appStartedAt;
});

ipcMain.on("set-login-item", (event, openAtLogin) => {
  // login items only make sense for the installed app, not the dev runner
  if (!app.isPackaged) {
    event.returnValue = false;
    return;
  }
  app.setLoginItemSettings({ openAtLogin: openAtLogin === true });
  event.returnValue = app.getLoginItemSettings().openAtLogin === (openAtLogin === true);
});

ipcMain.on("schedule-reminder", (event, id, text, remindAt) => {
  if (!Number.isInteger(id) || typeof text !== "string" || !Number.isFinite(remindAt)) return;

  clearLongTimeout(reminderTimers.get(id));

  // reminders can be months away, which plain setTimeout cannot handle
  const timer = setLongTimeout(remindAt, () => {
    reminderTimers.delete(id);
    new Notification({ title: "Desktop Buddy reminder", body: text }).show();
    // the window can be gone by the time a long reminder comes due
    if (!event.sender.isDestroyed()) event.sender.send("reminder-fired", id);
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
    show: ({ title, body, onClick }) => {
      try {
        const notification = new Notification({ title, body });
        notification.on("click", onClick);
        notification.show();
        return true;
      } catch (error) {
        console.error("Could not show the water reminder", error);
        return false;
      }
    },
    showBuddy,
  });
});

ipcMain.on("notify-missed-reminders", (_event, notice) => {
  if (
    !notice ||
    typeof notice.title !== "string" ||
    typeof notice.body !== "string"
  )
    return;
  try {
    // one notification for the whole backlog, not one per missed reminder
    new Notification({ title: notice.title, body: notice.body }).show();
  } catch (error) {
    console.error("Could not show missed reminders", error);
  }
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
    createTray();
    createWindow();

    app.on("activate", showBuddy);
  });
}

app.on("before-quit", flushWindowPosition);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
