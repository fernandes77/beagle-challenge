import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, ImageOverlay, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// CONUS bounds (Continental US)
const CONUS_CENTER = [39.0, -98.0]
const CONUS_ZOOM = 4

// Default bounds for MRMS data (will be updated from metadata)
const DEFAULT_BOUNDS = [
  [20.0, -130.0],  // Southwest corner [lat, lng]
  [55.0, -60.0]    // Northeast corner [lat, lng]
]

/**
 * Component to handle radar overlay updates
 */
function RadarOverlay({ bounds, refreshKey }) {
  const map = useMap()
  const [imageUrl, setImageUrl] = useState(null)
  const [opacity, setOpacity] = useState(0.85)

  useEffect(() => {
    // Create a unique URL to bypass cache
    const url = `/api/radar/latest?t=${refreshKey}`
    setImageUrl(url)
  }, [refreshKey])

  if (!imageUrl) return null

  return (
    <ImageOverlay
      url={imageUrl}
      bounds={bounds}
      opacity={opacity}
      zIndex={1000}
    />
  )
}

/**
 * Map controls component
 */
function MapControls({ onRefresh }) {
  return (
    <div className="map-controls">
      <button 
        className="refresh-button"
        onClick={onRefresh}
        title="Refresh radar data"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        Refresh
      </button>
    </div>
  )
}

/**
 * Main RadarMap component
 */
function RadarMap({ metadata }) {
  const [refreshKey, setRefreshKey] = useState(Date.now())
  const [bounds, setBounds] = useState(DEFAULT_BOUNDS)

  useEffect(() => {
    if (metadata?.bounds) {
      const { south, north, west, east } = metadata.bounds
      setBounds([
        [south, west],
        [north, east]
      ])
    }
  }, [metadata])

  // Refresh handler
  const handleRefresh = () => {
    setRefreshKey(Date.now())
  }

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(Date.now())
    }, 2 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

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
        {/* Dark base map tiles */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Radar overlay */}
        <RadarOverlay bounds={bounds} refreshKey={refreshKey} />
      </MapContainer>
      
      <MapControls onRefresh={handleRefresh} />
    </div>
  )
}

export default RadarMap

