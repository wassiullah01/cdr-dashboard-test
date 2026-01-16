import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiUrl } from '../utils/api';
import '../styles/dashboard.css';

function TopContactsChart({ filters, uploadId, viewMode }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (filters.number) {
      fetchTopContacts();
    } else {
      setData([]);
      setLoading(false);
    }
  }, [filters, uploadId, viewMode]);

  const fetchTopContacts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('number', filters.number);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent
      
      params.append('limit', '10');

      const response = await fetch(apiUrl(`/api/analytics/top-contacts?${params}`));
      const result = await response.json();
      setData(result.topContacts || []);
    } catch (error) {
      console.error('Failed to fetch top contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        Top Contacts {filters.number ? `for ${filters.number}` : '(Enter a number to view)'}
      </h3>
      {loading ? (
        <div className="loading">Loading chart...</div>
      ) : !filters.number ? (
        <div className="empty-state">
          <div className="empty-state-icon">📞</div>
          <p>Enter a phone number in the filters to see top contacts</p>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state">No contacts found</div>
      ) : (
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
            />
            <Legend />
            <Bar dataKey="count" fill="#2563eb" name="Total Interactions" />
            <Bar dataKey="calls" fill="#10b981" name="Calls" />
            <Bar dataKey="sms" fill="#8b5cf6" name="SMS" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default TopContactsChart;
