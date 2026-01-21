/**
 * ENRICHMENT MODULE
 * 
 * Computes derived analytics-ready fields that require cross-record analysis.
 * These fields enable advanced analytics like network analysis, anomaly detection, etc.
 */

/**
 * Compute contact first seen and last seen timestamps
 * Requires sorting records by timestamp
 */
export function enrichContactTimestamps(records) {
  // Group by contact_pair_key
  const contactMap = new Map();
  
  records.forEach(record => {
    if (!record.contact_pair_key) return;
    
    if (!contactMap.has(record.contact_pair_key)) {
      contactMap.set(record.contact_pair_key, {
        first_seen: record.timestamp_utc,
        last_seen: record.timestamp_utc,
        count: 0
      });
    }
    
    const contact = contactMap.get(record.contact_pair_key);
    contact.count++;
    
    const recordTime = new Date(record.timestamp_utc);
    const firstTime = new Date(contact.first_seen);
    const lastTime = new Date(contact.last_seen);
    
    if (recordTime < firstTime) {
      contact.first_seen = record.timestamp_utc;
    }
    if (recordTime > lastTime) {
      contact.last_seen = record.timestamp_utc;
    }
  });
  
  // Enrich records with contact timestamps
  return records.map(record => {
    if (!record.contact_pair_key) {
      return {
        ...record,
        contact_first_seen: null,
        contact_last_seen: null
      };
    }
    
    const contact = contactMap.get(record.contact_pair_key);
    return {
      ...record,
      contact_first_seen: contact.first_seen,
      contact_last_seen: contact.last_seen
    };
  });
}

/**
 * Compute daily event count per contact pair
 */
export function enrichDailyEventCount(records) {
  // Group by contact_pair_key and date
  const dailyCountMap = new Map();
  
  records.forEach(record => {
    if (!record.contact_pair_key || !record.date) return;
    
    const key = `${record.contact_pair_key}|${record.date}`;
    
    if (!dailyCountMap.has(key)) {
      dailyCountMap.set(key, 0);
    }
    
    dailyCountMap.set(key, dailyCountMap.get(key) + 1);
  });
  
  // Enrich records
  return records.map(record => {
    if (!record.contact_pair_key || !record.date) {
      return {
        ...record,
        daily_event_count: 0
      };
    }
    
    const key = `${record.contact_pair_key}|${record.date}`;
    const count = dailyCountMap.get(key) || 0;
    
    return {
      ...record,
      daily_event_count: count
    };
  });
}

/**
 * Compute rolling averages (7-day and 30-day)
 * ASSUMPTION: Rolling window is calculated backward from current record's date
 */
export function enrichRollingAverages(records) {
  // Sort by timestamp
  const sorted = [...records].sort((a, b) => {
    return new Date(a.timestamp_utc) - new Date(b.timestamp_utc);
  });
  
  // Group by contact_pair_key
  const contactGroups = new Map();
  
  sorted.forEach(record => {
    if (!record.contact_pair_key) return;
    
    if (!contactGroups.has(record.contact_pair_key)) {
      contactGroups.set(record.contact_pair_key, []);
    }
    
    contactGroups.get(record.contact_pair_key).push(record);
  });
  
  // Compute rolling averages for each contact
  contactGroups.forEach((contactRecords, contactKey) => {
    contactRecords.forEach((record, index) => {
      const recordDate = new Date(record.timestamp_utc);
      const sevenDaysAgo = new Date(recordDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(recordDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Count events in rolling windows
      let count7d = 0;
      let count30d = 0;
      
      for (let i = index; i >= 0; i--) {
        const prevRecord = contactRecords[i];
        const prevDate = new Date(prevRecord.timestamp_utc);
        
        if (prevDate >= sevenDaysAgo) {
          count7d++;
        }
        if (prevDate >= thirtyDaysAgo) {
          count30d++;
        } else {
          break; // No need to check older records
        }
      }
      
      // Calculate averages (events per day)
      record.rolling_7_day_avg = (count7d / 7).toFixed(2);
      record.rolling_30_day_avg = (count30d / 30).toFixed(2);
    });
  });
  
  // Enrich all records
  return records.map(record => {
    if (!record.contact_pair_key) {
      return {
        ...record,
        rolling_7_day_avg: 0,
        rolling_30_day_avg: 0
      };
    }
    
    const contactRecords = contactGroups.get(record.contact_pair_key);
    const recordIndex = contactRecords.findIndex(r => r.record_id === record.record_id);
    
    if (recordIndex >= 0) {
      return {
        ...record,
        rolling_7_day_avg: parseFloat(contactRecords[recordIndex].rolling_7_day_avg || 0),
        rolling_30_day_avg: parseFloat(contactRecords[recordIndex].rolling_30_day_avg || 0)
      };
    }
    
    return {
      ...record,
      rolling_7_day_avg: 0,
      rolling_30_day_avg: 0
    };
  });
}

/**
 * Group events into burst sessions
 * ASSUMPTION: Events within X minutes of each other belong to same burst session
 * Default X = 5 minutes (configurable)
 */
export function enrichBurstSessions(records, burstWindowMinutes = 5) {
  const burstWindowMs = burstWindowMinutes * 60 * 1000;

  // Prepare map of updated records keyed by record_id
  const updated = new Map(records.map(r => [r.record_id, { ...r, burst_session_id: null }]));

  // Group by contact_pair_key; burst sessions are scoped per contact pair
  const groups = new Map();
  records.forEach(record => {
    if (!record.contact_pair_key) {
      // Records without a contact_pair_key are not grouped into bursts
      return;
    }
    if (!groups.has(record.contact_pair_key)) {
      groups.set(record.contact_pair_key, []);
    }
    groups.get(record.contact_pair_key).push(record);
  });

  // For each contact_pair_key, sort by timestamp and assign burst sessions
  groups.forEach((groupRecords, contactKey) => {
    const sortedGroup = [...groupRecords].sort((a, b) => {
      return new Date(a.timestamp_utc) - new Date(b.timestamp_utc);
    });

    let sessionIndex = 1;
    let lastTimestamp = null;
    let currentSessionId = null;

    sortedGroup.forEach(record => {
      const recordTime = new Date(record.timestamp_utc);
      if (!lastTimestamp || (recordTime - lastTimestamp) > burstWindowMs) {
        // New burst session for this contact pair
        currentSessionId = `burst_${contactKey}_${sessionIndex++}`;
      }
      lastTimestamp = recordTime;

      const prev = updated.get(record.record_id) || record;
      updated.set(record.record_id, {
        ...prev,
        burst_session_id: currentSessionId
      });
    });
  });

  return records.map(r => {
    const enriched = updated.get(r.record_id) || r;
    // For records without contact_pair_key, keep burst_session_id as null
    if (!enriched.contact_pair_key) {
      return {
        ...enriched,
        burst_session_id: null
      };
    }
    return enriched;
  });
}

/**
 * Label baseline vs recent window
 * ASSUMPTION: 
 * - Baseline = earliest 70% of time range
 * - Recent = latest 30% of time range
 */
export function enrichBaselineWindow(records) {
  if (records.length === 0) return records;

  // Compute min and max timestamps based on timestamp_utc
  const validTimes = records
    .map(r => new Date(r.timestamp_utc))
    .filter(ts => !isNaN(ts.getTime()));

  if (validTimes.length === 0) {
    // No valid timestamps; leave labels unset
    return records;
  }

  const minTime = new Date(Math.min(...validTimes));
  const maxTime = new Date(Math.max(...validTimes));

  if (minTime.getTime() === maxTime.getTime()) {
    // All timestamps identical: mark everything as baseline
    return records.map(record => ({
      ...record,
      baseline_window_label: 'baseline'
    }));
  }

  const rangeMs = maxTime.getTime() - minTime.getTime();
  const cutoffTime = new Date(minTime.getTime() + rangeMs * 0.7);

  return records.map(record => {
    const recordTime = new Date(record.timestamp_utc);
    if (isNaN(recordTime.getTime())) {
      // If timestamp is invalid, treat as baseline (conservative)
      return {
        ...record,
        baseline_window_label: 'baseline'
      };
    }

    return {
      ...record,
      baseline_window_label: recordTime <= cutoffTime ? 'baseline' : 'recent'
    };
  });
}

/**
 * Apply all enrichment functions
 */
export function enrichRecords(records) {
  let enriched = [...records];
  
  // Step 1: Contact timestamps
  enriched = enrichContactTimestamps(enriched);
  
  // Step 2: Daily event count
  enriched = enrichDailyEventCount(enriched);
  
  // Step 3: Rolling averages
  enriched = enrichRollingAverages(enriched);
  
  // Step 4: Burst sessions
  enriched = enrichBurstSessions(enriched, 5); // 5 minute window
  
  // Step 5: Baseline window
  enriched = enrichBaselineWindow(enriched);
  
  return enriched;
}
