import express from 'express';
import Event from '../models/Event.js';
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
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = req.query;

    // Resolve uploadId filter (string, not ObjectId)
    const uploadId = await resolveUploadId(req.query);
    
    // Build filter query
    const filter = {};

    // Add uploadId filter if specified (string, no conversion needed)
    if (uploadId) {
      filter.uploadId = uploadId;
    }

    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) {
        filter.startTime.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.startTime.$lte = new Date(endDate);
      }
    }

    if (number) {
      filter.$or = [
        { aParty: { $regex: number, $options: 'i' } },
        { bParty: { $regex: number, $options: 'i' } }
      ];
    }

    if (eventType && ['CALL', 'SMS'].includes(eventType.toUpperCase())) {
      filter.eventType = eventType.toUpperCase();
    }

    if (direction && ['INCOMING', 'OUTGOING', 'UNKNOWN'].includes(direction.toUpperCase())) {
      filter.direction = direction.toUpperCase();
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // CRITICAL: Both find and countDocuments MUST use the same filter
    const events = await Event.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Event.countDocuments(filter);

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
