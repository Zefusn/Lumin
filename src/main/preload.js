const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lumin", {
  getState: () => ipcRenderer.invoke("wallpaper:get-state"),
  refreshWallpaper: () => ipcRenderer.invoke("wallpaper:refresh"),
  applyWallpaper: (startDate) => ipcRenderer.invoke("wallpaper:apply", startDate),
  setAutoStart: (enabled) => ipcRenderer.invoke("settings:set-autostart", enabled),
  updateGlassSettings: (settings) => ipcRenderer.invoke("settings:update-glass", settings),
  previewGlassSettings: (settings, startDate) =>
    ipcRenderer.invoke("settings:preview-glass", settings, startDate),
  openCacheFolder: () => ipcRenderer.invoke("app:open-cache"),
  openSource: (startDate) => ipcRenderer.invoke("app:open-source", startDate)
});
