/**
 * CANONICAL EVENT MODEL
 * 
 * This model represents the normalized, analytics-ready schema for CDR events.
 * All fields are designed to support advanced analytics (network analysis, anomaly detection, etc.)
 */

import mongoose from 'mongoose';

const canonicalEventSchema = new mongoose.Schema({
  // Core identifiers
  record_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  source_file: {
    type: String,
    index: true
  },
  source_sheet: {
    type: String,
    index: true
  },
  source_row_number: {
    type: Number
  },
  
  // Event classification
  event_type: {
    type: String,
    enum: ['call', 'sms', 'data', 'unknown'],
    required: true,
    index: true
  },
  
  // Temporal fields
  timestamp_utc: {
    type: Date,
    required: true,
    index: true
  },
  timestamp_local: {
    type: Date
  },
  date: {
    type: String, // YYYY-MM-DD format
    index: true
  },
  hour: {
    type: Number, // 0-23
    index: true
  },
  day_of_week: {
    type: Number, // 0-6 (Sunday = 0)
    index: true
  },
  is_weekend: {
    type: Boolean,
    index: true
  },
  is_night: {
    type: Boolean,
    index: true
  },
  
  // Communication parties
  caller_number: {
    type: String,
    index: true
  },
  receiver_number: {
    type: String,
    index: true
  },
  direction: {
    type: String,
    enum: ['outgoing', 'incoming', 'internal', 'unknown'],
    required: true,
    index: true
  },
  call_duration_seconds: {
    type: Number,
    default: 0
  },
  contact_pair_key: {
    type: String,
    index: true
  },
  
  // Location data
  cell_id: {
    type: String,
    index: true
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  },
  location_source: {
    type: String,
    enum: ['cell_id', 'gps', 'unknown'],
    default: 'unknown'
  },
  
  // Device identifiers
  imei: {
    type: String
  },
  imsi: {
    type: String
  },
  
  // Provider
  service_provider: {
    type: String
  },
  
  // Derived analytics fields
  contact_first_seen: {
    type: Date
  },
  contact_last_seen: {
    type: Date
  },
  daily_event_count: {
    type: Number,
    default: 0
  },
  rolling_7_day_avg: {
    type: Number,
    default: 0
  },
  rolling_30_day_avg: {
    type: Number,
    default: 0
  },
  burst_session_id: {
    type: String,
    index: true
  },
  baseline_window_label: {
    type: String,
    enum: ['baseline', 'recent'],
    index: true
  },
  
  // Audit/debugging
  raw_record: {
    type: String // JSON blob
  },
  
  // Metadata
  uploadId: {
    type: String,
    required: true,
    index: true
  },
  ingestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  normalizationWarnings: [{
    type: String
  }],
  normalizationConfidence: {
    score: Number,
    confidence: String, // 'high', 'medium', 'low'
    factors: [String]
  },
  is_duplicate: {
    type: Boolean,
    default: false
  },
  
  // Legacy fields (for backward compatibility)
  aParty: String,
  bParty: String,
  startTime: Date,
  endTime: Date,
  site: String,
  siteName: String,
  siteMeta: String,
  lacId: String
}, {
  timestamps: false // We manage our own timestamps
});

// Compound indexes for common analytics queries
canonicalEventSchema.index({ uploadId: 1, timestamp_utc: 1 });
canonicalEventSchema.index({ contact_pair_key: 1, timestamp_utc: 1 });
canonicalEventSchema.index({ caller_number: 1, receiver_number: 1 });
canonicalEventSchema.index({ date: 1, event_type: 1 });
canonicalEventSchema.index({ burst_session_id: 1, timestamp_utc: 1 });
canonicalEventSchema.index({ baseline_window_label: 1, timestamp_utc: 1 });

const EventCanonical = mongoose.model('EventCanonical', canonicalEventSchema, 'events_canonical');

export default EventCanonical;
