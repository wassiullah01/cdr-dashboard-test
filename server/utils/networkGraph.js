/**
 * NETWORK GRAPH UTILITIES
 * Builds interaction graphs from canonical CDR events and computes community detection and centrality metrics.
*/

import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';   // graphology-communities-louvain exports a default function
export function buildGraph(edges, nodeStats) {
  const graph = new Graph({ type: 'undirected', multi: false });
  const warnings = [];
  let selfCallCount = 0;

  // Add nodes with attributes - validate node data
  nodeStats.forEach(node => {
    if (!node._id || node._id === null || node._id === '') {
      warnings.push('Skipped invalid node: missing or empty _id');
      return;
    }
    
    // Ensure node ID is a string
    const nodeId = String(node._id).trim();
    if (!nodeId) {
      warnings.push(`Skipped invalid node: empty _id after trim`);
      return;
    }
    
    graph.addNode(nodeId, {
      label: nodeId,
      degree: node.degree || 0,
      weightedDegree: node.weightedDegree || 0,
      totalEvents: node.totalEvents || 0,
      totalDuration: node.totalDuration || 0,
      firstSeen: node.firstSeen || null,
      lastSeen: node.lastSeen || null
    });
  });

  // Add edges with attributes - validate edge data
  edges.forEach(edge => {
    if (!edge._id || !edge._id.source || !edge._id.target) {
      warnings.push('Skipped edge: missing _id, source, or target');
      return;
    }

    const source = String(edge._id.source).trim();
    const target = String(edge._id.target).trim();

    // Validate source and target are not empty
    if (!source || !target) {
      warnings.push('Skipped edge: empty source or target after trim');
      return;
    }

    // Skip self-loops and count them separately
    if (source === target) {
      selfCallCount++;
      return;
    }
    
    // Check if nodes exist (they should, but be defensive)
    if (!graph.hasNode(source) || !graph.hasNode(target)) {
      warnings.push(`Skipped edge: node missing for edge ${source} -> ${target}`);
      return;
    }
    
    // Check if edge already exists (shouldn't happen with aggregation, but be safe)
    if (graph.hasEdge(source, target)) {
      // Update existing edge (shouldn't happen, but handle it)
      const existingWeight = graph.getEdgeAttribute(source, target, 'weight') || 0;
      graph.setEdgeAttribute(source, target, 'weight', existingWeight + (edge.weight || 0));
      warnings.push(`Edge ${source} -> ${target} already exists, merged weights`);
    } else {
      graph.addEdge(source, target, {
        weight: edge.weight || 0,
        totalDuration: edge.totalDuration || 0,
        eventCount: edge.eventCount || 0,
        firstSeen: edge.firstSeen || null,
        lastSeen: edge.lastSeen || null
      });
    }
  });

  // Log warnings if any
  if (warnings.length > 0) {
    console.warn('Network graph build warnings:', warnings.slice(0, 10));
  }
  if (selfCallCount > 0) {
    console.info(`Excluded ${selfCallCount} self-calls from graph edges`);
  }

  return { graph, warnings, selfCallCount };
}

export function detectCommunities(graph) {
  if (graph.order === 0) {
    return {
      assignments: {},
      communities: []
    };
  }

  // Ensure deterministic results by sorting nodes before community detection
  // Louvain algorithm is generally deterministic, but sorting ensures stability
  const sortedNodes = graph.nodes().sort();
  
  // Run Louvain algorithm
  const communities = louvain(graph, {
    resolution: 1.0, // Default resolution
    randomWalk: false // Disable random walk for determinism
  });

  // Build community summary
  const communityMap = new Map();
  
  sortedNodes.forEach(node => {
    const communityId = communities[node] || 'isolate';
    
    if (!communityMap.has(communityId)) {
      communityMap.set(communityId, {
        id: communityId,
        nodes: [],
        totalEdgeWeight: 0
      });
    }
    
    const comm = communityMap.get(communityId);
    comm.nodes.push({
      id: node,
      weightedDegree: graph.getNodeAttribute(node, 'weightedDegree') || 0,
      degree: graph.getNodeAttribute(node, 'degree') || 0
    });
  });

  // Calculate total edge weight per community
  graph.forEachEdge((edge, attr, source, target) => {
    const sourceComm = communities[source];
    const targetComm = communities[target];
    
    if (sourceComm === targetComm && sourceComm) {
      const comm = communityMap.get(sourceComm);
      if (comm) {
        comm.totalEdgeWeight += attr.weight || 0;
      }
    }
  });

  // Convert to array and sort by size
  const communitiesArray = Array.from(communityMap.values())
    .map(comm => ({
      id: comm.id,
      size: comm.nodes.length,
      topNodes: comm.nodes
        .sort((a, b) => b.weightedDegree - a.weightedDegree)
        .slice(0, 10),
      totalEdgeWeight: comm.totalEdgeWeight
    }))
    .sort((a, b) => b.size - a.size);

  return {
    assignments: communities,
    communities: communitiesArray
  };
}

/**
 * Compute graph statistics
 * @param {Graph} graph - Graphology graph
 * @returns {Object} Graph statistics
 */
export function computeGraphStats(graph) {
  if (graph.order === 0) {
    return {
      nodeCount: 0,
      edgeCount: 0,
      components: 0,
      isolates: 0,
      density: 0,
      maxDegree: 0,
      avgDegree: 0,
      maxWeightedDegree: 0,
      avgWeightedDegree: 0
    };
  }

  const nodeCount = graph.order;
  const edgeCount = graph.size;
  
  // Compute connected components (using BFS)
  const visited = new Set();
  let components = 0;
  let isolates = 0;
  
  graph.forEachNode(node => {
    if (visited.has(node)) return;
    
    components++;
    const component = new Set();
    const queue = [node];
    
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      
      visited.add(current);
      component.add(current);
      
      graph.forEachNeighbor(current, neighbor => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }
    
    if (component.size === 1) {
      isolates++;
    }
  });

  // Density: actual edges / possible edges (for undirected graph)
  const possibleEdges = (nodeCount * (nodeCount - 1)) / 2;
  const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

  // Degree statistics
  let maxDegree = 0;
  let totalDegree = 0;
  let maxWeightedDegree = 0;
  let totalWeightedDegree = 0;

  graph.forEachNode(node => {
    const degree = graph.degree(node);
    const weightedDegree = graph.getNodeAttribute(node, 'weightedDegree') || 0;
    
    maxDegree = Math.max(maxDegree, degree);
    totalDegree += degree;
    maxWeightedDegree = Math.max(maxWeightedDegree, weightedDegree);
    totalWeightedDegree += weightedDegree;
  });

  const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;
  const avgWeightedDegree = nodeCount > 0 ? totalWeightedDegree / nodeCount : 0;

  return {
    nodeCount,
    edgeCount,
    components,
    isolates,
    density: parseFloat(density.toFixed(4)),
    maxDegree,
    avgDegree: parseFloat(avgDegree.toFixed(2)),
    maxWeightedDegree,
    avgWeightedDegree: parseFloat(avgWeightedDegree.toFixed(2))
  };
}

/**
 * Trim graph to top N nodes by weighted degree
 * Deterministic: sorted by weightedDegree (desc), then by node ID (asc) for ties
 * @param {Graph} graph - Graphology graph
 * @param {number} limitNodes - Maximum number of nodes to keep
 * @returns {Graph} Trimmed graph
 */
export function trimGraph(graph, limitNodes) {
  if (graph.order <= limitNodes) {
  // Return graph with metadata for validation
  return {
    graph,
    warnings,
    selfCallCount
  };
}

  // Get all nodes sorted by weighted degree (deterministic)
  const nodesWithDegree = graph.nodes().map(node => ({
    id: node,
    weightedDegree: graph.getNodeAttribute(node, 'weightedDegree') || 0
  }));

  // Sort deterministically: by weightedDegree (desc), then by node ID (asc) for ties
  nodesWithDegree.sort((a, b) => {
    if (b.weightedDegree !== a.weightedDegree) {
      return b.weightedDegree - a.weightedDegree;
    }
    // Tie-breaker: sort by node ID (ascending) for determinism
    return a.id.localeCompare(b.id);
  });
  
  const topNodes = new Set(nodesWithDegree.slice(0, limitNodes).map(n => n.id));
  
  // Create new graph with only top nodes and edges between them
  const trimmed = new Graph({ type: 'undirected', multi: false });
  
  topNodes.forEach(nodeId => {
    const attrs = {};
    graph.forEachNodeAttribute((value, key, node) => {
      if (node === nodeId) {
        attrs[key] = value;
      }
    });
    trimmed.addNode(nodeId, attrs);
  });
  
  graph.forEachEdge((edge, attr, source, target) => {
    if (topNodes.has(source) && topNodes.has(target)) {
      trimmed.addEdge(source, target, attr);
    }
  });

  return trimmed;
}
