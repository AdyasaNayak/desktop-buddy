const { app, BrowserWindow, Notification, ipcMain } = require("electron");
const path = require("node:path");

let sleepTimer;
const reminderTimers = new Map();

function createWindow() {
  const window = new BrowserWindow({
    width: 360,
    height: 260,
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

  if (process.argv.includes("--production")) {
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

ipcMain.on("exit-app", () => app.quit());

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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
