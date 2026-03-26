const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lumin", {
  getState: () => ipcRenderer.invoke("wallpaper:get-state"),
  refreshWallpaper: () => ipcRenderer.invoke("wallpaper:refresh"),
  applyWallpaper: () => ipcRenderer.invoke("wallpaper:apply"),
  setAutoStart: (enabled) => ipcRenderer.invoke("settings:set-autostart", enabled),
  openCacheFolder: () => ipcRenderer.invoke("app:open-cache"),
  openSource: () => ipcRenderer.invoke("app:open-source")
});

