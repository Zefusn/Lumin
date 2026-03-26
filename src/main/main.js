const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const { AppStore } = require("./store");
const { fetchLatestWallpaper } = require("./services/bingService");
const {
  createFrostedWallpaper,
  FROSTED_WALLPAPER_VERSION
} = require("./services/imageService");
const {
  getWindowsProductName,
  setDesktopWallpaper,
  setLockScreenWallpaperSilently
} = require("./services/windowsService");

let mainWindow;
let store;
let windowsProductName = "Windows";
let busy = false;

function asFileUrl(filePath) {
  return filePath ? pathToFileURL(filePath).toString() : null;
}

function nowIso() {
  return new Date().toISOString();
}

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function compactMessage(message) {
  if (!message) {
    return "操作完成。";
  }

  return message.replace(/\s+/g, " ").trim();
}

function buildViewModel(message = null, tone = "success") {
  const state = store.getState();
  const wallpaper = state.wallpaper;

  return {
    appVersion: app.getVersion(),
    autoLaunchEnabled: state.autoLaunchEnabled,
    message:
      message ||
      state.lastStatus?.message ||
      "Lumin 已就绪，可以按 FirstPage 同款图源获取 Bing 壁纸并生成毛玻璃版本。",
    tone: message ? tone : state.lastStatus?.tone || "success",
    windowsProductName,
    wallpaper: wallpaper
      ? {
          ...wallpaper,
          originalUrl: `${asFileUrl(wallpaper.originalPath)}?t=${Date.now()}`,
          frostedUrl: `${asFileUrl(wallpaper.frostedPath)}?t=${Date.now()}`
        }
      : null
  };
}

async function rememberStatus(message, tone = "success") {
  await store.patch({
    lastStatus: {
      message,
      tone,
      at: nowIso()
    }
  });
}

async function refreshWallpaper(options = {}) {
  if (busy) {
    return buildViewModel("正在处理中", "warning");
  }

  busy = true;

  try {
    const latest = await fetchLatestWallpaper(store.cacheDir);
    const frostedPath = await createFrostedWallpaper(
      latest.originalPath,
      store.cacheDir,
      latest.startDate
    );

    const wallpaper = {
      bingId: latest.bingId,
      startDate: latest.startDate,
      endDate: latest.endDate,
      title: latest.title,
      copyright: latest.copyright,
      copyrightLink: latest.copyrightLink,
      sourceUrl: latest.sourceUrl,
      originalPath: latest.originalPath,
      frostedPath,
      processorVersion: FROSTED_WALLPAPER_VERSION,
      refreshedAt: nowIso(),
      refreshedLocalDay: localDayKey()
    };

    await store.patch({ wallpaper });

    if (options.applyDesktopAfterRefresh) {
      await setDesktopWallpaper(frostedPath);
      await store.patch({
        wallpaper: {
          ...store.getState().wallpaper,
          desktopAppliedAt: nowIso()
        }
      });
    }

    const summary = options.applyDesktopAfterRefresh
      ? "今日壁纸已自动应用"
      : "今日壁纸已更新";

    await rememberStatus(summary, "success");
    return buildViewModel(summary, "success");
  } catch (error) {
    const message = `更新壁纸失败：${error.message}`;
    await rememberStatus(message, "error");
    return buildViewModel(message, "error");
  } finally {
    busy = false;
  }
}

async function applyCurrentWallpaper() {
  if (busy) {
    return buildViewModel("正在处理中", "warning");
  }

  const wallpaper = store.getState().wallpaper;
  if (!wallpaper?.frostedPath) {
    return buildViewModel("请先获取壁纸", "warning");
  }

  busy = true;

  try {
    await fs.access(wallpaper.frostedPath);
    await setDesktopWallpaper(wallpaper.frostedPath);

    const lockScreenResult = await setLockScreenWallpaperSilently(wallpaper.frostedPath);

    await store.patch({
      wallpaper: {
        ...wallpaper,
        desktopAppliedAt: nowIso(),
        lockScreenAppliedAt: lockScreenResult.applied ? nowIso() : wallpaper.lockScreenAppliedAt
      }
    });

    const summary = lockScreenResult.applied
      ? "桌面与锁屏已应用"
      : `桌面已应用，${lockScreenResult.reason}`;

    const compact = compactMessage(summary);
    await rememberStatus(compact, lockScreenResult.applied ? "success" : "warning");
    return buildViewModel(compact, lockScreenResult.applied ? "success" : "warning");
  } catch (error) {
    const message = `应用壁纸失败：${error.message}`;
    await rememberStatus(message, "error");
    return buildViewModel(message, "error");
  } finally {
    busy = false;
  }
}

async function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false
  });

  await store.patch({ autoLaunchEnabled: enabled });
  const message = enabled ? "已开启开机自启。" : "已关闭开机自启。";
  const compact = enabled ? "已开启开机自启" : "已关闭开机自启";
  await rememberStatus(compact, "success");
  return buildViewModel(compact, "success");
}

async function syncAutoLaunchState() {
  const settings = app.getLoginItemSettings();
  await store.patch({
    autoLaunchEnabled: Boolean(settings.openAtLogin)
  });
}

async function maybeRefreshDailyWallpaper() {
  const wallpaper = store.getState().wallpaper;
  const today = localDayKey();

  if (!wallpaper || wallpaper.refreshedLocalDay !== today) {
    await refreshWallpaper({ applyDesktopAfterRefresh: true });
    return;
  }

  if (wallpaper.processorVersion !== FROSTED_WALLPAPER_VERSION) {
    try {
      await fs.access(wallpaper.originalPath);
      const frostedPath = await createFrostedWallpaper(
        wallpaper.originalPath,
        store.cacheDir,
        wallpaper.startDate
      );

      await store.patch({
        wallpaper: {
          ...wallpaper,
          frostedPath,
          processorVersion: FROSTED_WALLPAPER_VERSION,
          refreshedAt: nowIso()
        }
      });

      await rememberStatus("已重新生成毛玻璃壁纸", "success");
    } catch (error) {
      await rememberStatus(`缓存迁移失败：${error.message}`, "warning");
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 760,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: "#eef2f6",
    title: "Lumin",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function registerIpc() {
  ipcMain.handle("wallpaper:get-state", async () => buildViewModel());
  ipcMain.handle("wallpaper:refresh", async () => refreshWallpaper());
  ipcMain.handle("wallpaper:apply", async () => applyCurrentWallpaper());
  ipcMain.handle("settings:set-autostart", async (_event, enabled) => setAutoLaunch(enabled));
  ipcMain.handle("app:open-cache", async () => shell.openPath(store.cacheDir));
  ipcMain.handle("app:open-source", async () => {
    const sourceUrl = store.getState().wallpaper?.sourceUrl;
    if (sourceUrl) {
      await shell.openExternal(sourceUrl);
    }
  });
}

async function bootstrap() {
  store = await new AppStore(app.getPath("userData")).init();
  await syncAutoLaunchState();
  windowsProductName = await getWindowsProductName();
  registerIpc();
  await maybeRefreshDailyWallpaper();
  createWindow();
  setInterval(() => {
    maybeRefreshDailyWallpaper().catch(() => {});
  }, 60 * 60 * 1000);
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
