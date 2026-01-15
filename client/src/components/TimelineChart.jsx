import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import '../styles/dashboard.css';

function TimelineChart({ filters, uploadId, viewMode }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTimeline();
  }, [filters, uploadId, viewMode]);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.number) params.append('number', filters.number);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent
      
      params.append('groupBy', 'day');

      const response = await fetch(`/api/analytics/timeline?${params}`);
      const result = await response.json();
      setData(result.timeline || []);
    } catch (error) {
      console.error('Failed to fetch timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">Timeline - Events Over Time</h3>
      {loading ? (
        <div className="loading">Loading chart...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="timestamp" 
              stroke="#64748b"
              style={{ fontSize: '0.75rem' }}
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
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#2563eb" 
              strokeWidth={2}
              name="Total Events"
            />
            <Line 
              type="monotone" 
              dataKey="calls" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Calls"
            />
            <Line 
              type="monotone" 
              dataKey="sms" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              name="SMS"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default TimelineChart;
