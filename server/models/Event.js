import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['CALL', 'SMS'],
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['INCOMING', 'OUTGOING', 'UNKNOWN'],
    required: true,
    index: true
  },
  aParty: {
    type: String,
    index: true,
    required: false
  },
  bParty: {
    type: String,
    index: true,
    required: false
  },
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    default: null
  },
  durationSec: {
    type: Number,
    default: 0
  },
  imei: {
    type: String,
    default: null
  },
  imsi: {
    type: String,
    default: null
  },
  cellId: {
    type: String,
    default: null
  },
  lacId: {
    type: String,
    default: null
  },
  lat: {
    type: Number,
    default: null
  },
  lng: {
    type: Number,
    default: null
  },
  site: {
    type: String,
    default: null
  },
  siteName: {
    type: String,
    default: null
  },
  siteMeta: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    default: null
  },
  source: {
    fileName: String,
    sheetName: String,
    rowNumber: Number
  },
  ingestedAt: {
    type: Date,
    default: Date.now
  },
  uploadId: {
    type: String,
    required: true,
    index: true
  },
  isShortCode: {
    type: Boolean,
    default: false
  },
  normalizationWarnings: [{
    type: String
  }]
});

// Compound indexes for common queries
eventSchema.index({ startTime: 1, eventType: 1 });
eventSchema.index({ aParty: 1, bParty: 1 });
eventSchema.index({ startTime: 1, aParty: 1 });
eventSchema.index({ uploadId: 1, startTime: 1 }); // For session-scoped queries

const Event = mongoose.model('Event', eventSchema, 'events');

export default Event;
