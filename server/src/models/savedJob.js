import mongoose from 'mongoose';

const savedJobSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  savedAt: { type: Date, default: Date.now }
}, { timestamps: true });

savedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export default mongoose.models.SavedJob || mongoose.model('SavedJob', savedJobSchema);
