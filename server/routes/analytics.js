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
// Supports mode=stacked (default) and mode=baselineRecent for behavior change analysis
router.get('/timeline', async (req, res) => {
  try {
    const { startDate, endDate, number, eventType, groupBy = 'day', mode = 'stacked' } = req.query;

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

    // BASELINE/RECENT MODE: Behavior change analysis
    if (mode === 'baselineRecent') {
      // Step 1: Determine time range from filtered dataset
      const timeRange = await EventCanonical.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            minTime: { $min: '$timestamp_utc' },
            maxTime: { $max: '$timestamp_utc' }
          }
        }
      ]);

      if (timeRange.length === 0 || !timeRange[0].minTime || !timeRange[0].maxTime) {
        return res.json({
          mode: 'baselineRecent',
          error: 'No data available for baseline/recent analysis',
          uploadId: uploadId || null
        });
      }

      const minTime = new Date(timeRange[0].minTime);
      const maxTime = new Date(timeRange[0].maxTime);
      const timeSpan = maxTime.getTime() - minTime.getTime();
      const timeSpanDays = timeSpan / (1000 * 60 * 60 * 24);

      // Check if time span is sufficient (at least 2 days)
      if (timeSpanDays < 2) {
        return res.json({
          mode: 'baselineRecent',
          error: 'Not enough time span to compare baseline vs recent. Minimum 2 days required.',
          timeSpanDays: timeSpanDays.toFixed(2),
          uploadId: uploadId || null
        });
      }

      // Calculate cutoff: earliest 70% = baseline, latest 30% = recent
      const cutoff = new Date(minTime.getTime() + 0.7 * timeSpan);

      // Step 2: Aggregate baseline and recent separately
      const baselineFilter = { ...filter, timestamp_utc: { ...filter.timestamp_utc, $lte: cutoff } };
      const recentFilter = { ...filter, timestamp_utc: { ...filter.timestamp_utc, $gt: cutoff } };

      // Ensure timestamp_utc is an object for recent filter
      if (!recentFilter.timestamp_utc || typeof recentFilter.timestamp_utc !== 'object') {
        recentFilter.timestamp_utc = { $gt: cutoff };
      } else {
        recentFilter.timestamp_utc.$gt = cutoff;
      }

      // Aggregate baseline series (by day)
      const baselineSeries = await EventCanonical.aggregate([
        { $match: baselineFilter },
        {
          $group: {
            _id: '$date',
            total: { $sum: 1 },
            calls: { $sum: { $cond: [{ $eq: ['$event_type', 'call'] }, 1, 0] } },
            sms: { $sum: { $cond: [{ $eq: ['$event_type', 'sms'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            date: '$_id',
            total: 1,
            calls: 1,
            sms: 1,
            _id: 0
          }
        }
      ]);

      // Aggregate recent series (by day)
      const recentSeries = await EventCanonical.aggregate([
        { $match: recentFilter },
        {
          $group: {
            _id: '$date',
            total: { $sum: 1 },
            calls: { $sum: { $cond: [{ $eq: ['$event_type', 'call'] }, 1, 0] } },
            sms: { $sum: { $cond: [{ $eq: ['$event_type', 'sms'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            date: '$_id',
            total: 1,
            calls: 1,
            sms: 1,
            _id: 0
          }
        }
      ]);

      // Step 3: Calculate deltas and metrics
      const baselineTotal = baselineSeries.reduce((sum, day) => sum + day.total, 0);
      const recentTotal = recentSeries.reduce((sum, day) => sum + day.total, 0);
      const baselineCalls = baselineSeries.reduce((sum, day) => sum + day.calls, 0);
      const recentCalls = recentSeries.reduce((sum, day) => sum + day.calls, 0);
      const baselineSms = baselineSeries.reduce((sum, day) => sum + day.sms, 0);
      const recentSms = recentSeries.reduce((sum, day) => sum + day.sms, 0);

      const baselineDays = baselineSeries.length || 1;
      const recentDays = recentSeries.length || 1;

      const avgDailyTotalBaseline = baselineTotal / baselineDays;
      const avgDailyTotalRecent = recentTotal / recentDays;
      const pctChangeTotal = avgDailyTotalBaseline > 0 
        ? ((avgDailyTotalRecent - avgDailyTotalBaseline) / avgDailyTotalBaseline * 100).toFixed(1)
        : recentTotal > 0 ? 100 : 0;
      const pctChangeCalls = baselineCalls > 0
        ? ((recentCalls - baselineCalls) / baselineCalls * 100).toFixed(1)
        : recentCalls > 0 ? 100 : 0;
      const pctChangeSms = baselineSms > 0
        ? ((recentSms - baselineSms) / baselineSms * 100).toFixed(1)
        : recentSms > 0 ? 100 : 0;

      // Calculate night activity percentages using canonical is_night field
      const baselineNight = await EventCanonical.countDocuments({ ...baselineFilter, is_night: true });
      const recentNight = await EventCanonical.countDocuments({ ...recentFilter, is_night: true });
      const nightActivityBaselinePct = baselineTotal > 0 ? ((baselineNight / baselineTotal) * 100).toFixed(1) : 0;
      const nightActivityRecentPct = recentTotal > 0 ? ((recentNight / recentTotal) * 100).toFixed(1) : 0;

      return res.json({
        mode: 'baselineRecent',
        cutoffUtc: cutoff.toISOString(),
        baseline: baselineSeries,
        recent: recentSeries,
        deltas: {
          avgDailyTotalBaseline: avgDailyTotalBaseline.toFixed(1),
          avgDailyTotalRecent: avgDailyTotalRecent.toFixed(1),
          pctChangeTotal: parseFloat(pctChangeTotal),
          pctChangeCalls: parseFloat(pctChangeCalls),
          pctChangeSms: parseFloat(pctChangeSms),
          nightActivityBaselinePct: parseFloat(nightActivityBaselinePct),
          nightActivityRecentPct: parseFloat(nightActivityRecentPct)
        },
        uploadId: uploadId || null
      });
    }

    // DEFAULT MODE: Stacked timeline (existing behavior)
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
      mode: 'stacked',
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

// Simple in-memory cache for anomaly results
const anomalyCache = new Map();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const MAX_CACHE_SIZE = 50; // Maximum cache entries

// Cache entry structure: { data, timestamp }
function getCacheKey(uploadId, from, to, eventType, baselineRatio, phone) {
  return `${uploadId}|${from || ''}|${to || ''}|${eventType || 'all'}|${baselineRatio}|${phone || ''}`;
}

function getCached(key) {
  const entry = anomalyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    anomalyCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Implement simple LRU: remove oldest if at capacity
  if (anomalyCache.size >= MAX_CACHE_SIZE) {
    const firstKey = anomalyCache.keys().next().value;
    anomalyCache.delete(firstKey);
  }
  anomalyCache.set(key, { data, timestamp: Date.now() });
}

// Helper: Generate deterministic alert ID
function generateAlertId(type, phone, related, cutoffUtc, metricsBucket) {
  const hashInput = `${type}|${phone}|${related || ''}|${cutoffUtc}|${JSON.stringify(metricsBucket)}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `alert_${Math.abs(hash).toString(36)}`;
}

// Helper: Calculate confidence based on baseline sample size
function calculateConfidence(baselineDaysCount, baselineSampleSize) {
  if (baselineDaysCount >= 14 && baselineSampleSize >= 100) return 'high';
  if (baselineDaysCount >= 7 && baselineSampleSize >= 50) return 'medium';
  return 'low';
}

// GET /api/analytics/anomalies - Detect anomalies using baseline vs recent comparison
router.get('/anomalies', async (req, res) => {
  try {
    const { uploadId, from, to, eventType = 'all', baselineRatio = 0.7, limit = 50, phone } = req.query;

    // Validation
    if (!uploadId) {
      return res.status(400).json({ error: 'uploadId is required' });
    }

    const baselineRatioNum = parseFloat(baselineRatio);
    if (isNaN(baselineRatioNum) || baselineRatioNum < 0.5 || baselineRatioNum > 0.9) {
      return res.status(422).json({ error: 'baselineRatio must be between 0.5 and 0.9' });
    }

    // Check cache
    const cacheKey = getCacheKey(uploadId, from, to, eventType, baselineRatioNum, phone);
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Build base filter
    const baseFilter = { uploadId };
    if (from || to) {
      baseFilter.timestamp_utc = {};
      if (from) baseFilter.timestamp_utc.$gte = new Date(from);
      if (to) baseFilter.timestamp_utc.$lte = new Date(to);
    }

    // Event type filter
    if (eventType !== 'all') {
      if (eventType === 'call') {
        baseFilter.event_type = 'call';
      } else if (eventType === 'sms') {
        baseFilter.event_type = 'sms';
      }
    }

    // Phone filter (if provided, compute anomalies only for that phone)
    if (phone) {
      baseFilter.$or = [
        { caller_number: phone },
        { receiver_number: phone }
      ];
    }

    // Step 1: Determine time range and cutoff
    const timeRange = await EventCanonical.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          minTime: { $min: '$timestamp_utc' },
          maxTime: { $max: '$timestamp_utc' }
        }
      }
    ]);

    if (timeRange.length === 0 || !timeRange[0].minTime || !timeRange[0].maxTime) {
      return res.json({
        uploadId,
        filters: { from, to, eventType, baselineRatio: baselineRatioNum, phone },
        baseline: { startUtc: null, endUtc: null, daysCount: 0, cutoffUtc: null },
        recent: { startUtc: null, endUtc: null, daysCount: 0 },
        summary: { totalAlerts: 0, high: 0, medium: 0, low: 0 },
        alerts: []
      });
    }

    const minTime = new Date(timeRange[0].minTime);
    const maxTime = new Date(timeRange[0].maxTime);
    const timeSpan = maxTime.getTime() - minTime.getTime();
    const cutoffTime = new Date(minTime.getTime() + baselineRatioNum * timeSpan);

    // Build baseline and recent filters
    const baselineFilter = {
      ...baseFilter,
      timestamp_utc: { ...baseFilter.timestamp_utc, $lte: cutoffTime }
    };
    if (!baselineFilter.timestamp_utc.$gte) {
      baselineFilter.timestamp_utc.$gte = minTime;
    }

    const recentFilter = {
      ...baseFilter,
      timestamp_utc: { ...baseFilter.timestamp_utc, $gt: cutoffTime }
    };
    if (!recentFilter.timestamp_utc.$lte) {
      recentFilter.timestamp_utc.$lte = maxTime;
    }

    // Calculate baseline and recent day counts
    const baselineDays = await EventCanonical.distinct('date', baselineFilter);
    const recentDays = await EventCanonical.distinct('date', recentFilter);
    const baselineDaysCount = baselineDays.length;
    const recentDaysCount = recentDays.length;

    // Step 2: Compute anomalies
    const alerts = [];

    // ANOMALY 1: VOLUME_SPIKE
    const volumeSpikeAlerts = await computeVolumeSpike(
      baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phone
    );
    alerts.push(...volumeSpikeAlerts);

    // ANOMALY 2: NEW_CONTACT_EMERGENCE
    const newContactAlerts = await computeNewContactEmergence(
      baselineFilter, recentFilter, phone
    );
    alerts.push(...newContactAlerts);

    // ANOMALY 3: NIGHT_ACTIVITY_SHIFT
    const nightActivityAlerts = await computeNightActivityShift(
      baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phone
    );
    alerts.push(...nightActivityAlerts);

    // ANOMALY 4: BURST_PATTERN_CHANGE
    const burstPatternAlerts = await computeBurstPatternChange(
      baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phone
    );
    alerts.push(...burstPatternAlerts);

    // Sort alerts: severity desc, then by score/type
    alerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      if (severityOrder[b.severity] !== severityOrder[a.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return (b.metrics?.multiplier || b.metrics?.deltaPoints || 0) - (a.metrics?.multiplier || a.metrics?.deltaPoints || 0);
    });

    // Limit results
    const limitedAlerts = alerts.slice(0, parseInt(limit) || 50);

    // Calculate summary
    const summary = {
      totalAlerts: limitedAlerts.length,
      high: limitedAlerts.filter(a => a.severity === 'high').length,
      medium: limitedAlerts.filter(a => a.severity === 'medium').length,
      low: limitedAlerts.filter(a => a.severity === 'low').length
    };

    const result = {
      uploadId,
      filters: { from, to, eventType, baselineRatio: baselineRatioNum, phone },
      baseline: {
        startUtc: minTime.toISOString(),
        endUtc: cutoffTime.toISOString(),
        daysCount: baselineDaysCount,
        cutoffUtc: cutoffTime.toISOString()
      },
      recent: {
        startUtc: cutoffTime.toISOString(),
        endUtc: maxTime.toISOString(),
        daysCount: recentDaysCount
      },
      summary,
      alerts: limitedAlerts
    };

    // Cache result
    setCache(cacheKey, result);

    res.json(result);

  } catch (error) {
    console.error('Anomalies computation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ANOMALY 1: VOLUME_SPIKE
async function computeVolumeSpike(baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phoneFilter) {
  const alerts = [];

  // Aggregate daily volumes per phone
  // Count events where phone is caller OR receiver
  const baselineDaily = await EventCanonical.aggregate([
    { $match: baselineFilter },
    {
      $project: {
        date: 1,
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    {
      $group: {
        _id: { phone: '$phoneTrim', date: '$date' },
        count: { $sum: 1 }
      }
    },
    ...(phoneFilter ? [{ $match: { '_id.phone': String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$_id.phone',
        avgDaily: { $avg: '$count' },
        totalEvents: { $sum: '$count' },
        daysCount: { $sum: 1 }
      }
    }
  ]);

  const recentDaily = await EventCanonical.aggregate([
    { $match: recentFilter },
    {
      $project: {
        date: 1,
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    {
      $group: {
        _id: { phone: '$phoneTrim', date: '$date' },
        count: { $sum: 1 }
      }
    },
    ...(phoneFilter ? [{ $match: { '_id.phone': String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$_id.phone',
        avgDaily: { $avg: '$count' },
        totalEvents: { $sum: '$count' },
        daysCount: { $sum: 1 }
      }
    }
  ]);

  // Match phones and compute spikes
  const phoneMap = new Map();
  baselineDaily.forEach(p => phoneMap.set(p._id, { baseline: p }));
  recentDaily.forEach(p => {
    if (!phoneMap.has(p._id)) phoneMap.set(p._id, {});
    phoneMap.get(p._id).recent = p;
  });

  for (const [phone, data] of phoneMap.entries()) {
    if (!data.baseline || !data.recent || !phone) continue;

    const baselineAvg = data.baseline.avgDaily;
    const recentAvg = data.recent.avgDaily;

    if (baselineAvg < 1) continue; // Avoid noise

    const multiplier = recentAvg / baselineAvg;
    if (multiplier >= 2.5) {
      const deltaPct = ((recentAvg - baselineAvg) / baselineAvg * 100).toFixed(1);
      let severity = 'low';
      if (multiplier >= 3.5) severity = 'high';
      else if (multiplier >= 2.8) severity = 'medium';

      const confidence = calculateConfidence(baselineDaysCount, data.baseline.totalEvents);

      alerts.push({
        id: generateAlertId('VOLUME_SPIKE', phone, null, recentFilter.timestamp_utc.$lte, { multiplier: Math.floor(multiplier * 10) }),
        type: 'VOLUME_SPIKE',
        severity,
        confidence,
        phone,
        related: {},
        window: {
          baseline: { avgDaily: baselineAvg.toFixed(1), totalEvents: data.baseline.totalEvents, daysCount: data.baseline.daysCount },
          recent: { avgDaily: recentAvg.toFixed(1), totalEvents: data.recent.totalEvents, daysCount: data.recent.daysCount }
        },
        metrics: {
          baselineAvgDaily: baselineAvg.toFixed(1),
          recentAvgDaily: recentAvg.toFixed(1),
          multiplier: multiplier.toFixed(2),
          deltaPct: parseFloat(deltaPct),
          baselineDaysCount: data.baseline.daysCount,
          recentDaysCount: data.recent.daysCount
        },
        explanation: `Daily communication volume increased ${multiplier.toFixed(1)}× from ${baselineAvg.toFixed(1)} to ${recentAvg.toFixed(1)} events/day (${deltaPct}% increase)`,
        recommendedActions: ['VIEW_EVENTS', 'VIEW_NETWORK', 'VIEW_TIMELINE']
      });
    }
  }

  return alerts;
}

// ANOMALY 2: NEW_CONTACT_EMERGENCE
async function computeNewContactEmergence(baselineFilter, recentFilter, phoneFilter) {
  const alerts = [];

  // Get all owner phones to analyze (from both caller and receiver in baseline+recent)
  let phonesToAnalyze;
  if (phoneFilter) {
    phonesToAnalyze = [phoneFilter];
  } else {
    // Get distinct phones from both caller_number and receiver_number in the combined dataset
    const [baselineCallers, baselineReceivers, recentCallers, recentReceivers] = await Promise.all([
      EventCanonical.distinct('caller_number', { ...baselineFilter, caller_number: { $exists: true, $nin: [null, ''] } }),
      EventCanonical.distinct('receiver_number', { ...baselineFilter, receiver_number: { $exists: true, $nin: [null, ''] } }),
      EventCanonical.distinct('caller_number', { ...recentFilter, caller_number: { $exists: true, $nin: [null, ''] } }),
      EventCanonical.distinct('receiver_number', { ...recentFilter, receiver_number: { $exists: true, $nin: [null, ''] } })
    ]);
    const allPhones = new Set([...baselineCallers, ...baselineReceivers, ...recentCallers, ...recentReceivers]);
    // Filter out empty strings and whitespace-only
    phonesToAnalyze = Array.from(allPhones).filter(p => p && String(p).trim().length > 0);
  }

  // Use aggregation to compute baseline counterparties (bidirectional) for all owners at once
  const baselineCounterpartiesMap = await EventCanonical.aggregate([
    { $match: baselineFilter },
    {
      $project: {
        caller: { $ifNull: ['$caller_number', ''] },
        receiver: { $ifNull: ['$receiver_number', ''] }
      }
    },
    {
      $match: {
        caller: { $nin: [null, ''] },
        receiver: { $nin: [null, ''] }
      }
    },
    {
      $addFields: {
        callerTrim: { $trim: { input: { $toString: '$caller' } } },
        receiverTrim: { $trim: { input: { $toString: '$receiver' } } }
      }
    },
    {
      $match: {
        callerTrim: { $ne: '' },
        receiverTrim: { $ne: '' }
      }
    },
    {
      $facet: {
        ownerAsCaller: [
          {
            $project: {
              owner: '$callerTrim',
              counterparty: '$receiverTrim'
            }
          }
        ],
        ownerAsReceiver: [
          {
            $project: {
              owner: '$receiverTrim',
              counterparty: '$callerTrim'
            }
          }
        ]
      }
    },
    {
      $project: {
        pairs: { $concatArrays: ['$ownerAsCaller', '$ownerAsReceiver'] }
      }
    },
    { $unwind: '$pairs' },
    {
      $group: {
        _id: { owner: '$pairs.owner', counterparty: '$pairs.counterparty' }
      }
    },
    {
      $group: {
        _id: '$_id.owner',
        counterparties: { $addToSet: '$_id.counterparty' }
      }
    }
  ]);

  // Build baseline counterparties map
  const baselineMap = new Map();
  baselineCounterpartiesMap.forEach(item => {
    if (item._id) {
      baselineMap.set(item._id, new Set(item.counterparties));
    }
  });

  // For each owner, find new counterparties in recent period (bidirectional)
  for (const ownerPhone of phonesToAnalyze) {
    if (!ownerPhone || String(ownerPhone).trim().length === 0) continue;

    const ownerTrim = String(ownerPhone).trim();
    const baselineCounterparties = baselineMap.get(ownerTrim) || new Set();

    // Get recent counterparties and their bidirectional event counts
    const recentCounterparties = await EventCanonical.aggregate([
      {
        $match: {
          ...recentFilter,
          $or: [
            { caller_number: ownerTrim },
            { receiver_number: ownerTrim }
          ]
        }
      },
      {
        $project: {
          counterparty: {
            $cond: [
              { $eq: ['$caller_number', ownerTrim] },
              '$receiver_number',
              '$caller_number'
            ]
          },
          timestamp_utc: 1
        }
      },
      {
        $match: {
          counterparty: { $exists: true, $nin: [null, ''] },
          $expr: {
            $and: [
              { $ne: [{ $trim: { input: { $toString: '$counterparty' } } }, ''] }
            ]
          }
        }
      },
      {
        $addFields: {
          counterpartyTrim: { $trim: { input: { $toString: '$counterparty' } } }
        }
      },
      {
        $match: {
          counterpartyTrim: { $ne: '' },
          counterpartyTrim: { $nin: Array.from(baselineCounterparties).map(c => String(c).trim()) }
        }
      },
      {
        $group: {
          _id: '$counterpartyTrim',
          eventCount: { $sum: 1 },
          firstSeen: { $min: '$timestamp_utc' }
        }
      }
    ]);

    // Get total recent events for owner phone (bidirectional)
    const totalRecentEvents = await EventCanonical.countDocuments({
      ...recentFilter,
      $or: [
        { caller_number: ownerTrim },
        { receiver_number: ownerTrim }
      ]
    });

    for (const contact of recentCounterparties) {
      const newContactPhone = contact._id;
      const recentEventCount = contact.eventCount;
      const sharePct = totalRecentEvents > 0 ? (recentEventCount / totalRecentEvents) : 0;

      if (recentEventCount >= 5 || sharePct >= 0.20) {
        let severity = 'low';
        if (sharePct >= 0.35 || recentEventCount >= 15) severity = 'high';
        else if (sharePct >= 0.25 || recentEventCount >= 10) severity = 'medium';

        alerts.push({
          id: generateAlertId('NEW_CONTACT_EMERGENCE', ownerTrim, newContactPhone, recentFilter.timestamp_utc.$lte, { eventCount: recentEventCount }),
          type: 'NEW_CONTACT_EMERGENCE',
          severity,
          confidence: 'medium', // New contacts inherently have less baseline data
          phone: ownerTrim,
          related: { otherPhone: newContactPhone },
          window: {
            baseline: { contactsSeen: baselineCounterparties.size },
            recent: { newContactPhone, recentEventCount, sharePct: (sharePct * 100).toFixed(1) + '%' }
          },
          metrics: {
            newContactPhone,
            recentEventCount,
            sharePct: (sharePct * 100).toFixed(1),
            firstSeenRecent: contact.firstSeen.toISOString()
          },
          explanation: `New contact ${newContactPhone} emerged with ${recentEventCount} events (${(sharePct * 100).toFixed(1)}% of recent activity)`,
          recommendedActions: ['VIEW_EVENTS', 'VIEW_NETWORK', 'VIEW_TIMELINE']
        });
      }
    }
  }

  return alerts;
}

// ANOMALY 3: NIGHT_ACTIVITY_SHIFT
async function computeNightActivityShift(baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phoneFilter) {
  const alerts = [];

  // Aggregate night activity per phone
  const baselineNight = await EventCanonical.aggregate([
    { $match: { ...baselineFilter, is_night: true } },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$phoneTrim',
        nightCount: { $sum: 1 }
      }
    }
  ]);

  const baselineTotal = await EventCanonical.aggregate([
    { $match: baselineFilter },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$phoneTrim',
        totalCount: { $sum: 1 }
      }
    }
  ]);

  const recentNight = await EventCanonical.aggregate([
    { $match: { ...recentFilter, is_night: true } },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$phoneTrim',
        nightCount: { $sum: 1 }
      }
    }
  ]);

  const recentTotal = await EventCanonical.aggregate([
    { $match: recentFilter },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        }
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: '$phoneTrim',
        totalCount: { $sum: 1 }
      }
    }
  ]);

  const phoneMap = new Map();
  baselineTotal.forEach(p => {
    if (!p._id) return;
    phoneMap.set(p._id, { baselineTotal: p.totalCount, baselineNight: 0 });
  });
  baselineNight.forEach(p => {
    if (phoneMap.has(p._id)) phoneMap.get(p._id).baselineNight = p.nightCount;
  });
  recentTotal.forEach(p => {
    if (!p._id) return;
    if (!phoneMap.has(p._id)) phoneMap.set(p._id, { baselineTotal: 0, baselineNight: 0 });
    phoneMap.get(p._id).recentTotal = p.totalCount;
    phoneMap.get(p._id).recentNight = 0;
  });
  recentNight.forEach(p => {
    if (phoneMap.has(p._id)) phoneMap.get(p._id).recentNight = p.nightCount;
  });

  for (const [phone, data] of phoneMap.entries()) {
    if (!data.baselineTotal || !data.recentTotal) continue;

    const baselineNightPct = (data.baselineNight / data.baselineTotal) * 100;
    const recentNightPct = (data.recentNight / data.recentTotal) * 100;
    const deltaPoints = recentNightPct - baselineNightPct;

    if (deltaPoints >= 18) {
      let severity = 'low';
      if (deltaPoints >= 30) severity = 'high';
      else if (deltaPoints >= 22) severity = 'medium';

      const confidence = calculateConfidence(baselineDaysCount, data.baselineTotal);

      alerts.push({
        id: generateAlertId('NIGHT_ACTIVITY_SHIFT', phone, null, recentFilter.timestamp_utc.$lte, { deltaPoints: Math.floor(deltaPoints) }),
        type: 'NIGHT_ACTIVITY_SHIFT',
        severity,
        confidence,
        phone,
        related: {},
        window: {
          baseline: { nightPct: baselineNightPct.toFixed(1) + '%', nightCount: data.baselineNight, totalCount: data.baselineTotal },
          recent: { nightPct: recentNightPct.toFixed(1) + '%', nightCount: data.recentNight, totalCount: data.recentTotal }
        },
        metrics: {
          baselineNightPct: baselineNightPct.toFixed(1),
          recentNightPct: recentNightPct.toFixed(1),
          deltaPoints: deltaPoints.toFixed(1)
        },
        explanation: `Night activity increased from ${baselineNightPct.toFixed(1)}% to ${recentNightPct.toFixed(1)}% (+${deltaPoints.toFixed(1)} points)`,
        recommendedActions: ['VIEW_EVENTS', 'VIEW_NETWORK', 'VIEW_TIMELINE']
      });
    }
  }

  return alerts;
}

// ANOMALY 4: BURST_PATTERN_CHANGE
async function computeBurstPatternChange(baselineFilter, recentFilter, baselineDaysCount, recentDaysCount, phoneFilter) {
  const alerts = [];

  // Aggregate burst sizes per phone per burst_session_id
  const baselineBursts = await EventCanonical.aggregate([
    { $match: { ...baselineFilter, burst_session_id: { $exists: true, $ne: null } } },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        },
        burstId: '$burst_session_id'
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: { phone: '$phoneTrim', burstId: '$burstId' },
        burstSize: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.phone',
        avgBurstSize: { $avg: '$burstSize' },
        burstCount: { $sum: 1 },
        maxBurstSize: { $max: '$burstSize' }
      }
    }
  ]);

  const recentBursts = await EventCanonical.aggregate([
    { $match: { ...recentFilter, burst_session_id: { $exists: true, $ne: null } } },
    {
      $project: {
        phones: {
          $filter: {
            input: ['$caller_number', '$receiver_number'],
            as: 'p',
            cond: {
              $and: [
                { $ne: ['$$p', null] },
                { $ne: ['$$p', ''] },
                { $ne: [{ $trim: { input: { $ifNull: ['$$p', ''] } } }, ''] }
              ]
            }
          }
        },
        burstId: '$burst_session_id'
      }
    },
    { $unwind: '$phones' },
    {
      $addFields: {
        phoneTrim: { $trim: { input: { $toString: '$phones' } } }
      }
    },
    {
      $match: {
        phoneTrim: { $ne: '' }
      }
    },
    ...(phoneFilter ? [{ $match: { phoneTrim: String(phoneFilter).trim() } }] : []),
    {
      $group: {
        _id: { phone: '$phoneTrim', burstId: '$burstId' },
        burstSize: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.phone',
        avgBurstSize: { $avg: '$burstSize' },
        burstCount: { $sum: 1 },
        maxBurstSize: { $max: '$burstSize' }
      }
    }
  ]);

  const phoneMap = new Map();
  baselineBursts.forEach(p => {
    if (!p._id) return;
    phoneMap.set(p._id, { baseline: p, baselineBurstRate: p.burstCount / baselineDaysCount });
  });
  recentBursts.forEach(p => {
    if (!p._id) return;
    if (!phoneMap.has(p._id)) phoneMap.set(p._id, { baseline: null, baselineBurstRate: 0 });
    phoneMap.get(p._id).recent = p;
    phoneMap.get(p._id).recentBurstRate = p.burstCount / recentDaysCount;
  });

  for (const [phone, data] of phoneMap.entries()) {
    if (!data.baseline || !data.recent) continue;

    const baselineAvgBurstSize = data.baseline.avgBurstSize;
    const recentAvgBurstSize = data.recent.avgBurstSize;
    const baselineBurstRate = data.baselineBurstRate;
    const recentBurstRate = data.recentBurstRate;

    const sizeMultiplier = recentAvgBurstSize / baselineAvgBurstSize;
    const rateMultiplier = baselineBurstRate > 0 ? recentBurstRate / baselineBurstRate : 0;

    if (sizeMultiplier >= 2.0 || rateMultiplier >= 2.5) {
      const maxMultiplier = Math.max(sizeMultiplier, rateMultiplier);
      let severity = 'low';
      if (maxMultiplier >= 3.0) severity = 'high';
      else if (maxMultiplier >= 2.5) severity = 'medium';

      const confidence = calculateConfidence(baselineDaysCount, data.baseline.burstCount);

      alerts.push({
        id: generateAlertId('BURST_PATTERN_CHANGE', phone, null, recentFilter.timestamp_utc.$lte, { multiplier: Math.floor(maxMultiplier * 10) }),
        type: 'BURST_PATTERN_CHANGE',
        severity,
        confidence,
        phone,
        related: {},
        window: {
          baseline: {
            avgBurstSize: baselineAvgBurstSize.toFixed(1),
            burstRate: baselineBurstRate.toFixed(2) + '/day',
            burstCount: data.baseline.burstCount
          },
          recent: {
            avgBurstSize: recentAvgBurstSize.toFixed(1),
            burstRate: recentBurstRate.toFixed(2) + '/day',
            burstCount: data.recent.burstCount,
            maxBurstSize: data.recent.maxBurstSize
          }
        },
        metrics: {
          baselineAvgBurstSize: baselineAvgBurstSize.toFixed(1),
          recentAvgBurstSize: recentAvgBurstSize.toFixed(1),
          baselineBurstRate: baselineBurstRate.toFixed(2),
          recentBurstRate: recentBurstRate.toFixed(2),
          topRecentBurstSize: data.recent.maxBurstSize,
          sizeMultiplier: sizeMultiplier.toFixed(2),
          rateMultiplier: rateMultiplier.toFixed(2)
        },
        explanation: `Burst pattern changed: size ${sizeMultiplier.toFixed(1)}× (${baselineAvgBurstSize.toFixed(1)} → ${recentAvgBurstSize.toFixed(1)} events/burst) or rate ${rateMultiplier.toFixed(1)}× (${baselineBurstRate.toFixed(2)} → ${recentBurstRate.toFixed(2)} bursts/day)`,
        recommendedActions: ['VIEW_EVENTS', 'VIEW_NETWORK', 'VIEW_TIMELINE']
      });
    }
  }

  return alerts;
}

export default router;
