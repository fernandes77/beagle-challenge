import { useEffect, useState } from "react";
import { MapContainer, TileLayer, ImageOverlay } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const CONUS_CENTER = [39.0, -98.0];
const CONUS_ZOOM = 4;

const DEFAULT_BOUNDS = [
  [20.0, -130.0],
  [55.0, -60.0],
];

function RadarOverlay({ bounds, refreshKey }) {
  const [imageUrl, setImageUrl] = useState(null);
  const opacity = 0.85;

  useEffect(() => {
    const url = `/api/radar/latest?t=${refreshKey}`;
    setImageUrl(url);
  }, [refreshKey]);

  if (!imageUrl) return null;

  return (
    <ImageOverlay
      key={refreshKey}
      url={imageUrl}
      bounds={bounds}
      opacity={opacity}
      zIndex={1000}
    />
  );
}

function MapControls({ onRefresh }) {
  return (
    <div className="map-controls">
      <button
        className="refresh-button"
        onClick={onRefresh}
        title="Refresh radar data"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
        </svg>
        Refresh
      </button>
    </div>
  );
}

function RadarMap({ metadata }) {
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const [bounds, setBounds] = useState(DEFAULT_BOUNDS);

  const handleRefresh = () => {
    setRefreshKey(Date.now());
  };

  useEffect(() => {
    if (metadata?.bounds) {
      const { south, north, west, east } = metadata.bounds;
      setBounds([
        [south, west],
        [north, east],
      ]);
    }
  }, [metadata]);

  return (
    <div className="radar-map-container">
      <MapContainer
        center={CONUS_CENTER}
        zoom={CONUS_ZOOM}
        minZoom={3}
        maxZoom={10}
        className="radar-map"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <RadarOverlay bounds={bounds} refreshKey={refreshKey} />
      </MapContainer>

      <MapControls onRefresh={handleRefresh} />
    </div>
  );
}

export default RadarMap;
