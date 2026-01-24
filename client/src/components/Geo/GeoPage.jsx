import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../../utils/api';
import GeoMap from './GeoMap';
import GeoControls from './GeoControls';
import GeoDetailsPanel from './GeoDetailsPanel';
import 'leaflet/dist/leaflet.css';
import '../../styles/geo.css';

function GeoPage({ currentUploadId, viewMode }) {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    eventType: 'all',
    phone: '',
    gridSize: 0.01,
    pointLimit: 2000
  });

  const [geoViewMode, setGeoViewMode] = useState('heatmap'); // 'heatmap' | 'points' | 'path'
  const [summary, setSummary] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [traceData, setTraceData] = useState(null);
  const [pointsData, setPointsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  
  // Separate AbortControllers for each fetch to prevent race conditions
  const summaryAbortRef = useRef(null);
  const heatmapAbortRef = useRef(null);
  const pointsAbortRef = useRef(null);
  const traceAbortRef = useRef(null);

  // Fetch geographic summary
  const fetchSummary = useCallback(async () => {
    if (!currentUploadId) {
      setLoading(false);
      setSummary(null);
      return;
    }

    // Abort previous summary request if still pending
    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
    }
    summaryAbortRef.current = new AbortController();
    const currentAbortController = summaryAbortRef.current;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('uploadId', currentUploadId);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      params.append('eventType', filters.eventType);
      if (filters.phone && filters.phone.trim()) {
        params.append('phone', filters.phone.trim());
      }

      const response = await fetch(apiUrl(`/api/analytics/geo/summary?${params}`), {
        signal: currentAbortController.signal
      });

      // Check if this request was aborted
      if (currentAbortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch geo summary: ${response.status}`);
      }

      const data = await response.json();
      
      // Double-check abort status before setting state
      if (!currentAbortController.signal.aborted) {
        setSummary(data);
        setError(null);
      }
    } catch (err) {
      // Silently handle abort errors
      if (err.name === 'AbortError' || currentAbortController.signal.aborted) {
        return;
      }
      console.error('Failed to fetch geo summary:', err);
      setError(err.message || 'Failed to load geographic data');
    } finally {
      // Only update loading state if this is still the current request
      if (summaryAbortRef.current === currentAbortController) {
        setLoading(false);
        summaryAbortRef.current = null;
      }
    }
  }, [currentUploadId, filters.from, filters.to, filters.eventType, filters.phone]);

  // Fetch heatmap data
  const fetchHeatmap = useCallback(async () => {
    if (!currentUploadId || geoViewMode !== 'heatmap') {
      setHeatmapData(null);
      return;
    }

    // Abort previous heatmap request if still pending
    if (heatmapAbortRef.current) {
      heatmapAbortRef.current.abort();
    }
    heatmapAbortRef.current = new AbortController();
    const currentAbortController = heatmapAbortRef.current;

    try {
      const params = new URLSearchParams();
      params.append('uploadId', currentUploadId);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      params.append('eventType', filters.eventType);
      params.append('grid', filters.gridSize.toString());
      if (filters.phone && filters.phone.trim()) {
        params.append('phone', filters.phone.trim());
      }

      const response = await fetch(apiUrl(`/api/analytics/geo/heatmap?${params}`), {
        signal: currentAbortController.signal
      });

      // Check if this request was aborted
      if (currentAbortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch heatmap: ${response.status}`);
      }

      const data = await response.json();
      
      // Double-check abort status before setting state
      if (!currentAbortController.signal.aborted) {
        setHeatmapData(data);
      }
    } catch (err) {
      // Silently handle abort errors
      if (err.name === 'AbortError' || currentAbortController.signal.aborted) {
        return;
      }
      console.error('Failed to fetch heatmap:', err);
    }
  }, [currentUploadId, filters.from, filters.to, filters.eventType, filters.phone, filters.gridSize, geoViewMode]);

  // Fetch points data (for points view) - uses trace endpoint without phone requirement
  const fetchPoints = useCallback(async () => {
    if (!currentUploadId || geoViewMode !== 'points') {
      setPointsData(null);
      return;
    }

    // Abort previous points request if still pending
    if (pointsAbortRef.current) {
      pointsAbortRef.current.abort();
    }
    pointsAbortRef.current = new AbortController();
    const currentAbortController = pointsAbortRef.current;

    try {
      const params = new URLSearchParams();
      params.append('uploadId', currentUploadId);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      params.append('eventType', filters.eventType);
      params.append('limit', filters.pointLimit.toString());
      // Phone is optional for points view
      if (filters.phone && filters.phone.trim()) {
        params.append('phone', filters.phone.trim());
      }

      const response = await fetch(apiUrl(`/api/analytics/geo/trace?${params}`), {
        signal: currentAbortController.signal
      });

      // Check if this request was aborted
      if (currentAbortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch points: ${response.status}`);
      }

      const data = await response.json();
      
      // Double-check abort status before setting state
      if (!currentAbortController.signal.aborted) {
        setPointsData(data);
      }
    } catch (err) {
      // Silently handle abort errors
      if (err.name === 'AbortError' || currentAbortController.signal.aborted) {
        return;
      }
      console.error('Failed to fetch points:', err);
    }
  }, [currentUploadId, filters.from, filters.to, filters.eventType, filters.phone, filters.pointLimit, geoViewMode]);

  // Fetch trace data
  const fetchTrace = useCallback(async () => {
    if (!currentUploadId || geoViewMode !== 'path' || !filters.phone || !filters.phone.trim()) {
      setTraceData(null);
      return;
    }

    // Abort previous trace request if still pending
    if (traceAbortRef.current) {
      traceAbortRef.current.abort();
    }
    traceAbortRef.current = new AbortController();
    const currentAbortController = traceAbortRef.current;

    try {
      const params = new URLSearchParams();
      params.append('uploadId', currentUploadId);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      params.append('eventType', filters.eventType);
      params.append('phone', filters.phone.trim());
      params.append('limit', filters.pointLimit.toString());

      const response = await fetch(apiUrl(`/api/analytics/geo/trace?${params}`), {
        signal: currentAbortController.signal
      });

      // Check if this request was aborted
      if (currentAbortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch trace: ${response.status}`);
      }

      const data = await response.json();
      
      // Double-check abort status before setting state
      if (!currentAbortController.signal.aborted) {
        setTraceData(data);
      }
    } catch (err) {
      // Silently handle abort errors
      if (err.name === 'AbortError' || currentAbortController.signal.aborted) {
        return;
      }
      console.error('Failed to fetch trace:', err);
    }
  }, [currentUploadId, filters.from, filters.to, filters.eventType, filters.phone, filters.pointLimit, geoViewMode]);

  // Fetch data when filters or view mode changes
  useEffect(() => {
    fetchSummary();
    
    // Cleanup: abort on unmount
    return () => {
      if (summaryAbortRef.current) {
        summaryAbortRef.current.abort();
      }
    };
  }, [fetchSummary]);

  useEffect(() => {
    fetchHeatmap();
    
    // Cleanup: abort on unmount
    return () => {
      if (heatmapAbortRef.current) {
        heatmapAbortRef.current.abort();
      }
    };
  }, [fetchHeatmap]);

  useEffect(() => {
    fetchPoints();
    
    // Cleanup: abort on unmount
    return () => {
      if (pointsAbortRef.current) {
        pointsAbortRef.current.abort();
      }
    };
  }, [fetchPoints]);

  useEffect(() => {
    fetchTrace();
    
    // Cleanup: abort on unmount
    return () => {
      if (traceAbortRef.current) {
        traceAbortRef.current.abort();
      }
    };
  }, [fetchTrace]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setSelectedPoint(null);
  };

  const handleViewModeChange = (mode) => {
    setGeoViewMode(mode);
    setSelectedPoint(null);
  };

  const handleResetFilters = () => {
    setFilters({
      from: '',
      to: '',
      eventType: 'all',
      phone: '',
      gridSize: 0.01,
      pointLimit: 2000
    });
    setGeoViewMode('heatmap');
    setSelectedPoint(null);
  };

  const handleFitToData = () => {
    if (summary?.bbox) {
      // This will be handled by GeoMap component
      setSelectedPoint({ type: 'fit', bbox: summary.bbox });
    }
  };

  return (
    <div className="geo-page">
      <div className="container">
        <div className="geo-header">
          <h1>Geographic Analysis</h1>
          <p className="subheader">
            {currentUploadId ? `Upload: ${currentUploadId.substring(0, 8)}...` : 'No upload selected'}
          </p>
        </div>

        <GeoControls
          filters={filters}
          viewMode={geoViewMode}
          summary={summary}
          onFilterChange={handleFilterChange}
          onViewModeChange={handleViewModeChange}
          onResetFilters={handleResetFilters}
          onFitToData={handleFitToData}
          loading={loading}
        />

        <div className="geo-content-wrapper">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading geographic data...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>Error: {error}</p>
              <button onClick={fetchSummary} className="btn btn-primary">
                Retry
              </button>
            </div>
          ) : (!summary || (summary.eventsWithCoords === 0 && 
            !(geoViewMode === 'path' && traceData?.points?.length > 0) &&
            !(geoViewMode === 'points' && pointsData?.points?.length > 0) &&
            !(geoViewMode === 'heatmap' && heatmapData?.cells?.length > 0))) ? (
            <div className="empty-state">
              <p>No location coordinates available in this filter window.</p>
              <p className="hint">Try adjusting your filters or ensure your dataset includes latitude/longitude data.</p>
              {summary && (
                <div className="hint" style={{ marginTop: '10px', fontSize: '0.875rem' }}>
                  <p>Summary: {summary.eventsWithCoords} events with coordinates found.</p>
                  {summary.totalEventsInWindow > 0 && (
                    <p>Total events in window: {summary.totalEventsInWindow}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="geo-content">
              <GeoMap
                summary={summary}
                heatmapData={geoViewMode === 'heatmap' ? heatmapData : null}
                traceData={geoViewMode === 'path' ? traceData : null}
                pointsData={geoViewMode === 'points' ? pointsData : null}
                viewMode={geoViewMode}
                filters={filters}
                selectedPoint={selectedPoint}
                onPointSelect={setSelectedPoint}
              />
              <GeoDetailsPanel
                selectedPoint={selectedPoint}
                traceData={traceData}
                viewMode={geoViewMode}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeoPage;
