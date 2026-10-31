import mongoose from 'mongoose';

const educationSchema = new mongoose.Schema({
  institution: { type: String, trim: true, maxlength: 200 },
  degree: { type: String, trim: true, maxlength: 120 },
  major: { type: String, trim: true, maxlength: 120 },
  academicYear: { type: String, trim: true, maxlength: 40 },
  graduationYear: { type: Number, min: 1900, max: 2200 },
  grade: { type: String, trim: true, maxlength: 40 },
  coursework: { type: [String], default: [] }
}, { _id: true });

const experienceSchema = new mongoose.Schema({
  organization: { type: String, trim: true, maxlength: 200 },
  role: { type: String, trim: true, maxlength: 160 },
  duration: { type: String, trim: true, maxlength: 100 },
  responsibilities: { type: [String], default: [] },
  achievements: { type: [String], default: [] }
}, { _id: true });

const projectSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  technologies: { type: [String], default: [] },
  url: { type: String, trim: true, maxlength: 500 },
  githubUrl: { type: String, trim: true, maxlength: 500 },
  responsibilities: { type: [String], default: [] },
  achievements: { type: [String], default: [] }
}, { _id: true });

const skillSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, trim: true, maxlength: 60 },
  proficiency: { type: String, trim: true, maxlength: 40 },
  confidence: { type: String, enum: ['verified', 'self-declared', 'learning'], default: 'self-declared' }
}, { _id: false });

const candidateProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  fullName: { type: String, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 40 },
  location: { type: String, trim: true, maxlength: 160 },
  linkedInUrl: { type: String, trim: true, maxlength: 500 },
  githubUrl: { type: String, trim: true, maxlength: 500 },
  portfolioUrl: { type: String, trim: true, maxlength: 500 },
  education: { type: [educationSchema], default: [] },
  skills: { type: [skillSchema], default: [] },
  experience: { type: [experienceSchema], default: [] },
  projects: { type: [projectSchema], default: [] },
  preferredRoles: { type: [String], default: [] },
  preferredLocations: { type: [String], default: [] },
  workplacePreference: { type: String, enum: ['remote', 'hybrid', 'onsite', 'any'], default: 'any' },
  employmentPreference: { type: String, enum: ['internship', 'full-time', 'any'], default: 'any' },
  availability: { type: String, trim: true, maxlength: 120 },
  existingSkills: { type: [skillSchema], default: [] },
  interests: { type: [String], default: [] },
  learningGoals: { type: [String], default: [] },
  weeklyBudgetHours: { type: Number, min: 0, max: 168, default: 5 },
  maxEffortMinutes: { type: Number, min: 1, max: 1440, default: 90 },
  yearsExperience: { type: Number, min: 0, max: 100, default: null },
  workAuthorizationCountries: { type: [String], default: [] }
}, { timestamps: true });

export default mongoose.models.CandidateProfile
  || mongoose.model('CandidateProfile', candidateProfileSchema);
