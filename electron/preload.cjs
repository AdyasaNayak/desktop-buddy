const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBuddy", {
  getWindowPosition: () => ipcRenderer.sendSync("window-position"),
  moveWindow: (x, y) => ipcRenderer.send("move-window", x, y),
  sleepWindow: (duration) => ipcRenderer.send("sleep-window", duration),
  exitApp: () => ipcRenderer.send("exit-app"),
});
