/**
 * ANALYTICS READINESS ASSESSMENT
 * 
 * Analyzes the normalized dataset and determines what advanced analytics
 * can be safely built and what is blocked by data limitations.
 */

import EventCanonical from '../models/EventCanonical.js';

/**
 * Generate analytics readiness verdict
 */
export async function generateAnalyticsReadinessVerdict(uploadId) {
  const verdict = {
    uploadId: uploadId,
    generatedAt: new Date().toISOString(),
    safeToBuild: [],
    blockedByLimitations: [],
    dataLimitations: {},
    recommendations: []
  };
  
  // Get sample of records for analysis
  const sampleSize = 1000;
  const records = await EventCanonical.find({ uploadId })
    .limit(sampleSize)
    .lean();
  
  if (records.length === 0) {
    verdict.blockedByLimitations.push('No records available for analysis');
    return verdict;
  }
  
  // Analyze location data
  const hasLatLng = records.filter(r => r.latitude && r.longitude).length;
  const hasCellId = records.filter(r => r.cell_id).length;
  const locationCoverage = {
    hasLatLng: hasLatLng > 0,
    hasCellIdOnly: hasCellId > 0 && hasLatLng === 0,
    latLngPercentage: ((hasLatLng / records.length) * 100).toFixed(2),
    cellIdPercentage: ((hasCellId / records.length) * 100).toFixed(2)
  };
  
  verdict.dataLimitations.location = locationCoverage;
  
  // Analyze communication graph
  const uniqueNodes = new Set();
  const uniqueEdges = new Set();
  const nodeDegrees = new Map();
  
  records.forEach(record => {
    if (record.caller_number) {
      uniqueNodes.add(record.caller_number);
      const degree = nodeDegrees.get(record.caller_number) || 0;
      nodeDegrees.set(record.caller_number, degree + 1);
    }
    if (record.receiver_number) {
      uniqueNodes.add(record.receiver_number);
      const degree = nodeDegrees.get(record.receiver_number) || 0;
      nodeDegrees.set(record.receiver_number, degree + 1);
    }
    if (record.contact_pair_key) {
      uniqueEdges.add(record.contact_pair_key);
    }
  });
  
  const degrees = Array.from(nodeDegrees.values());
  const maxDegree = degrees.length > 0 ? Math.max(...degrees) : 0;
  const avgDegree = degrees.length > 0 
    ? (degrees.reduce((a, b) => a + b, 0) / degrees.length).toFixed(2)
    : 0;
  
  const isolatedNodes = Array.from(nodeDegrees.entries())
    .filter(([node, degree]) => degree === 1).length;
  
  const graphReadiness = {
    uniqueNodes: uniqueNodes.size,
    uniqueEdges: uniqueEdges.size,
    maxDegree: maxDegree,
    avgDegree: parseFloat(avgDegree),
    isolatedNodes: isolatedNodes
  };
  
  verdict.dataLimitations.communicationGraph = graphReadiness;
  
  // Analyze temporal coverage
  const timestamps = records
    .map(r => new Date(r.timestamp_utc))
    .filter(ts => !isNaN(ts.getTime()))
    .sort((a, b) => a - b);
  
  // Initialize gaps array outside the if block to avoid reference errors
  const gaps = [];
  
  if (timestamps.length > 0) {
    const dateRange = {
      start: timestamps[0].toISOString(),
      end: timestamps[timestamps.length - 1].toISOString(),
      days: Math.ceil((timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60 * 24))
    };
    
    // Check for gaps (simplified: check if days are consecutive)
    for (let i = 1; i < timestamps.length; i++) {
      const diff = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24);
      if (diff > 2) { // More than 2 days gap
        gaps.push({
          from: timestamps[i - 1].toISOString(),
          to: timestamps[i].toISOString(),
          days: diff.toFixed(2)
        });
      }
    }
    
    // Event density by hour
    const hourDistribution = new Array(24).fill(0);
    records.forEach(r => {
      if (r.hour !== null && r.hour !== undefined) {
        hourDistribution[r.hour]++;
      }
    });
    
    verdict.dataLimitations.temporalCoverage = {
      dateRange: dateRange,
      gaps: gaps,
      eventDensityByHour: hourDistribution,
      totalEvents: records.length
    };
  }
  
  // Determine what analytics are safe to build
  if (uniqueNodes.size > 10 && uniqueEdges.size > 5) {
    verdict.safeToBuild.push('Network Analysis - Sufficient nodes and edges');
  } else {
    verdict.blockedByLimitations.push('Network Analysis - Insufficient graph data');
  }
  
  if (locationCoverage.hasLatLng && parseFloat(locationCoverage.latLngPercentage) > 50) {
    verdict.safeToBuild.push('Geographic Analysis - GPS coordinates available');
  } else if (locationCoverage.hasCellIdOnly && parseFloat(locationCoverage.cellIdPercentage) > 50) {
    verdict.safeToBuild.push('Geographic Analysis - Cell ID data available (limited precision)');
  } else {
    verdict.blockedByLimitations.push('Geographic Analysis - Insufficient location data');
  }
  
  if (timestamps.length > 100) {
    verdict.safeToBuild.push('Temporal Pattern Analysis - Sufficient time series data');
  } else {
    verdict.blockedByLimitations.push('Temporal Pattern Analysis - Insufficient time series data');
  }
  
  if (graphReadiness.maxDegree > 5) {
    verdict.safeToBuild.push('Centrality Analysis - High-degree nodes detected');
  }
  
  if (records.filter(r => r.burst_session_id).length > 0) {
    verdict.safeToBuild.push('Burst Detection - Session grouping available');
  }
  
  if (records.filter(r => r.baseline_window_label).length > 0) {
    verdict.safeToBuild.push('Anomaly Detection - Baseline vs recent comparison available');
  }
  
  // Generate recommendations
  if (parseFloat(locationCoverage.latLngPercentage) < 50) {
    verdict.recommendations.push({
      priority: 'medium',
      issue: 'Low GPS coverage',
      suggestion: 'Consider cell tower location mapping for better geographic analysis'
    });
  }
  
  if (gaps.length > 0) {
    verdict.recommendations.push({
      priority: 'low',
      issue: 'Temporal gaps detected',
      suggestion: 'Be aware of data gaps when performing time series analysis'
    });
  }
  
  if (graphReadiness.isolatedNodes > graphReadiness.uniqueNodes * 0.5) {
    verdict.recommendations.push({
      priority: 'low',
      issue: 'Many isolated nodes',
      suggestion: 'Network may be sparse - consider focusing on connected components'
    });
  }
  
  return verdict;
}

/**
 * Generate final normalized column summary
 */
export async function generateColumnSummary(uploadId) {
  const records = await EventCanonical.find({ uploadId }).lean();
  
  if (records.length === 0) {
    return { error: 'No records found' };
  }
  
  const columns = [
    'record_id', 'source_file', 'event_type', 'timestamp_utc', 'timestamp_local',
    'date', 'hour', 'day_of_week', 'is_weekend', 'is_night',
    'caller_number', 'receiver_number', 'direction', 'call_duration_seconds',
    'contact_pair_key', 'cell_id', 'latitude', 'longitude', 'location_source',
    'imei', 'imsi', 'service_provider', 'contact_first_seen', 'contact_last_seen',
    'daily_event_count', 'rolling_7_day_avg', 'rolling_30_day_avg',
    'burst_session_id', 'baseline_window_label'
  ];
  
  const summary = columns.map(column => {
    const nonNull = records.filter(r => r[column] !== null && r[column] !== undefined).length;
    const percentage = ((nonNull / records.length) * 100).toFixed(2);
    
    // Determine data type
    const sample = records.find(r => r[column] !== null && r[column] !== undefined);
    let dataType = 'unknown';
    if (sample) {
      if (sample[column] instanceof Date) {
        dataType = 'Date';
      } else if (typeof sample[column] === 'number') {
        dataType = 'Number';
      } else if (typeof sample[column] === 'string') {
        dataType = 'String';
      } else if (typeof sample[column] === 'boolean') {
        dataType = 'Boolean';
      }
    }
    
    // Source confidence (simplified)
    let sourceConfidence = 'high';
    if (parseFloat(percentage) < 50) {
      sourceConfidence = 'low';
    } else if (parseFloat(percentage) < 80) {
      sourceConfidence = 'medium';
    }
    
    return {
      column: column,
      dataType: dataType,
      nullCount: records.length - nonNull,
      nonNullCount: nonNull,
      nullPercentage: (100 - parseFloat(percentage)).toFixed(2),
      sourceConfidence: sourceConfidence
    };
  });
  
  return {
    uploadId: uploadId,
    totalRecords: records.length,
    columns: summary
  };
}
