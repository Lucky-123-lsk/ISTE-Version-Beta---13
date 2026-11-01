import mongoose from 'mongoose';

const applicationEventSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, required: true, trim: true },
  source: { type: String, enum: ['candidate', 'extension', 'system'], default: 'candidate' },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.ApplicationEvent
  || mongoose.model('ApplicationEvent', applicationEventSchema);
