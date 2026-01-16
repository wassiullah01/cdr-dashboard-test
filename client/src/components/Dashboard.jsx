import React, { useState, useEffect, useCallback } from 'react';
import Filters from './Filters';
import SummaryCards from './SummaryCards';
import TimelineChart from './TimelineChart';
import TopContactsChart from './TopContactsChart';
import EventsTable from './EventsTable';
import { apiUrl } from '../utils/api';
import '../styles/dashboard.css';

function Dashboard({ uploadSummary, currentUploadId, viewMode, onViewModeChange, onNewUpload }) {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    number: '',
    eventType: '',
    direction: ''
    // NOTE: uploadId is NOT stored in filters - it's passed explicitly from props
  });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvedUploadId, setResolvedUploadId] = useState(currentUploadId); // Track resolved ID from API

  // Update resolvedUploadId when currentUploadId prop changes
  useEffect(() => {
    if (currentUploadId) {
      setResolvedUploadId(currentUploadId);
    }
  }, [currentUploadId]);

  // Fetch overview when filters or view mode changes
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.number) params.append('number', filters.number);
      if (filters.eventType) params.append('eventType', filters.eventType);
      if (filters.direction) params.append('direction', filters.direction);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else {
        // Current mode: send uploadId if available
        const activeUploadId = currentUploadId || resolvedUploadId;
        if (activeUploadId) {
          params.append('uploadId', activeUploadId);
        }
        // If no uploadId, backend will default to most recent
      }

      const response = await fetch(apiUrl(`/api/analytics/overview?${params}`));
      const data = await response.json();
      setOverview(data);
      
      // Sync resolved uploadId from API response (if backend defaulted to most recent)
      if (data.uploadId && viewMode === 'current' && !currentUploadId) {
        setResolvedUploadId(data.uploadId);
      }
    } catch (error) {
      console.error('Failed to fetch overview:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, viewMode, currentUploadId, resolvedUploadId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleViewModeChange = (newMode) => {
    onViewModeChange(newMode);
  };

  // Format uploadId for display (short version)
  const displayUploadId = currentUploadId || resolvedUploadId;
  const uploadIdShort = displayUploadId ? displayUploadId.substring(0, 8) + '...' : 'Loading...';

  return (
    <div className="dashboard">
      <div className="container">
        {uploadSummary && (
          <div className="success-message">
            <strong>Upload Complete!</strong> Inserted: {uploadSummary.totalInserted}, 
            Skipped: {uploadSummary.totalSkipped} across {uploadSummary.totalFiles} file(s).
            <button
              onClick={onNewUpload}
              className="btn btn-secondary"
              style={{ marginLeft: 'var(--spacing-md)' }}
            >
              Upload New Files
            </button>
          </div>
        )}

        {/* Upload Session Indicator */}
        <div style={{
          padding: 'var(--spacing-md)',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-lg)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--spacing-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Showing results for:
            </span>
            <select
              value={viewMode}
              onChange={(e) => handleViewModeChange(e.target.value)}
              style={{
                padding: 'var(--spacing-xs) var(--spacing-sm)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              <option value="current">
                Current Upload (Latest)
              </option>
              <option value="all">All Uploads</option>
            </select>
          </div>
          {uploadSummary && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {uploadSummary.totalFiles} file(s) • {uploadSummary.totalInserted} events
            </span>
          )}
        </div>

        <Filters filters={filters} onFiltersChange={setFilters} />

        {loading ? (
          <div className="loading">Loading analytics...</div>
        ) : (
          <>
            <SummaryCards overview={overview} />
            <div className="grid grid-2">
              <TimelineChart 
                filters={filters} 
                uploadId={currentUploadId || resolvedUploadId}
                viewMode={viewMode}
              />
              <TopContactsChart 
                filters={filters} 
                uploadId={currentUploadId || resolvedUploadId}
                viewMode={viewMode}
              />
            </div>
            <EventsTable 
              filters={filters} 
              uploadId={currentUploadId || resolvedUploadId}
              viewMode={viewMode}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
