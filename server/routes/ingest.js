import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from '../utils/fileParser.js';
import Event from '../models/Event.js';
import Upload from '../models/Upload.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// POST /api/ingest - Process uploaded files
router.post('/', async (req, res) => {
  try {
    const { files } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files specified for ingestion' });
    }

    const uploadId = uuidv4();
    
    // Create Upload record with uploadId (UUID string)
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

    const fileSummaries = [];
    const allErrorSamples = [];
    let totalInserted = 0;
    let totalSkipped = 0;

    for (const fileInfo of files) {
      const filePath = path.join(__dirname, '../uploads', fileInfo.filename);
      
      if (!fs.existsSync(filePath)) {
        fileSummaries.push({
          fileName: fileInfo.originalName,
          inserted: 0,
          skipped: 0,
          totalRows: 0,
          error: 'File not found'
        });
        totalSkipped += 1; // Count missing file as skipped
        continue;
      }

      let buffer;
      try {
        buffer = fs.readFileSync(filePath);
      } catch (readError) {
        console.error(`Error reading file ${filePath}:`, readError.message);
        fileSummaries.push({
          fileName: fileInfo.originalName,
          inserted: 0,
          skipped: 0,
          totalRows: 0,
          error: `File read error: ${readError.message}`
        });
        totalSkipped += 1;
        continue;
      }

      let results = [];
      let errors = [];
      try {
        const parseResult = parseFile(buffer, fileInfo.originalName);
        results = parseResult.results || [];
        errors = parseResult.errors || [];
      } catch (parseError) {
        console.error(`Error parsing file ${fileInfo.originalName}:`, parseError.message);
        fileSummaries.push({
          fileName: fileInfo.originalName,
          inserted: 0,
          skipped: 0,
          totalRows: 0,
          error: `Parse error: ${parseError.message}`
        });
        totalSkipped += 1;
        // Clean up file even if parsing failed
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn(`Could not delete file ${filePath}:`, unlinkErr.message);
        }
        continue;
      }

      // Attach uploadId to all events before inserting
      // CRITICAL: Ensure uploadId is a string and is attached to EVERY event
      const eventsWithSession = results.map(event => {
        // Ensure uploadId is explicitly set (no old field names)
        const eventWithUploadId = { ...event };
        delete eventWithUploadId.uploadSessionId; // Remove any old field
        eventWithUploadId.uploadId = uploadId; // Set new field
        return eventWithUploadId;
      });

      // Insert valid records
      let inserted = 0;
      if (eventsWithSession.length > 0) {
        try {
          // Use insertMany with ordered: false to continue on errors
          const insertResult = await Event.insertMany(eventsWithSession, { ordered: false });
          inserted = insertResult.length;
          
          // Dev-only verification: Check MongoDB count matches inserted count
          if (process.env.NODE_ENV === 'development') {
            const mongoCount = await Event.countDocuments({ uploadId });
            console.log(`[DEBUG] Ingestion verification for ${fileInfo.originalName}:`, {
              uploadIdUsed: uploadId,
              insertedCount: inserted,
              mongoCountForUploadId: mongoCount,
              match: inserted === mongoCount ? '✓ MATCH' : '✗ MISMATCH'
            });
          }
        } catch (error) {
          // Some records may have failed, but some may have succeeded
          // Count actual inserted by checking writeErrors
          if (error.writeErrors && Array.isArray(error.writeErrors)) {
            inserted = results.length - error.writeErrors.length;
          } else if (error.insertedDocs && Array.isArray(error.insertedDocs)) {
            inserted = error.insertedDocs.length;
          } else {
            // If we can't determine, assume none were inserted
            inserted = 0;
            console.error(`Database insert error for ${fileInfo.originalName}:`, error.message);
          }
          
          // Dev-only: Still verify even on partial failure
          if (process.env.NODE_ENV === 'development' && inserted > 0) {
            const mongoCount = await Event.countDocuments({ uploadId });
            console.log(`[DEBUG] Ingestion verification (partial) for ${fileInfo.originalName}:`, {
              uploadIdUsed: uploadId,
              insertedCount: inserted,
              mongoCountForUploadId: mongoCount
            });
          }
        }
      }

      const skipped = errors.length + (results.length - inserted);
      totalInserted += inserted;
      totalSkipped += skipped;

      // Store error samples (limit to 10 per file for privacy)
      const errorSamples = errors.slice(0, 10).map(err => ({
        rowNumber: err.rowNumber,
        reason: err.reason,
        fileName: fileInfo.originalName
      }));
      allErrorSamples.push(...errorSamples);

      // Count warnings for this file
      const warningsCount = results.filter(r => r.normalizationWarnings && r.normalizationWarnings.length > 0).length;

      fileSummaries.push({
        fileName: fileInfo.originalName,
        inserted,
        skipped,
        totalRows: results.length + errors.length,
        warningsCount
      });

      // Clean up uploaded file after processing
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Could not delete file ${filePath}:`, err.message);
      }
    }

    // Update upload record with final stats
    try {
      uploadRecord.fileSummaries = fileSummaries;
      uploadRecord.errorSamples = allErrorSamples.slice(0, 50); // Limit total error samples
      uploadRecord.stats = {
        totalInserted,
        totalSkipped,
        totalFiles: files.length
      };
      await uploadRecord.save();
    } catch (dbError) {
      console.error('Error updating upload record:', dbError.message);
      // Continue even if we can't update the upload record
    }

    // STEP 1: Final MongoDB verification (dev only)
    if (process.env.NODE_ENV === 'development') {
      const totalAll = await Event.countDocuments({});
      const totalForUpload = await Event.countDocuments({ uploadId });
      console.log('[DEBUG] Final ingestion verification:', {
        uploadIdUsed: uploadId,
        totalInserted: totalInserted,
        totalAllEvents: totalAll,
        totalForUploadId: totalForUpload,
        match: totalInserted === totalForUpload ? '✓ MATCH' : '✗ MISMATCH',
        expected: `totalForUpload (${totalForUpload}) should equal totalInserted (${totalInserted})`
      });
    }

    res.json({
      uploadId,
      summary: {
        totalInserted,
        totalSkipped,
        totalFiles: files.length,
        fileSummaries,
        errorSamples: allErrorSamples.slice(0, 20) // Return top 20 for display
      }
    });

  } catch (error) {
    console.error('Ingestion error:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'An unexpected error occurred during ingestion',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
