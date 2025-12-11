/**
 * Radar reflectivity color legend
 * Shows the dBZ to color mapping
 */
function Legend() {
  // Color scale matching the backend renderer
  const colorStops = [
    { dbz: 75, color: 'rgb(200, 200, 255)', label: '75+' },
    { dbz: 70, color: 'rgb(255, 255, 255)', label: '70' },
    { dbz: 65, color: 'rgb(128, 0, 200)', label: '65' },
    { dbz: 60, color: 'rgb(168, 0, 168)', label: '60' },
    { dbz: 55, color: 'rgb(200, 0, 0)', label: '55' },
    { dbz: 50, color: 'rgb(255, 0, 0)', label: '50' },
    { dbz: 45, color: 'rgb(255, 128, 0)', label: '45' },
    { dbz: 40, color: 'rgb(255, 192, 0)', label: '40' },
    { dbz: 35, color: 'rgb(255, 255, 0)', label: '35' },
    { dbz: 30, color: 'rgb(0, 128, 0)', label: '30' },
    { dbz: 25, color: 'rgb(0, 168, 0)', label: '25' },
    { dbz: 20, color: 'rgb(0, 200, 0)', label: '20' },
    { dbz: 15, color: 'rgb(32, 144, 140)', label: '15' },
    { dbz: 10, color: 'rgb(64, 164, 176)', label: '10' },
    { dbz: 5, color: 'transparent', label: '5' },
  ]

  return (
    <div className="legend">
      <div className="legend-title">
        <span>Reflectivity</span>
        <span className="legend-unit">dBZ</span>
      </div>
      
      <div className="legend-scale">
        {colorStops.map((stop, index) => (
          <div key={stop.dbz} className="legend-item">
            <div 
              className="legend-color" 
              style={{ 
                backgroundColor: stop.color,
                border: stop.dbz === 5 ? '1px solid rgba(255,255,255,0.3)' : 'none'
              }}
            />
            <span className="legend-label">{stop.label}</span>
          </div>
        ))}
      </div>

      <div className="legend-footer">
        <div className="legend-info">
          <span className="info-label">Light Rain</span>
          <span className="info-range">10-30 dBZ</span>
        </div>
        <div className="legend-info">
          <span className="info-label">Moderate</span>
          <span className="info-range">30-45 dBZ</span>
        </div>
        <div className="legend-info">
          <span className="info-label">Heavy/Severe</span>
          <span className="info-range">45+ dBZ</span>
        </div>
      </div>
    </div>
  )
}

export default Legend

