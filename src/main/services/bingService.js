const fs = require("node:fs/promises");
const path = require("node:path");

const BING_API = "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN";

async function fetchLatestWallpaper(cacheDir) {
  const response = await fetch(BING_API);
  if (!response.ok) {
    throw new Error(`Bing 接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  const image = payload.images?.[0];

  if (!image?.url) {
    throw new Error("Bing 返回的数据中没有可用壁纸。");
  }

  const downloadUrl = new URL(image.url, "https://www.bing.com").toString();
  const originalPath = path.join(cacheDir, `${image.startdate}-original.jpg`);

  const imageResponse = await fetch(downloadUrl);
  if (!imageResponse.ok) {
    throw new Error(`下载 Bing 壁纸失败: ${imageResponse.status}`);
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(originalPath, buffer);

  return {
    bingId: image.hsh || image.startdate,
    sourceUrl: downloadUrl,
    startDate: image.startdate,
    endDate: image.enddate,
    title: image.title || "Bing 每日壁纸",
    copyright: image.copyright || "",
    originalPath
  };
}

module.exports = {
  fetchLatestWallpaper
};

