import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true },
  externalJobId: { type: String, required: true },
  boardId: { type: String, default: '' },
  sourceUrl: { type: String, default: '' },
  applicationUrl: { type: String, default: '' },
  firstDiscoveredAt: { type: Date, required: true },
  lastDiscoveredAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'closed', 'unverified', 'unknown'], default: 'unknown' },
  verificationEvidence: { type: String, default: '' }
}, { _id: false });

const jobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  companyName: { type: String, required: true, index: true },
  companyDomain: { type: String, default: '', index: true },
  description: { type: String, default: '' },
  location: { type: String, default: '', index: true },
  country: { type: String, default: '', index: true },
  countryCode: { type: String, default: '', index: true },
  workplaceType: { type: String, enum: ['remote', 'hybrid', 'onsite', 'unknown'], default: 'unknown', index: true },
  employmentType: { type: String, default: '', index: true },
  experienceRequirements: { type: String, default: '' },
  requiredSkills: { type: [String], default: [] },
  preferredSkills: { type: [String], default: [] },
  salary: {
    text: { type: String, default: '' },
    minimum: { type: Number, default: null },
    maximum: { type: Number, default: null },
    currency: { type: String, default: '' },
    period: { type: String, default: '' }
  },
  postedAt: { type: Date, default: null, index: true },
  applicationUrl: { type: String, default: '' },
  canonicalUrl: { type: String, default: '', index: true },
  canonicalKey: { type: String, required: true, unique: true },
  normalizedTitle: { type: String, required: true, index: true },
  normalizedLocation: { type: String, default: '', index: true },
  descriptionHash: { type: String, default: '', index: true },
  sourceRecords: { type: [sourceSchema], default: [] },
  status: { type: String, enum: ['active', 'expired', 'closed', 'unverified', 'unknown'], default: 'unknown', index: true },
  firstDiscoveredAt: { type: Date, required: true },
  lastDiscoveredAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: null },
  eligibilityRequirements: { type: [String], default: [] }
}, { timestamps: true });

jobSchema.index({ title: 'text', companyName: 'text', description: 'text', requiredSkills: 'text' });
jobSchema.index({ status: 1, postedAt: -1 });
jobSchema.index({ normalizedTitle: 1, companyDomain: 1, normalizedLocation: 1, descriptionHash: 1 });

export default mongoose.models.Job || mongoose.model('Job', jobSchema);
