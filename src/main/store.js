const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_STATE = {
  autoLaunchEnabled: false,
  lastStatus: null,
  wallpaper: null
};

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

class AppStore {
  constructor(appDataDir) {
    this.appDataDir = appDataDir;
    this.cacheDir = path.join(appDataDir, "cache");
    this.statePath = path.join(appDataDir, "state.json");
    this.state = structuredClone(DEFAULT_STATE);
  }

  async init() {
    await ensureDir(this.appDataDir);
    await ensureDir(this.cacheDir);
    this.state = {
      ...structuredClone(DEFAULT_STATE),
      ...(await readJson(this.statePath, DEFAULT_STATE))
    };
    return this;
  }

  getState() {
    return this.state;
  }

  async setState(nextState) {
    this.state = nextState;
    await writeJson(this.statePath, this.state);
  }

  async patch(patch) {
    this.state = {
      ...this.state,
      ...patch
    };
    await writeJson(this.statePath, this.state);
  }
}

module.exports = {
  AppStore,
  ensureDir
};

