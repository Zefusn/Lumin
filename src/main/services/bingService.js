const fs = require("node:fs/promises");
const path = require("node:path");

const FIRST_PAGE_BING_API = "https://bing.biturl.top/?resolution=1920&format=json";
const BING_ARCHIVE_API = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN";
const BING_HOST = "https://www.bing.com";

function inferTitle(copyrightText) {
  if (!copyrightText) {
    return "Bing Daily Wallpaper";
  }

  const [title] = copyrightText.split("(");
  return title?.trim() || "Bing Daily Wallpaper";
}

async function downloadWallpaper(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function fetchLatestWallpaper(cacheDir) {
  const response = await fetch(FIRST_PAGE_BING_API);
  if (!response.ok) {
    throw new Error(`FirstPage Bing API failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.url || !payload?.start_date) {
    throw new Error("FirstPage Bing API returned no usable wallpaper.");
  }

  const originalPath = path.join(cacheDir, `${payload.start_date}-original.jpg`);
  await downloadWallpaper(payload.url, originalPath);

  return {
    bingId: payload.start_date,
    startDate: payload.start_date,
    endDate: payload.end_date || payload.start_date,
    title: inferTitle(payload.title || payload.copyright),
    copyright: payload.copyright || "",
    copyrightLink: payload.copyright_link || "",
    sourceUrl: payload.url,
    originalPath
  };
}

async function fetchWallpaperHistory(cacheDir) {
  const response = await fetch(BING_ARCHIVE_API);
  if (!response.ok) {
    throw new Error(`Bing archive API failed: ${response.status}`);
  }

  const payload = await response.json();
  const images = Array.isArray(payload?.images) ? payload.images : [];

  const wallpapers = [];

  for (const image of images) {
    if (!image?.url || !image?.startdate) {
      continue;
    }

    const sourceUrl = image.url.startsWith("http") ? image.url : `${BING_HOST}${image.url}`;
    const originalPath = path.join(cacheDir, `${image.startdate}-original.jpg`);

    await downloadWallpaper(sourceUrl, originalPath);

    wallpapers.push({
      bingId: image.hsh || image.fullstartdate || image.startdate,
      startDate: image.startdate,
      endDate: image.enddate || image.startdate,
      title: inferTitle(image.title || image.copyright),
      copyright: image.copyright || "",
      copyrightLink: image.copyrightlink || "",
      sourceUrl,
      originalPath
    });
  }

  return wallpapers;
}

async function fetchWallpaperBundle(cacheDir) {
  const [latest, history] = await Promise.all([
    fetchLatestWallpaper(cacheDir),
    fetchWallpaperHistory(cacheDir)
  ]);

  const seen = new Set();
  const merged = [];

  for (const wallpaper of [latest, ...history]) {
    if (!wallpaper?.startDate || seen.has(wallpaper.startDate)) {
      continue;
    }

    seen.add(wallpaper.startDate);
    merged.push(wallpaper);
  }

  merged.sort((left, right) => right.startDate.localeCompare(left.startDate));
  return merged.slice(0, 7);
}

module.exports = {
  fetchLatestWallpaper,
  fetchWallpaperBundle
};
