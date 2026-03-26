const state = {
  loading: false
};

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  applyButton: document.getElementById("applyButton"),
  autoStartToggle: document.getElementById("autoStartToggle"),
  previewImage: document.getElementById("previewImage"),
  wallpaperDate: document.getElementById("wallpaperDate"),
  wallpaperTitle: document.getElementById("wallpaperTitle"),
  wallpaperCopyright: document.getElementById("wallpaperCopyright"),
  statusMessage: document.getElementById("statusMessage"),
  windowsLabel: document.getElementById("windowsLabel"),
  openCacheButton: document.getElementById("openCacheButton"),
  openSourceButton: document.getElementById("openSourceButton")
};

function setLoading(loading) {
  state.loading = loading;
  elements.refreshButton.disabled = loading;
  elements.applyButton.disabled = loading;
  elements.autoStartToggle.disabled = loading;
}

function formatDate(dateText) {
  if (!dateText || dateText.length !== 8) {
    return "等待获取今日壁纸";
  }

  return `Bing ${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}`;
}

function renderStatus(message, tone) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${tone || "success"}`;
}

function render(viewModel) {
  elements.autoStartToggle.checked = Boolean(viewModel.autoLaunchEnabled);
  elements.windowsLabel.textContent = viewModel.windowsProductName || "Windows";
  renderStatus(viewModel.message, viewModel.tone);

  if (!viewModel.wallpaper) {
    elements.previewImage.removeAttribute("src");
    elements.wallpaperDate.textContent = "等待获取今日壁纸";
    elements.wallpaperTitle.textContent = "Bing 每日壁纸";
    elements.wallpaperCopyright.textContent = "右侧始终展示原图预览";
    return;
  }

  elements.previewImage.src = viewModel.wallpaper.originalUrl;
  elements.wallpaperDate.textContent = formatDate(viewModel.wallpaper.startDate);
  elements.wallpaperTitle.textContent = viewModel.wallpaper.title || "Bing 每日壁纸";
  elements.wallpaperCopyright.textContent =
    viewModel.wallpaper.copyright || "右侧始终展示原图预览";
}

async function refreshState() {
  const viewModel = await window.lumin.getState();
  render(viewModel);
}

async function runAction(action) {
  setLoading(true);

  try {
    const viewModel = await action();
    render(viewModel);
  } catch (error) {
    renderStatus(error.message || "操作失败", "error");
  } finally {
    setLoading(false);
  }
}

elements.refreshButton.addEventListener("click", () => {
  runAction(() => window.lumin.refreshWallpaper());
});

elements.applyButton.addEventListener("click", () => {
  runAction(() => window.lumin.applyWallpaper());
});

elements.autoStartToggle.addEventListener("change", (event) => {
  runAction(() => window.lumin.setAutoStart(event.target.checked));
});

elements.openCacheButton.addEventListener("click", () => {
  window.lumin.openCacheFolder();
});

elements.openSourceButton.addEventListener("click", () => {
  window.lumin.openSource();
});

refreshState();
