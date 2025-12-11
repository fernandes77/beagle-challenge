import sharp from 'sharp';

/**
 * NWS Reflectivity Color Scale
 * Maps dBZ values to RGBA colors
 * 
 * Standard NWS color scale for radar reflectivity:
 * - Light precipitation: greens and blues
 * - Moderate precipitation: yellows and oranges
 * - Heavy precipitation: reds
 * - Severe precipitation: pinks and purples
 */
const COLOR_SCALE = [
  { dbz: -30, color: [0, 0, 0, 0] },        // Transparent (below threshold)
  { dbz: 0, color: [0, 0, 0, 0] },          // Transparent (no precip)
  { dbz: 5, color: [4, 68, 94, 160] },      // Dark blue-gray (very light)
  { dbz: 10, color: [0, 160, 180, 200] },   // Cyan
  { dbz: 15, color: [0, 200, 160, 220] },   // Teal-green
  { dbz: 20, color: [0, 230, 0, 240] },     // Bright green
  { dbz: 25, color: [0, 200, 0, 250] },     // Green
  { dbz: 30, color: [0, 144, 0, 255] },     // Dark green
  { dbz: 35, color: [255, 255, 0, 255] },   // Yellow
  { dbz: 40, color: [255, 192, 0, 255] },   // Gold
  { dbz: 45, color: [255, 128, 0, 255] },   // Orange
  { dbz: 50, color: [255, 0, 0, 255] },     // Red
  { dbz: 55, color: [200, 0, 0, 255] },     // Dark red
  { dbz: 60, color: [255, 0, 200, 255] },   // Hot pink
  { dbz: 65, color: [160, 0, 255, 255] },   // Purple
  { dbz: 70, color: [255, 255, 255, 255] }, // White
  { dbz: 75, color: [200, 200, 255, 255] }, // Light purple/white
];

/**
 * Get color for a dBZ value using linear interpolation
 */
function getColorForDbz(dbz) {
  // Handle missing/invalid values
  if (dbz < -900 || isNaN(dbz)) {
    return [0, 0, 0, 0]; // Transparent
  }
  
  // Find the two colors to interpolate between
  let lower = COLOR_SCALE[0];
  let upper = COLOR_SCALE[COLOR_SCALE.length - 1];
  
  for (let i = 0; i < COLOR_SCALE.length - 1; i++) {
    if (dbz >= COLOR_SCALE[i].dbz && dbz < COLOR_SCALE[i + 1].dbz) {
      lower = COLOR_SCALE[i];
      upper = COLOR_SCALE[i + 1];
      break;
    }
  }
  
  // If below minimum, use minimum color
  if (dbz < COLOR_SCALE[0].dbz) {
    return COLOR_SCALE[0].color;
  }
  
  // If above maximum, use maximum color
  if (dbz >= COLOR_SCALE[COLOR_SCALE.length - 1].dbz) {
    return COLOR_SCALE[COLOR_SCALE.length - 1].color;
  }
  
  // Linear interpolation
  const range = upper.dbz - lower.dbz;
  const t = range === 0 ? 0 : (dbz - lower.dbz) / range;
  
  return [
    Math.round(lower.color[0] + t * (upper.color[0] - lower.color[0])),
    Math.round(lower.color[1] + t * (upper.color[1] - lower.color[1])),
    Math.round(lower.color[2] + t * (upper.color[2] - lower.color[2])),
    Math.round(lower.color[3] + t * (upper.color[3] - lower.color[3]))
  ];
}

/**
 * Render radar data to a PNG image
 * @param {Object} radarData - Parsed GRIB2 data with values, width, height
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function renderRadarPng(radarData) {
  const { values, width, height, scanningMode } = radarData;
  
  console.log(`Rendering ${width}x${height} radar image...`);
  
  // Create RGBA buffer
  const pixels = new Uint8Array(width * height * 4);
  
  // Determine scan direction
  // Bit 7 (0x80): 0 = points scan in +i direction (west to east)
  // Bit 6 (0x40): 0 = points scan in -j direction (north to south)
  // Most GRIB2 files scan from NW corner
  const scanWestToEast = !(scanningMode & 0x80);
  const scanNorthToSouth = !(scanningMode & 0x40);
  
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      // Calculate source index based on scanning mode
      let srcY = scanNorthToSouth ? j : (height - 1 - j);
      let srcX = scanWestToEast ? i : (width - 1 - i);
      const srcIdx = srcY * width + srcX;
      
      // Calculate destination index (always top-left to bottom-right for PNG)
      const dstIdx = (j * width + i) * 4;
      
      // Get dBZ value and convert to color
      const dbz = values[srcIdx] || -999;
      const color = getColorForDbz(dbz);
      
      pixels[dstIdx] = color[0];     // R
      pixels[dstIdx + 1] = color[1]; // G
      pixels[dstIdx + 2] = color[2]; // B
      pixels[dstIdx + 3] = color[3]; // A
    }
  }
  
  // Create PNG using sharp
  const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .png({
      compressionLevel: 6,
      palette: false
    })
    .toBuffer();
  
  console.log(`Generated PNG: ${(pngBuffer.length / 1024).toFixed(2)} KB`);
  
  return pngBuffer;
}

/**
 * Generate a color legend as PNG
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function renderLegend() {
  const legendWidth = 30;
  const legendHeight = 256;
  
  const pixels = new Uint8Array(legendWidth * legendHeight * 4);
  
  // Map height to dBZ range (5 to 75 dBZ)
  const minDbz = 5;
  const maxDbz = 75;
  
  for (let y = 0; y < legendHeight; y++) {
    // Invert y so higher dBZ is at top
    const dbz = minDbz + (1 - y / legendHeight) * (maxDbz - minDbz);
    const color = getColorForDbz(dbz);
    
    for (let x = 0; x < legendWidth; x++) {
      const idx = (y * legendWidth + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255; // Full opacity for legend
    }
  }
  
  const pngBuffer = await sharp(Buffer.from(pixels.buffer), {
    raw: {
      width: legendWidth,
      height: legendHeight,
      channels: 4
    }
  })
    .png()
    .toBuffer();
  
  return pngBuffer;
}

