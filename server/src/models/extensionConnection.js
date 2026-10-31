import mongoose from 'mongoose';

const extensionConnectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  name: { type: String, trim: true, maxlength: 100, default: 'Chrome extension' },
  scopes: { type: [String], default: ['profile:read', 'applications:write'] },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });

extensionConnectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ExtensionConnection
  || mongoose.model('ExtensionConnection', extensionConnectionSchema);
