import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/api';
import '../styles/dashboard.css';

function Alerts({ currentUploadId, viewMode }) {
  const navigate = useNavigate();
  const abortControllerRef = useRef(null);

  const [filters, setFilters] = useState({
    from: '',
    to: '',
    eventType: 'all',
    baselineRatio: 0.7,
    phone: ''
  });

  const [alertsData, setAlertsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    if (!currentUploadId && viewMode === 'current') {
      setLoading(false);
      setAlertsData(null);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('uploadId', currentUploadId);
      if (filters.from) params.append('from', filters.from);
      if (filters.to) params.append('to', filters.to);
      params.append('eventType', filters.eventType);
      params.append('baselineRatio', filters.baselineRatio.toString());
      if (filters.phone) params.append('phone', filters.phone);

      const response = await fetch(apiUrl(`/api/analytics/anomalies?${params}`), {
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setAlertsData(data);
      setError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to fetch alerts:', err);
      setError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentUploadId, viewMode, filters]);

  useEffect(() => {
    fetchAlerts();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAlerts]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setSelectedAlert(null);
  };

  const handleResetFilters = () => {
    setFilters({
      from: '',
      to: '',
      eventType: 'all',
      baselineRatio: 0.7,
      phone: ''
    });
    setSelectedAlert(null);
  };

  const handleQuickDatePreset = (preset) => {
    const now = new Date();
    let from = '';
    let to = '';

    switch (preset) {
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        to = now.toISOString();
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        to = now.toISOString();
        break;
      case 'all':
        from = '';
        to = '';
        break;
      default:
        return;
    }

    setFilters(prev => ({ ...prev, from, to }));
  };

  const handleViewInNetwork = (alert) => {
    navigate('/network', { state: { focusPhone: alert.phone } });
  };

  const handleViewEvents = (alert) => {
    navigate('/', { state: { 
      filterPhone: alert.phone,
      filterFrom: alertsData?.recent?.startUtc,
      filterTo: alertsData?.recent?.endUtc
    }});
  };

  const handleViewTimeline = (alert) => {
    navigate('/', { state: { 
      filterPhone: alert.phone,
      filterFrom: alertsData?.baseline?.startUtc,
      filterTo: alertsData?.recent?.endUtc
    }});
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'high': return '#fee2e2';
      case 'medium': return '#fef3c7';
      case 'low': return '#dbeafe';
      default: return '#f3f4f6';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'VOLUME_SPIKE': return 'Volume Spike';
      case 'NEW_CONTACT_EMERGENCE': return 'New Contact';
      case 'NIGHT_ACTIVITY_SHIFT': return 'Night Activity Shift';
      case 'BURST_PATTERN_CHANGE': return 'Burst Pattern Change';
      default: return type;
    }
  };

  return (
    <div className="alerts-page" style={{ padding: 'var(--spacing-lg)' }}>
      <div className="container">
        <div className="alerts-header" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h1>Anomaly Alerts</h1>
          <p className="subheader">
            {currentUploadId ? `Upload: ${currentUploadId.substring(0, 8)}...` : 'No upload selected'}
          </p>
        </div>

        {/* Filters */}
        <div className="alerts-filters" style={{
          padding: 'var(--spacing-md)',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--spacing-lg)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', alignItems: 'flex-end' }}>
            <div className="filter-group">
              <label>Date Range</label>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                <button onClick={() => handleQuickDatePreset('30d')} className="btn btn-sm">Last 30d</button>
                <button onClick={() => handleQuickDatePreset('7d')} className="btn btn-sm">Last 7d</button>
                <button onClick={() => handleQuickDatePreset('all')} className="btn btn-sm">All</button>
              </div>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', marginTop: 'var(--spacing-xs)' }}>
                <input
                  type="datetime-local"
                  value={filters.from ? new Date(filters.from).toISOString().slice(0, 16) : ''}
                  onChange={(e) => handleFilterChange('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
                  style={{ fontSize: '0.875rem', padding: '4px 8px' }}
                />
                <span>to</span>
                <input
                  type="datetime-local"
                  value={filters.to ? new Date(filters.to).toISOString().slice(0, 16) : ''}
                  onChange={(e) => handleFilterChange('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
                  style={{ fontSize: '0.875rem', padding: '4px 8px' }}
                />
              </div>
            </div>

            <div className="filter-group">
              <label>Event Type</label>
              <select
                value={filters.eventType}
                onChange={(e) => handleFilterChange('eventType', e.target.value)}
                style={{ fontSize: '0.875rem', padding: '4px 8px' }}
              >
                <option value="all">All</option>
                <option value="call">Calls</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Baseline Ratio</label>
              <select
                value={filters.baselineRatio}
                onChange={(e) => handleFilterChange('baselineRatio', parseFloat(e.target.value))}
                style={{ fontSize: '0.875rem', padding: '4px 8px' }}
              >
                <option value="0.6">60/40</option>
                <option value="0.7">70/30</option>
                <option value="0.8">80/20</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Phone (optional)</label>
              <input
                type="text"
                value={filters.phone}
                onChange={(e) => handleFilterChange('phone', e.target.value)}
                placeholder="Search specific phone"
                style={{ fontSize: '0.875rem', padding: '4px 8px', width: '150px' }}
              />
            </div>

            <button onClick={handleResetFilters} className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>
              Reset Filters
            </button>
          </div>
        </div>

        {/* Summary */}
        {alertsData && alertsData.summary && (
          <div style={{
            display: 'flex',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-lg)',
            flexWrap: 'wrap'
          }}>
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: 'white',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              fontSize: '0.875rem'
            }}>
              <strong>Total:</strong> {alertsData.summary.totalAlerts}
            </div>
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: '#fee2e2',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #ef4444',
              fontSize: '0.875rem',
              color: '#991b1b'
            }}>
              <strong>High:</strong> {alertsData.summary.high}
            </div>
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: '#fef3c7',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #f59e0b',
              fontSize: '0.875rem',
              color: '#92400e'
            }}>
              <strong>Medium:</strong> {alertsData.summary.medium}
            </div>
            <div style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: '#dbeafe',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #3b82f6',
              fontSize: '0.875rem',
              color: '#1e40af'
            }}>
              <strong>Low:</strong> {alertsData.summary.low}
            </div>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="loading" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
            <div className="spinner"></div>
            <p>Loading anomalies...</p>
          </div>
        ) : error ? (
          <div className="error-state" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
            <p>Error: {error}</p>
            <button onClick={fetchAlerts} className="btn btn-primary" style={{ marginTop: 'var(--spacing-sm)' }}>
              Retry
            </button>
          </div>
        ) : !alertsData || alertsData.alerts.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
            <p>No anomalies found for this dataset/filters.</p>
            <p style={{ fontSize: '0.875rem', marginTop: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
              Try adjusting filters, lowering thresholds, or widening the date range.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
            {/* Alert List */}
            <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
              <div style={{
                background: 'white',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                maxHeight: '600px',
                overflowY: 'auto'
              }}>
                {alertsData.alerts.map(alert => (
                  <div
                    key={alert.id}
                    onClick={() => setSelectedAlert(alert)}
                    style={{
                      padding: 'var(--spacing-md)',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: selectedAlert?.id === alert.id ? 'var(--bg-secondary)' : 'white',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)' }}>
                      <div style={{
                        width: '4px',
                        height: '100%',
                        background: getSeverityColor(alert.severity),
                        borderRadius: '2px',
                        flexShrink: 0
                      }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: getSeverityBg(alert.severity),
                            color: getSeverityColor(alert.severity)
                          }}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)'
                          }}>
                            {getTypeLabel(alert.type)}
                          </span>
                          {alert.confidence === 'low' && (
                            <span style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              fontStyle: 'italic'
                            }}>
                              (low confidence)
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>
                          {alert.phone}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                          {alert.explanation}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Details Panel */}
            {selectedAlert && (
              <AlertDetails
                alert={selectedAlert}
                alertsData={alertsData}
                onViewNetwork={() => handleViewInNetwork(selectedAlert)}
                onViewEvents={() => handleViewEvents(selectedAlert)}
                onViewTimeline={() => handleViewTimeline(selectedAlert)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Alert Details Component
function AlertDetails({ alert, alertsData, onViewNetwork, onViewEvents, onViewTimeline }) {
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'VOLUME_SPIKE': return 'Volume Spike';
      case 'NEW_CONTACT_EMERGENCE': return 'New Contact Emergence';
      case 'NIGHT_ACTIVITY_SHIFT': return 'Night Activity Shift';
      case 'BURST_PATTERN_CHANGE': return 'Burst Pattern Change';
      default: return type;
    }
  };

  // Get comparison values for visualization
  const getComparisonValues = () => {
    if (alert.type === 'VOLUME_SPIKE') {
      return {
        baseline: parseFloat(alert.metrics.baselineAvgDaily),
        recent: parseFloat(alert.metrics.recentAvgDaily),
        label: 'Avg Daily Events'
      };
    } else if (alert.type === 'NIGHT_ACTIVITY_SHIFT') {
      return {
        baseline: parseFloat(alert.metrics.baselineNightPct),
        recent: parseFloat(alert.metrics.recentNightPct),
        label: 'Night Activity %'
      };
    } else if (alert.type === 'BURST_PATTERN_CHANGE') {
      return {
        baseline: parseFloat(alert.metrics.baselineAvgBurstSize),
        recent: parseFloat(alert.metrics.recentAvgBurstSize),
        label: 'Avg Burst Size'
      };
    }
    return null;
  };

  const comparison = getComparisonValues();

  return (
    <div style={{
      flex: '1 1 400px',
      minWidth: '300px',
      background: 'white',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)',
      padding: 'var(--spacing-lg)',
      maxHeight: '600px',
      overflowY: 'auto'
    }}>
      <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{getTypeLabel(alert.type)}</h3>

      {/* Why Flagged */}
      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
          Why Flagged
        </h4>
        <p style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
          {alert.explanation}
        </p>
      </div>

      {/* Metrics Table */}
      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
          Baseline vs Recent
        </h4>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: 'var(--spacing-xs)' }}>Metric</th>
              <th style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>Baseline</th>
              <th style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>Recent</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(alert.window.baseline).map(([key, value]) => (
              <tr key={key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 'var(--spacing-xs)', textTransform: 'capitalize' }}>{key}</td>
                <td style={{ padding: 'var(--spacing-xs)', textAlign: 'right', fontFamily: 'monospace' }}>{value}</td>
                <td style={{ padding: 'var(--spacing-xs)', textAlign: 'right', fontFamily: 'monospace' }}>{alert.window.recent[key] || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparison Visualization */}
      {comparison && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
            {comparison.label}
          </h4>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xs)' }}>
                Baseline
              </div>
              <div
                style={{
                  height: `${Math.max(
                    20,
                    Math.min(
                      120,
                      (comparison.baseline / Math.max(comparison.baseline, comparison.recent)) * 120
                    )
                  )}px`,
                  background: '#3b82f6',
                  borderRadius: '4px 4px 0 0',
                  minHeight: '20px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: '4px',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {comparison.baseline.toFixed(1)}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xs)' }}>
                Recent
              </div>
              <div 
              style={{
                height: `${Math.max(
                    20,
                    Math.min(
                      120,
                      (comparison.recent / Math.max(comparison.baseline, comparison.recent)) * 120
                    )
                  )}px`,
                background: '#ef4444',
                borderRadius: '4px 4px 0 0',
                minHeight: '20px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: '4px',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 600
              }}>
                {comparison.recent.toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
        <button onClick={onViewNetwork} className="btn btn-primary" style={{ width: '100%' }}>
          View in Network
        </button>
        <button onClick={onViewEvents} className="btn btn-secondary" style={{ width: '100%' }}>
          View Events
        </button>
        <button onClick={onViewTimeline} className="btn btn-secondary" style={{ width: '100%' }}>
          View Timeline
        </button>
      </div>
    </div>
  );
}

export default Alerts;
