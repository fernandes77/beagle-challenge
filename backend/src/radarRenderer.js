import sharp from "sharp";

const COLOR_SCALE = [
  { dbz: -30, color: [0, 0, 0, 0] },
  { dbz: 0, color: [0, 0, 0, 0] },
  { dbz: 5, color: [4, 68, 94, 160] },
  { dbz: 10, color: [0, 160, 180, 200] },
  { dbz: 15, color: [0, 200, 160, 220] },
  { dbz: 20, color: [0, 230, 0, 240] },
  { dbz: 25, color: [0, 200, 0, 250] },
  { dbz: 30, color: [0, 144, 0, 255] },
  { dbz: 35, color: [255, 255, 0, 255] },
  { dbz: 40, color: [255, 192, 0, 255] },
  { dbz: 45, color: [255, 128, 0, 255] },
  { dbz: 50, color: [255, 0, 0, 255] },
  { dbz: 55, color: [200, 0, 0, 255] },
  { dbz: 60, color: [255, 0, 200, 255] },
  { dbz: 65, color: [160, 0, 255, 255] },
  { dbz: 70, color: [255, 255, 255, 255] },
  { dbz: 75, color: [200, 200, 255, 255] },
];

function getColorForDbz(dbz) {
  if (dbz < -900 || isNaN(dbz)) {
    return [0, 0, 0, 0];
  }

  let lower = COLOR_SCALE[0];
  let upper = COLOR_SCALE[COLOR_SCALE.length - 1];

  for (let i = 0; i < COLOR_SCALE.length - 1; i++) {
    if (dbz >= COLOR_SCALE[i].dbz && dbz < COLOR_SCALE[i + 1].dbz) {
      lower = COLOR_SCALE[i];
      upper = COLOR_SCALE[i + 1];
      break;
    }
  }

  if (dbz < COLOR_SCALE[0].dbz) {
    return COLOR_SCALE[0].color;
  }

  if (dbz >= COLOR_SCALE[COLOR_SCALE.length - 1].dbz) {
    return COLOR_SCALE[COLOR_SCALE.length - 1].color;
  }

  const range = upper.dbz - lower.dbz;
  const t = range === 0 ? 0 : (dbz - lower.dbz) / range;

  return [
    Math.round(lower.color[0] + t * (upper.color[0] - lower.color[0])),
    Math.round(lower.color[1] + t * (upper.color[1] - lower.color[1])),
    Math.round(lower.color[2] + t * (upper.color[2] - lower.color[2])),
    Math.round(lower.color[3] + t * (upper.color[3] - lower.color[3])),
  ];
}

export async function renderRadarPng(radarData) {
  const { values, width, height, scanningMode } = radarData;

  console.log(`Rendering ${width}x${height} radar image...`);

  const pixels = new Uint8Array(width * height * 4);

  const scanWestToEast = !(scanningMode & 0x80);
  const scanNorthToSouth = !(scanningMode & 0x40);

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let srcY = scanNorthToSouth ? j : height - 1 - j;
      let srcX = scanWestToEast ? i : width - 1 - i;
      const srcIdx = srcY * width + srcX;

      const dstIdx = (j * width + i) * 4;

      const dbz = values[srcIdx] || -999;
      const color = getColorForDbz(dbz);

      pixels[dstIdx] = color[0];
      pixels[dstIdx + 1] = color[1];
      pixels[dstIdx + 2] = color[2];
      pixels[dstIdx + 3] = color[3];
    }
  }

  const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png({
      compressionLevel: 6,
      palette: false,
    })
    .toBuffer();

  console.log(`Generated PNG: ${(pngBuffer.length / 1024).toFixed(2)} KB`);

  return pngBuffer;
}

export async function renderLegend() {
  const legendWidth = 30;
  const legendHeight = 256;

  const pixels = new Uint8Array(legendWidth * legendHeight * 4);

  const minDbz = 5;
  const maxDbz = 75;

  for (let y = 0; y < legendHeight; y++) {
    const dbz = minDbz + (1 - y / legendHeight) * (maxDbz - minDbz);
    const color = getColorForDbz(dbz);

    for (let x = 0; x < legendWidth; x++) {
      const idx = (y * legendWidth + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
    raw: {
      width: legendWidth,
      height: legendHeight,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  return pngBuffer;
}
