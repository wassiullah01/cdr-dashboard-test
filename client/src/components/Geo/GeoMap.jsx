import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
// Import leaflet.heat plugin (extends L with heatLayer method)
// The plugin adds L.heatLayer() function
import 'leaflet.heat';

// Fix default marker icons (Leaflet issue with webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Heatmap Layer Component
function HeatmapLayer({ data }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!data?.cells || data.cells.length === 0) {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    // Convert cells to heat points format [lat, lng, intensity]
    const heatPoints = data.cells.map(cell => [
      cell.lat,
      cell.lng,
      cell.weight || cell.eventCount || 1
    ]);

    // Remove existing layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    // Create new heat layer (L.heatLayer is added by leaflet.heat plugin)
    if (typeof L.heatLayer !== 'function') {
      console.error('L.heatLayer is not available. Ensure leaflet.heat package is installed.');
      return;
    }
    const heatLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 18,
      max: 1.0,
      gradient: {
        0.0: 'blue',
        0.5: 'cyan',
        0.7: 'lime',
        0.9: 'yellow',
        1.0: 'red'
      }
    });

    heatLayer.addTo(map);
    heatLayerRef.current = heatLayer;

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [data, map]);

  return null;
}

// Fit Bounds Component
function FitBounds({ bbox, trigger }) {
  const map = useMap();

  useEffect(() => {
    if (bbox && trigger) {
      const bounds = [
        [bbox.minLat, bbox.minLng],
        [bbox.maxLat, bbox.maxLng]
      ];
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bbox, trigger, map]);

  return null;
}

// Points Layer Component
function PointsLayer({ data, filters, onPointClick, selectedPoint }) {
  const map = useMap();
  const zoom = map.getZoom();

  // Only show points when zoomed in enough or phone filter is active
  if (zoom < 10 && !filters.phone) {
    return null;
  }

  if (!data?.points || data.points.length === 0) {
    return null;
  }

  // Limit points for performance
  const maxPoints = filters.pointLimit || 2000;
  const pointsToShow = data.points.slice(0, maxPoints);

  return (
    <>
      {pointsToShow.map((point, idx) => {
        const isSelected = selectedPoint?.index === idx;
        return (
          <CircleMarker
            key={`point-${idx}`}
            center={[point.lat, point.lng]}
            radius={isSelected ? 8 : 4}
            pathOptions={{
              color: isSelected ? '#ff0000' : '#3b82f6',
              fillColor: isSelected ? '#ff0000' : '#3b82f6',
              fillOpacity: 0.6,
              weight: isSelected ? 3 : 1
            }}
            eventHandlers={{
              click: () => onPointClick({ ...point, index: idx })
            }}
          />
        );
      })}
    </>
  );
}

// Trace Path Component
function TracePath({ data, onPointClick, selectedPoint }) {
  if (!data?.points || data.points.length === 0) {
    return null;
  }

  const pathPositions = data.points.map(p => [p.lat, p.lng]);
  const startPoint = data.points[0];
  const endPoint = data.points[data.points.length - 1];

  return (
    <>
      <Polyline
        positions={pathPositions}
        pathOptions={{
          color: '#3b82f6',
          weight: 3,
          opacity: 0.7
        }}
      />
      {/* Start marker (green) */}
      {startPoint && (
        <CircleMarker
          center={[startPoint.lat, startPoint.lng]}
          radius={8}
          pathOptions={{
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.8,
            weight: 2
          }}
          eventHandlers={{
            click: () => onPointClick({ ...startPoint, index: 0, type: 'start' })
          }}
        />
      )}
      {/* End marker (red) */}
      {endPoint && (
        <CircleMarker
          center={[endPoint.lat, endPoint.lng]}
          radius={8}
          pathOptions={{
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.8,
            weight: 2
          }}
          eventHandlers={{
            click: () => onPointClick({ ...endPoint, index: data.points.length - 1, type: 'end' })
          }}
        />
      )}
      {/* Intermediate points */}
      {data.points.slice(1, -1).map((point, idx) => {
        const actualIdx = idx + 1;
        const isSelected = selectedPoint?.index === actualIdx;
        return (
          <CircleMarker
            key={`trace-point-${actualIdx}`}
            center={[point.lat, point.lng]}
            radius={isSelected ? 6 : 4}
            pathOptions={{
              color: isSelected ? '#ff0000' : '#3b82f6',
              fillColor: isSelected ? '#ff0000' : '#3b82f6',
              fillOpacity: 0.6,
              weight: isSelected ? 2 : 1
            }}
            eventHandlers={{
              click: () => onPointClick({ ...point, index: actualIdx })
            }}
          />
        );
      })}
    </>
  );
}

function GeoMap({ summary, heatmapData, traceData, pointsData, viewMode, filters, selectedPoint, onPointSelect }) {
  const mapRef = useRef(null);
  const fitBoundsTrigger = useRef(0);

  // Handle fit to bounds request
  useEffect(() => {
    if (selectedPoint?.type === 'fit' && selectedPoint?.bbox) {
      fitBoundsTrigger.current += 1;
    }
  }, [selectedPoint]);

  // Default center (Pakistan/Karachi area)
  const defaultCenter = [24.8607, 67.0011];
  const defaultZoom = 6;

  // Determine initial bounds from summary or data
  const getInitialBounds = () => {
    if (summary?.bbox) {
      return [
        [summary.bbox.minLat, summary.bbox.minLng],
        [summary.bbox.maxLat, summary.bbox.maxLng]
      ];
    }
    // Fallback: try to get bounds from trace/points data
    if (traceData?.points && traceData.points.length > 0) {
      const lats = traceData.points.map(p => p.lat).filter(l => l != null);
      const lngs = traceData.points.map(p => p.lng).filter(l => l != null);
      if (lats.length > 0 && lngs.length > 0) {
        return [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)]
        ];
      }
    }
    if (pointsData?.points && pointsData.points.length > 0) {
      const lats = pointsData.points.map(p => p.lat).filter(l => l != null);
      const lngs = pointsData.points.map(p => p.lng).filter(l => l != null);
      if (lats.length > 0 && lngs.length > 0) {
        return [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)]
        ];
      }
    }
    return null;
  };

  const initialBounds = getInitialBounds();

  return (
    <div className="geo-map-container">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(mapInstance) => {
          mapRef.current = mapInstance;
          // Fit to bounds if available
          if (initialBounds) {
            mapInstance.fitBounds(initialBounds, { padding: [50, 50] });
          }
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {viewMode === 'heatmap' && <HeatmapLayer data={heatmapData} />}
        {viewMode === 'points' && (
          <PointsLayer
            data={pointsData || { points: [] }}
            filters={filters}
            onPointClick={onPointSelect}
            selectedPoint={selectedPoint}
          />
        )}
        {viewMode === 'path' && (
          <TracePath
            data={traceData}
            onPointClick={onPointSelect}
            selectedPoint={selectedPoint}
          />
        )}
        
        {summary?.bbox && (
          <FitBounds
            bbox={summary.bbox}
            trigger={fitBoundsTrigger.current}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default GeoMap;
