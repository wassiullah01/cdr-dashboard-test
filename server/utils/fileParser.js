import XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { findHeaderRow, normalizeRow } from './normalizer.js';

/** Parse CSV file using csv-parse */
export function parseCSV(buffer, fileName) {
  const results = [];
  const errors = [];

  try {
    const text = buffer.toString('utf-8');
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });

    if (records.length === 0) {
      return { results, errors: [{ reason: 'No data rows found', rowNumber: 0 }] };
    }

    // Get headers from first record keys
    const headers = Object.keys(records[0]);

    records.forEach((record, index) => {
      const row = headers.map(h => record[h] || '');
      const normalized = normalizeRow(row, headers, {
        fileName,
        sheetName: null,
        rowNumber: index + 2 // +2 because header is row 1, data starts at row 2
      });

      if (normalized.error) {
        errors.push({
          rowNumber: index + 2,
          reason: normalized.error
        });
      } else {
        results.push(normalized);
      }
    });

  } catch (error) {
    errors.push({
      rowNumber: 0,
      reason: `CSV parsing error: ${error.message}`
    });
  }

  return { results, errors };
}

/** Parse Excel file (XLS/XLSX) */
export function parseExcel(buffer, fileName) {
  const results = [];
  const errors = [];

  try {
    // Read Excel with options to preserve phone numbers as strings and handle dates
    const workbook = XLSX.read(buffer, { 
      type: 'buffer', 
      cellDates: true,  // Parse dates properly
      cellNF: false,   // Don't parse number formats
      cellStyles: false,
      sheetStubs: false
    });

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON array format with raw values
      // We'll process phone numbers after identifying headers
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true  // Get raw values to preserve phone numbers
      });

      if (rawData.length === 0) {
        errors.push({
          rowNumber: 0,
          reason: `Sheet "${sheetName}" is empty`,
          fileName,
          sheetName
        });
        return;
      }

      // Find header row first
      const headerRowIndex = findHeaderRow(rawData);
      const headers = rawData[headerRowIndex] || [];

      // Identify phone number columns based on headers BEFORE processing rows
      const phoneColumnIndices = new Set();
      headers.forEach((header, idx) => {
        const headerStr = String(header || '').trim().toLowerCase();
        if (headerStr && (headerStr.includes('number') || headerStr.includes('party') || headerStr.includes('msisdn'))) {
          phoneColumnIndices.add(idx);
        }
      });
      
      // Process ALL rows (including header) to convert phone number columns to strings
      rawData.forEach((row) => {
        if (Array.isArray(row)) {
          row.forEach((cell, colIdx) => {
            if (phoneColumnIndices.has(colIdx)) {
              // Convert phone number columns to strings, preventing scientific notation
              if (typeof cell === 'number') {
                // Large numbers that might be phone numbers - convert to string without scientific notation
                if (cell > 1000000000 || cell < -1000000000) {
                  // Use toFixed(0) to avoid scientific notation for large integers
                  row[colIdx] = cell.toFixed(0);
                } else {
                  row[colIdx] = String(cell);
                }
              } else if (cell !== null && cell !== undefined) {
                row[colIdx] = String(cell);
              } else {
                row[colIdx] = '';
              }
            } else if (cell !== null && cell !== undefined && typeof cell !== 'string') {
              // Convert other non-string cells to strings for consistency
              row[colIdx] = String(cell);
            } else if (cell === null || cell === undefined) {
              row[colIdx] = '';
            }
          });
        }
      });

      // Now get headers again after processing (they may have been converted)
      const processedHeaders = rawData[headerRowIndex] || [];

      // Filter out empty columns and "Unnamed" columns
      const validHeaderIndices = [];
      const cleanedHeaders = [];

      processedHeaders.forEach((header, idx) => {
        const headerStr = String(header || '').trim();
        if (headerStr && !headerStr.startsWith('Unnamed:')) {
          validHeaderIndices.push(idx);
          cleanedHeaders.push(headerStr);
        }
      });

      if (cleanedHeaders.length === 0) {
        errors.push({
          rowNumber: headerRowIndex + 1,
          reason: `No valid headers found in sheet "${sheetName}"`,
          fileName,
          sheetName
        });
        return;
      }
      
          // Verify Site column is present and at correct index
          const siteColumnIndex = cleanedHeaders.findIndex(h => String(h || '').trim().toLowerCase() === 'site');
          const originalSiteIndex = processedHeaders.findIndex(h => String(h || '').trim().toLowerCase() === 'site');
          
          if (originalSiteIndex >= 0 && siteColumnIndex < 0) {
            console.error(`[ERROR] Site column was dropped during cleaning for ${fileName}! Original index: ${originalSiteIndex}`);
          }
      
      // Process data rows (skip header row and any rows before it)
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const rawRow = rawData[i];
        
        // Skip completely empty rows
        if (!rawRow || rawRow.every(cell => !cell || String(cell).trim() === '')) {
          continue;
        }

        // Map row to cleaned headers using SAME validHeaderIndices for consistency
        // This ensures columns don't shift when "Unnamed" columns are dropped
        const row = validHeaderIndices.map(idx => {
          // Ensure we don't go out of bounds
          return (idx < rawRow.length) ? (rawRow[idx] || '') : '';
        });

        const normalized = normalizeRow(row, cleanedHeaders, {
          fileName,
          sheetName,
          rowNumber: i + 1
        });

        if (normalized.error) {
          errors.push({
            rowNumber: i + 1,
            reason: normalized.error,
            fileName,
            sheetName
          });
        } else {
          results.push(normalized);
        }
      }
    });

  } catch (error) {
    errors.push({
      rowNumber: 0,
      reason: `Excel parsing error: ${error.message}`
    });
  }

  return { results, errors };
}

/**
 * Parse file based on extension
 */
export function parseFile(buffer, fileName) {
  const ext = fileName.toLowerCase().split('.').pop();
  
  if (ext === 'csv') {
    return parseCSV(buffer, fileName);
  } else if (ext === 'xls' || ext === 'xlsx') {
    return parseExcel(buffer, fileName);
  } else {
    return {
      results: [],
      errors: [{ reason: `Unsupported file type: .${ext}`, rowNumber: 0 }]
    };
  }
}
