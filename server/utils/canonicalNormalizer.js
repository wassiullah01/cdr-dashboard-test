/**
 * CANONICAL SCHEMA NORMALIZER
 * 
 * Produces a single normalized dataset with mandatory fields for analytics.
 * This is the foundation layer for advanced analytics (network analysis, anomaly detection, etc.)
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { DateTime } from 'luxon';
import { normalizePhone, parseDate, parseDuration, parseEventType, parseDirection } from './normalizer.js';

/**
 * Generate contact pair key (sorted hash of both numbers)
 * Ensures A-B and B-A produce the same key
 */
function generateContactPairKey(caller, receiver) {
  if (!caller || !receiver) return null;
  
  // Sort numbers to ensure consistent key regardless of direction
  const sorted = [caller, receiver].sort();
  const pair = `${sorted[0]}|${sorted[1]}`;
  
  // Generate deterministic hash
  return crypto.createHash('sha256').update(pair).digest('hex').substring(0, 16);
}

/**
 * Determine location source
 */
function determineLocationSource(lat, lng, cellId) {
  if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
    return 'gps';
  }
  if (cellId) {
    return 'cell_id';
  }
  return 'unknown';
}

/**
 * Determine if timestamp is in night hours
 * ASSUMPTION: Night hours are 22:00 (10 PM) to 06:00 (6 AM) local time (Asia/Karachi)
 * Uses Luxon to ensure correct local timezone interpretation.
 */
function isNightHour(timestamp) {
  if (!timestamp) return false;
  const dt = DateTime.fromJSDate(timestamp, { zone: 'Asia/Karachi' });
  if (!dt.isValid) return false;
  const hour = dt.hour;
  return hour >= 22 || hour < 6;
}

/**
 * Get day of week (0 = Sunday, 6 = Saturday) based on LOCAL time (Asia/Karachi)
 * Uses Luxon to ensure correct local timezone interpretation.
 */
function getDayOfWeek(timestamp) {
  if (!timestamp) return null;
  const dt = DateTime.fromJSDate(timestamp, { zone: 'Asia/Karachi' });
  if (!dt.isValid) return null;
  return dt.weekday % 7; // Luxon weekday: 1=Monday, 7=Sunday. Convert to 0=Sunday, 6=Saturday
}

/**
 * Check if date is weekend based on LOCAL time (Asia/Karachi)
 * Uses Luxon to ensure correct local timezone interpretation.
 */
function isWeekend(timestamp) {
  if (!timestamp) return false;
  const day = getDayOfWeek(timestamp);
  return day === 0 || day === 6; // Sunday or Saturday
}

/**
 * Extract date part (YYYY-MM-DD) based on LOCAL time (Asia/Karachi)
 * Uses Luxon to ensure correct local calendar date.
 */
function extractDate(timestamp) {
  if (!timestamp) return null;
  const dt = DateTime.fromJSDate(timestamp, { zone: 'Asia/Karachi' });
  if (!dt.isValid) return null;
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * Extract hour (0-23) based on LOCAL time (Asia/Karachi)
 * Uses Luxon to ensure correct local hour.
 */
function extractHour(timestamp) {
  if (!timestamp) return null;
  const dt = DateTime.fromJSDate(timestamp, { zone: 'Asia/Karachi' });
  if (!dt.isValid) return null;
  return dt.hour;
}

/**
 * Determine caller and receiver based on direction
 * ASSUMPTION: 
 * - OUTGOING: aParty is caller, bParty is receiver
 * - INCOMING: bParty is caller (from network perspective), aParty is receiver
 * - INTERNAL: Both parties are in same network (A = caller, B = receiver by convention)
 * - UNKNOWN: We DO NOT flip based on guesses; aParty is treated as caller, bParty as receiver
 */
function determineCallerReceiver(aParty, bParty, direction) {
  if (!aParty && !bParty) {
    return { caller: null, receiver: null };
  }
  
  switch (direction?.toUpperCase()) {
    case 'OUTGOING':
      return { caller: aParty, receiver: bParty };
    case 'INCOMING':
      // From network perspective: incoming means B called A
      return { caller: bParty, receiver: aParty };
    case 'INTERNAL':
      // Internal call: A is caller by convention
      return { caller: aParty, receiver: bParty };
    case 'UNKNOWN':
    default:
      // For unknown direction we do NOT flip; treat aParty as caller, bParty as receiver
      return { caller: aParty, receiver: bParty };
  }
}

/**
 * Normalize event type to canonical values
 */
function normalizeEventType(value) {
  const normalized = parseEventType(value);
  // Map to canonical values: call | sms | data | unknown
  switch (normalized?.toUpperCase()) {
    case 'CALL':
      return 'call';
    case 'SMS':
      return 'sms';
    case 'DATA':
      return 'data';
    default:
      return 'unknown';
  }
}

/**
 * Normalize direction to canonical values
 */
function normalizeDirection(value, aParty, bParty) {
  const parsed = parseDirection(value);
  
  // Check for internal calls (same number)
  if (aParty && bParty && aParty === bParty) {
    return 'internal';
  }
  
  // Map to canonical values: outgoing | incoming | internal | unknown
  switch (parsed?.toUpperCase()) {
    case 'OUTGOING':
      return 'outgoing';
    case 'INCOMING':
      return 'incoming';
    case 'INTERNAL':
      return 'internal';
    default:
      return 'unknown';
  }
}

/**
 * Compute timestamp_utc and timestamp_local from raw startTime.
 * 
 * Rules:
 * - If startTime has explicit timezone (e.g. ends with 'Z' or '+05:00'), respect it.
 * - Otherwise, treat it as LOCAL time in Asia/Karachi and convert to UTC.
 * - Derived fields (date/hour/day_of_week/is_weekend/is_night) use LOCAL time.
 */
function computeTimestamps(startTime) {
  if (!startTime) {
    return { error: 'Missing startTime' };
  }

  // If we get a Date, interpret its wall-clock fields as Asia/Karachi local time
  const buildFromDate = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) {
      return { error: 'Invalid startTime (Date)' };
    }
    const local = DateTime.fromObject(
      {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: d.getHours(),
        minute: d.getMinutes(),
        second: d.getSeconds(),
        millisecond: d.getMilliseconds()
      },
      { zone: 'Asia/Karachi' }
    );
    if (!local.isValid) {
      return { error: 'Invalid startTime (local Asia/Karachi)' };
    }
    return {
      timestamp_local: local.toJSDate(),
      timestamp_utc: local.toUTC().toJSDate()
    };
  };

  if (startTime instanceof Date) {
    return buildFromDate(startTime);
  }

  if (typeof startTime === 'number') {
    // Treat as epoch milliseconds in Asia/Karachi local time
    const local = DateTime.fromMillis(startTime, { zone: 'Asia/Karachi' });
    if (!local.isValid) {
      return { error: 'Invalid startTime (number)' };
    }
    return {
      timestamp_local: local.toJSDate(),
      timestamp_utc: local.toUTC().toJSDate()
    };
  }

  if (typeof startTime === 'string') {
    let dt;
    const hasExplicitZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(startTime);
    if (hasExplicitZone) {
      // Respect explicit timezone information
      dt = DateTime.fromISO(startTime, { setZone: true });
    } else {
      // Assume local Asia/Karachi when no explicit timezone
      dt = DateTime.fromISO(startTime, { zone: 'Asia/Karachi' });
    }

    if (!dt.isValid) {
      return { error: 'Invalid startTime (unparseable string)' };
    }

    const local = dt.setZone('Asia/Karachi');
    return {
      timestamp_local: local.toJSDate(),
      timestamp_utc: local.toUTC().toJSDate()
    };
  }

  return { error: 'Unsupported startTime type' };
}

/**
 * Create canonical normalized record
 * 
 * @param {Object} rawRecord - Raw normalized record from normalizer.js
 * @param {Object} source - Source metadata
 * @returns {Object} Canonical normalized record
 */
export function createCanonicalRecord(rawRecord, source) {
  const recordId = uuidv4();

  const tsResult = computeTimestamps(rawRecord.startTime);
  if (tsResult.error) {
    // Surface a clear error up to the ingestion pipeline
    throw new Error(tsResult.error);
  }

  const timestampUtc = tsResult.timestamp_utc;
  const timestampLocal = tsResult.timestamp_local;
  
  // Determine caller/receiver based on direction
  const direction = normalizeDirection(rawRecord.direction, rawRecord.aParty, rawRecord.bParty);
  const { caller, receiver } = determineCallerReceiver(rawRecord.aParty, rawRecord.bParty, direction);
  
  // Generate contact pair key
  const contactPairKey = generateContactPairKey(caller, receiver);
  
  // Extract temporal fields (using LOCAL time)
  const date = extractDate(timestampLocal);
  const hour = extractHour(timestampLocal);
  const dayOfWeek = getDayOfWeek(timestampLocal);
  
  // Determine location source
  const locationSource = determineLocationSource(rawRecord.lat, rawRecord.lng, rawRecord.cellId);
  
  // Create raw record JSON blob for audit/debugging
  const rawRecordJson = JSON.stringify({
    original: rawRecord,
    source: source
  });
  
  // Build canonical record
  const canonical = {
    // Core identifiers
    record_id: recordId,
    source_file: source.fileName || null,
    
    // Event classification
    event_type: normalizeEventType(rawRecord.eventType),
    
    // Temporal fields
    timestamp_utc: timestampUtc,
    timestamp_local: timestampLocal,
    date: date,
    hour: hour,
    day_of_week: dayOfWeek,
    is_weekend: isWeekend(timestampLocal),
    is_night: isNightHour(timestampLocal),
    
    // Communication parties
    caller_number: caller,
    receiver_number: receiver,
    direction: direction,
    call_duration_seconds: rawRecord.durationSec || 0,
    contact_pair_key: contactPairKey,
    
    // Location data
    cell_id: rawRecord.cellId || null,
    latitude: rawRecord.lat || null,
    longitude: rawRecord.lng || null,
    location_source: locationSource,
    
    // Device identifiers
    imei: rawRecord.imei || null,
    imsi: rawRecord.imsi || null,
    
    // Provider
    service_provider: rawRecord.provider || null,
    
    // Audit/debugging
    raw_record: rawRecordJson,
    
    // Metadata (preserved for compatibility)
    uploadId: rawRecord.uploadId || null,
    ingestedAt: rawRecord.ingestedAt || new Date(),
    normalizationWarnings: rawRecord.normalizationWarnings || [],
    
    // Legacy fields (for backward compatibility during transition)
    aParty: rawRecord.aParty,
    bParty: rawRecord.bParty,
    startTime: rawRecord.startTime,
    endTime: rawRecord.endTime,
    site: rawRecord.site,
    siteName: rawRecord.siteName,
    siteMeta: rawRecord.siteMeta,
    lacId: rawRecord.lacId
  };

  // Direction safety note: if direction is unknown, we assumed aParty as caller.
  if (direction === 'unknown' && (rawRecord.aParty || rawRecord.bParty)) {
    canonical.normalizationWarnings.push('Unknown direction; assumed aParty as caller.');
  }
  
  return canonical;
}

/**
 * Validate canonical record
 * Returns validation errors and warnings
 */
export function validateCanonicalRecord(record) {
  const errors = [];
  const warnings = [];
  
  // Timestamp validation
  if (!record.timestamp_utc) {
    errors.push('Missing timestamp_utc');
  } else {
    const ts = new Date(record.timestamp_utc);
    const now = new Date();
    
    // Check for future dates (more than 1 hour in future = likely error)
    if (ts > new Date(now.getTime() + 3600000)) {
      warnings.push('Future timestamp detected');
    }
    
    // Check for invalid epochs (before 2015)
    if (ts < new Date('2015-01-01')) {
      warnings.push('Timestamp before 2015 (unlikely for CDR data)');
    }
  }
  
  // Self-call detection
  if (record.caller_number && record.receiver_number && 
      record.caller_number === record.receiver_number) {
    warnings.push('Self-call detected (caller = receiver)');
  }
  
  // Duration validation
  if (record.call_duration_seconds < 0) {
    errors.push('Negative duration');
  }
  if (record.call_duration_seconds > 86400) { // More than 24 hours
    warnings.push('Duration exceeds 24 hours (unlikely for single call)');
  }
  
  // Missing parties
  if (!record.caller_number && !record.receiver_number) {
    errors.push('Missing both caller and receiver');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
