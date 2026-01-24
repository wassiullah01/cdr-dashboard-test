import React from 'react';

function GeoDetailsPanel({ selectedPoint, traceData, viewMode }) {
  if (!selectedPoint || selectedPoint.type === 'fit') {
    return (
      <div className="geo-details-panel">
        <div className="panel-section">
          <h3>Map Information</h3>
          <p className="hint">
            {viewMode === 'heatmap' && 'Click on the map to view location details.'}
            {viewMode === 'points' && 'Click on a point marker to view event details.'}
            {viewMode === 'path' && 'Click on a path point to view movement details.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="geo-details-panel">
      <div className="panel-section">
        <h3>Location Details</h3>
        <div className="detail-row">
          <span className="detail-label">Latitude:</span>
          <span className="detail-value">{selectedPoint.lat?.toFixed(6)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Longitude:</span>
          <span className="detail-value">{selectedPoint.lng?.toFixed(6)}</span>
        </div>
        {selectedPoint.timestampUtc && (
          <div className="detail-row">
            <span className="detail-label">Time:</span>
            <span className="detail-value">
              {new Date(selectedPoint.timestampUtc).toLocaleString()}
            </span>
          </div>
        )}
        {selectedPoint.eventType && (
          <div className="detail-row">
            <span className="detail-label">Event Type:</span>
            <span className="detail-value">{selectedPoint.eventType}</span>
          </div>
        )}
        {selectedPoint.counterparty && (
          <div className="detail-row">
            <span className="detail-label">Counterparty:</span>
            <span className="detail-value">{selectedPoint.counterparty}</span>
          </div>
        )}
        {selectedPoint.type && (
          <div className="detail-row">
            <span className="detail-label">Point Type:</span>
            <span className="detail-value">
              {selectedPoint.type === 'start' ? 'Start' : selectedPoint.type === 'end' ? 'End' : 'Waypoint'}
            </span>
          </div>
        )}
      </div>

      {viewMode === 'path' && traceData?.points && (
        <div className="panel-section">
          <h3>Movement Summary</h3>
          <div className="detail-row">
            <span className="detail-label">Total Points:</span>
            <span className="detail-value">{traceData.points.length}</span>
          </div>
          {traceData.points.length > 0 && (
            <>
              <div className="detail-row">
                <span className="detail-label">Start Time:</span>
                <span className="detail-value">
                  {new Date(traceData.points[0].timestampUtc).toLocaleString()}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">End Time:</span>
                <span className="detail-value">
                  {new Date(traceData.points[traceData.points.length - 1].timestampUtc).toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default GeoDetailsPanel;
