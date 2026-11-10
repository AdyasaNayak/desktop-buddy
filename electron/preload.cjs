const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBuddy", {
  isPackaged: ipcRenderer.sendSync("is-packaged"),
  appStartedAt: ipcRenderer.sendSync("app-started-at"),
  getWindowPosition: () => ipcRenderer.sendSync("window-position"),
  setWindowMode: (mode) => ipcRenderer.send("window-mode", mode),
  moveWindow: (x, y) => ipcRenderer.send("move-window", x, y),
  sleepWindow: (duration) => ipcRenderer.send("sleep-window", duration),
  hideApp: () => ipcRenderer.invoke("hide-app"),
  setClickThrough: (ignore) => ipcRenderer.send("set-click-through", ignore),
  exitApp: () => ipcRenderer.send("exit-app"),
  setLoginItem: (openAtLogin) => ipcRenderer.sendSync("set-login-item", openAtLogin),
  scheduleReminder: (id, text, remindAt) => ipcRenderer.send("schedule-reminder", id, text, remindAt),
  cancelReminder: (id) => ipcRenderer.send("cancel-reminder", id),
  notifyMissedReminders: (notice) =>
    ipcRenderer.send("notify-missed-reminders", notice),
  onReminder: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on("reminder-fired", listener);
    return () => ipcRenderer.removeListener("reminder-fired", listener);
  },
  onWindowHidden: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window-hidden", listener);
    return () => ipcRenderer.removeListener("window-hidden", listener);
  },
});
