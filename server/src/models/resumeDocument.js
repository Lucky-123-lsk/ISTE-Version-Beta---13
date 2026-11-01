import mongoose from 'mongoose';

const resumeDocumentSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  fileName: { type: String, default: '' },
  fileType: { type: String, default: 'text/plain' },
  fileSize: { type: Number, default: 0 },
  originalText: { type: String, default: '' },
  extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
  evidenceReferences: { type: [mongoose.Schema.Types.Mixed], default: [] },
  extractionStatus: { type: String, enum: ['not-started', 'complete', 'failed'], default: 'not-started' },
  analyzedAt: { type: Date, default: null }
}, { timestamps: true });

resumeDocumentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ResumeDocument
  || mongoose.model('ResumeDocument', resumeDocumentSchema);
