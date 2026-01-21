import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiUrl } from '../utils/api';
import '../styles/dashboard.css';

function TopContactsChart({ filters, uploadId, viewMode, overview }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    if (filters.number) {
      fetchTopContacts();
    } else {
      setData([]);
      setLoading(false);
    }
  }, [filters, uploadId, viewMode]);

  const fetchTopContacts = async () => {
    if (!uploadId && viewMode === 'current') {
      setLoading(false);
      setData([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('number', filters.number);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.eventType) params.append('eventType', filters.eventType);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent
      
      params.append('limit', '10');

      const response = await fetch(apiUrl(`/api/analytics/top-contacts?${params}`));
      if (!response.ok) {
        throw new Error(`Failed to fetch top contacts: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      setData(result.topContacts || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch top contacts:', err);
      setError(err.message || 'Failed to load top contacts data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Check if contacts are "new" (introduced in recent window)
  const isNewContact = (contactNumber) => {
    // Use overview data to check if contact was introduced in recent window
    if (!overview?.behavioral?.recentContactsCount) return false;
    
    // If we have firstSeen, check if it's in the recent window
    // This is a heuristic - ideally backend would flag this
    // For now, we'll mark contacts that appear in the data as potentially new
    // if the overview indicates recent contacts exist
    return false; // Placeholder - would need backend to explicitly flag recent contacts
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        Top Contacts {filters.number ? `for ${filters.number}` : '(Enter a number to view)'}
      </h3>
      {loading ? (
        <div className="loading" style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
          Loading chart...
        </div>
      ) : error ? (
        <div className="error-state" style={{ 
          padding: 'var(--spacing-lg)', 
          textAlign: 'center',
          color: 'var(--error-color)'
        }}>
          <p>Error: {error}</p>
          <button onClick={fetchTopContacts} className="btn btn-primary" style={{ marginTop: 'var(--spacing-sm)' }}>
            Retry
          </button>
        </div>
      ) : !filters.number ? (
        <div className="empty-state" style={{ 
          padding: 'var(--spacing-lg)', 
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--spacing-sm)' }}>📞</div>
          <p>Enter a phone number in the filters to see top contacts</p>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state" style={{ 
          padding: 'var(--spacing-lg)', 
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <p>No contacts found for {filters.number}</p>
          <p style={{ fontSize: '0.875rem', marginTop: 'var(--spacing-xs)' }}>
            Try adjusting your filters or checking the number format.
          </p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="number" 
                stroke="#64748b"
                style={{ fontSize: '0.75rem' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#64748b"
                style={{ fontSize: '0.75rem' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem'
                }}
                formatter={(value, name) => {
                  if (name === 'totalDurationHours') {
                    return `${parseFloat(value).toFixed(2)} hours`;
                  }
                  return value;
                }}
              />
              <Legend />
              <Bar 
                dataKey="count" 
                fill="#2563eb" 
                name="Total Interactions"
                onClick={(data) => setSelectedContact(data)}
                style={{ cursor: 'pointer' }}
              />
              <Bar dataKey="calls" fill="#10b981" name="Calls" />
              <Bar dataKey="sms" fill="#8b5cf6" name="SMS" />
            </BarChart>
          </ResponsiveContainer>
          
          {/* Contact Details Table */}
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-sm)', color: 'var(--text-secondary)' }}>
              Contact Details
            </h4>
            <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)'
            }}>
              <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Contact</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Events</th>
                    <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>Duration</th>
                    <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>First/Last</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((contact, idx) => (
                    <tr 
                      key={idx}
                      onClick={() => setSelectedContact(contact)}
                      style={{ 
                        cursor: 'pointer',
                        background: selectedContact?.number === contact.number ? 'var(--bg-tertiary)' : 'transparent'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = selectedContact?.number === contact.number ? 'var(--bg-tertiary)' : 'transparent'}
                    >
                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                        {contact.number}
                        {isNewContact(contact.number) && (
                          <span style={{ 
                            marginLeft: '8px', 
                            fontSize: '0.75rem', 
                            color: '#10b981',
                            fontWeight: 600
                          }}>
                            NEW
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>
                        {contact.count}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--border-color)' }}>
                        {formatDuration(contact.totalDuration)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
                        {contact.firstSeen ? formatDate(contact.firstSeen) : 'N/A'} / {contact.lastSeen ? formatDate(contact.lastSeen) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TopContactsChart;
