const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const { AppStore, DEFAULT_GLASS_SETTINGS } = require("./store");
const { fetchWallpaperBundle } = require("./services/bingService");
const {
  createFrostedWallpaper,
  FROSTED_WALLPAPER_VERSION,
  normalizeGlassSettings
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

function withCacheBust(filePath) {
  return filePath ? `${asFileUrl(filePath)}?t=${Date.now()}` : null;
}

function compactMessage(message) {
  return (message || "已完成").replace(/\s+/g, " ").trim();
}

function resolveWallpaperById(state, startDate) {
  if (!Array.isArray(state.wallpapers) || state.wallpapers.length === 0) {
    return state.wallpaper || null;
  }

  if (startDate) {
    const matched = state.wallpapers.find((item) => item.startDate === startDate);
    if (matched) {
      return matched;
    }
  }

  if (state.selectedWallpaperId) {
    const selected = state.wallpapers.find((item) => item.startDate === state.selectedWallpaperId);
    if (selected) {
      return selected;
    }
  }

  return state.wallpapers[0];
}

function toViewWallpaper(wallpaper) {
  if (!wallpaper) {
    return null;
  }

  return {
    ...wallpaper,
    originalUrl: withCacheBust(wallpaper.originalPath),
    frostedUrl: withCacheBust(wallpaper.frostedPath)
  };
}

function buildViewModel(message = null, tone = "success") {
  const state = store.getState();
  const activeWallpaper = resolveWallpaperById(state);
  const wallpapers = Array.isArray(state.wallpapers) ? state.wallpapers.map(toViewWallpaper) : [];

  return {
    appVersion: app.getVersion(),
    autoLaunchEnabled: state.autoLaunchEnabled,
    glassSettings: {
      ...DEFAULT_GLASS_SETTINGS,
      ...(state.glassSettings || {})
    },
    glassDefaults: DEFAULT_GLASS_SETTINGS,
    message:
      message ||
      state.lastStatus?.message ||
      "Lumin 已准备就绪，可以获取 Bing 壁纸并按当前参数生成毛玻璃版本。",
    tone: message ? tone : state.lastStatus?.tone || "success",
    windowsProductName,
    wallpaper: toViewWallpaper(activeWallpaper),
    wallpapers,
    selectedWallpaperId: activeWallpaper?.startDate || null
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

async function createWallpaperEntry(rawWallpaper, glassSettings) {
  const frostedPath = await createFrostedWallpaper(
    rawWallpaper.originalPath,
    store.cacheDir,
    rawWallpaper.startDate,
    glassSettings
  );

  return {
    ...rawWallpaper,
    frostedPath,
    processorVersion: FROSTED_WALLPAPER_VERSION,
    refreshedAt: nowIso(),
    refreshedLocalDay: localDayKey()
  };
}

async function buildCachedWallpapers() {
  const rawWallpapers = await fetchWallpaperBundle(store.cacheDir);
  const glassSettings = store.getState().glassSettings;
  const wallpapers = [];

  for (const rawWallpaper of rawWallpapers) {
    const wallpaper = await createWallpaperEntry(rawWallpaper, glassSettings);
    wallpapers.push(wallpaper);
  }

  return wallpapers;
}

async function regenerateWallpapersWithCurrentSettings() {
  const state = store.getState();
  const currentWallpapers = Array.isArray(state.wallpapers) ? state.wallpapers : [];
  const glassSettings = state.glassSettings;
  const nextWallpapers = [];

  for (const wallpaper of currentWallpapers) {
    await fs.access(wallpaper.originalPath);

    const frostedPath = await createFrostedWallpaper(
      wallpaper.originalPath,
      store.cacheDir,
      wallpaper.startDate,
      glassSettings
    );

    nextWallpapers.push({
      ...wallpaper,
      frostedPath,
      processorVersion: FROSTED_WALLPAPER_VERSION,
      refreshedAt: nowIso(),
      refreshedLocalDay: localDayKey()
    });
  }

  const selectedWallpaper = resolveWallpaperById(
    { ...state, wallpapers: nextWallpapers },
    state.selectedWallpaperId
  );

  await store.patch({
    wallpaper: selectedWallpaper,
    wallpapers: nextWallpapers,
    selectedWallpaperId: selectedWallpaper?.startDate || null
  });

  return selectedWallpaper;
}

async function refreshWallpaper(options = {}) {
  if (busy) {
    return buildViewModel("当前还有任务在处理中，请稍候。", "warning");
  }

  busy = true;

  try {
    const wallpapers = await buildCachedWallpapers();
    const selectedWallpaperId = options.startDate || wallpapers[0]?.startDate || null;
    const selectedWallpaper = resolveWallpaperById({ wallpapers, selectedWallpaperId }, selectedWallpaperId);

    await store.patch({
      wallpaper: selectedWallpaper,
      wallpapers,
      selectedWallpaperId
    });

    if (options.applyDesktopAfterRefresh && selectedWallpaper?.frostedPath) {
      await setDesktopWallpaper(selectedWallpaper.frostedPath);
      await store.patch({
        wallpaper: {
          ...selectedWallpaper,
          desktopAppliedAt: nowIso()
        }
      });
    }

    const summary = options.applyDesktopAfterRefresh
      ? "今日壁纸已刷新，并已同步到桌面。"
      : "最近几天的壁纸列表已刷新。";

    await rememberStatus(summary, "success");
    return buildViewModel(summary, "success");
  } catch (error) {
    const message = `刷新壁纸失败：${error.message}`;
    await rememberStatus(message, "error");
    return buildViewModel(message, "error");
  } finally {
    busy = false;
  }
}

async function applyWallpaper(startDate) {
  if (busy) {
    return buildViewModel("当前还有任务在处理中，请稍候。", "warning");
  }

  const state = store.getState();
  const wallpaper = resolveWallpaperById(state, startDate);

  if (!wallpaper?.frostedPath) {
    return buildViewModel("请先获取壁纸。", "warning");
  }

  busy = true;

  try {
    await fs.access(wallpaper.frostedPath);
    await setDesktopWallpaper(wallpaper.frostedPath);

    const lockScreenResult = await setLockScreenWallpaperSilently(wallpaper.frostedPath);
    const appliedAt = nowIso();

    const nextWallpapers = (state.wallpapers || []).map((item) =>
      item.startDate === wallpaper.startDate
        ? {
            ...item,
            desktopAppliedAt: appliedAt,
            lockScreenAppliedAt: lockScreenResult.applied ? appliedAt : item.lockScreenAppliedAt
          }
        : item
    );

    const nextWallpaper = nextWallpapers.find((item) => item.startDate === wallpaper.startDate) || {
      ...wallpaper,
      desktopAppliedAt: appliedAt,
      lockScreenAppliedAt: lockScreenResult.applied ? appliedAt : wallpaper.lockScreenAppliedAt
    };

    await store.patch({
      wallpaper: nextWallpaper,
      wallpapers: nextWallpapers,
      selectedWallpaperId: wallpaper.startDate
    });

    const summary = lockScreenResult.applied
      ? "桌面与锁屏都已应用。"
      : `桌面已应用。${lockScreenResult.reason}`;

    const tone = lockScreenResult.applied ? "success" : "warning";
    const compact = compactMessage(summary);

    await rememberStatus(compact, tone);
    return buildViewModel(compact, tone);
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

  const message = enabled ? "已开启开机自启。" : "已关闭开机自启。";
  await store.patch({ autoLaunchEnabled: enabled });
  await rememberStatus(message, "success");
  return buildViewModel(message, "success");
}

async function updateGlassSettings(rawSettings) {
  if (busy) {
    return buildViewModel("当前还有任务在处理中，请稍候。", "warning");
  }

  busy = true;

  try {
    const glassSettings = normalizeGlassSettings(rawSettings);
    await store.patch({ glassSettings });

    if (store.getState().wallpapers?.length) {
      await regenerateWallpapersWithCurrentSettings();
    }

    const message = "玻璃效果参数已更新，并已重生成缓存壁纸。";
    await rememberStatus(message, "success");
    return buildViewModel(message, "success");
  } catch (error) {
    const message = `更新玻璃效果参数失败：${error.message}`;
    await rememberStatus(message, "error");
    return buildViewModel(message, "error");
  } finally {
    busy = false;
  }
}

async function previewGlassSettings(rawSettings, startDate) {
  const state = store.getState();
  const wallpaper = resolveWallpaperById(state, startDate);

  if (!wallpaper?.originalPath) {
    return {
      settings: normalizeGlassSettings(rawSettings),
      previewUrl: null
    };
  }

  const settings = normalizeGlassSettings(rawSettings);
  const previewPath = await createFrostedWallpaper(
    wallpaper.originalPath,
    store.cacheDir,
    `preview-${wallpaper.startDate}`,
    settings
  );

  return {
    settings,
    previewUrl: withCacheBust(previewPath),
    wallpaper: toViewWallpaper(wallpaper)
  };
}

async function syncAutoLaunchState() {
  const settings = app.getLoginItemSettings();
  await store.patch({
    autoLaunchEnabled: Boolean(settings.openAtLogin)
  });
}

async function maybeRefreshDailyWallpaper() {
  const state = store.getState();
  const latestWallpaper = Array.isArray(state.wallpapers) ? state.wallpapers[0] : state.wallpaper;
  const today = localDayKey();

  if (!latestWallpaper || latestWallpaper.refreshedLocalDay !== today) {
    await refreshWallpaper({ applyDesktopAfterRefresh: true });
    return;
  }

  const needsMigration = (state.wallpapers || []).some(
    (item) => item.processorVersion !== FROSTED_WALLPAPER_VERSION
  );

  if (needsMigration) {
    try {
      await regenerateWallpapersWithCurrentSettings();
      await rememberStatus("缓存壁纸已按最新算法重新生成。", "success");
    } catch (error) {
      await rememberStatus(`缓存迁移失败：${error.message}`, "warning");
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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
  ipcMain.handle("wallpaper:apply", async (_event, startDate) => applyWallpaper(startDate));
  ipcMain.handle("settings:set-autostart", async (_event, enabled) => setAutoLaunch(enabled));
  ipcMain.handle("settings:update-glass", async (_event, settings) => updateGlassSettings(settings));
  ipcMain.handle("settings:preview-glass", async (_event, settings, startDate) =>
    previewGlassSettings(settings, startDate)
  );
  ipcMain.handle("app:open-cache", async () => shell.openPath(store.cacheDir));
  ipcMain.handle("app:open-source", async (_event, startDate) => {
    const sourceUrl = resolveWallpaperById(store.getState(), startDate)?.sourceUrl;
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
