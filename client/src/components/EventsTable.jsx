import React, { useState, useEffect } from 'react';
import EventDetailsModal from './EventDetailsModal';
import '../styles/tables.css';

function EventsTable({ filters, uploadId, viewMode }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [sortBy, setSortBy] = useState('startTime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, [filters, pagination.page, sortBy, sortOrder, uploadId, viewMode]);

  const fetchEvents = async () => {
    setLoading(true);
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

      const response = await fetch(`/api/events?${params}`);
      const result = await response.json();
      setEvents(result.events || []);
      setPagination(result.pagination || pagination);
    } catch (error) {
      console.error('Failed to fetch events:', error);
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
      ) : events.length === 0 ? (
        <div className="empty-state">No events found</div>
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
                    Start Time
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
                  <th>A Party</th>
                  <th>B Party</th>
                  <th>Duration</th>
                  <th>Provider</th>
                  <th>Site</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={index}>
                    <td>{formatDate(event.startTime)}</td>
                    <td>
                      <span className={`badge badge-${event.eventType.toLowerCase()}`}>
                        {event.eventType}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${event.direction.toLowerCase()}`}>
                        {event.direction}
                      </span>
                    </td>
                    <td>{event.aParty ? String(event.aParty) : '-'}</td>
                    <td>{event.bParty ? String(event.bParty) : '-'}</td>
                    <td>
                      {event.durationSec > 0 
                        ? `${Math.floor(event.durationSec / 60)}:${String(event.durationSec % 60).padStart(2, '0')}`
                        : '-'}
                    </td>
                    <td>{event.provider || '-'}</td>
                    <td>{event.siteName || event.site || '-'}</td>
                    <td>
                      <button
                        className="view-details-btn"
                        onClick={() => setSelectedEvent(event)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
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
