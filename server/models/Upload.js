import mongoose from 'mongoose';

const uploadSchema = new mongoose.Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Index for finding most recent upload
  },
  fileSummaries: [{
    fileName: String,
    inserted: Number,
    skipped: Number,
    totalRows: Number,
    warningsCount: Number
  }],
  errorSamples: [{
    rowNumber: Number,
    reason: String,
    fileName: String
  }],
  stats: {
    totalInserted: Number,
    totalSkipped: Number,
    totalFiles: Number
  }
});

const Upload = mongoose.model('Upload', uploadSchema, 'uploads');

export default Upload;
