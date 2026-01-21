/**
 * INGESTION PIPELINE
 * 
 * Orchestrates the complete data ingestion, normalization, enrichment, and validation process.
 * This is the main entry point for processing CDR files into analytics-ready canonical records.
 */

import { parseFile } from './fileParser.js';
import { normalizeRow } from './normalizer.js';
import { createCanonicalRecord, validateCanonicalRecord } from './canonicalNormalizer.js';
import { enrichRecords } from './enrichment.js';
import { deduplicateRecords } from './deduplication.js';
import { validateRecord, generateQualitySummary } from './dataQuality.js';
import { generateAllReports } from './reportGenerator.js';

/**
 * Process a single file through the complete pipeline
 */
export async function processFile(buffer, fileName, uploadId) {
  const results = [];
  const errors = [];
  const rawRecords = [];
  
  // Step 1: Parse file
  const parseResult = parseFile(buffer, fileName);
  
  if (parseResult.errors && parseResult.errors.length > 0) {
    errors.push(...parseResult.errors);
  }
  
  // Step 2: Normalize rows (existing normalizer)
  parseResult.results.forEach(rawRecord => {
    rawRecords.push({
      ...rawRecord,
      uploadId: uploadId
    });
  });
  
  // Step 3: Convert to canonical schema
  const canonicalRecords = [];
  rawRecords.forEach(rawRecord => {
    try {
      const canonical = createCanonicalRecord(rawRecord, {
        fileName: fileName,
        sheetName: rawRecord.source?.sheetName || null,
        rowNumber: rawRecord.source?.rowNumber || 0
      });
      
      // Validate canonical record
      const validation = validateCanonicalRecord(canonical);
      
      if (!validation.isValid) {
        errors.push({
          rowNumber: rawRecord.source?.rowNumber || 0,
          reason: `Canonical validation failed: ${validation.errors.join(', ')}`,
          fileName: fileName
        });
        return;
      }
      
      // Add validation warnings to record
      canonical.normalizationWarnings = [
        ...(canonical.normalizationWarnings || []),
        ...validation.warnings
      ];
      
      canonicalRecords.push(canonical);
    } catch (error) {
      errors.push({
        rowNumber: rawRecord.source?.rowNumber || 0,
        reason: `Canonical conversion error: ${error.message}`,
        fileName: fileName
      });
    }
  });
  
  // Step 4: Enrich records (derived analytics fields)
  let enrichedRecords = [];
  if (canonicalRecords.length > 0) {
    try {
      enrichedRecords = enrichRecords(canonicalRecords);
    } catch (error) {
      console.error(`Enrichment error for ${fileName}:`, error.message);
      // Continue with non-enriched records
      enrichedRecords = canonicalRecords;
    }
  }
  
  // Step 5: Deduplicate
  const dedupResult = deduplicateRecords(enrichedRecords);
  const finalRecords = dedupResult.records;
  
  // Step 6: Final validation and confidence scoring
  finalRecords.forEach(record => {
    const validation = validateRecord(record);
    
    // Add confidence score
    if (validation.confidence) {
      record.normalizationConfidence = {
        score: validation.confidence.score,
        confidence: validation.confidence.confidence,
        factors: validation.confidence.factors
      };
    }
    
    // Add any additional validation warnings
    if (validation.warnings.length > 0) {
      record.normalizationWarnings = [
        ...(record.normalizationWarnings || []),
        ...validation.warnings
      ];
    }
  });
  
  results.push(...finalRecords);
  
  return {
    results,
    errors,
    duplicates: dedupResult.duplicates,
    duplicateCount: dedupResult.duplicateCount
  };
}

/**
 * Process multiple files and generate reports
 */
export async function processFiles(files, uploadId) {
  const allResults = [];
  const allErrors = [];
  const allDuplicates = [];
  const fileSummaries = [];
  
  // Get header mappings from normalizer
  const { HEADER_MAPPINGS } = await import('./normalizer.js');
  const headerMappings = HEADER_MAPPINGS || {};
  
  for (const fileInfo of files) {
    const fileResult = await processFile(
      fileInfo.buffer,
      fileInfo.originalName || fileInfo.fileName,
      uploadId
    );
    
    allResults.push(...fileResult.results);
    allErrors.push(...fileResult.errors);
    allDuplicates.push(...fileResult.duplicates);
    
    fileSummaries.push({
      fileName: fileInfo.originalName || fileInfo.fileName,
      inserted: fileResult.results.length,
      skipped: fileResult.errors.length,
      totalRows: fileResult.results.length + fileResult.errors.length,
      duplicates: fileResult.duplicateCount,
      warningsCount: fileResult.results.filter(r => 
        r.normalizationWarnings && r.normalizationWarnings.length > 0
      ).length
    });
  }
  
  // Generate reports
  const reports = await generateAllReports(
    allResults,
    fileSummaries,
    uploadId,
    headerMappings
  );
  
  return {
    records: allResults,
    errors: allErrors,
    duplicates: allDuplicates,
    fileSummaries,
    reports
  };
}
