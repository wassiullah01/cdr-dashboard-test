/**
 * REPORT GENERATOR MODULE
 * 
 * Generates structured reports for normalization, schema mapping, and data quality.
 * These reports are critical for understanding data correctness and analytics readiness.
 */

import { generateQualitySummary } from './dataQuality.js';

/**
 * Generate normalization report
 */
export function generateNormalizationReport(records, uploadId) {
  const report = {
    uploadId: uploadId,
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    normalizationStats: {
      recordsWithWarnings: 0,
      recordsWithoutWarnings: 0,
      warningTypes: {}
    },
    fieldCompleteness: {},
    confidenceDistribution: {
      high: 0,
      medium: 0,
      low: 0
    }
  };
  
  // Analyze normalization warnings
  records.forEach(record => {
    if (record.normalizationWarnings && record.normalizationWarnings.length > 0) {
      report.normalizationStats.recordsWithWarnings++;
      
      record.normalizationWarnings.forEach(warning => {
        report.normalizationStats.warningTypes[warning] = 
          (report.normalizationStats.warningTypes[warning] || 0) + 1;
      });
    } else {
      report.normalizationStats.recordsWithoutWarnings++;
    }
  });
  
  // Field completeness
  const fields = [
    'timestamp_utc', 'caller_number', 'receiver_number', 'direction',
    'event_type', 'call_duration_seconds', 'latitude', 'longitude',
    'cell_id', 'imei', 'imsi', 'service_provider'
  ];
  
  fields.forEach(field => {
    const nonNullCount = records.filter(r => r[field] !== null && r[field] !== undefined).length;
    const percentage = records.length > 0 
      ? ((nonNullCount / records.length) * 100).toFixed(2)
      : 0;
    
    report.fieldCompleteness[field] = {
      nonNull: nonNullCount,
      null: records.length - nonNullCount,
      percentage: parseFloat(percentage)
    };
  });
  
  // Confidence distribution (if available)
  records.forEach(record => {
    // This would be populated if we run validation
    // For now, we'll calculate it here
    const hasWarnings = record.normalizationWarnings && record.normalizationWarnings.length > 0;
    const hasMissingFields = !record.timestamp_utc || (!record.caller_number && !record.receiver_number);
    
    if (!hasWarnings && !hasMissingFields) {
      report.confidenceDistribution.high++;
    } else if (hasWarnings && !hasMissingFields) {
      report.confidenceDistribution.medium++;
    } else {
      report.confidenceDistribution.low++;
    }
  });
  
  return report;
}

/**
 * Generate schema mapping report
 */
export function generateSchemaMappingReport(fileSummaries, headerMappings) {
  const report = {
    generatedAt: new Date().toISOString(),
    filesProcessed: fileSummaries.length,
    schemaMappings: [],
    unmappedColumns: [],
    mappingConfidence: {}
  };
  
  // For each file, document what columns were found and how they mapped
  fileSummaries.forEach(fileSummary => {
    // This would be populated during actual parsing
    // For now, we create a placeholder structure
    report.schemaMappings.push({
      fileName: fileSummary.fileName,
      totalRows: fileSummary.totalRows,
      inserted: fileSummary.inserted,
      skipped: fileSummary.skipped,
      mappingDetails: 'See headerMappings for canonical mappings'
    });
  });
  
  // Document header mappings
  report.canonicalMappings = headerMappings;
  
  return report;
}

/**
 * Generate data quality summary report
 */
export function generateDataQualitySummary(records, uploadId) {
  const qualitySummary = generateQualitySummary(records);
  
  const report = {
    uploadId: uploadId,
    generatedAt: new Date().toISOString(),
    summary: qualitySummary,
    recommendations: []
  };
  
  // Generate recommendations
  if (qualitySummary.invalidPercentage > 5) {
    report.recommendations.push({
      severity: 'high',
      issue: 'High invalid record percentage',
      recommendation: 'Review data source and normalization rules'
    });
  }
  
  if (qualitySummary.selfCallCount > 0) {
    report.recommendations.push({
      severity: 'medium',
      issue: 'Self-calls detected',
      recommendation: 'Verify if self-calls are expected in this dataset'
    });
  }
  
  if (qualitySummary.missingLocationCount > qualitySummary.totalRecords * 0.5) {
    report.recommendations.push({
      severity: 'medium',
      issue: 'More than 50% of records missing location data',
      recommendation: 'Location-based analytics may be limited'
    });
  }
  
  if (qualitySummary.confidenceDistribution.low > qualitySummary.totalRecords * 0.2) {
    report.recommendations.push({
      severity: 'medium',
      issue: 'More than 20% of records have low confidence',
      recommendation: 'Review normalization rules and data source quality'
    });
  }
  
  return report;
}

/**
 * Generate all reports for an upload
 * NOTE: Reports are returned in-memory only (not written to disk)
 * This prevents unwanted file system writes during ingestion
 */
export async function generateAllReports(records, fileSummaries, uploadId, headerMappings) {
  const reports = {};
  
  // Normalization report (in-memory only)
  const normReport = generateNormalizationReport(records, uploadId);
  reports.normalization = normReport;
  
  // Schema mapping report (in-memory only)
  const schemaReport = generateSchemaMappingReport(fileSummaries, headerMappings);
  reports.schemaMapping = schemaReport;
  
  // Data quality summary (in-memory only)
  const qualityReport = generateDataQualitySummary(records, uploadId);
  reports.dataQuality = qualityReport;
  
  return reports;
}
