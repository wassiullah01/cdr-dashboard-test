import React from 'react';
import '../styles/filters.css';

function Filters({ filters, onFiltersChange }) {
  const handleChange = (field, value) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const handleReset = () => {
    onFiltersChange({
      startDate: '',
      endDate: '',
      number: '',
      eventType: '',
      direction: ''
    });
  };

  const handleDatePreset = (preset) => {
    const now = new Date();
    let startDate = '';
    let endDate = '';

    switch (preset) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
        break;
      case 'all':
        startDate = '';
        endDate = '';
        break;
      default:
        return;
    }

    onFiltersChange({ ...filters, startDate, endDate });
  };

  return (
    <div className="filters-panel">
      <div className="filters-header">
        <h3 className="filters-title">Filters</h3>
        <button onClick={handleReset} className="btn btn-secondary">
          Clear Filters
        </button>
      </div>

      {/* Quick Date Presets */}
      <div className="filters-presets" style={{ marginBottom: 'var(--spacing-md)' }}>
        <label className="filter-label" style={{ marginBottom: 'var(--spacing-xs)' }}>Quick Presets:</label>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleDatePreset('24h')}
            className="btn btn-sm"
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            Last 24h
          </button>
          <button
            onClick={() => handleDatePreset('7d')}
            className="btn btn-sm"
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            Last 7d
          </button>
          <button
            onClick={() => handleDatePreset('30d')}
            className="btn btn-sm"
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            Last 30d
          </button>
          <button
            onClick={() => handleDatePreset('all')}
            className="btn btn-sm"
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            All Time
          </button>
        </div>
      </div>

      <div className="filters-grid">
        <div className="filter-group">
          <label className="filter-label">Start Date</label>
          <input
            type="date"
            className="filter-input"
            value={filters.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">End Date</label>
          <input
            type="date"
            className="filter-input"
            value={filters.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Phone Number</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Search by number..."
            value={filters.number}
            onChange={(e) => handleChange('number', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label className="filter-label">Event Type</label>
          <select
            className="filter-input"
            value={filters.eventType}
            onChange={(e) => handleChange('eventType', e.target.value)}
          >
            <option value="">All</option>
            <option value="CALL">Call</option>
            <option value="SMS">SMS</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Direction</label>
          <select
            className="filter-input"
            value={filters.direction}
            onChange={(e) => handleChange('direction', e.target.value)}
          >
            <option value="">All</option>
            <option value="INCOMING">Incoming</option>
            <option value="OUTGOING">Outgoing</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default Filters;
