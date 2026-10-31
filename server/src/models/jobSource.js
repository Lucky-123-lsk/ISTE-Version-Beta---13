import mongoose from 'mongoose';

const jobSourceSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  boardId: { type: String, default: '' },
  externalJobId: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  sourceUrl: { type: String, default: '' },
  applicationUrl: { type: String, default: '' },
  firstDiscoveredAt: { type: Date, required: true },
  lastDiscoveredAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'closed', 'unverified', 'unknown'], default: 'unknown' },
  verificationEvidence: { type: String, default: '' }
}, { timestamps: true });

jobSourceSchema.index({ provider: 1, boardId: 1, externalJobId: 1 }, { unique: true });

export default mongoose.models.JobSource || mongoose.model('JobSource', jobSourceSchema);
