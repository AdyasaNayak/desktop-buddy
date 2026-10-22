const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBuddy", {
  isPackaged: ipcRenderer.sendSync("is-packaged"),
  getWindowPosition: () => ipcRenderer.sendSync("window-position"),
  moveWindow: (x, y) => ipcRenderer.send("move-window", x, y),
  sleepWindow: (duration) => ipcRenderer.send("sleep-window", duration),
  exitApp: () => ipcRenderer.send("exit-app"),
  setLoginItem: (openAtLogin) => ipcRenderer.sendSync("set-login-item", openAtLogin),
  scheduleReminder: (id, text, remindAt) => ipcRenderer.send("schedule-reminder", id, text, remindAt),
  cancelReminder: (id) => ipcRenderer.send("cancel-reminder", id),
  onReminder: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on("reminder-fired", listener);
    return () => ipcRenderer.removeListener("reminder-fired", listener);
  },
});
