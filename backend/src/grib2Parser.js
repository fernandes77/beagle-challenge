import sharp from "sharp";

function readUint(buffer, offset, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i++) {
    value = (value << 8) | buffer[offset + i];
  }
  return value;
}

function readInt(buffer, offset, bytes) {
  const value = readUint(buffer, offset, bytes);
  const signBit = 1 << (bytes * 8 - 1);
  if (value & signBit) {
    return -(value & (signBit - 1));
  }
  return value;
}

function readFloat32(buffer, offset) {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
  return view.getFloat32(0, false); // big-endian
}

function parseSection0(buffer) {
  const magic = buffer.slice(0, 4).toString("ascii");
  if (magic !== "GRIB") {
    throw new Error("Invalid GRIB2 file: missing GRIB magic number");
  }

  const discipline = buffer[6];

  const edition = buffer[7];
  if (edition !== 2) {
    throw new Error(`Unsupported GRIB edition: ${edition}`);
  }

  const totalLength = Number(buffer.readBigUInt64BE(8));

  return { discipline, edition, totalLength };
}

function parseSection1(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];

  if (sectionNum !== 1) {
    throw new Error(`Expected section 1, got section ${sectionNum}`);
  }

  const centerId = readUint(buffer, offset + 5, 2);

  const subCenterId = readUint(buffer, offset + 7, 2);

  const year = readUint(buffer, offset + 12, 2);
  const month = buffer[offset + 14];
  const day = buffer[offset + 15];
  const hour = buffer[offset + 16];
  const minute = buffer[offset + 17];
  const second = buffer[offset + 18];

  const timestamp = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second)
  );

  return {
    length,
    centerId,
    subCenterId,
    timestamp,
  };
}

function parseSection3(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];

  if (sectionNum !== 3) {
    throw new Error(`Expected section 3, got section ${sectionNum}`);
  }

  const numPoints = readUint(buffer, offset + 6, 4);

  const templateNum = readUint(buffer, offset + 12, 2);

  let gridInfo = { numPoints, templateNum };

  if (templateNum === 0) {
    gridInfo = parseGridTemplate0(buffer, offset + 14, numPoints);
  } else if (templateNum === 30) {
    gridInfo = parseGridTemplate30(buffer, offset + 14, numPoints);
  }

  return { length, ...gridInfo };
}

function parseGridTemplate0(buffer, offset, numPoints) {
  const nx = readUint(buffer, offset + 16, 4);

  const ny = readUint(buffer, offset + 20, 4);

  const basicAngle = readUint(buffer, offset + 24, 4);

  const subdivisions = readUint(buffer, offset + 28, 4);

  const angleDivisor =
    basicAngle === 0 || subdivisions === 0 ? 1e6 : basicAngle * subdivisions;

  const lat1 = readInt(buffer, offset + 32, 4) / angleDivisor;

  let lon1 = readInt(buffer, offset + 36, 4) / angleDivisor;

  const lat2 = readInt(buffer, offset + 41, 4) / angleDivisor;

  let lon2 = readInt(buffer, offset + 45, 4) / angleDivisor;

  const dx = readUint(buffer, offset + 49, 4) / angleDivisor;

  const dy = readUint(buffer, offset + 53, 4) / angleDivisor;

  const scanningMode = buffer[offset + 57];

  if (lon1 > 180) lon1 -= 360;
  if (lon2 > 180) lon2 -= 360;

  return {
    numPoints,
    templateNum: 0,
    width: nx,
    height: ny,
    lat1,
    lon1,
    lat2,
    lon2,
    dx,
    dy,
    scanningMode,
    bounds: {
      west: Math.min(lon1, lon2),
      east: Math.max(lon1, lon2),
      south: Math.min(lat1, lat2),
      north: Math.max(lat1, lat2),
    },
  };
}

function parseGridTemplate30(buffer, offset, numPoints) {
  const nx = readUint(buffer, offset + 16, 4);

  const ny = readUint(buffer, offset + 20, 4);

  const lat1 = readInt(buffer, offset + 24, 4) / 1e6;

  let lon1 = readInt(buffer, offset + 28, 4) / 1e6;
  if (lon1 > 180) lon1 -= 360;

  return {
    numPoints,
    templateNum: 30,
    width: nx,
    height: ny,
    lat1,
    lon1,
    bounds: {
      west: -130.0,
      east: -60.0,
      south: 20.0,
      north: 55.0,
    },
  };
}

function parseSection5(buffer, offset) {
  const length = readUint(buffer, offset, 4);
  const sectionNum = buffer[offset + 4];

  if (sectionNum !== 5) {
    throw new Error(`Expected section 5, got section ${sectionNum}`);
  }

  const numDataPoints = readUint(buffer, offset + 5, 4);

  const templateNum = readUint(buffer, offset + 9, 2);

  let packingInfo = { numDataPoints, templateNum };

  if (templateNum === 0) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19],
    };
  } else if (templateNum === 40) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19],
      typeOfOriginalValues: buffer[offset + 20],
      typeOfCompression: buffer[offset + 21],
      targetCompressionRatio: buffer[offset + 22],
    };
  } else if (templateNum === 41) {
    packingInfo = {
      ...packingInfo,
      referenceValue: readFloat32(buffer, offset + 11),
      binaryScaleFactor: readInt(buffer, offset + 15, 2),
      decimalScaleFactor: readInt(buffer, offset + 17, 2),
      bitsPerValue: buffer[offset + 19],
      typeOfOriginalValues: buffer[offset + 20],
    };
  } else if (templateNum === 200) {
    packingInfo = {
      ...packingInfo,
      typeOfOriginalValues: buffer[offset + 11],
    };
  }

  return { length, ...packingInfo };
}

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

  if (section5.templateNum === 0) {
    values = unpackSimple(dataBuffer, section5, gridInfo);
  } else if (section5.templateNum === 40) {
    console.warn("JPEG2000 packing detected - using simplified decoding");
    values = unpackJpeg2000Fallback(dataBuffer, section5, gridInfo);
  } else if (section5.templateNum === 41) {
    console.log("PNG packing detected - decoding with sharp");
    values = await unpackPng(dataBuffer, section5, gridInfo);
  } else if (section5.templateNum === 200) {
    values = unpackRunLength(dataBuffer, section5, gridInfo);
  } else {
    throw new Error(
      `Unsupported data representation template: ${section5.templateNum}`
    );
  }

  return { length, values };
}

function unpackSimple(dataBuffer, section5, gridInfo) {
  const {
    referenceValue,
    binaryScaleFactor,
    decimalScaleFactor,
    bitsPerValue,
  } = section5;
  const numPoints = gridInfo.numPoints;

  const values = new Float32Array(numPoints);

  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);

  if (bitsPerValue === 0) {
    values.fill(referenceValue * decimalFactor);
    return values;
  }

  let bitOffset = 0;
  for (let i = 0; i < numPoints; i++) {
    const byteOffset = Math.floor(bitOffset / 8);
    const bitPosition = bitOffset % 8;

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

    values[i] = (referenceValue + packedValue * binaryFactor) * decimalFactor;
    bitOffset += bitsPerValue;
  }

  return values;
}

function unpackJpeg2000Fallback(dataBuffer, section5, gridInfo) {
  console.warn(
    "JPEG2000 decoding not fully implemented - using raw byte approximation"
  );

  const { referenceValue, binaryScaleFactor, decimalScaleFactor } = section5;
  const numPoints = gridInfo.numPoints;

  const values = new Float32Array(numPoints);
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);

  for (let i = 0; i < numPoints; i++) {
    if (i < dataBuffer.length) {
      values[i] =
        (referenceValue + dataBuffer[i] * binaryFactor) * decimalFactor;
    } else {
      values[i] = -999;
    }
  }

  return values;
}

function unpackRunLength(dataBuffer, section5, gridInfo) {
  const numPoints = gridInfo.numPoints;
  const values = new Float32Array(numPoints);
  values.fill(-999);

  let i = 0;
  let pos = 0;

  while (pos < dataBuffer.length - 1 && i < numPoints) {
    const value = dataBuffer[pos];
    const count = dataBuffer[pos + 1];

    const dbz = value === 0 ? -999 : value * 0.5 - 33;

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
  const {
    referenceValue,
    binaryScaleFactor,
    decimalScaleFactor,
    bitsPerValue,
  } = section5;
  const numPoints = gridInfo.numPoints;

  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);

  try {
    // Decode the PNG image using sharp
    const image = sharp(dataBuffer);
    const metadata = await image.metadata();

    console.log(
      `PNG image: ${metadata.width}x${metadata.height}, channels: ${metadata.channels}`
    );

    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const values = new Float32Array(numPoints);
    const channels = info.channels;

    for (let i = 0; i < numPoints && i < data.length / channels; i++) {
      let packedValue;

      if (bitsPerValue <= 8) {
        packedValue = data[i * channels];
      } else if (bitsPerValue <= 16 && channels >= 2) {
        packedValue = (data[i * channels] << 8) | data[i * channels + 1];
      } else {
        packedValue = data[i * channels];
      }

      const rawValue =
        (referenceValue + packedValue * binaryFactor) * decimalFactor;

      if (rawValue < -30 || packedValue === 0) {
        values[i] = -999;
      } else {
        values[i] = rawValue;
      }
    }

    for (let i = data.length / channels; i < numPoints; i++) {
      values[i] = -999;
    }

    return values;
  } catch (error) {
    console.error("Error decoding PNG:", error);
    return unpackPngFallback(dataBuffer, section5, gridInfo);
  }
}

function unpackPngFallback(dataBuffer, section5, gridInfo) {
  console.warn("PNG decoding failed - using fallback");

  const { referenceValue, binaryScaleFactor, decimalScaleFactor } = section5;
  const numPoints = gridInfo.numPoints;

  const values = new Float32Array(numPoints);
  const binaryFactor = Math.pow(2, binaryScaleFactor);
  const decimalFactor = Math.pow(10, -decimalScaleFactor);

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

export async function parseGrib2(buffer) {
  console.log("Parsing GRIB2 file...");

  const section0 = parseSection0(buffer);
  console.log(
    `GRIB2 file: edition ${section0.edition}, total length ${section0.totalLength} bytes`
  );

  let offset = 16;

  const section1 = parseSection1(buffer, offset);
  console.log(`Data timestamp: ${section1.timestamp.toISOString()}`);
  offset += section1.length;

  if (buffer[offset + 4] === 2) {
    const length = readUint(buffer, offset, 4);
    offset += length;
  }

  const section3Offset = findSection(buffer, offset, 3);
  if (section3Offset === -1) {
    throw new Error("Could not find Section 3 (Grid Definition)");
  }
  const section3 = parseSection3(buffer, section3Offset);
  console.log(
    `Grid: ${section3.width}x${section3.height} (${section3.numPoints} points)`
  );
  console.log(`Bounds: ${JSON.stringify(section3.bounds)}`);

  const section5Offset = findSection(
    buffer,
    section3Offset + section3.length,
    5
  );
  if (section5Offset === -1) {
    throw new Error("Could not find Section 5 (Data Representation)");
  }
  const section5 = parseSection5(buffer, section5Offset);
  console.log(
    `Data packing: template ${section5.templateNum}, ${
      section5.bitsPerValue || "N/A"
    } bits per value`
  );

  const section7Offset = findSection(
    buffer,
    section5Offset + section5.length,
    7
  );
  if (section7Offset === -1) {
    throw new Error("Could not find Section 7 (Data)");
  }
  const section7 = await parseSection7(
    buffer,
    section7Offset,
    section5,
    section3
  );

  let min = Infinity,
    max = -Infinity,
    validCount = 0;
  for (const v of section7.values) {
    if (v > -900) {
      min = Math.min(min, v);
      max = Math.max(max, v);
      validCount++;
    }
  }
  console.log(
    `Values: min=${min.toFixed(2)}, max=${max.toFixed(
      2
    )}, valid=${validCount}/${section7.values.length}`
  );

  return {
    timestamp: section1.timestamp,
    width: section3.width,
    height: section3.height,
    bounds: section3.bounds,
    scanningMode: section3.scanningMode,
    values: section7.values,
  };
}
