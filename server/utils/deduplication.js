/**
 * DEDUPLICATION MODULE
 * 
 * Deterministically deduplicates records based on configurable criteria.
 * Critical for data correctness in investigation analytics.
 */

import crypto from 'crypto';

/**
 * Generate deterministic record fingerprint for reporting
 * Uses caller/receiver, event_type, 1-second timestamp bucket and rounded duration
 */
function generateFingerprint(record) {
  const ts = record.timestamp_utc ? new Date(record.timestamp_utc) : null;
  const timestampBucket = ts && !isNaN(ts.getTime())
    ? Math.floor(ts.getTime() / 1000) // 1-second buckets
    : null;

  const duration = typeof record.call_duration_seconds === 'number'
    ? Math.round(record.call_duration_seconds)
    : 0;

  const key = [
    record.caller_number || '',
    record.receiver_number || '',
    timestampBucket !== null ? timestampBucket : '',
    record.event_type || '',
    duration
  ].join('|');
  
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Deduplicate records deterministically
 * 
 * ASSUMPTION: Two records are duplicates if they have:
 * - Same caller and receiver (order matters for direction)
 * - Same timestamp (within 1 second tolerance)
 * - Same event type
 * - Same duration (within 1 second tolerance)
 * 
 * Strategy: Keep first occurrence, mark others as duplicates
 */
export function deduplicateRecords(records) {
  const duplicates = [];
  const isDuplicate = new Array(records.length).fill(false);

  // Group candidates by caller|receiver|event_type
  const groups = new Map();
  records.forEach((record, index) => {
    const key = [
      record.caller_number || '',
      record.receiver_number || '',
      record.event_type || ''
    ].join('|');

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ record, index });
  });

  // For each group, sort by timestamp and apply 1-second tolerance rules
  groups.forEach(groupItems => {
    const sorted = [...groupItems].sort((a, b) => {
      const ta = new Date(a.record.timestamp_utc).getTime();
      const tb = new Date(b.record.timestamp_utc).getTime();
      return ta - tb;
    });

    let lastKept = null;

    sorted.forEach(item => {
      const { record, index } = item;
      const ts = new Date(record.timestamp_utc);
      if (isNaN(ts.getTime())) {
        // Invalid timestamp: cannot safely deduplicate, always keep
        lastKept = item;
        return;
      }

      const duration = typeof record.call_duration_seconds === 'number'
        ? record.call_duration_seconds
        : 0;

      if (!lastKept) {
        lastKept = item;
        return;
      }

      const lastTs = new Date(lastKept.record.timestamp_utc);
      const lastDuration = typeof lastKept.record.call_duration_seconds === 'number'
        ? lastKept.record.call_duration_seconds
        : 0;

      const timeDiffSec = Math.abs(ts.getTime() - lastTs.getTime()) / 1000;
      const durationDiffSec = Math.abs(duration - lastDuration);

      if (timeDiffSec <= 1 && durationDiffSec <= 1) {
        // Within 1 second tolerance on both time and duration: treat as duplicate
        isDuplicate[index] = true;
        duplicates.push({
          record_id: record.record_id,
          original_index: index,
          duplicate_of: lastKept.record.record_id,
          fingerprint: generateFingerprint(record)
        });
      } else {
        // Not a duplicate; this becomes the new reference
        lastKept = item;
      }
    });
  });

  const deduplicated = records
    .map((record, index) => ({
      record,
      index
    }))
    .filter(item => !isDuplicate[item.index])
    .map(item => ({
      ...item.record,
      is_duplicate: false
    }));

  return {
    records: deduplicated,
    duplicates,
    duplicateCount: duplicates.length
  };
}

/**
 * Detect near-duplicates (fuzzy matching)
 * Useful for detecting records that are likely the same event with minor variations
 */
export function detectNearDuplicates(records, toleranceSeconds = 5) {
  const nearDuplicates = [];
  
  // Group by contact pair
  const contactGroups = new Map();
  
  records.forEach(record => {
    if (!record.contact_pair_key) return;
    
    if (!contactGroups.has(record.contact_pair_key)) {
      contactGroups.set(record.contact_pair_key, []);
    }
    
    contactGroups.get(record.contact_pair_key).push(record);
  });
  
  // Check each group for near-duplicates
  contactGroups.forEach((groupRecords, contactKey) => {
    // Sort by timestamp
    groupRecords.sort((a, b) => {
      return new Date(a.timestamp_utc) - new Date(b.timestamp_utc);
    });
    
    for (let i = 0; i < groupRecords.length - 1; i++) {
      const record1 = groupRecords[i];
      const record2 = groupRecords[i + 1];
      
      const time1 = new Date(record1.timestamp_utc);
      const time2 = new Date(record2.timestamp_utc);
      const timeDiff = Math.abs(time2 - time1) / 1000; // seconds
      
      // Same event type and within tolerance
      if (record1.event_type === record2.event_type && 
          timeDiff <= toleranceSeconds) {
        nearDuplicates.push({
          record1_id: record1.record_id,
          record2_id: record2.record_id,
          time_diff_seconds: timeDiff,
          contact_pair_key: contactKey
        });
      }
    }
  });
  
  return nearDuplicates;
}
