/**
 * DATA QUALITY VALIDATION MODULE
 * 
 * Enforces data quality rules and generates structured quality reports.
 * Critical for investigation analytics where correctness matters.
 */

/**
 * Validate timestamp sanity
 */
export function validateTimestamp(timestamp) {
  const errors = [];
  const warnings = [];
  
  if (!timestamp) {
    errors.push('Missing timestamp');
    return { errors, warnings, isValid: false };
  }
  
  const ts = new Date(timestamp);
  const now = new Date();
  
  // Check for invalid date
  if (isNaN(ts.getTime())) {
    errors.push('Invalid timestamp (NaN)');
    return { errors, warnings, isValid: false };
  }
  
  // Check for future dates (more than 1 hour = likely error)
  const oneHourFromNow = new Date(now.getTime() + 3600000);
  if (ts > oneHourFromNow) {
    warnings.push(`Future timestamp detected: ${ts.toISOString()}`);
  }
  
  // Check for invalid epochs (before 2015)
  const minDate = new Date('2015-01-01');
  if (ts < minDate) {
    warnings.push(`Timestamp before 2015: ${ts.toISOString()}`);
  }
  
  // Check for very old dates (before 2000)
  const veryOldDate = new Date('2000-01-01');
  if (ts < veryOldDate) {
    errors.push(`Timestamp before 2000 (invalid epoch): ${ts.toISOString()}`);
    return { errors, warnings, isValid: false };
  }
  
  return { errors, warnings, isValid: true };
}

/**
 * Flag self-calls (A = B)
 */
export function detectSelfCall(caller, receiver) {
  if (!caller || !receiver) return null;
  
  if (caller === receiver) {
    return {
      isSelfCall: true,
      warning: 'Self-call detected (caller = receiver)'
    };
  }
  
  return { isSelfCall: false };
}

/**
 * Validate call duration
 */
export function validateDuration(durationSeconds, eventType) {
  const errors = [];
  const warnings = [];
  
  if (durationSeconds === null || durationSeconds === undefined) {
    // Duration can be null for SMS
    if (eventType === 'call') {
      warnings.push('Missing duration for call event');
    }
    return { errors, warnings, isValid: true };
  }
  
  if (typeof durationSeconds !== 'number') {
    errors.push(`Invalid duration type: ${typeof durationSeconds}`);
    return { errors, warnings, isValid: false };
  }
  
  if (durationSeconds < 0) {
    errors.push(`Negative duration: ${durationSeconds}`);
    return { errors, warnings, isValid: false };
  }
  
  // Impossible durations
  if (durationSeconds > 86400) { // More than 24 hours
    warnings.push(`Duration exceeds 24 hours: ${durationSeconds}s`);
  }
  
  if (durationSeconds > 3600 && eventType === 'sms') { // More than 1 hour for SMS
    warnings.push(`SMS with duration > 1 hour: ${durationSeconds}s`);
  }
  
  return { errors, warnings, isValid: true };
}

/**
 * Calculate normalization confidence score
 * Higher score = higher confidence in normalization
 */
export function calculateNormalizationConfidence(record) {
  let score = 100;
  const factors = [];
  
  // Deduct points for missing critical fields
  if (!record.timestamp_utc) {
    score -= 50;
    factors.push('missing_timestamp');
  }
  
  if (!record.caller_number && !record.receiver_number) {
    score -= 50;
    factors.push('missing_parties');
  }
  
  if (!record.caller_number || !record.receiver_number) {
    score -= 10;
    factors.push('missing_one_party');
  }
  
  if (!record.direction || record.direction === 'unknown') {
    score -= 15;
    factors.push('unknown_direction');
  }
  
  if (!record.event_type || record.event_type === 'unknown') {
    score -= 10;
    factors.push('unknown_event_type');
  }
  
  if (!record.latitude && !record.longitude && !record.cell_id) {
    score -= 5;
    factors.push('missing_location');
  }
  
  // Deduct for warnings
  if (record.normalizationWarnings && record.normalizationWarnings.length > 0) {
    score -= record.normalizationWarnings.length * 2;
    factors.push(`warnings:${record.normalizationWarnings.length}`);
  }
  
  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    factors,
    confidence: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low'
  };
}

/**
 * Validate a single record
 */
export function validateRecord(record) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    confidence: null
  };
  
  // Timestamp validation
  const tsValidation = validateTimestamp(record.timestamp_utc);
  validation.errors.push(...tsValidation.errors);
  validation.warnings.push(...tsValidation.warnings);
  if (!tsValidation.isValid) {
    validation.isValid = false;
  }
  
  // Self-call detection
  const selfCall = detectSelfCall(record.caller_number, record.receiver_number);
  if (selfCall?.isSelfCall) {
    validation.warnings.push(selfCall.warning);
  }
  
  // Duration validation
  const durationValidation = validateDuration(
    record.call_duration_seconds,
    record.event_type
  );
  validation.errors.push(...durationValidation.errors);
  validation.warnings.push(...durationValidation.warnings);
  if (!durationValidation.isValid) {
    validation.isValid = false;
  }
  
  // Normalization confidence
  const confidence = calculateNormalizationConfidence(record);
  validation.confidence = confidence;
  
  return validation;
}

/**
 * Generate data quality summary for a batch of records
 */
export function generateQualitySummary(records) {
  const summary = {
    totalRecords: records.length,
    validRecords: 0,
    invalidRecords: 0,
    errorCounts: {},
    warningCounts: {},
    confidenceDistribution: {
      high: 0,
      medium: 0,
      low: 0
    },
    selfCallCount: 0,
    missingLocationCount: 0,
    futureTimestampCount: 0,
    invalidDurationCount: 0
  };
  
  records.forEach(record => {
    const validation = validateRecord(record);
    
    if (validation.isValid) {
      summary.validRecords++;
    } else {
      summary.invalidRecords++;
    }
    
    // Count errors
    validation.errors.forEach(error => {
      summary.errorCounts[error] = (summary.errorCounts[error] || 0) + 1;
    });
    
    // Count warnings
    validation.warnings.forEach(warning => {
      summary.warningCounts[warning] = (summary.warningCounts[warning] || 0) + 1;
    });
    
    // Confidence distribution
    if (validation.confidence) {
      summary.confidenceDistribution[validation.confidence.confidence]++;
    }
    
    // Specific counts
    if (record.caller_number === record.receiver_number) {
      summary.selfCallCount++;
    }
    
    if (!record.latitude && !record.longitude && !record.cell_id) {
      summary.missingLocationCount++;
    }
    
    if (validation.warnings.some(w => w.includes('Future timestamp'))) {
      summary.futureTimestampCount++;
    }
    
    if (validation.errors.some(e => e.includes('duration'))) {
      summary.invalidDurationCount++;
    }
  });
  
  // Calculate percentages
  summary.validPercentage = summary.totalRecords > 0 
    ? ((summary.validRecords / summary.totalRecords) * 100).toFixed(2)
    : 0;
  
  summary.invalidPercentage = summary.totalRecords > 0
    ? ((summary.invalidRecords / summary.totalRecords) * 100).toFixed(2)
    : 0;
  
  return summary;
}
