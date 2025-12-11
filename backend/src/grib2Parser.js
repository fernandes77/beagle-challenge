/**
 * GRIB2 Parser for MRMS Reflectivity at Lowest Altitude (RALA) data
 * 
 * This is a minimal parser that handles the specific MRMS RALA format.
 * GRIB2 is a complex binary format used in meteorology.
 * 
 * Reference: https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/
 */

import sharp from 'sharp';

/**
 * Read an unsigned integer from a buffer (big-endian)
 */
function readUint(buffer, offset, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i++) {
    value = (value << 8) | buffer[offset + i];
  }
  return value;
}

/**
 * Read a signed integer from a buffer (big-endian)
 */
function readInt(buffer, offset, bytes) {
  const value = readUint(buffer, offset, bytes);
  const signBit = 1 << (bytes * 8 - 1);
  if (value & signBit) {
    // Negative number - the high bit is the sign bit in GRIB2
    return -(value & (signBit - 1));
  }
  return value;
}

/**
 * Read a 32-bit IEEE float from buffer
 */
function readFloat32(buffer, offset) {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
  return view.getFloat32(0, false); // big-endian
}

/**
 * Parse Section 0 (Indicator Section)
 */
function parseSection0(buffer) {
  // Check for "GRIB" magic number
  const magic = buffer.slice(0, 4).toString('ascii');
  if (magic !== 'GRIB') {
    throw new Error('Invalid GRIB2 file: missing GRIB magic number');
  }
  
  // Bytes 5-6: Reserved
  // Byte 7: Discipline (0 = Meteorological)
  const discipline = buffer[6];
  
  // Byte 8: GRIB edition (should be 2)
  const edition = buffer[7];
  if (edition !== 2) {
    throw new Error(`Unsupported GRIB edition: ${edition}`);
  }
  
  // Bytes 9-16: Total message length (8 bytes)
  const totalLength = Number(buffer.readBigUInt64BE(8));
  
  return { discipline, edition, totalLength };
}

/**
 * Parse Section 1 (Identification Section)
 */
function parseSection1(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];
  
  if (sectionNum !== 1) {
    throw new Error(`Expected section 1, got section ${sectionNum}`);
  }
  
  // Bytes 6-7: Center ID
  const centerId = readUint(buffer, offset + 5, 2);
  
  // Bytes 8-9: Sub-center ID  
  const subCenterId = readUint(buffer, offset + 7, 2);
  
  // Byte 10: GRIB master tables version
  const masterTablesVersion = buffer[offset + 9];
  
  // Byte 11: Local tables version
  const localTablesVersion = buffer[offset + 10];
  
  // Byte 12: Significance of reference time
  const refTimeSignificance = buffer[offset + 11];
  
  // Bytes 13-19: Reference time (year, month, day, hour, minute, second)
  const year = readUint(buffer, offset + 12, 2);
  const month = buffer[offset + 14];
  const day = buffer[offset + 15];
  const hour = buffer[offset + 16];
  const minute = buffer[offset + 17];
  const second = buffer[offset + 18];
  
  const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  
  return {
    length,
    centerId,
    subCenterId,
    timestamp
  };
}

/**
 * Parse Section 3 (Grid Definition Section)
 */
function parseSection3(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];
  
  if (sectionNum !== 3) {
    throw new Error(`Expected section 3, got section ${sectionNum}`);
  }
  
  // Byte 6: Source of grid definition
  const source = buffer[offset + 5];
  
  // Bytes 7-10: Number of data points
  const numPoints = readUint(buffer, offset + 6, 4);
  
  // Byte 11: Number of octets for optional list
  const numOctets = buffer[offset + 10];
  
  // Byte 12: Interpretation of list
  const interpretation = buffer[offset + 11];
  
  // Bytes 13-14: Grid definition template number
  const templateNum = readUint(buffer, offset + 12, 2);
  
  let gridInfo = { numPoints, templateNum };
  
  // Template 0: Latitude/Longitude (equidistant cylindrical)
  if (templateNum === 0) {
    gridInfo = parseGridTemplate0(buffer, offset + 14, numPoints);
  }
  // Template 30: Lambert Conformal
  else if (templateNum === 30) {
    gridInfo = parseGridTemplate30(buffer, offset + 14, numPoints);
  }
  
  return { length, ...gridInfo };
}

/**
 * Parse Grid Template 0 (Lat/Lon grid)
 */
function parseGridTemplate0(buffer, offset, numPoints) {
  // Bytes 1: Shape of earth
  const shapeOfEarth = buffer[offset];
  
  // Bytes 2: Scale factor of radius
  const scaleFactor = buffer[offset + 1];
  
  // Bytes 3-6: Scaled value of radius
  const scaledRadius = readUint(buffer, offset + 2, 4);
  
  // Bytes 7: Scale factor of major axis
  // Bytes 8-11: Scaled value of major axis
  // Bytes 12: Scale factor of minor axis  
  // Bytes 13-16: Scaled value of minor axis
  
  // Bytes 17-20: Ni (number of points along a parallel)
  const nx = readUint(buffer, offset + 16, 4);
  
  // Bytes 21-24: Nj (number of points along a meridian)
  const ny = readUint(buffer, offset + 20, 4);
  
  // Bytes 25-28: Basic angle
  const basicAngle = readUint(buffer, offset + 24, 4);
  
  // Bytes 29-32: Subdivisions of basic angle
  const subdivisions = readUint(buffer, offset + 28, 4);
  
  // Calculate angle divisor
  const angleDivisor = (basicAngle === 0 || subdivisions === 0) ? 1e6 : 
    (basicAngle * subdivisions);
  
  // Bytes 33-36: La1 (latitude of first grid point)
  const lat1 = readInt(buffer, offset + 32, 4) / angleDivisor;
  
  // Bytes 37-40: Lo1 (longitude of first grid point)
  let lon1 = readInt(buffer, offset + 36, 4) / angleDivisor;
  
  // Byte 41: Resolution and component flags
  const resolutionFlags = buffer[offset + 40];
  
  // Bytes 42-45: La2 (latitude of last grid point)
  const lat2 = readInt(buffer, offset + 41, 4) / angleDivisor;
  
  // Bytes 46-49: Lo2 (longitude of last grid point)
  let lon2 = readInt(buffer, offset + 45, 4) / angleDivisor;
  
  // Bytes 50-53: Di (i direction increment)
  const dx = readUint(buffer, offset + 49, 4) / angleDivisor;
  
  // Bytes 54-57: Dj (j direction increment)
  const dy = readUint(buffer, offset + 53, 4) / angleDivisor;
  
  // Byte 58: Scanning mode
  const scanningMode = buffer[offset + 57];
  
  // Normalize longitudes to -180 to 180 range
  if (lon1 > 180) lon1 -= 360;
  if (lon2 > 180) lon2 -= 360;
  
  return {
    numPoints,
    templateNum: 0,
    width: nx,
    height: ny,
    lat1, lon1,
    lat2, lon2,
    dx, dy,
    scanningMode,
    bounds: {
      west: Math.min(lon1, lon2),
      east: Math.max(lon1, lon2),
      south: Math.min(lat1, lat2),
      north: Math.max(lat1, lat2)
    }
  };
}

/**
 * Parse Grid Template 30 (Lambert Conformal)
 */
function parseGridTemplate30(buffer, offset, numPoints) {
  // This is a simplified parser for Lambert Conformal
  // Bytes 17-20: Nx
  const nx = readUint(buffer, offset + 16, 4);
  
  // Bytes 21-24: Ny
  const ny = readUint(buffer, offset + 20, 4);
  
  // Bytes 25-28: La1 (latitude of first point) in microdegrees
  const lat1 = readInt(buffer, offset + 24, 4) / 1e6;
  
  // Bytes 29-32: Lo1 (longitude of first point) in microdegrees
  let lon1 = readInt(buffer, offset + 28, 4) / 1e6;
  if (lon1 > 180) lon1 -= 360;
  
  // For Lambert Conformal, we need to approximate the lat/lon bounds
  // MRMS CONUS typically covers roughly:
  // Lat: 20°N to 55°N
  // Lon: 130°W to 60°W
  
  return {
    numPoints,
    templateNum: 30,
    width: nx,
    height: ny,
    lat1, lon1,
    bounds: {
      west: -130.0,
      east: -60.0,
      south: 20.0,
      north: 55.0
    }
  };
}

/**
 * Parse Section 5 (Data Representation Section)
 */
function parseSection5(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];
  
  if (sectionNum !== 5) {
    throw new Error(`Expected section 5, got section ${sectionNum}`);
  }
  
  // Bytes 6-9: Number of data points
  const numDataPoints = readUint(buffer, offset + 5, 4);
  
  // Bytes 10-11: Data representation template number
  const templateNum = readUint(buffer, offset + 9, 2);
  
  let packingInfo = { numDataPoints, templateNum };
  
  // Template 0: Simple packing
  if (templateNum === 0) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19]
    };
  }
  // Template 40: JPEG2000 packing
  else if (templateNum === 40) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19],
      typeOfOriginalValues: buffer[offset + 20],
      typeOfCompression: buffer[offset + 21],
      targetCompressionRatio: buffer[offset + 22]
    };
  }
  // Template 41: PNG packing (similar to JPEG2000 but with PNG compression)
  else if (templateNum === 41) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19],
      typeOfOriginalValues: buffer[offset + 20]
    };
  }
  // Template 200: Run-length packing (MRMS specific)
  else if (templateNum === 200) {
    packingInfo = {
      ...packingInfo,
      typeOfOriginalValues: buffer[offset + 11],
      // Additional fields specific to run-length encoding
    };
  }
  
  return { length, ...packingInfo };
}

/**
 * Parse Section 7 (Data Section)
 */
async function parseSection7(buffer, offset, section5, gridInfo) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];
  
  if (sectionNum !== 7) {
    throw new Error(`Expected section 7, got section ${sectionNum}`);
  }
  
  const dataOffset = offset + 5;
  const dataLength = length - 5;
  const dataBuffer = buffer.slice(dataOffset, dataOffset + dataLength);
  
  let values;
  
  // Template 0: Simple packing
  if (section5.templateNum === 0) {
    values = unpackSimple(dataBuffer, section5, gridInfo);
  }
  // Template 40: JPEG2000 (not supported - fall back to simple approximation)
  else if (section5.templateNum === 40) {
    console.warn('JPEG2000 packing detected - using simplified decoding');
    values = unpackJpeg2000Fallback(dataBuffer, section5, gridInfo);
  }
  // Template 41: PNG packing
  else if (section5.templateNum === 41) {
    console.log('PNG packing detected - decoding with sharp');
    values = await unpackPng(dataBuffer, section5, gridInfo);
  }
  // Template 200: Run-length packing
  else if (section5.templateNum === 200) {
    values = unpackRunLength(dataBuffer, section5, gridInfo);
  }
  else {
    throw new Error(`Unsupported data representation template: ${section5.templateNum}`);
  }
  
  return { length, values };
}

/**
 * Unpack simple packed data
 */
function unpackSimple(dataBuffer, section5, gridInfo) {
  const { referenceValue, binaryScaleFactor, decimalScaleFactor, bitsPerValue } = section5;
  const numPoints = gridInfo.numPoints;
  
  const values = new Float32Array(numPoints);
  
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);
  
  if (bitsPerValue === 0) {
    // All values are the reference value
    values.fill(referenceValue * decimalFactor);
    return values;
  }
  
  let bitOffset = 0;
  for (let i = 0; i < numPoints; i++) {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitPosition = bitOffset % 8;
    
    // Read the packed value
    let packedValue = 0;
    let bitsRemaining = bitsPerValue;
    let currentByte = byteOffset;
    let currentBitPos = bitPosition;
    
    while (bitsRemaining > 0) {
      const bitsToRead = Math.min(bitsRemaining, 8 - currentBitPos);
      const mask = (1 << bitsToRead) - 1;
      const shift = 8 - currentBitPos - bitsToRead;
      
      if (currentByte < dataBuffer.length) {
        const bits = (dataBuffer[currentByte] >> shift) & mask;
        packedValue = (packedValue << bitsToRead) | bits;
      }
      
      bitsRemaining -= bitsToRead;
      currentBitPos += bitsToRead;
      
      if (currentBitPos >= 8) {
        currentBitPos = 0;
        currentByte++;
      }
    }
    
    // Convert to actual value
    values[i] = (referenceValue + packedValue * binaryFactor) * decimalFactor;
    bitOffset += bitsPerValue;
  }
  
  return values;
}

/**
 * Fallback for JPEG2000 packed data - creates a simple approximation
 * Real JPEG2000 decoding would require a full J2K decoder
 */
function unpackJpeg2000Fallback(dataBuffer, section5, gridInfo) {
  console.warn('JPEG2000 decoding not fully implemented - using raw byte approximation');
  
  const { referenceValue, binaryScaleFactor, decimalScaleFactor } = section5;
  const numPoints = gridInfo.numPoints;
  
  const values = new Float32Array(numPoints);
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);
  
  // Simple approximation: use raw bytes as data
  // This won't give correct values but allows visualization
  for (let i = 0; i < numPoints; i++) {
    if (i < dataBuffer.length) {
      values[i] = (referenceValue + dataBuffer[i] * binaryFactor) * decimalFactor;
    } else {
      values[i] = -999; // Missing value
    }
  }
  
  return values;
}

/**
 * Unpack run-length encoded data (MRMS specific)
 */
function unpackRunLength(dataBuffer, section5, gridInfo) {
  const numPoints = gridInfo.numPoints;
  const values = new Float32Array(numPoints);
  values.fill(-999); // Initialize with missing value
  
  // MRMS run-length encoding
  // Each run is encoded as: value (1 byte) + count (1 byte)
  let i = 0;
  let pos = 0;
  
  while (pos < dataBuffer.length - 1 && i < numPoints) {
    const value = dataBuffer[pos];
    const count = dataBuffer[pos + 1];
    
    // Convert byte value to dBZ
    // MRMS uses: dBZ = (value - 66) / 2 - 32.5
    // or for simple mapping: dBZ = value * 0.5 - 33
    const dbz = value === 0 ? -999 : (value * 0.5 - 33);
    
    for (let j = 0; j < count && i < numPoints; j++, i++) {
      values[i] = dbz;
    }
    
    pos += 2;
  }
  
  return values;
}

/**
 * Unpack PNG packed data (Template 41)
 * The data section contains a PNG image with packed values
 */
async function unpackPng(dataBuffer, section5, gridInfo) {
  const { referenceValue, binaryScaleFactor, decimalScaleFactor, bitsPerValue } = section5;
  const numPoints = gridInfo.numPoints;
  
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);
  
  try {
    // Decode the PNG image using sharp
    const image = sharp(dataBuffer);
    const metadata = await image.metadata();
    
    console.log(`PNG image: ${metadata.width}x${metadata.height}, channels: ${metadata.channels}`);
    
    // Get raw pixel data
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const values = new Float32Array(numPoints);
    const channels = info.channels;
    
    // Process each pixel
    for (let i = 0; i < numPoints && i < data.length / channels; i++) {
      // Get the pixel value (use first channel if multi-channel)
      let packedValue;
      
      if (bitsPerValue <= 8) {
        packedValue = data[i * channels];
      } else if (bitsPerValue <= 16 && channels >= 2) {
        // 16-bit value stored in 2 channels (big-endian)
        packedValue = (data[i * channels] << 8) | data[i * channels + 1];
      } else {
        packedValue = data[i * channels];
      }
      
      // Convert to actual value using GRIB2 formula:
      // Y = (R + X * 2^E) * 10^(-D)
      // where R = reference value, X = packed value, E = binary scale, D = decimal scale
      const rawValue = (referenceValue + packedValue * binaryFactor) * decimalFactor;
      
      // Check for missing/no-data values
      // In MRMS, very low values (< -30) typically indicate no data
      if (rawValue < -30 || packedValue === 0) {
        values[i] = -999; // Missing value
      } else {
        values[i] = rawValue;
      }
    }
    
    // Fill remaining points if PNG is smaller than expected
    for (let i = data.length / channels; i < numPoints; i++) {
      values[i] = -999;
    }
    
    return values;
  } catch (error) {
    console.error('Error decoding PNG:', error);
    // Fallback to treating raw bytes as values
    return unpackPngFallback(dataBuffer, section5, gridInfo);
  }
}

/**
 * Fallback PNG unpacking when sharp fails
 */
function unpackPngFallback(dataBuffer, section5, gridInfo) {
  console.warn('PNG decoding failed - using fallback');
  
  const { referenceValue, binaryScaleFactor, decimalScaleFactor } = section5;
  const numPoints = gridInfo.numPoints;
  
  const values = new Float32Array(numPoints);
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);
  
  // Skip PNG header (8 bytes) and try to read raw data
  const headerSize = 8;
  for (let i = 0; i < numPoints; i++) {
    const byteIndex = headerSize + i;
    if (byteIndex < dataBuffer.length) {
      const packedValue = dataBuffer[byteIndex];
      values[i] = (referenceValue + packedValue * binaryFactor) * decimalFactor;
    } else {
      values[i] = -999;
    }
  }
  
  return values;
}

/**
 * Find section by traversing GRIB2 message
 */
function findSection(buffer, startOffset, sectionNum) {
  let offset = startOffset;
  
  while (offset < buffer.length - 4) {
    const length = readUint(buffer, offset, 4);
    const section = buffer[offset + 4];
    
    if (section === sectionNum) {
      return offset;
    }
    
    if (length === 0 || section === 8 || section > 8) {
      break;
    }
    
    offset += length;
  }
  
  return -1;
}

/**
 * Main GRIB2 parser function
 */
export async function parseGrib2(buffer) {
  console.log('Parsing GRIB2 file...');
  
  // Parse Section 0 (Indicator)
  const section0 = parseSection0(buffer);
  console.log(`GRIB2 file: edition ${section0.edition}, total length ${section0.totalLength} bytes`);
  
  let offset = 16; // After section 0
  
  // Parse Section 1 (Identification)
  const section1 = parseSection1(buffer, offset);
  console.log(`Data timestamp: ${section1.timestamp.toISOString()}`);
  offset += section1.length;
  
  // Skip Section 2 (Local Use) if present
  if (buffer[offset + 4] === 2) {
    const length = readUint(buffer, offset, 4);
    offset += length;
  }
  
  // Parse Section 3 (Grid Definition)
  const section3Offset = findSection(buffer, offset, 3);
  if (section3Offset === -1) {
    throw new Error('Could not find Section 3 (Grid Definition)');
  }
  const section3 = parseSection3(buffer, section3Offset);
  console.log(`Grid: ${section3.width}x${section3.height} (${section3.numPoints} points)`);
  console.log(`Bounds: ${JSON.stringify(section3.bounds)}`);
  
  // Parse Section 5 (Data Representation)
  const section5Offset = findSection(buffer, section3Offset + section3.length, 5);
  if (section5Offset === -1) {
    throw new Error('Could not find Section 5 (Data Representation)');
  }
  const section5 = parseSection5(buffer, section5Offset);
  console.log(`Data packing: template ${section5.templateNum}, ${section5.bitsPerValue || 'N/A'} bits per value`);
  
  // Parse Section 7 (Data)
  const section7Offset = findSection(buffer, section5Offset + section5.length, 7);
  if (section7Offset === -1) {
    throw new Error('Could not find Section 7 (Data)');
  }
  const section7 = await parseSection7(buffer, section7Offset, section5, section3);
  
  // Calculate statistics
  let min = Infinity, max = -Infinity, validCount = 0;
  for (const v of section7.values) {
    if (v > -900) { // Exclude missing values
      min = Math.min(min, v);
      max = Math.max(max, v);
      validCount++;
    }
  }
  console.log(`Values: min=${min.toFixed(2)}, max=${max.toFixed(2)}, valid=${validCount}/${section7.values.length}`);
  
  return {
    timestamp: section1.timestamp,
    width: section3.width,
    height: section3.height,
    bounds: section3.bounds,
    scanningMode: section3.scanningMode,
    values: section7.values
  };
}

