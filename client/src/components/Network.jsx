import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getNetworkGraph } from '../utils/api';
import '../styles/network.css';

function Network({ currentUploadId, viewMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state || {};
  const appliedFocusRef = useRef(false);

  // Derive focusPhone from either focusPhone or filterPhone (backward compatible)
  const focusPhone = navState.focusPhone || navState.filterPhone || null;

  const defaultFilters = {
    from: navState.filterFrom || '',
    to: navState.filterTo || '',
    eventType: 'all',
    minEdgeWeight: 10,
    limitNodes: 500 
  };

  const [filters, setFilters] = useState(defaultFilters);
  const [isLayoutPaused, setIsLayoutPaused] = useState(false);
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [isStabilized, setIsStabilized] = useState(false);
  
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [highlightedCommunity, setHighlightedCommunity] = useState(null);
  
  const abortControllerRef = useRef(null);

  // Fetch network graph
  const fetchNetworkGraph = useCallback(async () => {
    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    
    try {
      const params = {
        uploadId: currentUploadId,
        ...filters
      };
      
      const data = await getNetworkGraph(params);
      setGraphData(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was aborted, ignore
      }
      console.error('Failed to fetch network graph:', err);
      setError(err.message || 'Failed to load network graph');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentUploadId, filters]);

  useEffect(() => {
    if (currentUploadId) {
      fetchNetworkGraph();
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [currentUploadId, fetchNetworkGraph]);

  // Handle navigation state: focus phone if provided (apply once and clear router state)
  useEffect(() => {
    if (!focusPhone) {
      appliedFocusRef.current = false; // Reset when no focus phone
      return;
    }
    if (!graphData?.nodes?.length) return;

    if (!appliedFocusRef.current) {
      const exists = graphData.nodes.some(n => n.id === focusPhone);
      if (exists) {
        setSelectedNode(focusPhone);
        setSelectedEdge(null);
        appliedFocusRef.current = true;
      }
    }

    // Clear router state after attempting
    navigate(location.pathname, { replace: true, state: null });
  }, [focusPhone, graphData, location.pathname, navigate]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setSelectedNode(null);
    setSelectedEdge(null);
    setHighlightedCommunity(null);
    setIsStabilized(false);
    setIsStabilizing(false);
    setIsLayoutPaused(false);
    // Graph will re-render with new filters, which will reset stabilization
  };

  const handleStabilize = () => {
    if (isStabilizing) return; // Already stabilizing
    
    setIsStabilizing(true);
    setIsStabilized(false);
    setIsLayoutPaused(false); // Resume if paused to allow stabilization
  };

  const handleResetLayout = () => {
    // Reset positions by triggering a re-render
    setIsStabilized(false);
    setIsStabilizing(false);
    setIsLayoutPaused(false);
    // Force graph to reinitialize positions
    if (graphData) {
      setGraphData({ ...graphData });
    }
  };

  const handleQuickDatePreset = (preset) => {
    const now = new Date();
    let from = '';
    let to = '';
    
    switch (preset) {
      case '24h':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        to = now.toISOString();
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        to = now.toISOString();
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
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

  const handleNodeClick = (nodeId) => {
    if (selectedNode === nodeId) {
      setSelectedNode(null);
      setSelectedEdge(null);
    } else {
      setSelectedNode(nodeId);
      setSelectedEdge(null);
    }
  };

  const handleEdgeClick = (edgeId) => {
    setSelectedEdge(edgeId);
    setSelectedNode(null);
  };

  const handleCommunityClick = (communityId) => {
    if (highlightedCommunity === communityId) {
      setHighlightedCommunity(null);
    } else {
      setHighlightedCommunity(communityId);
    }
  };

  // Get selected node details
  const selectedNodeData = graphData?.graph?.nodes?.find(n => n.id === selectedNode);
  
  // Get selected edge details
  const selectedEdgeData = graphData?.graph?.edges?.find(e => e.id === selectedEdge);
  
  // Get top contacts for selected node
  const topContacts = selectedNodeData
    ? graphData?.graph?.edges
        ?.filter(e => e.source === selectedNode || e.target === selectedNode)
        .map(e => ({
          number: e.source === selectedNode ? e.target : e.source,
          weight: e.weight,
          eventCount: e.eventCount,
          totalDuration: e.totalDuration
        }))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10)
    : [];

  return (
    <div className="network-page">
      <div className="container">
        <div className="network-header">
          <h1>Network Analysis</h1>
          <p className="subheader">
            {currentUploadId ? `Upload: ${currentUploadId.substring(0, 8)}...` : 'No upload selected'}
            {graphData?.truncated && (
              <span className="warning-badge">Graph truncated</span>
            )}
          </p>
        </div>

        {/* Filter Bar */}
        <div className="network-filters">
          <div className="filter-group">
            <label>Date Range</label>
            <div className="quick-presets">
              <button onClick={() => handleQuickDatePreset('24h')}>Last 24h</button>
              <button onClick={() => handleQuickDatePreset('7d')}>Last 7d</button>
              <button onClick={() => handleQuickDatePreset('30d')}>Last 30d</button>
              <button onClick={() => handleQuickDatePreset('all')}>All</button>
            </div>
            <div className="date-inputs">
              <input
                type="datetime-local"
                value={filters.from ? new Date(filters.from).toISOString().slice(0, 16) : ''}
                onChange={(e) => handleFilterChange('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
              />
              <span>to</span>
              <input
                type="datetime-local"
                value={filters.to ? new Date(filters.to).toISOString().slice(0, 16) : ''}
                onChange={(e) => handleFilterChange('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
              />
            </div>
          </div>

          <div className="filter-group">
            <label>Event Type</label>
            <select
              value={filters.eventType}
              onChange={(e) => handleFilterChange('eventType', e.target.value)}
            >
              <option value="all">All</option>
              <option value="call">Calls</option>
              <option value="sms">SMS</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Min Edge Weight</label>
            <input
              type="number"
              min="1"
              value={filters.minEdgeWeight}
              onChange={(e) => handleFilterChange('minEdgeWeight', parseInt(e.target.value) || 1)}
            />
          </div>

          <div className="filter-group">
            <label>Max Nodes</label>
            <select
              value={filters.limitNodes}
              onChange={(e) => handleFilterChange('limitNodes', parseInt(e.target.value))}
            >
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
            </select>
          </div>

          <button
            className="btn btn-secondary"
            onClick={handleResetFilters}
            disabled={loading}
          >
            Reset Filters
          </button>
          <button
            className="btn btn-primary"
            onClick={fetchNetworkGraph}
            disabled={loading || !currentUploadId}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Layout Controls */}
        {graphData && graphData.graph.nodes.length > 0 && (
          <div className="layout-controls" style={{
            padding: 'var(--spacing-sm) var(--spacing-md)',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            gap: 'var(--spacing-sm)',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              className="btn btn-sm"
              onClick={() => setIsLayoutPaused(!isLayoutPaused)}
              disabled={isStabilizing}
              style={{ fontSize: '0.875rem', opacity: isStabilizing ? 0.6 : 1 }}
              title={isStabilizing ? 'Cannot pause while stabilizing' : isLayoutPaused ? 'Resume physics simulation' : 'Pause physics simulation'}
            >
              {isLayoutPaused ? '▶ Resume Layout' : '⏸ Pause Layout'}
            </button>
            <button
              className="btn btn-sm"
              onClick={handleStabilize}
              disabled={isStabilizing || isStabilized}
              style={{ 
                fontSize: '0.875rem',
                opacity: (isStabilizing || isStabilized) ? 0.6 : 1
              }}
              title="Run physics simulation for controlled duration, then auto-pause"
            >
              {isStabilizing ? 'Stabilizing...' : isStabilized ? 'Stabilized' : 'Stabilize'}
            </button>
            <button
              className="btn btn-sm"
              onClick={handleResetLayout}
              style={{ fontSize: '0.875rem' }}
              title="Reset node positions and restart simulation"
            >
              Reset Layout
            </button>
            {isStabilized && !isStabilizing && (
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Layout stabilized - click Resume to continue simulation
              </span>
            )}
            {graphData.graph.nodes.length > 800 && (
              <span style={{ 
                fontSize: '0.75rem', 
                color: '#f59e0b',
                padding: '2px 8px',
                background: '#fef3c7',
                borderRadius: '4px'
              }}>
                Large network ({graphData.graph.nodes.length} nodes) - stabilization may be limited
              </span>
            )}
          </div>
        )}

        {/* Main Content */}
        <div className="network-content">
          {/* Graph Area */}
          <div className="network-graph-container">
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading network graph...</p>
              </div>
            ) : error ? (
              <div className="error-state">
                <p>Error: {error}</p>
                <button className="btn btn-primary" onClick={fetchNetworkGraph}>
                  Retry
                </button>
              </div>
            ) : !graphData || graphData.graph.nodes.length === 0 ? (
              <div className="empty-state">
                <p>No network data available for the selected filters.</p>
                <p className="hint">Try adjusting your filters or ensure data exists for this upload.</p>
              </div>
            ) : (
            <NetworkGraph
              graphData={graphData}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              highlightedCommunity={highlightedCommunity}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              isPaused={isLayoutPaused}
              isStabilizing={isStabilizing}
              onStabilizationComplete={() => {
                setIsStabilizing(false);
                setIsStabilized(true);
                setIsLayoutPaused(true);
              }}
            />
            )}
          </div>

          {/* Insights Sidebar */}
          <div className="network-sidebar">
            {graphData && (
              <>
                {/* Graph Summary */}
                <div className="sidebar-section">
                  <h3>Graph Summary</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Nodes</span>
                      <span className="stat-value">{graphData.stats.nodeCount}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Edges</span>
                      <span className="stat-value">{graphData.stats.edgeCount}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Density</span>
                      <span className="stat-value">{graphData.stats.density.toFixed(4)}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Components</span>
                      <span className="stat-value">{graphData.stats.components}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Isolates</span>
                      <span className="stat-value">{graphData.stats.isolates}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Avg Degree</span>
                      <span className="stat-value">{graphData.stats.avgDegree.toFixed(2)}</span>
                    </div>
                  </div>
                  {graphData.truncated && (
                    <div className="warning-box">
                      <strong>Graph Truncated</strong>
                      <p>{graphData.truncationReason}</p>
                    </div>
                  )}
                </div>

                {/* Top Nodes */}
                <div className="sidebar-section">
                  <h3>Top Nodes</h3>
                  <div className="top-nodes-list">
                    {graphData.graph.nodes
                      .sort((a, b) => b.weightedDegree - a.weightedDegree)
                      .slice(0, 10)
                      .map(node => (
                        <div
                          key={node.id}
                          className={`node-item ${selectedNode === node.id ? 'selected' : ''}`}
                          onClick={() => handleNodeClick(node.id)}
                        >
                          <div className="node-number">{node.id}</div>
                          <div className="node-stats">
                            <span>Degree: {node.degree}</span>
                            <span>Events: {node.totalEvents}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Communities */}
                <div className="sidebar-section">
                  <h3>
                    Communities ({graphData.communities.length})
                    <span 
                      style={{ 
                        marginLeft: 'var(--spacing-xs)',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        cursor: 'help'
                      }}
                      title="Communities are clusters of numbers that communicate more with each other than with the rest of the network."
                    >
                    </span>
                  </h3>
                  <div className="communities-list">
                    {graphData.communities.length === 1 ? (
                      <div
                        className={`community-item ${highlightedCommunity === graphData.communities[0].id ? 'highlighted' : ''}`}
                        onClick={() => handleCommunityClick(graphData.communities[0].id)}
                        title="Communities are clusters of numbers that communicate more with each other than with the rest of the network."
                      >
                        <div className="community-header">
                          <span className="community-id">Unified network (no distinct subgroups detected)</span>
                          <span className="community-size">{graphData.communities[0].size} nodes</span>
                        </div>
                        <div className="community-top-nodes">
                          {graphData.communities[0].topNodes.slice(0, 3).map(node => (
                            <span key={node.id} className="community-node">{node.id.substring(0, 8)}...</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      graphData.communities.map((comm, index) => {
                        // Only show "Isolated nodes" if all nodes in community have degree 0
                        const allIsolated = comm.topNodes.every(node => {
                          const nodeData = graphData.graph.nodes.find(n => n.id === node.id);
                          return nodeData && nodeData.degree === 0;
                        });
                        const displayLabel = allIsolated && comm.size > 0
                          ? `Isolated nodes (${comm.size} nodes, no connections)`
                          : `Community ${index + 1}`;
                        
                        return (
                          <div
                            key={comm.id}
                            className={`community-item ${highlightedCommunity === comm.id ? 'highlighted' : ''}`}
                            onClick={() => handleCommunityClick(comm.id)}
                            title="Communities are clusters of numbers that communicate more with each other than with the rest of the network."
                          >
                            <div className="community-header">
                              <span className="community-id">{displayLabel}</span>
                              <span className="community-size">{comm.size} nodes</span>
                            </div>
                            <div className="community-top-nodes">
                              {comm.topNodes.slice(0, 3).map(node => (
                                <span key={node.id} className="community-node">{node.id.substring(0, 8)}...</span>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Selection Details */}
                {selectedNodeData && (
                  <div className="sidebar-section">
                    <h3>Node Details</h3>
                    <div className="node-details">
                      <div className="detail-row">
                        <span className="detail-label">Number:</span>
                        <span className="detail-value">{selectedNodeData.id}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Community:</span>
                        <span className="detail-value">
                          {selectedNodeData.community === 'isolate' 
                            ? 'Isolated node' 
                            : graphData.communities.length === 1
                            ? 'Unified network'
                            : `Community ${graphData.communities.findIndex(c => c.id === selectedNodeData.community) + 1}`}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Degree:</span>
                        <span className="detail-value">{selectedNodeData.degree}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Weighted Degree:</span>
                        <span className="detail-value">{selectedNodeData.weightedDegree}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Events:</span>
                        <span className="detail-value">{selectedNodeData.totalEvents}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Duration:</span>
                        <span className="detail-value">{(selectedNodeData.totalDuration / 3600).toFixed(2)}h</span>
                      </div>
                      {selectedNodeData.firstSeen && (
                        <div className="detail-row">
                          <span className="detail-label">First Seen:</span>
                          <span className="detail-value">{new Date(selectedNodeData.firstSeen).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedNodeData.lastSeen && (
                        <div className="detail-row">
                          <span className="detail-label">Last Seen:</span>
                          <span className="detail-value">{new Date(selectedNodeData.lastSeen).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <h4>Top Contacts</h4>
                    <div className="contacts-list">
                      {topContacts.map((contact, idx) => (
                        <div key={idx} className="contact-item">
                          <span className="contact-number">{contact.number}</span>
                          <span className="contact-weight">{contact.weight} events</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEdgeData && (
                  <div className="sidebar-section">
                    <h3>Edge Details</h3>
                    <div className="edge-details">
                      <div className="detail-row">
                        <span className="detail-label">From:</span>
                        <span className="detail-value">{selectedEdgeData.source}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">To:</span>
                        <span className="detail-value">{selectedEdgeData.target}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Weight:</span>
                        <span className="detail-value">{selectedEdgeData.weight}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Event Count:</span>
                        <span className="detail-value">{selectedEdgeData.eventCount}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Total Duration:</span>
                        <span className="detail-value">{(selectedEdgeData.totalDuration / 3600).toFixed(2)}h</span>
                      </div>
                      {selectedEdgeData.firstSeen && (
                        <div className="detail-row">
                          <span className="detail-label">First Seen:</span>
                          <span className="detail-value">{new Date(selectedEdgeData.firstSeen).toLocaleString()}</span>
                        </div>
                      )}
                      {selectedEdgeData.lastSeen && (
                        <div className="detail-row">
                          <span className="detail-label">Last Seen:</span>
                          <span className="detail-value">{new Date(selectedEdgeData.lastSeen).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Network Graph Visualization Component (Canvas-based)
function NetworkGraph({ graphData, selectedNode, selectedEdge, highlightedCommunity, onNodeClick, onEdgeClick, isPaused = false, isStabilizing = false, onStabilizationComplete }) {
  const canvasRef = React.useRef(null);
  const animationFrameRef = React.useRef(null);
  const positionsRef = React.useRef({});
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragNode, setDragNode] = React.useState(null);
  const stabilizationTicksRef = React.useRef(0);
  const alphaRef = React.useRef(1.0); // Alpha for cooling down forces
  const nodeCount = graphData?.graph?.nodes?.length || 0;
  // Adjust tick count based on network size
  const maxStabilizationTicks = nodeCount > 800 ? 300 : nodeCount > 500 ? 400 : 500;

  // Initialize graph structure
  const nodes = React.useMemo(() => {
    if (!graphData?.graph?.nodes) return [];
    return graphData.graph.nodes.map(node => ({
      ...node,
      size: Math.max(8, Math.min(25, Math.sqrt(node.weightedDegree) * 2)),
      color: getCommunityColor(node.community, graphData.communities?.length || 0)
    }));
  }, [graphData]);

  const edges = React.useMemo(() => {
    if (!graphData?.graph?.edges) return [];
    return graphData.graph.edges.map(edge => ({
      ...edge,
      size: Math.max(1, Math.min(4, Math.sqrt(edge.weight)))
    }));
  }, [graphData]);

  // Initialize positions
  React.useEffect(() => {
    if (nodes.length === 0) return;

    const positions = {};
    nodes.forEach(node => {
      positions[node.id] = {
        x: Math.random() * 800 + 100,
        y: Math.random() * 500 + 100,
        vx: 0,
        vy: 0
      };
    });
    positionsRef.current = positions;
    stabilizationTicksRef.current = 0; // Reset stabilization counter when graph changes
    alphaRef.current = 1.0; // Reset alpha
  }, [nodes]);

  // Reset stabilization state when isStabilizing changes
  React.useEffect(() => {
    if (isStabilizing) {
      stabilizationTicksRef.current = 0;
      alphaRef.current = 1.0;
    }
  }, [isStabilizing]);

  // Force-directed layout and rendering
  React.useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const resizeCanvas = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Reset stabilization when graph data changes
    stabilizationTicksRef.current = 0;
    alphaRef.current = 1.0;

    let animationId = null;
    const animate = () => {
      // Check if paused (but allow stabilization to continue)
      if (isPaused && !isStabilizing) {
        // Render final frame and STOP animation loop
        renderFrame();
        return; // Do NOT schedule another RAF - truly stop
      }

      const positions = positionsRef.current;
      if (!positions || Object.keys(positions).length === 0) return;

      // Calculate alpha decay during stabilization (cooling down forces)
      if (isStabilizing) {
        stabilizationTicksRef.current++;
        // Alpha decays from 1.0 to 0.05 over the stabilization period
        const progress = stabilizationTicksRef.current / maxStabilizationTicks;
        alphaRef.current = Math.max(0.05, 1.0 - (progress * 0.95));
        
        // Check if stabilization is complete
        if (stabilizationTicksRef.current >= maxStabilizationTicks) {
          renderFrame(); // Final render
          if (onStabilizationComplete) {
            onStabilizationComplete();
          }
          return; // Stop animation - do NOT schedule RAF
        }
      } else {
        alphaRef.current = 1.0; // Full force when not stabilizing
      }

      // Force-directed algorithm with alpha cooling and force clamping
      const maxForce = 50; // Cap maximum force to prevent jitter
      const maxSpeed = 5; // Cap maximum velocity
      
      nodes.forEach(node => {
        if (isDragging && dragNode === node.id) return; // Skip dragged node
        
        const pos = positions[node.id];
        if (!pos) return;
        
        let fx = 0, fy = 0;

        // Repulsion from other nodes (scaled by alpha)
        nodes.forEach(other => {
          if (node.id === other.id) return;
          const otherPos = positions[other.id];
          if (!otherPos) return;
          
          const dx = pos.x - otherPos.x;
          const dy = pos.y - otherPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          let force = (8000 / (dist * dist)) * alphaRef.current;
          // Clamp force
          force = Math.min(maxForce, force);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });

        // Attraction along edges (scaled by alpha)
        edges.forEach(edge => {
          if (edge.source === node.id) {
            const targetPos = positions[edge.target];
            if (targetPos) {
              const dx = targetPos.x - pos.x;
              const dy = targetPos.y - pos.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              let force = (dist / 100) * alphaRef.current;
              // Clamp force
              force = Math.min(maxForce, force);
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          } else if (edge.target === node.id) {
            const sourcePos = positions[edge.source];
            if (sourcePos) {
              const dx = sourcePos.x - pos.x;
              const dy = sourcePos.y - pos.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              let force = (dist / 100) * alphaRef.current;
              // Clamp force
              force = Math.min(maxForce, force);
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          }
        });

        // Apply damping (increased during stabilization for faster convergence)
        const damping = isStabilizing ? Math.max(0.92, 0.85 + (0.1 * alphaRef.current)) : 0.85;
        pos.vx = (pos.vx + fx) * damping;
        pos.vy = (pos.vy + fy) * damping;
        
        // Clamp velocity
        const speed = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
        if (speed > maxSpeed) {
          pos.vx = (pos.vx / speed) * maxSpeed;
          pos.vy = (pos.vy / speed) * maxSpeed;
        }
        
        pos.x += pos.vx;
        pos.y += pos.vy;

        // Boundary constraints
        pos.x = Math.max(node.size, Math.min(canvas.width - node.size, pos.x));
        pos.y = Math.max(node.size, Math.min(canvas.height - node.size, pos.y));
      });

      renderFrame();
      
      // Continue animation only if not paused (or if stabilizing)
      if (!isPaused || isStabilizing) {
        animationId = requestAnimationFrame(animate);
      }
    };

    // Start animation loop
    animationId = requestAnimationFrame(animate);

    const renderFrame = () => {
      const positions = positionsRef.current;
      if (!positions || Object.keys(positions).length === 0) return;

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw edges
      edges.forEach(edge => {
        const sourcePos = positions[edge.source];
        const targetPos = positions[edge.target];
        if (!sourcePos || !targetPos) return;

        ctx.strokeStyle = selectedEdge === edge.id ? '#ff0000' : '#cccccc';
        ctx.lineWidth = edge.size || 1;
        ctx.beginPath();
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(node => {
        const pos = positions[node.id];
        if (!pos) return;

        const isSelected = selectedNode === node.id;
        const isHighlighted = highlightedCommunity && node.community === highlightedCommunity;

        // Node circle
        ctx.fillStyle = isSelected ? '#ff0000' : (isHighlighted ? '#00ff00' : node.color || '#666');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, node.size, 0, Math.PI * 2);
        ctx.fill();

        // Selection border
        if (isSelected) {
          ctx.strokeStyle = '#000';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Label for selected or important nodes
        if (isSelected || node.weightedDegree > 10) {
          ctx.fillStyle = '#000';
          ctx.font = '11px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(node.id.substring(0, 10), pos.x, pos.y - node.size - 5);
        }
      });
    };

    animate();

    // Mouse interaction
    const handleMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Find clicked node
      for (const node of nodes) {
        const pos = positionsRef.current[node.id];
        if (!pos) continue;
        
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < node.size + 5) {
          setIsDragging(true);
          setDragNode(node.id);
          onNodeClick(node.id);
          return;
        }
      }
    };

    const handleMouseMove = (e) => {
      if (!isDragging || !dragNode) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const pos = positionsRef.current[dragNode];
      if (pos) {
        pos.x = Math.max(nodes.find(n => n.id === dragNode)?.size || 10, 
                        Math.min(canvas.width - (nodes.find(n => n.id === dragNode)?.size || 10), x));
        pos.y = Math.max(nodes.find(n => n.id === dragNode)?.size || 10, 
                        Math.min(canvas.height - (nodes.find(n => n.id === dragNode)?.size || 10), y));
        pos.vx = 0;
        pos.vy = 0;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragNode(null);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [nodes, edges, selectedNode, selectedEdge, highlightedCommunity, isDragging, dragNode, isPaused, isStabilizing, onStabilizationComplete, onNodeClick]);

  return (
    <div className="network-graph">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: isDragging ? 'grabbing' : 'default' }}></canvas>
    </div>
  );
}

function getCommunityColor(communityId, totalCommunities) {
  // Generate deterministic colors for communities
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80'
  ];
  
  if (communityId === 'isolate') return '#CCCCCC';
  
  const index = parseInt(communityId) % colors.length;
  return colors[index] || '#666666';
}

export default Network;
