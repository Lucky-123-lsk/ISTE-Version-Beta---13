import mongoose from 'mongoose';

const applicationEventSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, required: true, trim: true },
  originalStatusText: { type: String, trim: true, default: '' },
  source: { type: String, enum: ['candidate', 'extension', 'system'], default: 'candidate' },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });

applicationEventSchema.index({ applicationId: 1, status: 1, originalStatusText: 1 }, { unique: true });

export default mongoose.models.ApplicationEvent
  || mongoose.model('ApplicationEvent', applicationEventSchema);
