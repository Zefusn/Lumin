const fs = require("node:fs/promises");
const path = require("node:path");

const FIRST_PAGE_BING_API = "https://bing.biturl.top/?resolution=1920&format=json";

function inferTitle(copyrightText) {
  if (!copyrightText) {
    return "Bing 每日壁纸";
  }

  const [title] = copyrightText.split("，");
  return title?.trim() || "Bing 每日壁纸";
}

async function fetchLatestWallpaper(cacheDir) {
  const response = await fetch(FIRST_PAGE_BING_API);
  if (!response.ok) {
    throw new Error(`FirstPage Bing 接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.url || !payload?.start_date) {
    throw new Error("FirstPage Bing 接口没有返回可用壁纸。");
  }

  const originalPath = path.join(cacheDir, `${payload.start_date}-original.jpg`);
  const imageResponse = await fetch(payload.url);
  if (!imageResponse.ok) {
    throw new Error(`下载 Bing 壁纸失败: ${imageResponse.status}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(originalPath, buffer);

  return {
    bingId: payload.start_date,
    sourceUrl: payload.url,
    startDate: payload.start_date,
    endDate: payload.end_date,
    title: inferTitle(payload.copyright),
    copyright: payload.copyright || "",
    copyrightLink: payload.copyright_link || "",
    originalPath
  };
}

module.exports = {
  fetchLatestWallpaper
};
