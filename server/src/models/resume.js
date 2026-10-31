import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalName: { type: String, required: true, trim: true },
  storageKey: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true, enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  sizeBytes: { type: Number, required: true, min: 1 },
  extractedText: { type: String, default: '', select: false },
  version: { type: Number, required: true, min: 1 },
  isActive: { type: Boolean, default: true, index: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

resumeSchema.index({ userId: 1, version: -1 });

export default mongoose.models.Resume || mongoose.model('Resume', resumeSchema);
