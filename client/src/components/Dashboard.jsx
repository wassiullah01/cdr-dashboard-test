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
  const [error, setError] = useState(null);
  const [resolvedUploadId, setResolvedUploadId] = useState(currentUploadId); // Track resolved ID from API

  // Update resolvedUploadId when currentUploadId prop changes
  useEffect(() => {
    if (currentUploadId) {
      setResolvedUploadId(currentUploadId);
    }
  }, [currentUploadId]);

  // Fetch overview when filters or view mode changes
  const fetchOverview = useCallback(async () => {
    if (!currentUploadId && viewMode === 'current') {
      // No uploadId in current mode - wait for it
      setLoading(false);
      setError(null);
      setOverview(null);
      return;
    }
    
    setLoading(true);
    setError(null);
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
      
      if (!response.ok) {
        throw new Error(`Failed to fetch overview: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setOverview(data);
      
      // Sync resolved uploadId from API response (if backend defaulted to most recent)
      if (data.uploadId && viewMode === 'current' && !currentUploadId) {
        setResolvedUploadId(data.uploadId);
      }
    } catch (error) {
      console.error('Failed to fetch overview:', error);
      setError(error.message || 'Failed to load dashboard data');
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
            <strong>Upload Complete!</strong> 
            <span style={{ marginLeft: 'var(--spacing-sm)' }}>
              <strong>Inserted:</strong> {uploadSummary.totalInserted || 0}
              {' • '}
              <strong>Skipped:</strong> {uploadSummary.totalSkipped || 0}
              {uploadSummary.totalInvalid > 0 && (
                <span style={{ marginLeft: 'var(--spacing-sm)', color: '#d32f2f' }}>
                  (Invalid: {uploadSummary.totalInvalid}
                </span>
              )}
              {uploadSummary.totalDuplicates > 0 && (
                <span style={{ marginLeft: 'var(--spacing-xs)', color: '#ff9800' }}>
                  {uploadSummary.totalInvalid > 0 ? ', ' : '('}Duplicates: {uploadSummary.totalDuplicates}
                </span>
              )}
              {(uploadSummary.totalInvalid > 0 || uploadSummary.totalDuplicates > 0) && (
                <span style={{ marginLeft: 'var(--spacing-xs)' }}>)</span>
              )}
            </span>
            <span style={{ marginLeft: 'var(--spacing-sm)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              across {uploadSummary.totalFiles} file(s)
            </span>
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

        {/* Global Investigator Filters */}
        <div className="investigator-filters" style={{
          background: 'var(--bg-secondary)',
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-lg)',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 'var(--spacing-sm)',
            flexWrap: 'wrap',
            gap: 'var(--spacing-sm)'
          }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Investigator Filters</h3>
            <button
              onClick={() => setFilters({
                startDate: '',
                endDate: '',
                number: '',
                eventType: '',
                direction: ''
              })}
              className="btn btn-secondary"
              style={{ fontSize: '0.875rem', padding: '6px 12px' }}
            >
              Reset All Filters
            </button>
          </div>
          <Filters filters={filters} onFiltersChange={setFilters} />
        </div>

        {loading ? (
          <div className="loading" style={{ 
            padding: 'var(--spacing-xl)', 
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            Loading analytics...
          </div>
        ) : error ? (
          <div className="error-state" style={{
            padding: 'var(--spacing-xl)',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--error-color)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-md)', color: 'var(--error-color)' }}>⚠️</div>
            <h3 style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--error-color)' }}>Error Loading Dashboard</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
              {error}
            </p>
            <button
              onClick={fetchOverview}
              className="btn btn-primary"
            >
              Retry
            </button>
          </div>
        ) : overview && overview.totalEvents === 0 ? (
          <div className="empty-state" style={{
            padding: 'var(--spacing-xl)',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-md)' }}>📊</div>
            <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>No Events Found</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
              {filters.startDate || filters.endDate || filters.number || filters.eventType || filters.direction
                ? 'No events match the selected filters. Try adjusting your filters or clearing them.'
                : 'No events found for this upload. Please upload CDR files to begin analysis.'}
            </p>
            {(filters.startDate || filters.endDate || filters.number || filters.eventType || filters.direction) && (
              <button
                onClick={() => setFilters({
                  startDate: '',
                  endDate: '',
                  number: '',
                  eventType: '',
                  direction: ''
                })}
                className="btn btn-primary"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <SummaryCards overview={overview} />
            <div className="grid grid-2">
              <TimelineChart 
                filters={filters} 
                uploadId={currentUploadId || resolvedUploadId}
                viewMode={viewMode}
                overview={overview}
              />
              <TopContactsChart 
                filters={filters} 
                uploadId={currentUploadId || resolvedUploadId}
                viewMode={viewMode}
                overview={overview}
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
