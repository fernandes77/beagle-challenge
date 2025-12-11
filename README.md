# Weather Radar Display

A full-stack application that displays real-time weather radar data from NOAA's Multi-Radar Multi-Sensor (MRMS) system.

![Weather Radar Display](https://img.shields.io/badge/React-18.2-blue) ![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Real-time radar data** from NOAA MRMS (Reflectivity at Lowest Altitude)
- **Dynamic processing** - fetches and processes fresh data on each request
- **Interactive map** with pan, zoom, and automatic data refresh
- **Dark theme** with professional weather radar color scale
- **Responsive design** for desktop and mobile

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐     ┌─────────────────┐
│   NOAA MRMS     │────▶│          Node.js Backend         │────▶│  React Frontend │
│   (GRIB2 data)  │     │  Fetch → Parse → Render → API    │     │  Leaflet Map    │
└─────────────────┘     └──────────────────────────────────┘     └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. **Clone the repository**

   ```bash
   cd beagle-challenge
   ```

2. **Install backend dependencies**

   ```bash
   cd backend
   pnpm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../frontend
   pnpm install
   ```

### Running the Application

1. **Start the backend** (in one terminal)

   ```bash
   cd backend
   pnpm start
   ```

   The API will be available at `http://localhost:3001`

2. **Start the frontend** (in another terminal)
   ```bash
   cd frontend
   pnpm dev
   ```
   Open `http://localhost:5173` in your browser

## API Endpoints

| Endpoint                  | Description                             |
| ------------------------- | --------------------------------------- |
| `GET /api/radar/latest`   | Returns the latest radar PNG image      |
| `GET /api/radar/metadata` | Returns timestamp and geographic bounds |
| `GET /health`             | Health check endpoint                   |

## Data Source

- **Source**: NOAA MRMS (Multi-Radar Multi-Sensor)
- **Product**: Reflectivity at Lowest Altitude (RALA)
- **URL**: https://mrms.ncep.noaa.gov/data/2D/ReflectivityAtLowestAltitude/
- **Format**: GRIB2 (gzip compressed)
- **Update frequency**: Every 2 minutes
- **Coverage**: Continental United States (CONUS)

## Technology Stack

### Backend

- **Express.js** - Web server framework
- **sharp** - PNG image generation from raw pixel data
- **zlib** - Built-in gzip decompression

### Frontend

- **React 18** - UI framework
- **Leaflet** - Interactive maps (via react-leaflet)
- **Vite** - Build tool and dev server

## Library Justifications

### Backend Libraries

1. **express**: Industry-standard Node.js web framework. Implementing an HTTP server from scratch would be time-prohibitive and error-prone.

2. **sharp**: Required for PNG generation from raw RGBA pixel data. PNG encoding involves complex compression (DEFLATE), filtering, and CRC calculations that would be impractical to implement manually.

3. **cors**: Simple CORS middleware. While technically implementable as headers, this provides proper handling of preflight requests.

### Frontend Libraries

1. **react-leaflet**: React bindings for Leaflet. Direct Leaflet DOM manipulation conflicts with React's virtual DOM - this library properly bridges the two.

2. **leaflet**: The mapping library (your choice from the allowed options). Implementing a tile-based slippy map with projections, panning, zooming, and touch support from scratch is a massive undertaking.

### Not Using External Libraries For

- **GRIB2 parsing**: Implemented from scratch - a minimal parser that handles the specific MRMS RALA format
- **Color scale**: Implemented from scratch - NWS-standard reflectivity colors
- **CSS styling**: Written from scratch - no CSS frameworks used
- **State management**: Using React's built-in hooks (useState, useEffect)

## Color Scale

| dBZ Range | Color              | Interpretation               |
| --------- | ------------------ | ---------------------------- |
| < 10      | Transparent        | No significant precipitation |
| 10-20     | Teal/Blue-green    | Very light rain              |
| 20-30     | Green              | Light rain                   |
| 30-40     | Yellow             | Moderate rain                |
| 40-50     | Orange/Red         | Heavy rain                   |
| 50-60     | Red/Dark red       | Very heavy rain              |
| 60-70     | Magenta/Purple     | Severe                       |
| 70+       | White/Light purple | Extreme                      |

## License

MIT
