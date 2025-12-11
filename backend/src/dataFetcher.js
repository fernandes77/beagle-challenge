import { gunzipSync } from "zlib";

const MRMS_RALA_URL =
  "https://mrms.ncep.noaa.gov/data/2D/ReflectivityAtLowestAltitude/MRMS_ReflectivityAtLowestAltitude.latest.grib2.gz";

export async function fetchLatestRadarData() {
  console.log("Fetching MRMS RALA data from:", MRMS_RALA_URL);

  const response = await fetch(MRMS_RALA_URL, {
    headers: {
      "User-Agent": "WeatherRadarDisplay/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch MRMS data: ${response.status} ${response.statusText}`
    );
  }

  const compressedData = await response.arrayBuffer();
  console.log(
    `Downloaded ${(compressedData.byteLength / 1024 / 1024).toFixed(
      2
    )} MB of compressed data`
  );

  const compressedBuffer = Buffer.from(compressedData);
  const decompressedBuffer = gunzipSync(compressedBuffer);
  console.log(
    `Decompressed to ${(decompressedBuffer.length / 1024 / 1024).toFixed(2)} MB`
  );

  return decompressedBuffer;
}
