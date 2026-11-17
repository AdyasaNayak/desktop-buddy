const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBuddy", {
  isPackaged: ipcRenderer.sendSync("is-packaged"),
  getWindowPosition: () => ipcRenderer.sendSync("window-position"),
  getPointerPosition: () => ipcRenderer.sendSync("window-pointer"),
  getAlwaysOnTop: () => ipcRenderer.sendSync("get-always-on-top"),
  setAlwaysOnTop: (enabled) =>
    ipcRenderer.send("set-always-on-top", enabled),
  onAlwaysOnTopChanged: (callback) => {
    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on("always-on-top-changed", listener);
    return () =>
      ipcRenderer.removeListener("always-on-top-changed", listener);
  },
  onPointerPosition: (callback) => {
    const listener = (_event, point) => callback(point);
    ipcRenderer.on("window-pointer-changed", listener);
    return () =>
      ipcRenderer.removeListener("window-pointer-changed", listener);
  },
  setWindowMode: (mode) => ipcRenderer.send("window-mode", mode),
  moveWindow: (x, y) => ipcRenderer.send("move-window", x, y),
  sleepWindow: (duration) => ipcRenderer.send("sleep-window", duration),
  hideApp: () => ipcRenderer.invoke("hide-app"),
  setWorkStatus: (status) => ipcRenderer.send("work-status", status),
  setClickThrough: (ignore) => ipcRenderer.send("set-click-through", ignore),
  exitApp: () => ipcRenderer.send("exit-app"),
  setLoginItem: (openAtLogin, launchHidden) =>
    ipcRenderer.sendSync("set-login-item", openAtLogin, launchHidden),
  scheduleReminder: (id, text, remindAt) => ipcRenderer.send("schedule-reminder", id, text, remindAt),
  cancelReminder: (id) => ipcRenderer.send("cancel-reminder", id),
  notifyMissedReminders: (notice) =>
    ipcRenderer.send("notify-missed-reminders", notice),
  notifyWaterReminder: (notice) =>
    ipcRenderer.send("notify-water-reminder", notice),
  notifyWorkReminder: (notice) =>
    ipcRenderer.send("notify-work-reminder", notice),
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
  onWindowWake: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window-wake", listener);
    return () => ipcRenderer.removeListener("window-wake", listener);
  },
  onWindowShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window-shown", listener);
    return () => ipcRenderer.removeListener("window-shown", listener);
  },
});
