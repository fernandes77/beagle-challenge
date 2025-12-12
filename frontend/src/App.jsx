import { useState, useEffect } from "react";
import RadarMap from "./components/RadarMap";
import Legend from "./components/Legend";

function App() {
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchMetadata = async () => {
    try {
      const response = await fetch("/api/radar/metadata");
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      const data = await response.json();
      setMetadata(data);
      setLastUpdate(new Date());
      setError(null);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching metadata:", err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="title-section">
            <h1>Weather Radar</h1>
          </div>
          <div className="info-section">
            {loading && (
              <span className="loading-indicator">
                <span className="spinner small" />
                <span>Loading…</span>
              </span>
            )}
            {error && <span className="error-indicator">Error: {error}</span>}
            {metadata && (
              <div className="timestamp-info">
                <div className="data-time">
                  <span className="label">Radar Data:</span>
                  <span className="value">
                    {formatTimestamp(metadata.timestamp)}
                  </span>
                </div>
                <div className="update-time">
                  <span className="label">Last Refresh:</span>
                  <span className="value">{formatTimestamp(lastUpdate)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <RadarMap metadata={metadata} />
        <Legend />
      </main>

      <footer className="footer">
        <p>
          Data source:{" "}
          <a
            href="https://mrms.ncep.noaa.gov"
            target="_blank"
            rel="noopener noreferrer"
          >
            NOAA MRMS
          </a>
          {" | "}
          Updates every 2 minutes
        </p>
      </footer>
    </div>
  );
}

export default App;
