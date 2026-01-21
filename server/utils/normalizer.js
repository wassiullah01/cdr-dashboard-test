/**
 * Normalization pipeline for CDR data
 * Handles varying schemas, header detection, and data cleaning
 */

// Known header synonyms mapping
export const HEADER_MAPPINGS = {
  startTime: ['Start Time', 'Date & Time', 'strt_tm', 'StartTime', 'timestamp', 'time', 'Start Date', 'Date'],
  endTime: ['End Time', 'end_tm', 'EndTime', 'End Date'],
  aParty: ['A Number', 'A-Party', 'msisdn', 'A Party', 'ANumber', 'A-Number', 'Calling Party'],
  bParty: ['B Number', 'B-Party', 'bnumber', 'B Party', 'BNumber', 'B-Number', 'Called Party'],
  eventType: ['Type', 'Call Type', 'call_type', 'Event Type', 'Service Type'],
  direction: ['Direction', 'Call Direction', 'dir', 'Call Dir'],
  duration: ['Duration', 'Call Duration', 'duration_sec', 'Call Length'],
  durationMins: ['mins', 'min', 'minutes', 'Minutes', 'Mins', 'Min'],
  durationSecs: ['secs', 'sec', 'seconds', 'Seconds', 'Secs', 'Sec'],
  cellId: ['Cell ID', 'Cell Id', 'cell_id', 'CellID', 'Cell', 'Cell Id', 'Cell Sector'],
  lacId: ['LAC', 'lac_id', 'lacId', 'Lac ID'],
  lat: ['Latitude', 'lat', 'Lat'],
  lng: ['Longitude', 'lng', 'lon', 'Lng', 'Long'],
  site: ['Site', 'site_address', 'Location', 'siteAddress', 'Cell Site', 'Location Name'],
  imei: ['IMEI', 'imei'],
  imsi: ['IMSI', 'imsi'],
  provider: ['Service Provider', 'provider', 'Provider', 'Network', 'Carrier']
};

// Keywords that indicate a header row
const HEADER_KEYWORDS = [
  'imei', 'imsi', 'a-party', 'b-party', 'a number', 'b number', 'msisdn',
  'date', 'time', 'duration', 'cell', 'lac', 'latitude', 'longitude',
  'site', 'location', 'provider', 'type', 'direction'
];

/**
 * Find the best header row in Excel data
 */
export function findHeaderRow(rows, maxScan = 30) {
  let bestRow = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    let score = 0;
    const rowLower = row.map(cell => String(cell || '').toLowerCase().trim());

    for (const keyword of HEADER_KEYWORDS) {
      if (rowLower.some(cell => cell.includes(keyword))) {
        score++;
      }
    }

    // Bonus for having multiple expected fields
    const uniqueFields = new Set(rowLower.filter(cell => cell.length > 0));
    score += uniqueFields.size * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  return bestRow;
}

/**
 * Normalize header names to canonical keys
 * Prioritizes exact matches over partial matches
 */
export function normalizeHeaders(headers) {
  const normalized = {};
  const headerLower = headers.map(h => String(h || '').toLowerCase().trim());

  for (const [canonical, synonyms] of Object.entries(HEADER_MAPPINGS)) {
    // First pass: look for exact matches (case-insensitive)
    let found = false;
    for (let i = 0; i < headers.length && !found; i++) {
      const header = headerLower[i];
      if (!header) continue;

      // Check for exact match first (highest priority)
      const exactMatch = synonyms.some(syn => header === syn.toLowerCase().trim());
      if (exactMatch) {
        normalized[canonical] = i;
        found = true;
        break;
      }
    }

    // Second pass: look for partial matches only if exact match not found
    if (!found) {
      for (let i = 0; i < headers.length; i++) {
        const header = headerLower[i];
        if (!header) continue;

        // Check if header matches any synonym (partial match)
        const matches = synonyms.some(syn => 
          header.includes(syn.toLowerCase()) ||
          syn.toLowerCase().includes(header)
        );

        if (matches && !normalized[canonical]) {
          normalized[canonical] = i;
          break;
        }
      }
    }
  }

  return normalized;
}

/**
 * Normalize phone number
 * Prevents scientific notation and ensures string format
 */
export function normalizePhone(value) {
  if (!value && value !== 0) return null;
  
  // Convert to string first, handling numbers that might be in scientific notation
  let phone = String(value).trim();
  
  // Check for scientific notation (e.g., 9.23838E+11)
  if (phone.includes('e+') || phone.includes('E+') || phone.includes('e-') || phone.includes('E-')) {
    // Try to convert from scientific notation
    const num = parseFloat(phone);
    if (!isNaN(num)) {
      // Convert to integer string if it's a whole number (phone numbers usually are)
      if (num % 1 === 0) {
        phone = String(Math.floor(num));
      } else {
        phone = String(num);
      }
    }
  }
  
  // Remove spaces, hyphens, but keep leading +
  phone = phone.replace(/[\s-]/g, '');
  
  // Remove decimal point if it's a whole number (e.g., "923895890631.0" -> "923895890631")
  if (phone.includes('.') && phone.split('.')[1] === '0') {
    phone = phone.split('.')[0];
  }
  
  return phone || null;
}

/**
 * Parse date from various formats including Excel serial dates
 * Handles: Date objects, Excel serial numbers (with time), DD/MM/YYYY and MM/DD/YYYY strings
 */
export function parseDate(value) {
  if (!value && value !== 0) return null;

  // Handle Date objects (from SheetJS with cellDates:true)
  if (value instanceof Date) {
    const date = value;
    if (isNaN(date.getTime())) return null;
    // Validate reasonable date range (2015-2030 for CDR data)
    const year = date.getFullYear();
    if (year < 2015 || year > 2030) {
      return null; // Invalid date range
    }
    return date;
  }

  // Handle Excel serial dates (numeric values)
  // Excel serial date: number of days since December 30, 1899
  // Fractional part represents time (e.g., 45223.5 = noon on that day)
  if (typeof value === 'number' && value > 0) {
    // Check if it looks like an Excel serial date (typically between 1 and 100000)
    if (value < 100000 && value > 1) {
      // Excel epoch: December 30, 1899 (month 11 = December, day 30)
      const excelEpoch = new Date(1899, 11, 30);
      
      // Extract days (integer part) and time (fractional part)
      const days = Math.floor(value);
      const timeFraction = value - days;
      
      // Calculate date: epoch + (days - 1) days + time fraction
      // Note: Excel counts from day 1, so we subtract 1
      const milliseconds = excelEpoch.getTime() + (days - 1) * 24 * 60 * 60 * 1000;
      const timeMs = timeFraction * 24 * 60 * 60 * 1000;
      const date = new Date(milliseconds + timeMs);
      
      if (!isNaN(date.getTime())) {
        // Validate reasonable date range
        const year = date.getFullYear();
        if (year >= 2015 && year <= 2030) {
          return date;
        }
      }
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try explicit date formats with time
  // Format 1: DD/MM/YYYY HH:mm:ss or DD/MM/YYYY HH:mm
  const ddmmFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?/i;
  // Format 2: MM/DD/YYYY HH:mm:ss or MM/DD/YYYY HH:mm
  const mmddFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(AM|PM))?/i;
  // Format 3: YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm
  const isoFormat = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/;

  // Try DD/MM/YYYY first (common in international datasets)
  let match = str.match(ddmmFormat);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hour = parseInt(match[4], 10);
    let minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7];

    // Handle AM/PM
    if (ampm) {
      const isPM = ampm.toUpperCase() === 'PM';
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }

    // Validate: if day > 12, it must be DD/MM (not MM/DD)
    // If month > 12, it must be DD/MM (not MM/DD)
    if (day <= 31 && month < 12 && year >= 2015 && year <= 2030) {
      const date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try MM/DD/YYYY (US format) - only if day <= 12 (ambiguous otherwise)
  match = str.match(mmddFormat);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    let hour = parseInt(match[4], 10);
    let minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7];

    // Handle AM/PM
    if (ampm) {
      const isPM = ampm.toUpperCase() === 'PM';
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
    }

    // Only use MM/DD if day <= 12 (to avoid ambiguity)
    // If day > 12, we already tried DD/MM above
    if (day <= 12 && month < 12 && year >= 2015 && year <= 2030) {
      const date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try ISO format YYYY-MM-DD
  match = str.match(isoFormat);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;

    if (year >= 2015 && year <= 2030) {
      const date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try date-only formats (without time)
  const dateOnlyDDMM = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  match = str.match(dateOnlyDDMM);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    if (day <= 31 && month < 12 && year >= 2015 && year <= 2030) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Fallback: try Date constructor (may work for some formats)
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    // Only accept if in reasonable range
    if (year >= 2015 && year <= 2030) {
      return date;
    }
  }

  return null; // All parsing attempts failed
}

/**
 * Parse duration in seconds from various formats
 */
export function parseDuration(value) {
  if (!value) return 0;

  // Already a number
  if (typeof value === 'number') {
    return Math.max(0, value);
  }

  const str = String(value).trim();
  if (!str) return 0;

  // Try "mm:ss" or "hh:mm:ss" format
  const timeMatch = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (timeMatch) {
    const hours = timeMatch[3] ? parseInt(timeMatch[1], 10) : 0;
    const minutes = timeMatch[3] ? parseInt(timeMatch[2], 10) : parseInt(timeMatch[1], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : parseInt(timeMatch[2], 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  // Try plain number (assume seconds)
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Determine event type from value
 */
export function parseEventType(value) {
  if (!value) return 'CALL'; // Default
  const str = String(value).toUpperCase();
  if (str.includes('SMS') || str.includes('MESSAGE')) {
    return 'SMS';
  }
  if (str.includes('CALL') || str.includes('VOICE')) {
    return 'CALL';
  }
  return 'CALL'; // Default
}

/**
 * Determine direction from value using strict word boundary matching
 * Avoids false matches like "INTERNET" being classified as "IN"
 */
export function parseDirection(value) {
  if (!value) return 'UNKNOWN';
  const str = String(value).trim();
  if (!str) return 'UNKNOWN';
  
  // Convert to lowercase for comparison
  const lower = str.toLowerCase();
  
  // Use word boundaries to match "incoming" or "outgoing" as complete words
  // Also handle common variations
  const incomingPatterns = [
    /^incoming$/i,
    /^in$/i,
    /^incoming\s/i,
    /\bincoming\b/i
  ];
  
  const outgoingPatterns = [
    /^outgoing$/i,
    /^out$/i,
    /^outgoing\s/i,
    /\boutgoing\b/i
  ];
  
  // Check for explicit "incoming" or "outgoing" first (higher priority)
  for (const pattern of incomingPatterns) {
    if (pattern.test(str)) {
      return 'INCOMING';
    }
  }
  
  for (const pattern of outgoingPatterns) {
    if (pattern.test(str)) {
      return 'OUTGOING';
    }
  }
  
  // Only check for "in" or "out" as standalone words if explicit patterns didn't match
  // This prevents "INTERNET" from matching "IN"
  if (/^in$/i.test(str) || /\bin\b/i.test(str)) {
    // Additional check: make sure it's not part of another word
    if (!lower.includes('internet') && !lower.includes('internal') && !lower.includes('input')) {
      return 'INCOMING';
    }
  }
  
  if (/^out$/i.test(str) || /\bout\b/i.test(str)) {
    // Additional check: make sure it's not part of another word
    if (!lower.includes('without') && !lower.includes('about') && !lower.includes('route')) {
      return 'OUTGOING';
    }
  }
  
  return 'UNKNOWN';
}

/**
 * Normalize a single row to canonical schema
 */
export function normalizeRow(row, headers, source) {
  const normalized = normalizeHeaders(headers);
  const result = {
    eventType: 'CALL',
    direction: 'UNKNOWN',
    aParty: null,
    bParty: null,
    startTime: null,
    endTime: null,
    durationSec: 0,
    imei: null,
    imsi: null,
    cellId: null,
    lacId: null,
    lat: null,
    lng: null,
    site: null,
    provider: null,
    source: {
      fileName: source.fileName,
      sheetName: source.sheetName || null,
      rowNumber: source.rowNumber
    },
    ingestedAt: new Date()
  };

  // Extract values using normalized header indices
  const getValue = (key) => {
    const idx = normalized[key];
    return idx !== undefined && idx < row.length ? row[idx] : null;
  };

  // Parse startTime (required)
  const startTimeValue = getValue('startTime');
  result.startTime = parseDate(startTimeValue);
  if (!result.startTime) {
    return { error: 'Missing or invalid startTime' };
  }

  // Parse endTime
  const endTimeValue = getValue('endTime');
  result.endTime = parseDate(endTimeValue);

  // Parse aParty and bParty (at least one required)
  result.aParty = normalizePhone(getValue('aParty'));
  result.bParty = normalizePhone(getValue('bParty'));
  if (!result.aParty && !result.bParty) {
    return { error: 'Missing both aParty and bParty' };
  }

  // Parse direction with correct priority:
  // 1. Dedicated Direction column takes precedence
  // 2. Only derive from eventType if direction column is missing/empty
  const dirValue = getValue('direction');
  if (dirValue && String(dirValue).trim()) {
    // Dedicated direction column exists and has value - use it
    result.direction = parseDirection(dirValue);
  } else {
    // No dedicated direction column, try to derive from eventType
    const typeValue = getValue('eventType');
    if (typeValue) {
      result.direction = parseDirection(typeValue);
    }
  }

  // Parse eventType (independent of direction)
  const typeValue = getValue('eventType');
  if (typeValue) {
    result.eventType = parseEventType(typeValue);
  }

  // Parse duration - check for mins/secs if duration field is missing/0
  const durationValue = getValue('duration');
  const durationMinsValue = getValue('durationMins');
  const durationSecsValue = getValue('durationSecs');
  
  result.durationSec = parseDuration(durationValue);
  
  // If duration is 0 or missing, try to compute from mins + secs
  if (result.durationSec === 0 && (durationMinsValue || durationSecsValue)) {
    const mins = parseDuration(durationMinsValue || '0');
    const secs = parseDuration(durationSecsValue || '0');
    result.durationSec = (mins * 60) + secs;
  }

  // Parse optional fields
  const imeiValue = getValue('imei');
  if (imeiValue) result.imei = String(imeiValue).trim() || null;

  const imsiValue = getValue('imsi');
  if (imsiValue) result.imsi = String(imsiValue).trim() || null;

  const cellIdValue = getValue('cellId');
  if (cellIdValue) result.cellId = String(cellIdValue).trim() || null;

  const lacIdValue = getValue('lacId');
  if (lacIdValue) result.lacId = String(lacIdValue).trim() || null;

  const latValue = getValue('lat');
  if (latValue) {
    const lat = parseFloat(latValue);
    if (!isNaN(lat)) result.lat = lat;
  }

  const lngValue = getValue('lng');
  if (lngValue) {
    const lng = parseFloat(lngValue);
    if (!isNaN(lng)) result.lng = lng;
  }

  // Parse site with priority: exact "Site" column first, then other synonyms
  let siteValue = null;
  
  // Priority 1: Check for exact "Site" column (case-insensitive)
  const siteHeaderIdx = headers.findIndex(h => String(h || '').trim().toLowerCase() === 'site');
  if (siteHeaderIdx >= 0 && siteHeaderIdx < row.length) {
    const exactSiteValue = row[siteHeaderIdx];
    if (exactSiteValue && String(exactSiteValue).trim()) {
      siteValue = String(exactSiteValue).trim();
    }
  }
  
  // Priority 2: Fall back to normalized header mapping if exact match not found
  if (!siteValue) {
    siteValue = getValue('site');
    if (siteValue) siteValue = String(siteValue).trim();
  }
  
  // Parse site format if it contains pipe-separated values
  if (siteValue) {
    result.site = siteValue; // Keep full original string for investigation value
    
    // Parse pipe-separated format: "name|lat|lng|meta"
    if (siteValue.includes('|')) {
      const parts = siteValue.split('|').map(p => p.trim()).filter(p => p);
      
      // Extract site name (part before first pipe, or first part)
      if (parts.length > 0) {
        result.siteName = parts[0]; // Store name separately for cleaner display
      }
      
      // Extract lat/lng if missing and available in site string
      if (!result.lat && parts.length > 1) {
        const latFromSite = parseFloat(parts[1]);
        if (!isNaN(latFromSite)) {
          result.lat = latFromSite;
        }
      }
      
      if (!result.lng && parts.length > 2) {
        const lngFromSite = parseFloat(parts[2]);
        if (!isNaN(lngFromSite)) {
          result.lng = lngFromSite;
        }
      }
      
      // Store remaining metadata (e.g., "27BF8CD5") if present
      if (parts.length > 3) {
        result.siteMeta = parts.slice(3).join('|'); // Keep any additional parts
      }
    } else {
      // No pipe format, use as-is
      result.siteName = siteValue;
    }
  } else {
    result.site = null;
    result.siteName = null;
  }

  const providerValue = getValue('provider');
  if (providerValue) result.provider = String(providerValue).trim() || null;

  // Data quality warnings
  const warnings = [];
  
  // Check for short codes (common in SMS)
  if (result.aParty && result.aParty.length < 8) {
    warnings.push('aParty_short_code');
  }
  if (result.bParty && result.bParty.length < 8) {
    warnings.push('bParty_short_code');
  }
  
  // Check for scientific notation in phone numbers (should be caught by normalizePhone, but log if found)
  const aPartyStr = String(result.aParty || '');
  const bPartyStr = String(result.bParty || '');
  if (aPartyStr.includes('e+') || aPartyStr.includes('E+')) {
    warnings.push('aParty_scientific_notation_source');
  }
  if (bPartyStr.includes('e+') || bPartyStr.includes('E+')) {
    warnings.push('bParty_scientific_notation_source');
  }
  
  // Check for missing site
  if (!result.site) {
    warnings.push('missing_site');
  }
  
  // Add warnings to result if any
  if (warnings.length > 0) {
    result.normalizationWarnings = warnings;
  }
  
  // Mark short codes
  if (warnings.some(w => w.includes('short_code'))) {
    result.isShortCode = true;
  }

  return result;
}
