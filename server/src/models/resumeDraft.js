import mongoose from 'mongoose';

const resumeDraftSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  evidenceId: { type: String, default: '' },
  content: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['draft', 'candidate-approved-draft'], default: 'draft' },
  approvedAt: { type: Date, default: null }
}, { timestamps: true });

resumeDraftSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ResumeDraft || mongoose.model('ResumeDraft', resumeDraftSchema);
