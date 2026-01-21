/**
 * CANONICAL INGESTION ROUTE
 * 
 * Uses the new canonical normalization pipeline for analytics-ready data processing.
 * This route produces the canonical schema with all derived analytics fields.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processFiles } from '../utils/ingestionPipeline.js';
import EventCanonical from '../models/EventCanonical.js';
import Upload from '../models/Upload.js';
import { v4 as uuidv4 } from 'uuid';
import { generateAnalyticsReadinessVerdict, generateColumnSummary } from '../utils/analyticsReadiness.js';
// Header mappings imported dynamically in ingestionPipeline

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// POST /api/ingest/canonical - Process files with canonical schema
router.post('/canonical', async (req, res) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files specified for ingestion' });
    }

    const uploadId = uuidv4();
    
    // Create Upload record
    const uploadRecord = new Upload({
      uploadId,
      fileSummaries: [],
      errorSamples: [],
      stats: {
        totalInserted: 0,
        totalSkipped: 0,
        totalFiles: files.length
      }
    });
    await uploadRecord.save();

    // Prepare files with buffers
    const filesWithBuffers = [];
    
    for (const fileInfo of files) {
      const filePath = path.join(__dirname, '../uploads', fileInfo.filename);
      
      if (!fs.existsSync(filePath)) {
        uploadRecord.fileSummaries.push({
          fileName: fileInfo.originalName,
          inserted: 0,
          skipped: 0,
          totalRows: 0,
          error: 'File not found'
        });
        continue;
      }

      let buffer;
      try {
        buffer = fs.readFileSync(filePath);
        filesWithBuffers.push({
          buffer: buffer,
          originalName: fileInfo.originalName,
          fileName: fileInfo.filename
        });
      } catch (readError) {
        console.error(`Error reading file ${filePath}:`, readError.message);
        uploadRecord.fileSummaries.push({
          fileName: fileInfo.originalName,
          inserted: 0,
          skipped: 0,
          totalRows: 0,
          error: `File read error: ${readError.message}`
        });
        continue;
      }
    }

    if (filesWithBuffers.length === 0) {
      return res.status(400).json({ error: 'No valid files to process' });
    }

    // Process files through canonical pipeline
    const pipelineResult = await processFiles(filesWithBuffers, uploadId);
    
    // Insert canonical records into database
    let totalInserted = 0;
    let totalSkipped = pipelineResult.errors.length;
    
    if (pipelineResult.records.length > 0) {
      try {
        // Insert in batches to avoid memory issues
        const batchSize = 1000;
        for (let i = 0; i < pipelineResult.records.length; i += batchSize) {
          const batch = pipelineResult.records.slice(i, i + batchSize);
          await EventCanonical.insertMany(batch, { ordered: false });
          totalInserted += batch.length;
        }
      } catch (error) {
        console.error('Database insert error:', error.message);
        // Some records may have succeeded
        if (error.insertedDocs && Array.isArray(error.insertedDocs)) {
          totalInserted = error.insertedDocs.length;
        }
      }
    }

    // Calculate accurate summary statistics
    const totalInvalid = pipelineResult.errors.length;
    const totalDuplicates = pipelineResult.duplicates.length;
    const totalSkipped = totalInvalid + totalDuplicates; // Skipped = invalid + duplicates
    const totalProcessed = totalInserted + totalSkipped;

    // Update upload record with accurate breakdown
    uploadRecord.fileSummaries = pipelineResult.fileSummaries;
    uploadRecord.errorSamples = pipelineResult.errors.slice(0, 50);
    uploadRecord.stats = {
      totalInserted: totalInserted,
      totalInvalid: totalInvalid,
      totalDuplicates: totalDuplicates,
      totalSkipped: totalSkipped,
      totalProcessed: totalProcessed,
      totalFiles: files.length
    };
    await uploadRecord.save();

    // Generate analytics readiness assessment
    let analyticsVerdict = null;
    let columnSummary = null;
    
    try {
      analyticsVerdict = await generateAnalyticsReadinessVerdict(uploadId);
      columnSummary = await generateColumnSummary(uploadId);
    } catch (error) {
      console.error('Error generating analytics readiness:', error.message);
    }

    // Clean up uploaded files
    filesWithBuffers.forEach(fileInfo => {
      const filePath = path.join(__dirname, '../uploads', fileInfo.fileName);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.warn(`Could not delete file ${filePath}:`, err.message);
      }
    });

    // Return comprehensive response with accurate summary
    res.json({
      uploadId,
      summary: {
        totalInserted,
        totalInvalid,
        totalDuplicates,
        totalSkipped: totalSkipped, // Skipped = invalid + duplicates
        totalProcessed,
        totalFiles: files.length,
        fileSummaries: pipelineResult.fileSummaries,
        errorSamples: pipelineResult.errors.slice(0, 20)
      },
      reports: {
        normalization: pipelineResult.reports?.normalization,
        schemaMapping: pipelineResult.reports?.schemaMapping,
        dataQuality: pipelineResult.reports?.dataQuality
      },
      analyticsReadiness: analyticsVerdict,
      columnSummary: columnSummary
    });

  } catch (error) {
    console.error('Canonical ingestion error:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'An unexpected error occurred during canonical ingestion',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
