const path = require("node:path");
const { BlendMode, Jimp, rgbaToInt } = require("jimp");

const FROSTED_WALLPAPER_VERSION = 2;

async function createFrostedWallpaper(originalPath, outputDir, dateTag) {
  const image = await Jimp.read(originalPath);

  image.blur(18);
  image.color([
    { apply: "saturate", params: [12] },
    { apply: "lighten", params: [8] }
  ]);

  const overlay = new Jimp(
    {
      width: image.bitmap.width,
      height: image.bitmap.height,
      color: rgbaToInt(255, 255, 255, 34)
    }
  );

  const highlight = new Jimp(
    {
      width: image.bitmap.width,
      height: image.bitmap.height,
      color: rgbaToInt(220, 235, 255, 18)
    }
  );

  image.composite(overlay, 0, 0, {
    mode: BlendMode.SRC_OVER,
    opacitySource: 0.22
  });

  image.composite(highlight, 0, 0, {
    mode: BlendMode.SRC_OVER,
    opacitySource: 0.1
  });

  const outputPath = path.join(outputDir, `${dateTag}-frosted.jpg`);
  await image.write(outputPath);
  return outputPath;
}

module.exports = {
  createFrostedWallpaper,
  FROSTED_WALLPAPER_VERSION
};
