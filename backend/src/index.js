import express from 'express';
import cors from 'cors';
import { fetchLatestRadarData } from './dataFetcher.js';
import { parseGrib2 } from './grib2Parser.js';
import { renderRadarPng } from './radarRenderer.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for frontend requests
app.use(cors());

// Cache for processed radar data
let radarCache = {
  image: null,
  metadata: null,
  timestamp: null,
  fetchedAt: null
};

// Cache duration in milliseconds (1 minute)
const CACHE_DURATION = 60 * 1000;

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  if (!radarCache.fetchedAt) return false;
  return Date.now() - radarCache.fetchedAt < CACHE_DURATION;
}

/**
 * Fetch and process radar data
 */
async function getRadarData() {
  if (isCacheValid() && radarCache.image) {
    console.log('Serving from cache');
    return radarCache;
  }

  console.log('Fetching fresh radar data...');
  
  try {
    // Fetch the latest GRIB2 data
    const gribBuffer = await fetchLatestRadarData();
    
    // Parse the GRIB2 file
    const parsedData = await parseGrib2(gribBuffer);
    
    // Render to PNG
    const pngBuffer = await renderRadarPng(parsedData);
    
    // Update cache
    radarCache = {
      image: pngBuffer,
      metadata: {
        timestamp: parsedData.timestamp,
        bounds: parsedData.bounds,
        width: parsedData.width,
        height: parsedData.height
      },
      timestamp: parsedData.timestamp,
      fetchedAt: Date.now()
    };
    
    console.log('Radar data processed successfully');
    return radarCache;
  } catch (error) {
    console.error('Error fetching radar data:', error);
    throw error;
  }
}

// API endpoint to get the latest radar image
app.get('/api/radar/latest', async (req, res) => {
  try {
    const data = await getRadarData();
    
    if (!data.image) {
      return res.status(503).json({ error: 'Radar data not available' });
    }
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=60');
    res.send(data.image);
  } catch (error) {
    console.error('Error serving radar image:', error);
    res.status(500).json({ error: 'Failed to fetch radar data' });
  }
});

// API endpoint to get radar metadata
app.get('/api/radar/metadata', async (req, res) => {
  try {
    const data = await getRadarData();
    
    if (!data.metadata) {
      return res.status(503).json({ error: 'Radar data not available' });
    }
    
    res.json(data.metadata);
  } catch (error) {
    console.error('Error serving metadata:', error);
    res.status(500).json({ error: 'Failed to fetch radar metadata' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', cacheValid: isCacheValid() });
});

app.listen(PORT, () => {
  console.log(`Weather radar backend running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  GET /api/radar/latest   - Returns radar PNG image`);
  console.log(`  GET /api/radar/metadata - Returns radar metadata`);
  console.log(`  GET /health             - Health check`);
});

