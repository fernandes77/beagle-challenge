import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { fetchLatestRadarData } from "./dataFetcher.js";
import { parseGrib2 } from "./grib2Parser.js";
import { renderRadarPng } from "./radarRenderer.js";

const app = express();
const PORT = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "../frontend/dist");

app.use(cors());

let radarCache = {
  image: null,
  metadata: null,
  timestamp: null,
  fetchedAt: null,
};

const CACHE_DURATION = 60 * 1000;

function isCacheValid() {
  if (!radarCache.fetchedAt) return false;
  return Date.now() - radarCache.fetchedAt < CACHE_DURATION;
}

async function getRadarData() {
  if (isCacheValid() && radarCache.image) {
    console.log("Serving from cache");
    return radarCache;
  }

  console.log("Fetching fresh radar data...");

  try {
    const gribBuffer = await fetchLatestRadarData();

    const parsedData = await parseGrib2(gribBuffer);

    const pngBuffer = await renderRadarPng(parsedData);

    radarCache = {
      image: pngBuffer,
      metadata: {
        timestamp: parsedData.timestamp,
        bounds: parsedData.bounds,
        width: parsedData.width,
        height: parsedData.height,
      },
      timestamp: parsedData.timestamp,
      fetchedAt: Date.now(),
    };

    console.log("Radar data processed successfully");
    return radarCache;
  } catch (error) {
    console.error("Error fetching radar data:", error);
    throw error;
  }
}

app.get("/api/radar/latest", async (req, res) => {
  try {
    const data = await getRadarData();

    if (!data.image) {
      return res.status(503).json({ error: "Radar data not available" });
    }

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=60");
    res.send(data.image);
  } catch (error) {
    console.error("Error serving radar image:", error);
    res.status(500).json({ error: "Failed to fetch radar data" });
  }
});

app.get("/api/radar/metadata", async (req, res) => {
  try {
    const data = await getRadarData();

    if (!data.metadata) {
      return res.status(503).json({ error: "Radar data not available" });
    }

    res.json(data.metadata);
  } catch (error) {
    console.error("Error serving metadata:", error);
    res.status(500).json({ error: "Failed to fetch radar metadata" });
  }
});

// Serve built frontend
app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Weather radar backend running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  GET /api/radar/latest   - Returns radar PNG image`);
  console.log(`  GET /api/radar/metadata - Returns radar metadata`);
});
