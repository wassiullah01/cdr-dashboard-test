import express from 'express';
// MIGRATION: EventCanonical is now the single source of truth
// import Event from '../models/Event.js'; // DISABLED - canonical migration complete
import EventCanonical from '../models/EventCanonical.js';
import { resolveUploadId } from '../utils/uploadSession.js';

const router = express.Router();

// GET /api/events - Get events with filters and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      number,
      eventType,
      direction,
      sortBy = 'startTime', // Frontend expects startTime, we'll map to timestamp_utc
      sortOrder = 'desc'
    } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);
    
    // Build canonical filter
    const filter = {};

    // Add uploadId filter if specified
    if (uploadId) {
      filter.uploadId = uploadId;
    }

    // Date filters - use timestamp_utc
    if (startDate || endDate) {
      filter.timestamp_utc = {};
      if (startDate) {
        filter.timestamp_utc.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.timestamp_utc.$lte = new Date(endDate);
      }
    }

    // Number filter - use caller_number/receiver_number
    if (number) {
      filter.$or = [
        { caller_number: { $regex: number, $options: 'i' } },
        { receiver_number: { $regex: number, $options: 'i' } }
      ];
    }

    // Event type filter - map to canonical event_type (lowercase)
    if (eventType) {
      const upperType = eventType.toUpperCase();
      if (upperType === 'CALL') {
        filter.event_type = 'call';
      } else if (upperType === 'SMS') {
        filter.event_type = 'sms';
      }
    }

    // Direction filter - map to canonical direction (lowercase)
    if (direction) {
      const upperDir = direction.toUpperCase();
      if (['INCOMING', 'OUTGOING', 'UNKNOWN'].includes(upperDir)) {
        filter.direction = upperDir.toLowerCase();
      }
    }

    // Build sort - map sortBy to canonical fields
    const sort = {};
    const canonicalSortBy = sortBy === 'startTime' ? 'timestamp_utc' : 
                           sortBy === 'durationSec' ? 'call_duration_seconds' :
                           sortBy === 'event_type' ? 'event_type' :
                           sortBy === 'direction' ? 'direction' :
                           'timestamp_utc';
    sort[canonicalSortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const canonicalEvents = await EventCanonical.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await EventCanonical.countDocuments(filter);

    // Map canonical fields to legacy response shape for frontend compatibility
    const events = canonicalEvents.map(event => ({
      // Legacy fields (for frontend compatibility)
      startTime: event.timestamp_utc,
      endTime: null, // Not available in canonical schema
      eventType: event.event_type ? event.event_type.toUpperCase() : 'CALL',
      direction: event.direction ? event.direction.toUpperCase() : 'UNKNOWN',
      aParty: event.caller_number,
      bParty: event.receiver_number,
      durationSec: event.call_duration_seconds || 0,
      provider: event.service_provider,
      site: event.site,
      siteName: event.siteName,
      // Location fields (for modal display)
      lat: event.latitude,
      lng: event.longitude,
      cellId: event.cell_id,
      lacId: null, // Not in canonical schema
      imei: event.imei,
      imsi: event.imsi,
      // Source information
      source: {
        fileName: event.source_file,
        sheetName: event.source_sheet || null,
        rowNumber: event.source_row_number || null
      },
      // Normalization warnings
      normalizationWarnings: event.normalizationWarnings || [],
      // Additional canonical fields available if needed
      _canonical: {
        record_id: event.record_id,
        date: event.date,
        hour: event.hour,
        day_of_week: event.day_of_week,
        is_weekend: event.is_weekend,
        is_night: event.is_night,
        contact_pair_key: event.contact_pair_key,
        latitude: event.latitude,
        longitude: event.longitude,
        cell_id: event.cell_id,
        location_source: event.location_source,
        timestamp_local: event.timestamp_local,
        timestamp_utc: event.timestamp_utc,
        call_duration_seconds: event.call_duration_seconds,
        caller_number: event.caller_number,
        receiver_number: event.receiver_number,
        imei: event.imei,
        imsi: event.imsi,
        service_provider: event.service_provider
      }
    }));

    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      uploadId: uploadId || null // Return resolved uploadId
    });

  } catch (error) {
    console.error('Events query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;