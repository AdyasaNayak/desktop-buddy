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

const PET_WINDOW = { width: 360, height: 260 };
const SETUP_WINDOW = { width: 460, height: 600 };

let sleepTimer;
let buddyWindow;
let tray;
let trayHintShown = false;
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
  const area = screen.getDisplayMatching(bounds).workArea;
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height),
  };
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

function hideBuddy(window = buddyWindow) {
  if (!window || window.isDestroyed()) return;
  window.hide();

  if (trayHintShown) return;
  trayHintShown = true;
  if (!Notification.isSupported()) return;
  try {
    new Notification({
      title: "Desktop Buddy is still running",
      body: tray
        ? "Click the tray icon, or open Desktop Buddy again, to bring your buddy back."
        : "Open Desktop Buddy again to bring your buddy back.",
    }).show();
  } catch (error) {
    console.error("Could not show the tray hint", error);
  }
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
  const window = new BrowserWindow({
    ...PET_WINDOW,
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
  buddyWindow = window;
  window.on("show", updateTrayMenu);
  window.on("hide", updateTrayMenu);
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
  if (window && Number.isFinite(x) && Number.isFinite(y)) {
    window.setPosition(Math.round(x), Math.round(y));
  }
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

ipcMain.on("hide-app", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) hideBuddy(window);
});

ipcMain.on("exit-app", () => app.quit());

ipcMain.on("window-mode", (event, mode) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed() || (mode !== "setup" && mode !== "pet")) return;

  const bounds = window.getBounds();
  if (mode === "setup") {
    // remember where a visible buddy was so renaming can put it back
    if (windowModes.get(window) === "pet") petWindowBounds.set(window, bounds);
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
});

ipcMain.on("is-packaged", (event) => {
  event.returnValue = app.isPackaged;
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

  const existing = reminderTimers.get(id);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, remindAt - Date.now());
  const timer = setTimeout(() => {
    reminderTimers.delete(id);
    new Notification({ title: "Desktop Buddy reminder", body: text }).show();
    event.sender.send("reminder-fired", id);
  }, delay);
  reminderTimers.set(id, timer);
});

ipcMain.on("cancel-reminder", (_event, id) => {
  const timer = reminderTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete(id);
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
