const state = {
  loading: false,
  viewModel: null,
  previewIndex: 0,
  previewTimer: null,
  previewRequestId: 0
};

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  applyButton: document.getElementById("applyButton"),
  settingsButton: document.getElementById("settingsButton"),
  autoStartToggle: document.getElementById("autoStartToggle"),
  previewImage: document.getElementById("previewImage"),
  wallpaperDate: document.getElementById("wallpaperDate"),
  wallpaperTitle: document.getElementById("wallpaperTitle"),
  wallpaperCopyright: document.getElementById("wallpaperCopyright"),
  statusMessage: document.getElementById("statusMessage"),
  windowsLabel: document.getElementById("windowsLabel"),
  openCacheButton: document.getElementById("openCacheButton"),
  openSourceButton: document.getElementById("openSourceButton"),
  prevWallpaperButton: document.getElementById("prevWallpaperButton"),
  nextWallpaperButton: document.getElementById("nextWallpaperButton"),
  previewCounter: document.getElementById("previewCounter"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsButton: document.getElementById("closeSettingsButton"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  resetSettingsButton: document.getElementById("resetSettingsButton"),
  transparencyRange: document.getElementById("transparencyRange"),
  tintRange: document.getElementById("tintRange"),
  blurRange: document.getElementById("blurRange"),
  transparencyValue: document.getElementById("transparencyValue"),
  tintValue: document.getElementById("tintValue"),
  blurValue: document.getElementById("blurValue"),
  settingsPreviewImage: document.getElementById("settingsPreviewImage"),
  settingsPreviewCaption: document.getElementById("settingsPreviewCaption")
};

function getWallpapers(viewModel = state.viewModel) {
  if (!viewModel) {
    return [];
  }

  if (Array.isArray(viewModel.wallpapers) && viewModel.wallpapers.length > 0) {
    return viewModel.wallpapers;
  }

  return viewModel.wallpaper ? [viewModel.wallpaper] : [];
}

function getCurrentWallpaper(viewModel = state.viewModel) {
  const wallpapers = getWallpapers(viewModel);
  if (wallpapers.length === 0) {
    return null;
  }

  const index = Math.min(Math.max(state.previewIndex, 0), wallpapers.length - 1);
  return wallpapers[index] || wallpapers[0];
}

function isSettingsOpen() {
  return !elements.settingsModal.classList.contains("is-hidden");
}

function setLoading(loading) {
  state.loading = loading;
  elements.refreshButton.disabled = loading;
  elements.applyButton.disabled = loading;
  elements.settingsButton.disabled = loading;
  elements.autoStartToggle.disabled = loading;
  elements.saveSettingsButton.disabled = loading;
  elements.resetSettingsButton.disabled = loading;
  elements.prevWallpaperButton.disabled = loading;
  elements.nextWallpaperButton.disabled = loading;
}

function formatDate(dateText) {
  if (!dateText || dateText.length !== 8) {
    return "等待获取今日壁纸";
  }

  return `Bing ${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}`;
}

function formatTintValue(value) {
  const numeric = Number(value);
  return numeric > 0 ? `+${numeric}` : `${numeric}`;
}

function renderStatus(message, tone) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${tone || "success"}`;
}

function syncSettingsLabels() {
  elements.transparencyValue.textContent = elements.transparencyRange.value;
  elements.tintValue.textContent = formatTintValue(elements.tintRange.value);
  elements.blurValue.textContent = elements.blurRange.value;
}

function getSettingsPayload() {
  return {
    transparency: Number(elements.transparencyRange.value),
    tint: Number(elements.tintRange.value),
    blur: Number(elements.blurRange.value)
  };
}

function fillSettingsForm(glassSettings, defaults) {
  const resolved = {
    ...defaults,
    ...(glassSettings || {})
  };

  elements.transparencyRange.value = resolved.transparency;
  elements.tintRange.value = resolved.tint;
  elements.blurRange.value = resolved.blur;
  syncSettingsLabels();
}

function syncPreviewIndex(viewModel, preferredStartDate) {
  const wallpapers = getWallpapers(viewModel);

  if (wallpapers.length === 0) {
    state.previewIndex = 0;
    return;
  }

  const targetStartDate = preferredStartDate || viewModel.selectedWallpaperId || wallpapers[0].startDate;
  const matchedIndex = wallpapers.findIndex((item) => item.startDate === targetStartDate);
  state.previewIndex = matchedIndex >= 0 ? matchedIndex : 0;
}

function renderPreview() {
  const wallpapers = getWallpapers();
  const wallpaper = getCurrentWallpaper();

  if (!wallpaper) {
    elements.previewImage.removeAttribute("src");
    elements.wallpaperDate.textContent = "等待获取今日壁纸";
    elements.wallpaperTitle.textContent = "Bing 每日壁纸";
    elements.wallpaperCopyright.textContent = "右侧展示原图预览";
    elements.previewCounter.textContent = "0 / 0";
    elements.prevWallpaperButton.disabled = true;
    elements.nextWallpaperButton.disabled = true;
    return;
  }

  elements.previewImage.src = wallpaper.originalUrl;
  elements.wallpaperDate.textContent = formatDate(wallpaper.startDate);
  elements.wallpaperTitle.textContent = wallpaper.title || "Bing 每日壁纸";
  elements.wallpaperCopyright.textContent = wallpaper.copyright || "右侧展示原图预览";
  elements.previewCounter.textContent = `${state.previewIndex + 1} / ${wallpapers.length}`;
  elements.prevWallpaperButton.disabled = state.loading || wallpapers.length <= 1;
  elements.nextWallpaperButton.disabled = state.loading || wallpapers.length <= 1;
}

function render(viewModel) {
  const previousWallpaper = getCurrentWallpaper();
  const previousStartDate = previousWallpaper?.startDate;

  state.viewModel = viewModel;
  elements.autoStartToggle.checked = Boolean(viewModel.autoLaunchEnabled);
  elements.windowsLabel.textContent = viewModel.windowsProductName || "Windows";
  renderStatus(viewModel.message, viewModel.tone);
  fillSettingsForm(viewModel.glassSettings, viewModel.glassDefaults);
  syncPreviewIndex(viewModel, previousStartDate);
  renderPreview();

  if (isSettingsOpen()) {
    updateSettingsLivePreview({ immediate: true });
  }
}

function openSettingsModal() {
  elements.settingsModal.classList.remove("is-hidden");
  updateSettingsLivePreview({ immediate: true });
}

function closeSettingsModal() {
  elements.settingsModal.classList.add("is-hidden");
}

async function refreshState() {
  const viewModel = await window.lumin.getState();
  render(viewModel);
}

async function runAction(action, { closeModalAfterSuccess = false } = {}) {
  setLoading(true);

  try {
    const viewModel = await action();
    render(viewModel);

    if (closeModalAfterSuccess) {
      closeSettingsModal();
    }
  } catch (error) {
    renderStatus(error.message || "操作失败", "error");
  } finally {
    setLoading(false);
    renderPreview();
  }
}

async function performLivePreview() {
  const currentWallpaper = getCurrentWallpaper();
  const payload = getSettingsPayload();
  const requestId = ++state.previewRequestId;

  if (!currentWallpaper) {
    elements.settingsPreviewImage.removeAttribute("src");
    elements.settingsPreviewCaption.textContent = "获取壁纸后，这里会显示实时预览。";
    return;
  }

  elements.settingsPreviewCaption.textContent = "正在生成实时预览...";

  try {
    const preview = await window.lumin.previewGlassSettings(payload, currentWallpaper.startDate);
    if (requestId !== state.previewRequestId) {
      return;
    }

    if (preview.previewUrl) {
      elements.settingsPreviewImage.src = preview.previewUrl;
      elements.settingsPreviewCaption.textContent = `预览基于 ${formatDate(currentWallpaper.startDate)} 生成。`;
    } else {
      elements.settingsPreviewImage.removeAttribute("src");
      elements.settingsPreviewCaption.textContent = "当前没有可预览的壁纸。";
    }
  } catch (error) {
    if (requestId !== state.previewRequestId) {
      return;
    }

    elements.settingsPreviewCaption.textContent = error.message || "预览生成失败。";
  }
}

function updateSettingsLivePreview({ immediate = false } = {}) {
  if (!isSettingsOpen()) {
    return;
  }

  if (state.previewTimer) {
    window.clearTimeout(state.previewTimer);
    state.previewTimer = null;
  }

  if (immediate) {
    performLivePreview();
    return;
  }

  state.previewTimer = window.setTimeout(() => {
    state.previewTimer = null;
    performLivePreview();
  }, 180);
}

function changePreview(direction) {
  const wallpapers = getWallpapers();
  if (wallpapers.length <= 1) {
    return;
  }

  const length = wallpapers.length;
  state.previewIndex = (state.previewIndex + direction + length) % length;
  renderPreview();

  if (isSettingsOpen()) {
    updateSettingsLivePreview({ immediate: true });
  }
}

elements.refreshButton.addEventListener("click", () => {
  runAction(() => window.lumin.refreshWallpaper());
});

elements.applyButton.addEventListener("click", () => {
  const currentWallpaper = getCurrentWallpaper();
  runAction(() => window.lumin.applyWallpaper(currentWallpaper?.startDate));
});

elements.settingsButton.addEventListener("click", () => {
  openSettingsModal();
});

elements.closeSettingsButton.addEventListener("click", () => {
  closeSettingsModal();
});

elements.settingsModal.addEventListener("click", (event) => {
  if (event.target.dataset.closeSettings === "true") {
    closeSettingsModal();
  }
});

elements.autoStartToggle.addEventListener("change", (event) => {
  runAction(() => window.lumin.setAutoStart(event.target.checked));
});

elements.openCacheButton.addEventListener("click", () => {
  window.lumin.openCacheFolder();
});

elements.openSourceButton.addEventListener("click", () => {
  const currentWallpaper = getCurrentWallpaper();
  window.lumin.openSource(currentWallpaper?.startDate);
});

elements.prevWallpaperButton.addEventListener("click", () => {
  changePreview(-1);
});

elements.nextWallpaperButton.addEventListener("click", () => {
  changePreview(1);
});

elements.transparencyRange.addEventListener("input", () => {
  syncSettingsLabels();
  updateSettingsLivePreview();
});

elements.tintRange.addEventListener("input", () => {
  syncSettingsLabels();
  updateSettingsLivePreview();
});

elements.blurRange.addEventListener("input", () => {
  syncSettingsLabels();
  updateSettingsLivePreview();
});

elements.resetSettingsButton.addEventListener("click", () => {
  const defaults = state.viewModel?.glassDefaults || {
    transparency: 72,
    tint: 10,
    blur: 28
  };

  fillSettingsForm(defaults, defaults);
  updateSettingsLivePreview({ immediate: true });
});

elements.saveSettingsButton.addEventListener("click", () => {
  const payload = getSettingsPayload();

  runAction(() => window.lumin.updateGlassSettings(payload), {
    closeModalAfterSuccess: true
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettingsModal();
  }
});

refreshState();
