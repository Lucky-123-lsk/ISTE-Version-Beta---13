import mongoose from 'mongoose';

const candidateProfileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  confirmed: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedByCandidateAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.models.CandidateProfile
  || mongoose.model('CandidateProfile', candidateProfileSchema);
