import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  termsAcceptedAt: { type: Date, required: true },
  privacyAcceptedAt: { type: Date, required: true },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true, name: 'email_1' });

export default mongoose.models.User || mongoose.model('User', userSchema);
