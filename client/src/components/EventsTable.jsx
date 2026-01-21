import React, { useState, useEffect } from 'react';
import EventDetailsModal from './EventDetailsModal';
import { apiUrl } from '../utils/api';
import '../styles/tables.css';

function EventsTable({ filters, uploadId, viewMode }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [sortBy, setSortBy] = useState('startTime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, [filters, pagination.page, sortBy, sortOrder, uploadId, viewMode]);

  const fetchEvents = async () => {
    if (!uploadId && viewMode === 'current') {
      setLoading(false);
      setEvents([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.number) params.append('number', filters.number);
      if (filters.eventType) params.append('eventType', filters.eventType);
      if (filters.direction) params.append('direction', filters.direction);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent

      const response = await fetch(apiUrl(`/api/events?${params}`));
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      setEvents(result.events || []);
      setPagination(result.pagination || pagination);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError(err.message || 'Failed to load events data');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handlePageChange = (newPage) => {
    setPagination({ ...pagination, page: newPage });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getSortClass = (field) => {
    if (sortBy !== field) return 'sortable';
    return sortOrder === 'asc' ? 'sort-asc' : 'sort-desc';
  };

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">Events</h3>
      </div>

      {loading ? (
        <div className="loading">Loading events...</div>
      ) : error ? (
        <div className="error-state" style={{ 
          padding: 'var(--spacing-lg)', 
          textAlign: 'center',
          color: 'var(--error-color)'
        }}>
          <p>Error: {error}</p>
          <button onClick={fetchEvents} className="btn btn-primary" style={{ marginTop: 'var(--spacing-sm)' }}>
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <p>No events found for the selected filters.</p>
          <p className="hint" style={{ fontSize: '0.875rem', marginTop: 'var(--spacing-xs)', color: 'var(--text-secondary)' }}>
            Try adjusting your filters or ensure data exists for this upload.
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th 
                    className={`sortable ${getSortClass('startTime')}`}
                    onClick={() => handleSort('startTime')}
                  >
                    Timestamp (Local)
                  </th>
                  <th 
                    className={`sortable ${getSortClass('eventType')}`}
                    onClick={() => handleSort('eventType')}
                  >
                    Type
                  </th>
                  <th 
                    className={`sortable ${getSortClass('direction')}`}
                    onClick={() => handleSort('direction')}
                  >
                    Direction
                  </th>
                  <th>Caller</th>
                  <th>Receiver</th>
                  <th 
                    className={`sortable ${getSortClass('durationSec')}`}
                    onClick={() => handleSort('durationSec')}
                  >
                    Duration
                  </th>
                  <th>Site Name</th>
                  <th>Cell ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  // Use canonical fields if available, fallback to legacy
                  const timestamp = event._canonical?.timestamp_local || event.startTime;
                  
                  return (
                    <tr key={index}>
                      <td>{formatDate(timestamp)}</td>
                      <td>
                        <span className={`badge badge-${(event.eventType || '').toLowerCase()}`}>
                          {event.eventType || 'UNKNOWN'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${(event.direction || '').toLowerCase()}`}>
                          {event.direction || 'UNKNOWN'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {event.aParty || event._canonical?.caller_number || '-'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {event.bParty || event._canonical?.receiver_number || '-'}
                      </td>
                      <td style={{ fontFamily: 'monospace', textAlign: 'right' }}>
                        {(() => {
                          const duration = event.durationSec || event._canonical?.call_duration_seconds || 0;
                          if (duration <= 0) return '-';
                          const hours = Math.floor(duration / 3600);
                          const minutes = Math.floor((duration % 3600) / 60);
                          const seconds = Math.floor(duration % 60);
                          if (hours > 0) {
                            return `${hours}h ${minutes}m ${seconds}s`;
                          } else if (minutes > 0) {
                            return `${minutes}m ${seconds}s`;
                          } else {
                            return `${seconds}s`;
                          }
                        })()}
                      </td>
                      <td style={{ fontSize: '0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.siteName || event.site || '-'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {event._canonical?.cell_id || event.cellId || '-'}
                      </td>
                      <td>
                        <button
                          className="view-details-btn"
                          onClick={() => setSelectedEvent(event)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="pagination-info">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} events
            </div>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                const page = pagination.page <= 3 
                  ? i + 1 
                  : Math.max(1, pagination.page - 2 + i);
                if (page > pagination.pages) return null;
                return (
                  <button
                    key={page}
                    className={`pagination-btn ${page === pagination.page ? 'active' : ''}`}
                    onClick={() => handlePageChange(page)}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                className="pagination-btn"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

export default EventsTable;
