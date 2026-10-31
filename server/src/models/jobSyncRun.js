import mongoose from 'mongoose';

const jobSyncRunSchema = new mongoose.Schema({
  provider: { type: String, required: true, index: true },
  sourceId: { type: String, default: '', index: true },
  status: { type: String, enum: ['running', 'succeeded', 'partial', 'failed', 'skipped'], required: true },
  startedAt: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null },
  fetched: { type: Number, default: 0 },
  normalized: { type: Number, default: 0 },
  inserted: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  rejected: { type: Number, default: 0 },
  pages: { type: Number, default: 0 },
  queryCursor: { type: Date, default: null },
  cursorAt: { type: Date, default: null },
  nextOffset: { type: Number, default: 0 },
  creditsEstimated: { type: Number, default: 0 },
  error: { type: String, default: '' }
}, { timestamps: true });

jobSyncRunSchema.index({ provider: 1, startedAt: -1 });

export default mongoose.models.JobSyncRun || mongoose.model('JobSyncRun', jobSyncRunSchema);
