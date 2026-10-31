import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  jobTitle: { type: String, required: true, trim: true },
  companyName: { type: String, required: true, trim: true },
  officialApplicationUrl: { type: String, trim: true, default: '' },
  portalName: { type: String, trim: true, default: '' },
  externalReferenceId: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['APPLICATION_STARTED', 'SUBMITTED', 'UNDER_REVIEW', 'ASSESSMENT', 'INTERVIEW', 'ON_HOLD', 'NOT_SELECTED', 'OFFER', 'UNKNOWN', 'Saved', 'Planned', 'Applied', 'Assessment', 'Rejected', 'Withdrawn'],
    default: 'APPLICATION_STARTED',
    index: true
  },
  originalStatusText: { type: String, trim: true, default: '' }
}, { timestamps: true });

applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export default mongoose.models.Application || mongoose.model('Application', applicationSchema);
