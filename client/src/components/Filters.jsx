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

  return (
    <div className="filters-panel">
      <div className="filters-header">
        <h3 className="filters-title">Filters</h3>
        <button onClick={handleReset} className="btn btn-secondary">
          Reset
        </button>
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
