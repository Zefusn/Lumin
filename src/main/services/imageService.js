const path = require("node:path");
const sharp = require("sharp");

const FROSTED_WALLPAPER_VERSION = 4;
const DEFAULT_SIZE = {
  width: 1920,
  height: 1080
};

async function extractAccentColors(originalPath) {
  const { data, info } = await sharp(originalPath)
    .rotate()
    .resize(60, 60, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  let red2 = 0;
  let green2 = 0;
  let blue2 = 0;
  let count2 = 0;

  for (let index = 0; index < data.length; index += info.channels) {
    red += data[index];
    green += data[index + 1];
    blue += data[index + 2];
    count += 1;

    if ((index / info.channels) % 2 === 0) {
      red2 += data[index];
      green2 += data[index + 1];
      blue2 += data[index + 2];
      count2 += 1;
    }
  }

  return {
    accent: {
      r: Math.round(red / count),
      g: Math.round(green / count),
      b: Math.round(blue / count)
    },
    accent2: {
      r: Math.round(red2 / count2),
      g: Math.round(green2 / count2),
      b: Math.round(blue2 / count2)
    }
  };
}

function createFirstPageOverlay(width, height, accent, accent2) {
  const radius = Math.round(Math.max(width, height) * 0.34);
  const blur = Math.round(Math.max(width, height) * 0.09);

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="wash">
          <feGaussianBlur stdDeviation="${blur}" />
        </filter>
        <linearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.18)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0.12)" />
        </linearGradient>
      </defs>

      <g filter="url(#wash)">
        <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.3)}" r="${radius}" fill="rgb(${accent.r},${accent.g},${accent.b})" fill-opacity="0.35" />
        <circle cx="${Math.round(width * 0.8)}" cy="${Math.round(height * 0.7)}" r="${Math.round(radius * 1.08)}" fill="rgb(${accent2.r},${accent2.g},${accent2.b})" fill-opacity="0.28" />
        <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.5)}" r="${Math.round(radius * 1.4)}" fill="rgb(${accent.r},${accent.g},${accent.b})" fill-opacity="0.18" />
      </g>

      <rect x="0" y="0" width="${width}" height="${height}" fill="white" fill-opacity="0.16" />
    </svg>
  `;

  return Buffer.from(svg);
}

async function createFrostedWallpaper(originalPath, outputDir, dateTag) {
  const outputPath = path.join(outputDir, `${dateTag}-frosted.jpg`);

  const metadata = await sharp(originalPath, { failOn: "none" }).rotate().metadata();
  const width = metadata.width || DEFAULT_SIZE.width;
  const height = metadata.height || DEFAULT_SIZE.height;
  const fit = { width, height, fit: "cover" };

  const { accent, accent2 } = await extractAccentColors(originalPath);
  const overlay = createFirstPageOverlay(width, height, accent, accent2);

  const blurredBase = await sharp(originalPath)
    .rotate()
    .resize(fit)
    .blur(30)
    .modulate({
      saturation: 1.4,
      brightness: 1.04
    })
    .png()
    .toBuffer();

  await sharp(blurredBase)
    .composite([{ input: overlay, blend: "over" }])
    .jpeg({
      quality: 97,
      chromaSubsampling: "4:4:4",
      mozjpeg: true
    })
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  createFrostedWallpaper,
  FROSTED_WALLPAPER_VERSION
};
