import React, { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiUrl } from '../utils/api';
import '../styles/dashboard.css';

function TimelineChart({ filters, uploadId, viewMode, overview }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('stacked'); // 'line' or 'stacked'
  const [showBaselineRecent, setShowBaselineRecent] = useState(false);

  useEffect(() => {
    fetchTimeline();
  }, [filters, uploadId, viewMode]);

  const fetchTimeline = async () => {
    if (!uploadId && viewMode === 'current') {
      setLoading(false);
      setData([]);
      return;
    }
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.number) params.append('number', filters.number);
      if (filters.eventType) params.append('eventType', filters.eventType);
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent
      
      params.append('groupBy', 'day');

      const response = await fetch(apiUrl(`/api/analytics/timeline?${params}`));
      if (!response.ok) {
        throw new Error(`Failed to fetch timeline: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      setData(result.timeline || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
      setError(err.message || 'Failed to load timeline data');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Prepare data with baseline/recent overlay if enabled
  const chartData = showBaselineRecent && overview?.temporal
    ? data.map(item => ({
        ...item,
        baselineCount: overview.temporal.baselineCount || 0,
        recentCount: overview.temporal.recentCount || 0
      }))
    : data;

  return (
    <div className="chart-container">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 'var(--spacing-md)',
        flexWrap: 'wrap',
        gap: 'var(--spacing-sm)'
      }}>
        <h3 className="chart-title" style={{ margin: 0 }}>Timeline - Events Over Time</h3>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <button
            onClick={() => setChartType(chartType === 'stacked' ? 'line' : 'stacked')}
            className="btn btn-sm"
            style={{ 
              fontSize: '0.75rem', 
              padding: '4px 8px',
              background: chartType === 'stacked' ? 'var(--primary-color)' : 'var(--bg-secondary)',
              color: chartType === 'stacked' ? 'white' : 'var(--text-primary)'
            }}
          >
            {chartType === 'stacked' ? 'Stacked' : 'Line'}
          </button>
          {overview?.temporal && (
            <button
              onClick={() => setShowBaselineRecent(!showBaselineRecent)}
              className="btn btn-sm"
              style={{ 
                fontSize: '0.75rem', 
                padding: '4px 8px',
                background: showBaselineRecent ? 'var(--primary-color)' : 'var(--bg-secondary)',
                color: showBaselineRecent ? 'white' : 'var(--text-primary)'
              }}
            >
              Baseline/Recent
            </button>
          )}
        </div>
      </div>
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
          <button onClick={fetchTimeline} className="btn btn-primary" style={{ marginTop: 'var(--spacing-sm)' }}>
            Retry
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state" style={{ 
          padding: 'var(--spacing-lg)', 
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <p>No timeline data available for the selected filters.</p>
          <p style={{ fontSize: '0.875rem', marginTop: 'var(--spacing-xs)' }}>
            Try adjusting your date range or clearing filters.
          </p>
        </div>
      ) : chartType === 'stacked' ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorSms" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
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
            <Area 
              type="monotone" 
              dataKey="calls" 
              stackId="1"
              stroke="#10b981" 
              fill="url(#colorCalls)"
              name="Calls"
            />
            <Area 
              type="monotone" 
              dataKey="sms" 
              stackId="1"
              stroke="#8b5cf6" 
              fill="url(#colorSms)"
              name="SMS"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
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
