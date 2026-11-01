import mongoose from 'mongoose';

const tailoredResumeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  targetJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  versionName: { type: String, required: true, maxlength: 160 },
  sections: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvalStatus: { type: String, enum: ['draft', 'candidate-approved'], default: 'draft' },
  sourceResumeId: { type: String, default: '' },
  proofPoints: { type: [mongoose.Schema.Types.Mixed], default: [] },
  acceptedSuggestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  applicationId: { type: String, default: '' }
}, { timestamps: true });

tailoredResumeSchema.index({ userId: 1, targetJobId: 1, updatedAt: -1 });

export default mongoose.models.TailoredResume
  || mongoose.model('TailoredResume', tailoredResumeSchema);
