import express from 'express';
// MIGRATION: EventCanonical is now the single source of truth
// Event import kept for reference only (legacy code paths disabled)
// import Event from '../models/Event.js'; // DISABLED - canonical migration complete
import EventCanonical from '../models/EventCanonical.js';
import { resolveUploadId } from '../utils/uploadSession.js';
import { buildGraph, detectCommunities, computeGraphStats, trimGraph } from '../utils/networkGraph.js';

const router = express.Router();

// GET /api/analytics/overview - Get overview statistics
// MIGRATED: Uses EventCanonical only (canonical collection is single source of truth)
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate, number } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // Build canonical filter
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST (most important)
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters (date, number, etc.) - using canonical field names
    if (startDate || endDate) {
      filter.timestamp_utc = {};
      if (startDate) filter.timestamp_utc.$gte = new Date(startDate);
      if (endDate) filter.timestamp_utc.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { caller_number: { $regex: number, $options: 'i' } },
        { receiver_number: { $regex: number, $options: 'i' } }
      ];
    }

    // STEP 3: Execute queries using EventCanonical schema
    const [
      totalEvents,
      totalCalls,
      totalSMS,
      totalDuration,
      uniqueContacts,
      incomingCount,
      outgoingCount,
      internalCount,
      // Data coverage & quality
      eventsWithGPS,
      eventsWithCellIdOnly,
      eventsWithNoLocation,
      duplicateCount,
      recordsWithWarnings,
      // Temporal intelligence
      dateRange,
      peakHour,
      peakDayOfWeek,
      nightActivityCount,
      baselineCount,
      recentCount,
      // Behavioral summary
      dailyStats,
      burstSessionStats,
      recentContacts
    ] = await Promise.all([
      EventCanonical.countDocuments(filter),
      EventCanonical.countDocuments({ ...filter, event_type: 'call' }),
      EventCanonical.countDocuments({ ...filter, event_type: 'sms' }),
      EventCanonical.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: '$call_duration_seconds' } } }
      ]),
      Promise.all([
        EventCanonical.distinct('caller_number', filter),
        EventCanonical.distinct('receiver_number', filter)
      ]).then(([callers, receivers]) => {
        const all = new Set([...callers, ...receivers].filter(p => p));
        return Array.from(all);
      }),
      EventCanonical.countDocuments({ ...filter, direction: 'incoming' }),
      EventCanonical.countDocuments({ ...filter, direction: 'outgoing' }),
      EventCanonical.countDocuments({ ...filter, direction: 'internal' }),
      // Data coverage & quality
      EventCanonical.countDocuments({ ...filter, latitude: { $exists: true, $ne: null }, longitude: { $exists: true, $ne: null } }),
      EventCanonical.countDocuments({ ...filter, cell_id: { $exists: true, $ne: null }, latitude: { $exists: false }, longitude: { $exists: false } }),
      EventCanonical.countDocuments({ ...filter, cell_id: { $exists: false }, latitude: { $exists: false } }),
      EventCanonical.countDocuments({ ...filter, is_duplicate: true }),
      EventCanonical.countDocuments({ ...filter, normalizationWarnings: { $exists: true, $ne: [] } }),
      // Temporal intelligence
      EventCanonical.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            firstEvent: { $min: '$timestamp_utc' },
            lastEvent: { $max: '$timestamp_utc' }
          }
        }
      ]),
      EventCanonical.aggregate([
        { $match: filter },
        { $group: { _id: '$hour', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]),
      EventCanonical.aggregate([
        { $match: filter },
        { $group: { _id: '$day_of_week', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]),
      EventCanonical.countDocuments({ ...filter, is_night: true }),
      EventCanonical.countDocuments({ ...filter, baseline_window_label: 'baseline' }),
      EventCanonical.countDocuments({ ...filter, baseline_window_label: 'recent' }),
      // Behavioral summary
      EventCanonical.aggregate([
        { $match: filter },
        { $group: { _id: '$date', count: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            avgDaily: { $avg: '$count' },
            maxDaily: { $max: '$count' }
          }
        }
      ]),
      EventCanonical.aggregate([
        { $match: { ...filter, burst_session_id: { $exists: true, $ne: null } } },
        { $group: { _id: '$burst_session_id', size: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            totalBurstSessions: { $sum: 1 },
            maxBurstSize: { $max: '$size' }
          }
        }
      ]),
      // Recent contacts (first seen in recent window)
      EventCanonical.distinct('contact_pair_key', { ...filter, baseline_window_label: 'recent' })
    ]);

    const durationHours = totalDuration[0]?.total ? (totalDuration[0].total / 3600).toFixed(2) : 0;
    
    // Calculate percentages
    const callPercentage = totalEvents > 0 ? ((totalCalls / totalEvents) * 100).toFixed(1) : 0;
    const smsPercentage = totalEvents > 0 ? ((totalSMS / totalEvents) * 100).toFixed(1) : 0;
    const gpsPercentage = totalEvents > 0 ? ((eventsWithGPS / totalEvents) * 100).toFixed(1) : 0;
    const cellIdOnlyPercentage = totalEvents > 0 ? ((eventsWithCellIdOnly / totalEvents) * 100).toFixed(1) : 0;
    const noLocationPercentage = totalEvents > 0 ? ((eventsWithNoLocation / totalEvents) * 100).toFixed(1) : 0;
    const duplicatePercentage = totalEvents > 0 ? ((duplicateCount / totalEvents) * 100).toFixed(1) : 0;
    const warningsPercentage = totalEvents > 0 ? ((recordsWithWarnings / totalEvents) * 100).toFixed(1) : 0;
    const nightActivityPercentage = totalEvents > 0 ? ((nightActivityCount / totalEvents) * 100).toFixed(1) : 0;
    
    // Temporal intelligence
    const dateRangeData = dateRange[0] || {};
    const peakHourData = peakHour[0] || {};
    const peakDayData = peakDayOfWeek[0] || {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Behavioral summary
    const dailyStatsData = dailyStats[0] || {};
    const burstStatsData = burstSessionStats[0] || {};

    res.json({
      // Basic stats (backward compatible)
      totalEvents,
      totalCalls,
      totalSMS,
      totalDurationHours: parseFloat(durationHours),
      uniqueContacts: uniqueContacts.length,
      incomingCount,
      outgoingCount,
      uploadId: uploadId || null,
      
      // Data Coverage & Quality Indicators
      dataCoverage: {
        callPercentage: parseFloat(callPercentage),
        smsPercentage: parseFloat(smsPercentage),
        gpsPercentage: parseFloat(gpsPercentage),
        cellIdOnlyPercentage: parseFloat(cellIdOnlyPercentage),
        noLocationPercentage: parseFloat(noLocationPercentage),
        duplicatePercentage: parseFloat(duplicatePercentage),
        warningsPercentage: parseFloat(warningsPercentage)
      },
      
      // Temporal Intelligence
      temporal: {
        dateRange: {
          firstEventDate: dateRangeData.firstEvent || null,
          lastEventDate: dateRangeData.lastEvent || null
        },
        peakHour: peakHourData._id !== undefined ? peakHourData._id : null,
        peakDayOfWeek: peakDayData._id !== undefined ? dayNames[peakDayData._id] : null,
        nightActivityPercentage: parseFloat(nightActivityPercentage),
        baselineCount,
        recentCount
      },
      
      // Behavioral Summary
      behavioral: {
        averageDailyEvents: dailyStatsData.avgDaily ? parseFloat(dailyStatsData.avgDaily.toFixed(1)) : 0,
        maxDailyEvents: dailyStatsData.maxDaily || 0,
        totalBurstSessions: burstStatsData.totalBurstSessions || 0,
        maxBurstSessionSize: burstStatsData.maxBurstSize || 0,
        recentContactsCount: recentContacts.length
      },
      
      // Directional Summary
      directional: {
        incomingCount,
        outgoingCount,
        internalCount,
        incomingOutgoingRatio: outgoingCount > 0 ? (incomingCount / outgoingCount).toFixed(2) : '0.00'
      }
    });

  } catch (error) {
    console.error('Analytics overview error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/timeline - Get timeline data (events per day/hour)
// MIGRATED: Uses EventCanonical only - uses canonical "date" field for day grouping
router.get('/timeline', async (req, res) => {
  try {
    const { startDate, endDate, number, eventType, groupBy = 'day' } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // Build canonical filter
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters - using canonical field names
    if (startDate || endDate) {
      filter.timestamp_utc = {};
      if (startDate) filter.timestamp_utc.$gte = new Date(startDate);
      if (endDate) filter.timestamp_utc.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { caller_number: { $regex: number, $options: 'i' } },
        { receiver_number: { $regex: number, $options: 'i' } }
      ];
    }
    
    // Event type filter
    if (eventType && eventType !== 'all') {
      if (eventType === 'call') {
        filter.event_type = 'call';
      } else if (eventType === 'sms') {
        filter.event_type = 'sms';
      }
    }

    // Use canonical "date" field (YYYY-MM-DD) for day grouping, timestamp_utc for hour grouping
    const groupFormat = groupBy === 'hour'
      ? { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp_utc' } }
      : '$date'; // Use pre-computed date field for efficiency

    // Aggregate using EventCanonical
    const timeline = await EventCanonical.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupFormat,
          count: { $sum: 1 },
          calls: { $sum: { $cond: [{ $eq: ['$event_type', 'call'] }, 1, 0] } },
          sms: { $sum: { $cond: [{ $eq: ['$event_type', 'sms'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          timestamp: '$_id',
          count: 1,
          calls: 1,
          sms: 1,
          _id: 0
        }
      }
    ]);

    res.json({ 
      timeline,
      uploadId: uploadId || null // Return resolved uploadId
    });

  } catch (error) {
    console.error('Analytics timeline error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/top-contacts - Get top contacts for a number
// MIGRATED: Uses EventCanonical only - uses caller_number/receiver_number fields
router.get('/top-contacts', async (req, res) => {
  try {
    const { number, startDate, endDate, eventType, limit = 10 } = req.query;

    if (!number) {
      return res.status(400).json({ error: 'Number parameter is required' });
    }

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // Build canonical filter
    const filter = {
      $or: [
        { caller_number: { $regex: number, $options: 'i' } },
        { receiver_number: { $regex: number, $options: 'i' } }
      ]
    };
    
    // STEP 1: Add uploadId filter (CRITICAL - must be included)
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add date filters - using canonical field names
    if (startDate || endDate) {
      filter.timestamp_utc = {};
      if (startDate) filter.timestamp_utc.$gte = new Date(startDate);
      if (endDate) filter.timestamp_utc.$lte = new Date(endDate);
    }
    
    // Event type filter
    if (eventType && eventType !== 'all') {
      if (eventType === 'call') {
        filter.event_type = 'call';
      } else if (eventType === 'sms') {
        filter.event_type = 'sms';
      }
    }

    // Query EventCanonical
    const events = await EventCanonical.find(filter)
      .select('caller_number receiver_number call_duration_seconds event_type direction timestamp_utc')
      .lean();

    // Group by counterparty (other party)
    const contactMap = new Map();
    
    // Normalize target number for exact matching
    const targetNumber = String(number).trim();

    events.forEach(event => {
      // Skip self-calls (caller === receiver)
      if (event.caller_number && event.receiver_number && 
          String(event.caller_number).trim() === String(event.receiver_number).trim()) {
        return; // Skip self-calls
      }
      
      // Determine if target is caller or receiver (exact match)
      const callerMatch = event.caller_number && String(event.caller_number).trim() === targetNumber;
      const receiverMatch = event.receiver_number && String(event.receiver_number).trim() === targetNumber;
      
      // Skip if target is not involved in this event
      if (!callerMatch && !receiverMatch) {
        return;
      }
      
      // Determine counterparty: the OTHER party (not the target)
      const counterparty = callerMatch ? event.receiver_number : event.caller_number;

      // Exclude if counterparty is missing, empty, or same as target
      if (!counterparty || String(counterparty).trim() === '' || String(counterparty).trim() === targetNumber) {
        return;
      }

      if (!contactMap.has(counterparty)) {
        contactMap.set(counterparty, {
          number: counterparty,
          count: 0,
          totalDuration: 0,
          calls: 0,
          sms: 0,
          incoming: 0,
          outgoing: 0,
          timestamps: [] // Store timestamps for first/last seen
        });
      }

      const contact = contactMap.get(counterparty);
      contact.count++;
      contact.totalDuration += event.call_duration_seconds || 0;
      if (event.event_type === 'call') contact.calls++;
      if (event.event_type === 'sms') contact.sms++;
      if (event.direction === 'incoming') contact.incoming++;
      if (event.direction === 'outgoing') contact.outgoing++;
      if (event.timestamp_utc) {
        contact.timestamps.push(new Date(event.timestamp_utc));
      }
    });

    // Calculate first/last seen and convert to final format
    const topContacts = Array.from(contactMap.values())
      .map(contact => {
        const sortedTimestamps = contact.timestamps.sort((a, b) => a - b);
        return {
          number: contact.number,
          count: contact.count,
          totalDuration: contact.totalDuration,
          totalDurationHours: (contact.totalDuration / 3600).toFixed(2),
          calls: contact.calls,
          sms: contact.sms,
          incoming: contact.incoming,
          outgoing: contact.outgoing,
          firstSeen: sortedTimestamps[0] || null,
          lastSeen: sortedTimestamps[sortedTimestamps.length - 1] || null
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json({ 
      topContacts,
      uploadId: uploadId || null // Return resolved uploadId
    });

  } catch (error) {
    console.error('Analytics top-contacts error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/geo - Get geographic data or top sites/cells
// MIGRATED: Uses EventCanonical only - uses latitude/longitude/cell_id fields
router.get('/geo', async (req, res) => {
  try {
    const { startDate, endDate, number, type = 'sites' } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // Build canonical filter
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters - using canonical field names
    if (startDate || endDate) {
      filter.timestamp_utc = {};
      if (startDate) filter.timestamp_utc.$gte = new Date(startDate);
      if (endDate) filter.timestamp_utc.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { caller_number: { $regex: number, $options: 'i' } },
        { receiver_number: { $regex: number, $options: 'i' } }
      ];
    }

    if (type === 'locations') {
      // Return location points with lat/lng
      const locations = await EventCanonical.find({
        ...filter,
        latitude: { $exists: true, $ne: null },
        longitude: { $exists: true, $ne: null }
      })
        .select('latitude longitude timestamp_utc site')
        .limit(1000)
        .lean();

      // Map to expected response format
      const mappedLocations = locations.map(loc => ({
        lat: loc.latitude,
        lng: loc.longitude,
        startTime: loc.timestamp_utc,
        site: loc.site || null
      }));

      res.json({ 
        locations: mappedLocations,
        uploadId: uploadId || null
      });
    } else {
      // Return top sites or cells
      // Canonical uses cell_id (not cellId) and site is in legacy fields
      const matchFilter = {
        ...filter,
        [type === 'sites' ? 'site' : 'cell_id']: { $exists: true, $ne: null }
      };
      
      const groupField = type === 'sites' ? '$site' : '$cell_id';
      const topItems = await EventCanonical.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: groupField,
            count: { $sum: 1 },
            lat: { $first: '$latitude' },
            lng: { $first: '$longitude' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
        {
          $project: {
            name: '$_id',
            count: 1,
            lat: 1,
            lng: 1,
            _id: 0
          }
        }
      ]);

      res.json({ 
        topItems, 
        type,
        uploadId: uploadId || null
      });
    }

  } catch (error) {
    console.error('Analytics geo error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/network - Get network graph with communities
router.get('/network', async (req, res) => {
  try {
    const {
      uploadId: queryUploadId,
      from,
      to,
      eventType = 'all',
      minEdgeWeight = 1,
      limitNodes,
      limitEdges
    } = req.query;

    // uploadId is required for network analysis
    const uploadId = await resolveUploadId({ uploadId: queryUploadId });
    if (!uploadId) {
      return res.status(400).json({ 
        error: 'uploadId is required for network analysis. Use specific uploadId or ensure at least one upload exists.' 
      });
    }

    // Build filter
    const filter = { uploadId };
    
    // Date range filter
    if (from || to) {
      filter.timestamp_utc = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ error: `Invalid 'from' date: ${from}` });
        }
        filter.timestamp_utc.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ error: `Invalid 'to' date: ${to}` });
        }
        filter.timestamp_utc.$lte = toDate;
      }
    }

    // Event type filter
    if (eventType && eventType !== 'all') {
      const validTypes = ['call', 'sms', 'data', 'unknown'];
      if (!validTypes.includes(eventType.toLowerCase())) {
        return res.status(400).json({ error: `Invalid eventType. Must be one of: all, call, sms, data, unknown` });
      }
      filter.event_type = eventType.toLowerCase();
    }

    // Exclude records with missing parties AND self-calls
    filter.$and = [
      { caller_number: { $exists: true, $nin: [null, ''] } },
      { receiver_number: { $exists: true, $nin: [null, ''] } },
      { $expr: { $ne: ['$caller_number', '$receiver_number'] } } // Exclude self-calls
    ];

    // Check if any records exist
    const recordCount = await EventCanonical.countDocuments(filter);
    if (recordCount === 0) {
      return res.json({
        uploadId,
        filters: { from, to, eventType, minEdgeWeight, limitNodes, limitEdges },
        graph: { nodes: [], edges: [] },
        communities: [],
        stats: {
          nodeCount: 0,
          edgeCount: 0,
          components: 0,
          isolates: 0,
          density: 0,
          maxDegree: 0,
          avgDegree: 0,
          maxWeightedDegree: 0,
          avgWeightedDegree: 0
        },
        message: 'No records found for the specified filters'
      });
    }

    // Build edges using aggregation (efficient)
    // Use contact_pair_key if available, otherwise create normalized pair
    const edgesPipeline = [
      { $match: filter },
      {
        $project: {
          caller: '$caller_number',
          receiver: '$receiver_number',
          contactPairKey: '$contact_pair_key',
          timestamp: '$timestamp_utc',
          duration: '$call_duration_seconds',
          eventType: '$event_type'
        }
      },
      {
        $addFields: {
          // Create normalized pair (sorted) if contact_pair_key is missing
          normalizedPair: {
            $cond: {
              if: { $ifNull: ['$contactPairKey', false] },
              then: '$contactPairKey',
              else: {
                $concat: [
                  { $cond: [{ $lt: ['$caller', '$receiver'] }, '$caller', '$receiver'] },
                  '|',
                  { $cond: [{ $lt: ['$caller', '$receiver'] }, '$receiver', '$caller'] }
                ]
              }
            }
          }
        }
      },
      {
        // Exclude self-calls (caller === receiver)
        $match: {
          $expr: { $ne: ['$caller', '$receiver'] }
        }
      },
      {
        $group: {
          _id: {
            source: { $cond: [{ $lt: ['$caller', '$receiver'] }, '$caller', '$receiver'] },
            target: { $cond: [{ $lt: ['$caller', '$receiver'] }, '$receiver', '$caller'] }
          },
          weight: { $sum: 1 },
          totalDuration: { $sum: { $cond: [{ $eq: ['$eventType', 'call'] }, '$duration', 0] } },
          eventCount: { $sum: 1 },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' }
        }
      },
      { $match: { weight: { $gte: parseInt(minEdgeWeight) || 1 } } },
      { $sort: { weight: -1 } }
    ];

    // Apply edge limit if specified
    if (limitEdges) {
      edgesPipeline.push({ $limit: parseInt(limitEdges) });
    }

    const edges = await EventCanonical.aggregate(edgesPipeline);

    // Build node statistics - aggregate all nodes that appear in events
    const nodesPipeline = [
      { $match: filter },
      {
        $project: {
          nodes: {
            $setUnion: [
              { $cond: [{ $ne: ['$caller_number', null] }, ['$caller_number'], []] },
              { $cond: [{ $ne: ['$receiver_number', null] }, ['$receiver_number'], []] }
            ]
          },
          timestamp: '$timestamp_utc',
          duration: { $cond: [{ $eq: ['$event_type', 'call'] }, '$call_duration_seconds', 0] }
        }
      },
      { $unwind: '$nodes' },
      {
        $group: {
          _id: '$nodes',
          totalEvents: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' }
        }
      }
    ];

    const nodeStats = await EventCanonical.aggregate(nodesPipeline);

    // Calculate degree and weighted degree for each node
    const nodeMap = new Map();
    nodeStats.forEach(node => {
      nodeMap.set(node._id, {
        ...node,
        degree: 0,
        weightedDegree: 0
      });
    });

    // Calculate degrees from edges
    edges.forEach(edge => {
      const source = edge._id.source;
      const target = edge._id.target;
      
      if (nodeMap.has(source)) {
        const node = nodeMap.get(source);
        node.degree++;
        node.weightedDegree += edge.weight;
      }
      if (nodeMap.has(target)) {
        const node = nodeMap.get(target);
        node.degree++;
        node.weightedDegree += edge.weight;
      }
    });

    // Filter nodes to only those that appear in edges (or keep all if no edges)
    const nodesInGraph = edges.length > 0 
      ? Array.from(nodeMap.values()).filter(node => node.degree > 0)
      : Array.from(nodeMap.values());

    // Build graph with validation
    const graphResult = buildGraph(edges, nodesInGraph);
    let graph = graphResult.graph || graphResult; // Handle both return formats for backward compatibility
    const selfCallCount = graphResult.selfCallCount || 0;
    const buildWarnings = graphResult.warnings || [];
    
    // Log warnings if graph is empty but records exist
    if (graph.order === 0 && recordCount > 0) {
      console.warn(`Network graph is empty but ${recordCount} records exist. Warnings:`, buildWarnings);
    }

    // Check if trimming is needed
    let truncated = false;
    let truncationReason = null;
    const maxNodesBeforeTrim = 20000;
    const requestedLimit = limitNodes ? parseInt(limitNodes) : null;

    if (graph.order > maxNodesBeforeTrim) {
      // Force trimming if graph is too large
      const trimLimit = requestedLimit || 1000;
      graph = trimGraph(graph, trimLimit);
      truncated = true;
      truncationReason = `Graph exceeded ${maxNodesBeforeTrim} nodes. Trimmed to top ${trimLimit} nodes by weighted degree.`;
    } else if (requestedLimit && graph.order > requestedLimit) {
      // Trim to requested limit
      graph = trimGraph(graph, requestedLimit);
      truncated = true;
      truncationReason = `Trimmed to top ${requestedLimit} nodes by weighted degree as requested.`;
    }

    // Detect communities
    const { assignments, communities } = detectCommunities(graph);

    // Compute statistics
    const stats = computeGraphStats(graph);
    
    // Add self-call count and warnings to stats if available
    if (selfCallCount > 0) {
      stats.selfCallsExcluded = selfCallCount;
    }
    if (buildWarnings.length > 0) {
      stats.buildWarnings = buildWarnings.slice(0, 10);
    }
    
    // Convert graph to response format
    const nodes = graph.nodes().map(nodeId => {
      const attrs = graph.getNodeAttributes(nodeId);
      return {
        id: nodeId,
        label: nodeId,
        degree: attrs.degree || 0,
        weightedDegree: attrs.weightedDegree || 0,
        totalEvents: attrs.totalEvents || 0,
        totalDuration: attrs.totalDuration || 0,
        community: assignments[nodeId] || 'isolate',
        firstSeen: attrs.firstSeen || null,
        lastSeen: attrs.lastSeen || null
      };
    });

    const graphEdges = graph.edges().map(edgeId => {
      const [source, target] = graph.extremities(edgeId);
      const attrs = graph.getEdgeAttributes(edgeId);
      return {
        id: edgeId,
        source,
        target,
        weight: attrs.weight || 0,
        totalDuration: attrs.totalDuration || 0,
        eventCount: attrs.eventCount || 0,
        firstSeen: attrs.firstSeen || null,
        lastSeen: attrs.lastSeen || null
      };
    });

    res.json({
      uploadId,
      filters: { from, to, eventType, minEdgeWeight, limitNodes, limitEdges },
      graph: {
        nodes,
        edges: graphEdges
      },
      communities,
      stats,
      truncated: truncated || false,
      truncationReason: truncationReason || null
    });

  } catch (error) {
    console.error('Analytics network error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
