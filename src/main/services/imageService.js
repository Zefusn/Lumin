const path = require("node:path");
const sharp = require("sharp");

const { DEFAULT_GLASS_SETTINGS } = require("../store");

const FROSTED_WALLPAPER_VERSION = 5;
const DEFAULT_SIZE = {
  width: 1920,
  height: 1080
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeGlassSettings(settings = {}) {
  return {
    transparency: clamp(
      Number.isFinite(Number(settings.transparency))
        ? Number(settings.transparency)
        : DEFAULT_GLASS_SETTINGS.transparency,
      0,
      100
    ),
    tint: clamp(
      Number.isFinite(Number(settings.tint)) ? Number(settings.tint) : DEFAULT_GLASS_SETTINGS.tint,
      -100,
      100
    ),
    blur: clamp(
      Number.isFinite(Number(settings.blur)) ? Number(settings.blur) : DEFAULT_GLASS_SETTINGS.blur,
      8,
      42
    )
  };
}

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

function createGlassOverlay(width, height, accent, accent2, settings) {
  const radius = Math.round(Math.max(width, height) * 0.34);
  const blur = Math.round(Math.max(width, height) * 0.09);
  const transparencyFactor = settings.transparency / 100;
  const whiteTint = settings.tint > 0 ? settings.tint / 100 : 0;
  const blackTint = settings.tint < 0 ? Math.abs(settings.tint) / 100 : 0;

  const accentA = (0.12 + (1 - transparencyFactor) * 0.12).toFixed(3);
  const accentB = (0.08 + (1 - transparencyFactor) * 0.08).toFixed(3);
  const accentC = (0.04 + (1 - transparencyFactor) * 0.06).toFixed(3);
  const whiteOverlay = (0.02 + whiteTint * 0.14 * (1 - transparencyFactor * 0.4)).toFixed(3);
  const blackOverlay = (blackTint * 0.18 * (1 - transparencyFactor * 0.35)).toFixed(3);

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="wash">
          <feGaussianBlur stdDeviation="${blur}" />
        </filter>
      </defs>

      <g filter="url(#wash)">
        <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.3)}" r="${radius}" fill="rgb(${accent.r},${accent.g},${accent.b})" fill-opacity="${accentA}" />
        <circle cx="${Math.round(width * 0.8)}" cy="${Math.round(height * 0.7)}" r="${Math.round(radius * 1.08)}" fill="rgb(${accent2.r},${accent2.g},${accent2.b})" fill-opacity="${accentB}" />
        <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.5)}" r="${Math.round(radius * 1.4)}" fill="rgb(${accent.r},${accent.g},${accent.b})" fill-opacity="${accentC}" />
      </g>

      <rect x="0" y="0" width="${width}" height="${height}" fill="white" fill-opacity="${whiteOverlay}" />
      <rect x="0" y="0" width="${width}" height="${height}" fill="black" fill-opacity="${blackOverlay}" />
    </svg>
  `;

  return Buffer.from(svg);
}

async function createFrostedWallpaper(originalPath, outputDir, dateTag, rawSettings = {}) {
  const settings = normalizeGlassSettings(rawSettings);
  const outputPath = path.join(outputDir, `${dateTag}-frosted.jpg`);

  const metadata = await sharp(originalPath, { failOn: "none" }).rotate().metadata();
  const width = metadata.width || DEFAULT_SIZE.width;
  const height = metadata.height || DEFAULT_SIZE.height;
  const fit = { width, height, fit: "cover" };

  const transparencyFactor = settings.transparency / 100;
  const darkTint = settings.tint < 0 ? Math.abs(settings.tint) / 100 : 0;
  const { accent, accent2 } = await extractAccentColors(originalPath);
  const overlay = createGlassOverlay(width, height, accent, accent2, settings);

  const blurredBase = await sharp(originalPath)
    .rotate()
    .resize(fit)
    .blur(settings.blur)
    .modulate({
      saturation: 1.18 + transparencyFactor * 0.16,
      brightness: 1 + transparencyFactor * 0.04 - darkTint * 0.06
    })
    .png()
    .toBuffer();

  const detailLayer = await sharp(originalPath)
    .rotate()
    .resize(fit)
    .modulate({
      saturation: 1.04 + transparencyFactor * 0.08,
      brightness: 1.0 + transparencyFactor * 0.02
    })
    .ensureAlpha(0.08 + transparencyFactor * 0.2)
    .png()
    .toBuffer();

  await sharp(blurredBase)
    .composite([
      { input: detailLayer, blend: "over" },
      { input: overlay, blend: "over" }
    ])
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
  FROSTED_WALLPAPER_VERSION,
  normalizeGlassSettings
};
