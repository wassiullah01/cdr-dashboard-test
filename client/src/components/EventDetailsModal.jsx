import React from 'react';
import '../styles/dashboard.css';

function EventDetailsModal({ event, onClose }) {
  if (!event) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div 
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-lg)',
          paddingBottom: 'var(--spacing-md)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>
            Event Details
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 'var(--spacing-xs)',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gap: 'var(--spacing-md)' }}>
          <div className="detail-row">
            <span className="detail-label">Event Type:</span>
            <span className={`badge badge-${event.eventType?.toLowerCase()}`}>
              {event.eventType || '-'}
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Direction:</span>
            <span className={`badge badge-${event.direction?.toLowerCase()}`}>
              {event.direction || '-'}
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">A Party:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event.aParty || '-')}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">B Party:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event.bParty || '-')}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Start Time:</span>
            <span>{formatDate(event.startTime)}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">End Time:</span>
            <span>{formatDate(event.endTime)}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Duration:</span>
            <span>{formatDuration(event.durationSec)}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Provider:</span>
            <span>{event.provider || '-'}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Site Name:</span>
            <span>{event.siteName || event.site || '-'}</span>
          </div>

          {event.site && event.site.includes('|') && (
            <div className="detail-row">
              <span className="detail-label">Full Site (Raw):</span>
              <span style={{ 
                fontSize: '0.875rem', 
                color: 'var(--text-secondary)',
                wordBreak: 'break-word'
              }}>
                {event.site}
              </span>
            </div>
          )}

          <div className="detail-row">
            <span className="detail-label">Latitude:</span>
            <span>{event._canonical?.latitude || event.lat ? (event._canonical?.latitude || event.lat).toFixed(6) : '-'}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Longitude:</span>
            <span>{event._canonical?.longitude || event.lng ? (event._canonical?.longitude || event.lng).toFixed(6) : '-'}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Cell ID:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event._canonical?.cell_id || event.cellId || '-')}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">LAC ID:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event.lacId || '-')}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">IMEI:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event._canonical?.imei || event.imei || '-')}</span>
          </div>

          <div className="detail-row">
            <span className="detail-label">IMSI:</span>
            <span style={{ fontFamily: 'monospace' }}>{String(event._canonical?.imsi || event.imsi || '-')}</span>
          </div>
          
          {event._canonical?.location_source && (
            <div className="detail-row">
              <span className="detail-label">Location Source:</span>
              <span style={{ 
                fontSize: '0.875rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: event._canonical.location_source === 'gps' ? '#10b98120' : 
                           event._canonical.location_source === 'cell_id' ? '#3b82f620' : 
                           '#64748b20',
                color: event._canonical.location_source === 'gps' ? '#10b981' : 
                      event._canonical.location_source === 'cell_id' ? '#3b82f6' : 
                      '#64748b'
              }}>
                {event._canonical.location_source.toUpperCase()}
              </span>
            </div>
          )}

          {/* Additional Canonical Fields */}
          {event._canonical && (
            <>
              <div style={{
                marginTop: 'var(--spacing-lg)',
                paddingTop: 'var(--spacing-md)',
                borderTop: '1px solid var(--border-color)'
              }}>
                <h3 style={{ 
                  fontSize: '1rem', 
                  fontWeight: 600,
                  marginBottom: 'var(--spacing-md)',
                  color: 'var(--text-secondary)'
                }}>
                  Temporal Information
                </h3>
                {event._canonical.day_of_week !== null && event._canonical.day_of_week !== undefined && (
                  <div className="detail-row">
                    <span className="detail-label">Day of Week:</span>
                    <span>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][event._canonical.day_of_week]}</span>
                  </div>
                )}
                {event._canonical.is_weekend !== null && event._canonical.is_weekend !== undefined && (
                  <div className="detail-row">
                    <span className="detail-label">Weekend:</span>
                    <span>{event._canonical.is_weekend ? 'Yes' : 'No'}</span>
                  </div>
                )}
                {event._canonical.is_night !== null && event._canonical.is_night !== undefined && (
                  <div className="detail-row">
                    <span className="detail-label">Night Activity:</span>
                    <span>{event._canonical.is_night ? 'Yes' : 'No'}</span>
                  </div>
                )}
                {event._canonical.timestamp_local && (
                  <div className="detail-row">
                    <span className="detail-label">Date & Time:</span>
                    <span>{formatDate(event._canonical.timestamp_local)}</span>
                  </div>
                )}
                {event._canonical.hour !== null && event._canonical.hour !== undefined && (
                  <div className="detail-row">
                    <span className="detail-label">Hour:</span>
                    <span>{event._canonical.hour}:00</span>
                  </div>
                )}
              </div>

              {event._canonical.contact_pair_key && (
                <div style={{
                  marginTop: 'var(--spacing-md)',
                  paddingTop: 'var(--spacing-md)',
                  borderTop: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ 
                    fontSize: '1rem', 
                    fontWeight: 600,
                    marginBottom: 'var(--spacing-md)',
                    color: 'var(--text-secondary)'
                  }}>
                    Network Information
                  </h3>
                  <div className="detail-row">
                    <span className="detail-label">Contact Pair Key:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{event._canonical.contact_pair_key}</span>
                  </div>
                </div>
              )}

              {event._canonical.service_provider && (
                <div style={{
                  marginTop: 'var(--spacing-md)',
                  paddingTop: 'var(--spacing-md)',
                  borderTop: '1px solid var(--border-color)'
                }}>
                  <h3 style={{ 
                    fontSize: '1rem', 
                    fontWeight: 600,
                    marginBottom: 'var(--spacing-md)',
                    color: 'var(--text-secondary)'
                  }}>
                    Service Provider
                  </h3>
                  <div className="detail-row">
                    <span className="detail-label">Provider:</span>
                    <span>{event._canonical.service_provider}</span>
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{
            marginTop: 'var(--spacing-lg)',
            paddingTop: 'var(--spacing-md)',
            borderTop: '1px solid var(--border-color)'
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              fontWeight: 600,
              marginBottom: 'var(--spacing-md)',
              color: 'var(--text-secondary)'
            }}>
              Source Information
            </h3>
            <div className="detail-row">
              <span className="detail-label">File:</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{event.source?.fileName || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Sheet:</span>
              <span style={{ fontSize: '0.875rem' }}>{event.source?.sheetName || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Row Number:</span>
              <span style={{ fontSize: '0.875rem' }}>{event.source?.rowNumber || '-'}</span>
            </div>
            {event._canonical?.record_id && (
              <div className="detail-row">
                <span className="detail-label">Record ID:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{event._canonical.record_id}</span>
              </div>
            )}
          </div>

          {event.normalizationWarnings && event.normalizationWarnings.length > 0 && (
            <div style={{
              marginTop: 'var(--spacing-md)',
              padding: 'var(--spacing-md)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)'
            }}>
              <span className="detail-label" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                Data Quality Warnings:
              </span>
              <ul style={{ 
                margin: 0, 
                paddingLeft: 'var(--spacing-lg)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)'
              }}>
                {event.normalizationWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{
          marginTop: 'var(--spacing-lg)',
          paddingTop: 'var(--spacing-md)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            className="btn btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventDetailsModal;
