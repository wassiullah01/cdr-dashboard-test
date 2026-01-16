/**
 * Utility functions for upload session management
 * Uses uploadId (UUID string) consistently, not ObjectId
 */
import Upload from '../models/Upload.js';

/**
 * Get the most recent uploadId (UUID string)
 * @returns {Promise<string|null>} The most recent uploadId as string, or null if none exists
 */
export async function getMostRecentUploadId() {
  try {
    const mostRecent = await Upload.findOne()
      .sort({ createdAt: -1 })
      .select('uploadId')
      .lean();
    
    return mostRecent ? mostRecent.uploadId : null;
  } catch (error) {
    console.error('Error getting most recent uploadId:', error.message);
    return null;
  }
}

/**
 * Resolve uploadId from query params
 * - If includeAll=true, return null (no filtering)
 * - If uploadId is provided, use it (as string)
 * - Otherwise, default to most recent uploadId
 * @param {Object} query - Express query object
 * @returns {Promise<string|null>} The uploadId to filter by, or null for all
 */
export async function resolveUploadId(query) {
  const { uploadId, includeAll } = query;

  // Explicit includeAll flag means show all sessions
  if (includeAll === 'true' || includeAll === true) {
    return null;
  }

  // If specific uploadId provided, use it (it's a UUID string, no validation needed)
  if (uploadId && typeof uploadId === 'string' && uploadId.trim()) {
    return uploadId.trim();
  }

  // Default: use most recent uploadId
  return await getMostRecentUploadId();
}
