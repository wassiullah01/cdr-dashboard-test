import React from 'react';

function GeoControls({ filters, viewMode, summary, onFilterChange, onViewModeChange, onResetFilters, onFitToData, loading }) {
  const handleQuickDatePreset = (preset) => {
    if (!summary?.timeRange) return;

    const anchorTime = summary.timeRange.maxTime || new Date();
    const anchorDate = new Date(anchorTime);
    let from = '';
    let to = '';

    if (preset === 'all') {
      from = '';
      to = '';
    } else {
      const days = preset === '7d' ? 7 : 30;
      from = new Date(anchorDate.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
      to = anchorDate.toISOString();
    }

    onFilterChange('from', from);
    onFilterChange('to', to);
  };

  return (
    <div className="geo-controls">
      <div className="control-group">
        <label>Date Range</label>
        <div className="quick-presets">
          <button
            onClick={() => handleQuickDatePreset('7d')}
            disabled={!summary?.timeRange || loading}
            className="btn btn-sm"
          >
            Last 7d
          </button>
          <button
            onClick={() => handleQuickDatePreset('30d')}
            disabled={!summary?.timeRange || loading}
            className="btn btn-sm"
          >
            Last 30d
          </button>
          <button
            onClick={() => handleQuickDatePreset('all')}
            disabled={loading}
            className="btn btn-sm"
          >
            All
          </button>
        </div>
        <div className="date-inputs">
          <input
            type="datetime-local"
            value={filters.from ? new Date(filters.from).toISOString().slice(0, 16) : ''}
            onChange={(e) => onFilterChange('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
            disabled={loading}
          />
          <span>to</span>
          <input
            type="datetime-local"
            value={filters.to ? new Date(filters.to).toISOString().slice(0, 16) : ''}
            onChange={(e) => onFilterChange('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
            disabled={loading}
          />
        </div>
      </div>

      <div className="control-group">
        <label>Event Type</label>
        <select
          value={filters.eventType}
          onChange={(e) => onFilterChange('eventType', e.target.value)}
          disabled={loading}
        >
          <option value="all">All</option>
          <option value="call">Calls</option>
          <option value="sms">SMS</option>
        </select>
      </div>

      <div className="control-group">
        <label>Phone (optional)</label>
        <input
          type="text"
          value={filters.phone}
          onChange={(e) => onFilterChange('phone', e.target.value.trim())}
          placeholder="Enter phone number"
          disabled={loading}
        />
        <small>Required for Path view</small>
      </div>

      <div className="control-group">
        <label>View Mode</label>
        <div className="view-toggles">
          <button
            className={`btn btn-sm ${viewMode === 'heatmap' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onViewModeChange('heatmap')}
            disabled={loading}
          >
            Heatmap
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'points' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onViewModeChange('points')}
            disabled={loading}
          >
            Points
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'path' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onViewModeChange('path')}
            disabled={loading || !filters.phone}
            title={!filters.phone ? 'Enter a phone number to enable Path view' : ''}
          >
            Path
          </button>
        </div>
      </div>

      {viewMode === 'heatmap' && (
        <div className="control-group">
          <label>Grid Size</label>
          <select
            value={filters.gridSize}
            onChange={(e) => onFilterChange('gridSize', parseFloat(e.target.value))}
            disabled={loading}
          >
            <option value="0.005">Fine (0.005°)</option>
            <option value="0.01">Medium (0.01°)</option>
            <option value="0.02">Coarse (0.02°)</option>
          </select>
        </div>
      )}

      {(viewMode === 'points' || viewMode === 'path') && (
        <div className="control-group">
          <label>Point Limit</label>
          <select
            value={filters.pointLimit}
            onChange={(e) => onFilterChange('pointLimit', parseInt(e.target.value))}
            disabled={loading}
          >
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="2000">2000</option>
            <option value="5000">5000</option>
          </select>
        </div>
      )}

      <div className="control-actions">
        <button
          onClick={onFitToData}
          disabled={!summary?.bbox || loading}
          className="btn btn-primary"
        >
          Fit to Data
        </button>
        <button
          onClick={onResetFilters}
          disabled={loading}
          className="btn btn-secondary"
        >
          Reset Filters
        </button>
      </div>

      {summary && (
        <div className="geo-summary">
          <div className="summary-item">
            <span className="label">Events with Coords:</span>
            <span className="value">{summary.eventsWithCoords.toLocaleString()}</span>
          </div>
          <div className="summary-item">
            <span className="label">Unique Locations:</span>
            <span className="value">{summary.uniqueLocationsCount.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeoControls;
