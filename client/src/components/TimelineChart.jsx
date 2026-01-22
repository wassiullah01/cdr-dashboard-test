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
  const [baselineRecentData, setBaselineRecentData] = useState(null);

  useEffect(() => {
    fetchTimeline();
  }, [filters, uploadId, viewMode, showBaselineRecent]);

  const fetchTimeline = async () => {
    if (!uploadId && viewMode === 'current') {
      setLoading(false);
      setData([]);
      setBaselineRecentData(null);
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
      
      // CRITICAL: Always send uploadId in current mode, includeAll in all mode
      if (viewMode === 'all') {
        params.append('includeAll', 'true');
      } else if (uploadId) {
        params.append('uploadId', uploadId);
      }
      // If no uploadId in current mode, backend will default to most recent
      
      params.append('groupBy', 'day');
      
      // Add mode parameter
      if (showBaselineRecent) {
        params.append('mode', 'baselineRecent');
      } else {
        params.append('mode', 'stacked');
      }

      const response = await fetch(apiUrl(`/api/analytics/timeline?${params}`));
      if (!response.ok) {
        throw new Error(`Failed to fetch timeline: ${response.status} ${response.statusText}`);
      }
      const result = await response.json();
      
      if (result.mode === 'baselineRecent') {
        if (result.error) {
          setError(result.error);
          setData([]);
          setBaselineRecentData(null);
        } else {
          setBaselineRecentData(result);
          // Merge baseline and recent for chart display
          const allDates = new Set([
            ...(result.baseline || []).map(d => d.date),
            ...(result.recent || []).map(d => d.date)
          ]);
          const merged = Array.from(allDates).sort().map(date => {
            const baseline = result.baseline.find(d => d.date === date) || { total: 0, calls: 0, sms: 0 };
            const recent = result.recent.find(d => d.date === date) || { total: 0, calls: 0, sms: 0 };
            return {
              date,
              baselineTotal: baseline.total,
              baselineCalls: baseline.calls,
              baselineSms: baseline.sms,
              recentTotal: recent.total,
              recentCalls: recent.calls,
              recentSms: recent.sms
            };
          });
          setData(merged);
        }
      } else {
        setData(result.timeline || []);
        setBaselineRecentData(null);
      }
      setError(null);
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
      setError(err.message || 'Failed to load timeline data');
      setData([]);
      setBaselineRecentData(null);
    } finally {
      setLoading(false);
    }
  };

  // Prepare data for chart rendering
  const chartData = data;

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
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setShowBaselineRecent(false);
              setChartType('stacked');
            }}
            className="btn btn-sm"
            disabled={loading}
            style={{ 
              fontSize: '0.75rem', 
              padding: '4px 12px',
              background: !showBaselineRecent ? 'var(--primary-color)' : 'var(--bg-secondary)',
              color: !showBaselineRecent ? 'white' : 'var(--text-primary)',
              opacity: loading ? 0.6 : 1,
              border: '1px solid var(--border-color)'
            }}
          >
            Stacked
          </button>
          <button
            onClick={() => setShowBaselineRecent(true)}
            className="btn btn-sm"
            disabled={loading}
            style={{ 
              fontSize: '0.75rem', 
              padding: '4px 12px',
              background: showBaselineRecent ? 'var(--primary-color)' : 'var(--bg-secondary)',
              color: showBaselineRecent ? 'white' : 'var(--text-primary)',
              opacity: loading ? 0.6 : 1,
              border: '1px solid var(--border-color)'
            }}
          >
            Baseline vs Recent
          </button>
        </div>
      </div>
      
      {/* Behavior Change Summary Chip */}
      {showBaselineRecent && baselineRecentData && baselineRecentData.deltas ? (
        <div style={{
          marginBottom: 'var(--spacing-md)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          fontSize: '0.875rem'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
            Behavior Change Summary
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
            <span>
              <strong>Recent vs Baseline:</strong>{' '}
              <span style={{ color: parseFloat(baselineRecentData.deltas.pctChangeTotal) >= 0 ? '#10b981' : '#ef4444' }}>
                {baselineRecentData.deltas.pctChangeTotal >= 0 ? '+' : ''}{baselineRecentData.deltas.pctChangeTotal}% total events
              </span>
              {', '}
              <span style={{ color: parseFloat(baselineRecentData.deltas.pctChangeCalls) >= 0 ? '#10b981' : '#ef4444' }}>
                {baselineRecentData.deltas.pctChangeCalls >= 0 ? '+' : ''}{baselineRecentData.deltas.pctChangeCalls}% calls
              </span>
              {', '}
              <span style={{ color: parseFloat(baselineRecentData.deltas.pctChangeSms) >= 0 ? '#10b981' : '#ef4444' }}>
                {baselineRecentData.deltas.pctChangeSms >= 0 ? '+' : ''}{baselineRecentData.deltas.pctChangeSms}% SMS
              </span>
            </span>
            <span>
              <strong>Night activity:</strong>{' '}
              baseline {baselineRecentData.deltas.nightActivityBaselinePct}% → recent {baselineRecentData.deltas.nightActivityRecentPct}%
            </span>
          </div>
          {baselineRecentData.cutoffUtc && (
            <div style={{ marginTop: 'var(--spacing-xs)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Cutoff: {new Date(baselineRecentData.cutoffUtc).toLocaleString()}
            </div>
          )}
        </div>
      ) : showBaselineRecent && baselineRecentData && baselineRecentData.error ? (
        <div style={{
          marginBottom: 'var(--spacing-md)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          background: '#fef3c7',
          borderRadius: 'var(--radius-md)',
          border: '1px solid #f59e0b',
          fontSize: '0.875rem',
          color: '#92400e'
        }}>
          {baselineRecentData.error}
        </div>
      ) : null}
      {loading ? (
        <div className="loading" style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
          {showBaselineRecent ? 'Loading comparison...' : 'Loading chart...'}
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
      ) : showBaselineRecent && baselineRecentData ? (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="date" 
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
                dataKey="baselineTotal" 
                stroke="#3b82f6" 
                strokeWidth={3}
                strokeDasharray="8 4"
                name="Baseline Total"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="recentTotal" 
                stroke="#ef4444" 
                strokeWidth={3}
                name="Recent Total"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          
          {/* Average Daily Comparison */}
          {baselineRecentData.deltas && (
            <div
              style={{
                marginTop: 'var(--spacing-md)',
                padding: 'var(--spacing-md)',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 'var(--spacing-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                }}
              >
                Average Daily Volume Comparison
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}
                  >
                    Baseline
                  </div>
                  <div
                    style={{
                      height: `${Math.max(
                        20,
                        Math.min(
                          120,
                          (parseFloat(baselineRecentData.deltas.avgDailyTotalBaseline) /
                            Math.max(
                              parseFloat(baselineRecentData.deltas.avgDailyTotalBaseline),
                              parseFloat(baselineRecentData.deltas.avgDailyTotalRecent)
                            )) *
                            120
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
                    {parseFloat(baselineRecentData.deltas.avgDailyTotalBaseline).toFixed(0)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}
                  >
                    Recent
                  </div>
                  <div
                    style={{
                      height: `${Math.max(
                        20,
                        Math.min(
                          120,
                          (parseFloat(baselineRecentData.deltas.avgDailyTotalRecent) /
                            Math.max(
                              parseFloat(baselineRecentData.deltas.avgDailyTotalBaseline),
                              parseFloat(baselineRecentData.deltas.avgDailyTotalRecent)
                            )) *
                            120
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
                      fontWeight: 600,
                    }}
                  >
                    {parseFloat(baselineRecentData.deltas.avgDailyTotalRecent).toFixed(0)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : chartType === 'stacked' ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorSms" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
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
                borderRadius: '0.5rem',
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
                borderRadius: '0.5rem',
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
