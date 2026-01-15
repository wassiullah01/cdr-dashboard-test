import express from 'express';
import Event from '../models/Event.js';
import { resolveUploadId } from '../utils/uploadSession.js';

const router = express.Router();

// GET /api/analytics/overview - Get overview statistics
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate, number } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // CRITICAL: Build filter object - uploadId MUST be included if provided
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST (most important)
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters (date, number, etc.)
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { aParty: { $regex: number, $options: 'i' } },
        { bParty: { $regex: number, $options: 'i' } }
      ];
    }
    
    // Debug logging BEFORE queries (dev only, no sensitive data)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/overview REQUEST:', {
        includeAll: req.query.includeAll,
        uploadIdReceived: req.query.uploadId,
        uploadIdResolved: uploadId,
        filterBeforeQueries: JSON.stringify(filter)
      });
    }

    // STEP 3: Execute ALL queries with the SAME filter object
    // CRITICAL: Every query MUST use filter (or spread of filter)
    const [
      totalEvents,
      totalCalls,
      totalSMS,
      totalDuration,
      uniqueContacts,
      incomingCount,
      outgoingCount
    ] = await Promise.all([
      Event.countDocuments(filter),
      Event.countDocuments({ ...filter, eventType: 'CALL' }),
      Event.countDocuments({ ...filter, eventType: 'SMS' }),
      Event.aggregate([
        { $match: filter }, // CRITICAL: $match stage must include filter
        { $group: { _id: null, total: { $sum: '$durationSec' } } }
      ]),
      Promise.all([
        Event.distinct('aParty', filter), // CRITICAL: distinct uses filter
        Event.distinct('bParty', filter)  // CRITICAL: distinct uses filter
      ]).then(([aParties, bParties]) => {
        const all = new Set([...aParties, ...bParties].filter(p => p));
        return Array.from(all);
      }),
      Event.countDocuments({ ...filter, direction: 'INCOMING' }),
      Event.countDocuments({ ...filter, direction: 'OUTGOING' })
    ]);

    const durationHours = totalDuration[0]?.total ? (totalDuration[0].total / 3600).toFixed(2) : 0;

    // Debug logging AFTER queries (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/overview RESULTS:', {
        uploadIdResolved: uploadId,
        filterUsed: JSON.stringify(filter),
        totalEvents,
        totalCalls,
        totalSMS,
        incomingCount,
        outgoingCount,
        verification: uploadId 
          ? `Expected: totalEvents should match count for uploadId=${uploadId}` 
          : 'No uploadId filter (showing all or most recent)'
      });
    }

    res.json({
      totalEvents,
      totalCalls,
      totalSMS,
      totalDurationHours: parseFloat(durationHours),
      uniqueContacts: uniqueContacts.length,
      incomingCount,
      outgoingCount,
      uploadId: uploadId || null // Return resolved uploadId
    });

  } catch (error) {
    console.error('Analytics overview error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/analytics/timeline - Get timeline data (events per day/hour)
router.get('/timeline', async (req, res) => {
  try {
    const { startDate, endDate, number, groupBy = 'day' } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // CRITICAL: Build filter object - uploadId MUST be included if provided
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { aParty: { $regex: number, $options: 'i' } },
        { bParty: { $regex: number, $options: 'i' } }
      ];
    }
    
    // Debug logging BEFORE query (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/timeline REQUEST:', {
        includeAll: req.query.includeAll,
        uploadIdReceived: req.query.uploadId,
        uploadIdResolved: uploadId,
        filterBeforeQuery: JSON.stringify(filter)
      });
    }

    const groupFormat = groupBy === 'hour'
      ? { $dateToString: { format: '%Y-%m-%d %H:00', date: '$startTime' } }
      : { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } };

    // CRITICAL: First stage MUST be $match with filter
    const timeline = await Event.aggregate([
      { $match: filter }, // CRITICAL: Filter applied here
      {
        $group: {
          _id: groupFormat,
          count: { $sum: 1 },
          calls: { $sum: { $cond: [{ $eq: ['$eventType', 'CALL'] }, 1, 0] } },
          sms: { $sum: { $cond: [{ $eq: ['$eventType', 'SMS'] }, 1, 0] } }
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
    
    // Debug logging AFTER query (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/timeline RESULTS:', {
        uploadIdResolved: uploadId,
        filterUsed: JSON.stringify(filter),
        timelineDataPoints: timeline.length,
        pipelineStages: ['$match (filter)', '$group', '$sort', '$project']
      });
    }

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
router.get('/top-contacts', async (req, res) => {
  try {
    const { number, startDate, endDate, limit = 10 } = req.query;

    if (!number) {
      return res.status(400).json({ error: 'Number parameter is required' });
    }

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // CRITICAL: Build filter object - uploadId MUST be included if provided
    const filter = {
      $or: [
        { aParty: { $regex: number, $options: 'i' } },
        { bParty: { $regex: number, $options: 'i' } }
      ]
    };
    
    // STEP 1: Add uploadId filter (CRITICAL - must be included)
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add date filters
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }
    
    // Debug logging BEFORE query (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/top-contacts REQUEST:', {
        includeAll: req.query.includeAll,
        uploadIdReceived: req.query.uploadId,
        uploadIdResolved: uploadId,
        filterBeforeQuery: JSON.stringify(filter)
      });
    }

    // CRITICAL: Event.find MUST use filter (includes uploadId if provided)
    const events = await Event.find(filter).lean();

    // Group by counterparty
    const contactMap = new Map();

    events.forEach(event => {
      const counterparty = event.aParty === number || event.aParty?.includes(number)
        ? event.bParty
        : event.aParty;

      if (!counterparty) return;

      if (!contactMap.has(counterparty)) {
        contactMap.set(counterparty, {
          number: counterparty,
          count: 0,
          totalDuration: 0,
          calls: 0,
          sms: 0,
          incoming: 0,
          outgoing: 0
        });
      }

      const contact = contactMap.get(counterparty);
      contact.count++;
      contact.totalDuration += event.durationSec || 0;
      if (event.eventType === 'CALL') contact.calls++;
      if (event.eventType === 'SMS') contact.sms++;
      if (event.direction === 'INCOMING') contact.incoming++;
      if (event.direction === 'OUTGOING') contact.outgoing++;
    });

    const topContacts = Array.from(contactMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit))
      .map(contact => ({
        ...contact,
        totalDurationHours: (contact.totalDuration / 3600).toFixed(2)
      }));
    
    // Debug logging AFTER query (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/top-contacts RESULTS:', {
        uploadIdResolved: uploadId,
        filterUsed: JSON.stringify(filter),
        eventsFound: events.length,
        topContactsReturned: topContacts.length
      });
    }

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
router.get('/geo', async (req, res) => {
  try {
    const { startDate, endDate, number, type = 'sites' } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);

    // CRITICAL: Build filter object - uploadId MUST be included if provided
    const filter = {};
    
    // STEP 1: Add uploadId filter FIRST
    if (uploadId) {
      filter.uploadId = uploadId;
    }
    
    // STEP 2: Add other filters
    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }
    if (number) {
      filter.$or = [
        { aParty: { $regex: number, $options: 'i' } },
        { bParty: { $regex: number, $options: 'i' } }
      ];
    }
    
    // Debug logging BEFORE query (dev only)
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] /api/analytics/geo REQUEST:', {
        includeAll: req.query.includeAll,
        uploadIdReceived: req.query.uploadId,
        uploadIdResolved: uploadId,
        type,
        filterBeforeQuery: JSON.stringify(filter)
      });
    }

    if (type === 'locations' && filter.lat && filter.lng) {
      // Return location points with lat/lng
      // CRITICAL: Use spread of filter to preserve uploadId
      const locations = await Event.find({
        ...filter, // CRITICAL: Includes uploadId if provided
        lat: { $exists: true, $ne: null },
        lng: { $exists: true, $ne: null }
      })
        .select('lat lng startTime site')
        .limit(1000)
        .lean();
      
      // Debug logging (dev only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] /api/analytics/geo RESULTS (locations):', {
          uploadIdResolved: uploadId,
          filterUsed: JSON.stringify(filter),
          locationsFound: locations.length
        });
      }

      res.json({ 
        locations,
        uploadId: uploadId || null
      });
    } else {
      // Return top sites or cells
      // CRITICAL: Build match filter that includes uploadId AND field existence check
      const matchFilter = {
        ...filter, // CRITICAL: Includes uploadId if provided
        [type === 'sites' ? 'site' : 'cellId']: { $exists: true, $ne: null }
      };
      
      const groupField = type === 'sites' ? '$site' : '$cellId';
      const topItems = await Event.aggregate([
        { $match: matchFilter }, // CRITICAL: Filter applied here (includes uploadId)
        {
          $group: {
            _id: groupField,
            count: { $sum: 1 },
            lat: { $first: '$lat' },
            lng: { $first: '$lng' }
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
      
      // Debug logging (dev only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[DEBUG] /api/analytics/geo RESULTS (top items):', {
          uploadIdResolved: uploadId,
          filterUsed: JSON.stringify(matchFilter),
          topItemsReturned: topItems.length,
          pipelineStages: ['$match (filter)', '$group', '$sort', '$limit', '$project']
        });
      }

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

export default router;
