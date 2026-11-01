import './config/env.js';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { setServers } from 'node:dns';
import mongoose from 'mongoose';
import User from './models/user.js';
import Job from './models/job.js';
import JobSource from './models/jobSource.js';
import JobSyncRun from './models/jobSyncRun.js';
import CandidateProfile from './models/candidateProfile.js';
import ResumeDocument from './models/resumeDocument.js';
import ResumeDraft from './models/resumeDraft.js';
import TailoredResume from './models/tailoredResume.js';
import Application from './models/application.js';
import ApplicationEvent from './models/applicationEvent.js';
import ExtensionConnection from './models/extensionConnection.js';
import SavedJob from './models/savedJob.js';
import { analyzeResume, analyzeSkillGaps, extractResumeProfile, generateResumeSuggestions, getAIProviderStatus, researchCompanyWithGroq, validateExactQuote } from './services/aiProvider.js';
import { answerJobQuestion } from './services/jobChat.js';
import { computeGaps, generateReport, getFixedQuestions, planQuestions } from './services/rejectionCoach.js';
import { getCompanyRegistry } from './config/jobCompanies.js';
import { startJobSyncScheduler } from './services/jobIngestion/scheduler.js';
import { synchronizeJobs } from './services/jobIngestion/sync.js';
import { matchJob } from './services/jobMatching.js';
import { summarizeApplications } from './services/applicationInsights.js';
import { buildResumeEvidence } from './services/resumeEvidence.js';
import { prioritizeJob, sortJobsByPriority } from './services/jobPriority.js';
import { buildRecommendationProfile, recommendJobs } from './services/jobRecommendations.js';
import { buildTailoredSections } from './services/tailoredResume.js';
import {
  checkOfficialSite,
  parseOfficialSiteUrl,
  searchAdzunaCompany,
  searchTavilyCompany
} from './services/companyVerification.js';
import { createRateLimiter, securityHeaders } from './middleware/apiSecurity.js';
import {
  hashPassword,
  issueDemoAccessToken,
  issueAccessToken,
  WEB_SESSION_TTL_SECONDS,
  DEMO_SESSION_TTL_SECONDS,
  normalizeEmail,
  publicUser,
  validateRegistrationInput,
  verifyPassword
} from './services/auth.js';

const app = express();
const port = process.env.PORT || 4000;
const configuredSecret = process.env.JWT_SECRET?.trim();
let mongoReady = false;
let mongoModelsInitialized = false;
let jobSyncStarted = false;
let mongoRetryTimer = null;
let shuttingDown = false;
if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
  throw new Error('Production requires a JWT_SECRET containing at least 32 characters.');
}
const secret = configuredSecret || randomBytes(32).toString('hex');
if (!configuredSecret) console.warn('JWT_SECRET is unset; using an ephemeral development key. Existing sessions will not survive an API restart.');
const configuredClientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const aiRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 20 });
const trustSearchRateLimit = createRateLimiter({ windowMs: 60 * 1000, max: 5 });
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === configuredClientOrigin || /^chrome-extension:\/\/[a-z]{32}$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CareerPilot CORS policy.'));
  },
  credentials: true
}));
app.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== configuredClientOrigin) {
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  }
  return next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  return next();
});

const demoProfile = () => ({
  existingSkills: [
    { name: 'React', confidence: 'self-declared' },
    { name: 'JavaScript', confidence: 'self-declared' },
    { name: 'Node.js', confidence: 'self-declared' }
  ],
  transferableSkills: ['Project delivery', 'API integration', 'Documentation'],
  interests: ['AI/ML applications', 'Web development'],
  learningGoals: ['Python', 'Machine learning fundamentals'],
  weeklyBudgetHours: 5,
  maxEffortMinutes: 90,
  preferredRoles: ['Frontend', 'AI application'],
  yearsExperience: null,
  workAuthorizationCountries: [],
  fullName: 'Demo Candidate',
  email: '',
  location: '',
  linkedIn: '',
  github: '',
  portfolio: '',
  objective: '',
  education: [],
  projects: [],
  experience: [],
  achievements: []
});
const profiles = new Map([['demo-user', demoProfile()]]);
const savedJobs = new Map([['demo-user', new Set()]]);
const applications = [];
const reports = [];
const reviewedJobs = new Map([['demo-user', new Set()]]);
const resumeDrafts = [];
const resumeRecords = new Map();
const resumeTextLimit = 200000;

function requireAuth(req, res, next) {
  const token = readCookie(req, 'careerpilot_access');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!['web', 'demo'].includes(req.user.tokenType)) throw new Error('Unsupported session type.');
  } catch {
    clearAccessCookie(res);
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }
  if (req.user.tokenType === 'demo') return next();
  if (mongoose.Types.ObjectId.isValid(req.user.id)) {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Account authentication is temporarily unavailable because MongoDB is not connected.' });
    }
    return User.exists({ _id: req.user.id })
      .then(user => {
        if (user) return next();
        clearAccessCookie(res);
        return res.status(401).json({ error: 'Account no longer exists.' });
      })
      .catch(next);
  }
  return next();
}

function optionalAuth(req, res, next) {
  const token = readCookie(req, 'careerpilot_access');
  if (token) {
    try {
      req.user = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (!['web', 'demo'].includes(req.user.tokenType)) throw new Error('Unsupported session type.');
    } catch {
      req.user = null;
      clearAccessCookie(res);
    }
  }
  next();
}

function readCookie(req, name) {
  const cookies = req.headers.cookie?.split(';').map(value => value.trim()) || [];
  const entry = cookies.find(value => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : '';
}

function setAccessCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', `careerpilot_access=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearAccessCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', `careerpilot_access=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`);
}

function requireExtensionAuth(req, res, next) {
  const token = req.headers['x-careerpilot-extension-token']
    || req.headers.authorization?.replace(/^Extension\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Extension pairing required.' });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  ExtensionConnection.findOne({ tokenHash, revokedAt: null, expiresAt: { $gt: new Date() } })
    .lean()
    .then(connection => {
      if (!connection) return res.status(401).json({ error: 'Extension pairing is invalid or expired.' });
      req.extension = connection;
      return next();
    })
    .catch(next);
}

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function databaseUnavailable(res) {
  return res.status(503).json({ error: 'Job search is unavailable because MongoDB is not connected. Configure MONGODB_URI and restart the API.' });
}

function getSaved(userId) {
  if (!savedJobs.has(userId)) savedJobs.set(userId, new Set());
  return savedJobs.get(userId);
}

function getProfile(userId) {
  if (!profiles.has(userId)) profiles.set(userId, demoProfile());
  return profiles.get(userId);
}

function toJobResponse(job, profile = {}) {
  const match = matchJob(job, profile);
  const verificationAge = Number(process.env.JOB_VERIFICATION_STALE_DAYS) || 7;
  const staleVerification = !job.lastVerifiedAt
    || Date.now() - new Date(job.lastVerifiedAt).getTime() > verificationAge * 86400000;
  const currentStatus = job.status === 'active' && staleVerification ? 'unknown' : job.status;
  const sources = job.sourceRecords.map(source => ({
    provider: source.provider,
    externalJobId: source.externalJobId,
    boardId: source.boardId,
    sourceUrl: source.sourceUrl,
    applicationUrl: source.applicationUrl,
    status: source.status === 'active' && (!source.lastVerifiedAt
      || Date.now() - new Date(source.lastVerifiedAt).getTime() > verificationAge * 86400000)
      ? 'unknown' : source.status,
    lastVerifiedAt: source.lastVerifiedAt,
    verificationEvidence: source.verificationEvidence
  }));
  const trustStatus = currentStatus === 'active' ? 'active'
    : currentStatus === 'closed' ? 'confirmed-closed'
      : currentStatus === 'expired' ? 'possibly-expired' : 'needs-review';
  return {
    id: String(job._id),
    title: job.title,
    company: job.companyName,
    companyDomain: job.companyDomain,
    description: job.description,
    location: job.location || job.country || 'Location not provided',
    country: job.country,
    countryCode: job.countryCode,
    type: job.employmentType,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    experienceRequirements: job.experienceRequirements,
    skills: [...new Set([...(job.requiredSkills || []), ...(job.preferredSkills || [])])],
    requiredSkills: job.requiredSkills || [],
    preferredSkills: job.preferredSkills || [],
    skillMatch: match.skillMatch,
    skillMatchSource: match.skillMatchSource,
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    eligibilityMatch: match.eligibilityMatch,
    experienceMatch: match.experienceMatch,
    category: match.category,
    match: match.skillMatch,
    why: match.explanation,
    salary: job.salary,
    postedAt: job.postedAt,
    applicationUrl: job.applicationUrl,
    sourceUrl: sources[0]?.sourceUrl || '',
    sources,
    status: currentStatus,
    firstDiscoveredAt: job.firstDiscoveredAt,
    lastDiscoveredAt: job.lastDiscoveredAt,
    lastVerifiedAt: job.lastVerifiedAt,
    estimatedMinutes: null,
    effortEstimateStatus: 'not-provided-by-source',
    trust: {
      status: trustStatus,
      source: sources.map(source => `${source.provider} public job feed`).join(', ') || 'No source evidence',
      deadline: 'Not supplied by the source',
      duplicate: sources.length > 1 ? `${sources.length} source records linked to this listing` : 'No cross-source match found',
      application: currentStatus === 'active' ? 'Listed as active in the latest provider response' : `Status: ${currentStatus}`,
      flags: sources.map(source => source.verificationEvidence).filter(Boolean)
    },
    matching: match
  };
}

function priorityFor(job, profile) {
  const match = matchJob(job, profile);
  const status = toJobResponse(job, profile).status;
  return prioritizeJob({
    job,
    profile,
    match,
    status,
    staleAfterDays: Number(process.env.JOB_VERIFICATION_STALE_DAYS) || 7
  });
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeStatus(status) {
  return [
    'APPLICATION_STARTED', 'SUBMITTED', 'UNDER_REVIEW', 'ASSESSMENT', 'INTERVIEW',
    'ON_HOLD', 'NOT_SELECTED', 'OFFER', 'UNKNOWN',
    'Saved', 'Planned', 'Applied', 'Assessment', 'Interview', 'Rejected', 'Offer', 'Withdrawn'
  ].includes(status);
}

function isOfficialApplicationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

function applicationResponse(application, events = []) {
  return {
    id: String(application._id),
    jobId: String(application.jobId),
    jobTitle: application.jobTitle,
    companyName: application.companyName,
    officialApplicationUrl: application.officialApplicationUrl,
    status: application.status,
    notes: application.notes || '',
    interviewDate: application.interviewDate || '',
    history: events.map(event => ({ status: event.status, at: event.occurredAt, source: event.source })),
    createdAt: application.createdAt,
    updatedAt: application.updatedAt
  };
}

app.get('/api/health', (req, res) => {
  const ready = mongoReady && mongoose.connection.readyState === 1;
  return res.status(ready ? 200 : 503).json({
    ok: ready,
    status: ready ? 'ready' : 'database-unavailable',
    mode: 'jobs-mongodb',
    mongodbConnected: mongoose.connection.readyState === 1,
    message: ready
      ? 'CareerPilot API and MongoDB are ready.'
      : 'CareerPilot API is listening, but MongoDB is not ready. Database-backed features are unavailable.'
  });
});
app.get('/api/ai/status', (req, res) => res.json(getAIProviderStatus()));
app.post('/api/ai/skill-gap-analysis', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
  if (req.body?.consentAccepted !== true) {
    return res.status(400).json({ error: 'Consent is required before sending skill analysis data to an AI provider.' });
  }
  const role = typeof req.body?.role === 'string' ? req.body.role.trim().slice(0, 100) : '';
  const jobCount = req.body?.jobCount;
  const skills = req.body?.skills;
  if (!role || !Number.isInteger(jobCount) || jobCount < 1 || jobCount > 5000) {
    return res.status(400).json({ error: 'A target role and a valid job sample count are required.' });
  }
  if (!Array.isArray(skills) || skills.length > 30) {
    return res.status(400).json({ error: 'Provide up to 30 skill signals for analysis.' });
  }
  const safeSkills = [];
  for (const item of skills) {
    if (
      !item
      || typeof item.name !== 'string'
      || !item.name.trim()
      || item.name.trim().length > 80
      || !['verified', 'self-declared', 'learning', 'not-confirmed'].includes(item.status)
      || !['listingCount', 'requiredCount', 'preferredCount'].every(field =>
        Number.isInteger(item[field]) && item[field] >= 0 && item[field] <= jobCount)
      || (item.descriptionMentionCount !== undefined
        && (!Number.isInteger(item.descriptionMentionCount)
          || item.descriptionMentionCount < 0
          || item.descriptionMentionCount > item.listingCount))
    ) {
      return res.status(400).json({ error: 'Each skill signal must contain a name, evidence status, and valid listing counts.' });
    }
    safeSkills.push({
      name: item.name.trim(),
      status: item.status,
      listingCount: item.listingCount,
      requiredCount: item.requiredCount,
      preferredCount: item.preferredCount,
      descriptionMentionCount: item.descriptionMentionCount || 0
    });
  }
  try {
    return res.json(await analyzeSkillGaps({ role, jobCount, skills: safeSkills }));
  } catch (error) {
    console.error('Skill gap AI analysis failed:', error.message);
    return res.status(error.statusCode || 502).json({
      error: error.message || 'AI skill analysis could not be completed.'
    });
  }
}));
app.post('/api/ai/job-chat', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length > 20) {
    return res.status(400).json({ error: 'Chat messages must be provided as a list of 20 or fewer messages.' });
  }
  const job = req.body?.job && typeof req.body.job === 'object' && !Array.isArray(req.body.job)
    ? req.body.job
    : {};
  try {
    let resumeText = '';
    if (req.body?.includeResume === true) {
      const resume = mongoose.connection.readyState === 1
        ? await ResumeDocument.findOne({
          userId: req.user.id,
          originalText: { $ne: '' },
          extractionStatus: 'complete'
        }).sort({ analyzedAt: -1, createdAt: -1 }).select('originalText').lean()
        : [...resumeRecords.values()]
          .filter(record => record.userId === req.user.id && record.extractionStatus === 'complete' && record.originalText)
          .sort((left, right) => new Date(right.analyzedAt || 0) - new Date(left.analyzedAt || 0))[0];
      if (!resume?.originalText) {
        return res.status(400).json({ error: 'No analyzed resume is available. Upload and analyze a resume in Career DNA first.' });
      }
      resumeText = resume.originalText;
    }
    const answer = await answerJobQuestion({ job, messages, resumeText });
    return res.json({
      ...answer,
      resumeIncluded: Boolean(resumeText),
      dataHandling: `Job context and chat messages${resumeText ? ', plus your explicitly attached analyzed resume' : ''} are sent to the configured AI provider for this request and are not saved by CareerPilot.`
    });
  } catch (error) {
    console.error('Job chat request failed:', error.message);
    return res.status(error.statusCode || 502).json({ error: error.message || 'The AI chat could not answer this question.' });
  }
}));
app.post('/api/auth/register', authRateLimit, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  let input;
  try {
    input = validateRegistrationInput(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  const existing = await User.findOne({ email: input.email }).select('_id').lean();
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    termsAcceptedAt: new Date(),
    privacyAcceptedAt: new Date()
  });
  const token = issueAccessToken(user, secret);
  setAccessCookie(res, token, WEB_SESSION_TTL_SECONDS);
  return res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', authRateLimit, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  user.lastLoginAt = new Date();
  await user.save();
  const token = issueAccessToken(user, secret);
  setAccessCookie(res, token, WEB_SESSION_TTL_SECONDS);
  return res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  clearAccessCookie(res);
  return res.json({ loggedOut: true });
});

app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => {
  if (req.user.tokenType === 'demo') {
    return res.json({ user: { id: 'demo-user', name: 'Demo Candidate', email: req.user.email } });
  }
  if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.user.id)) {
    return res.status(404).json({ error: 'Account not found.' });
  }
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ user: publicUser(user) });
}));
app.post('/api/extension/pair', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const rawToken = randomBytes(32).toString('base64url');
  const connection = await ExtensionConnection.create({
    userId: req.user.id,
    tokenHash: createHash('sha256').update(rawToken).digest('hex'),
    name: typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : 'CareerPilot Chrome extension',
    expiresAt: new Date(Date.now() + 30 * 86400000)
  });
  return res.status(201).json({
    connectionId: String(connection._id),
    token: rawToken,
    expiresAt: connection.expiresAt,
    scopes: connection.scopes,
    warning: 'Store this token securely. It is shown only once.'
  });
}));
app.get('/api/extension/profile', requireExtensionAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!Array.isArray(req.extension.scopes) || !req.extension.scopes.includes('profile:read')) {
    return res.status(403).json({ error: 'This extension connection does not have profile:read scope.' });
  }
  const record = await CandidateProfile.findOne({ userId: req.extension.userId }).lean();
  const profile = record?.confirmed || {};
  return res.json({
    name: profile.fullName || profile.name || '',
    email: profile.email || '',
    phone: profile.phone || '',
    location: profile.location || '',
    linkedIn: profile.linkedIn || profile.linkedInUrl || '',
    github: profile.github || profile.githubUrl || '',
    portfolio: profile.portfolio || profile.portfolioUrl || ''
  });
}));
app.get('/api/extension/connections', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const connections = await ExtensionConnection.find({
    userId: req.user.id, revokedAt: null, expiresAt: { $gt: new Date() }
  }).select('name scopes expiresAt createdAt').sort({ createdAt: -1 }).lean();
  return res.json(connections.map(connection => ({ id: String(connection._id), ...connection })));
}));
app.delete('/api/extension/connections/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: 'Extension connection not found.' });
  }
  const result = await ExtensionConnection.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  if (!result) return res.status(404).json({ error: 'Extension connection not found.' });
  return res.json({ revoked: true, connectionId: req.params.id });
}));
app.post('/api/ai/resume-analysis', requireAuth, aiRateLimit, async (req, res) => {
  const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
  const jobDescription = typeof req.body?.jobDescription === 'string' ? req.body.jobDescription.trim() : '';
  if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending resume text to an AI provider.' });
  if (resumeText.length < 30) return res.status(400).json({ error: 'Resume text must contain at least 30 characters.' });
  if (resumeText.length > 20000) return res.status(413).json({ error: 'Resume text must be 20,000 characters or fewer.' });
  if (jobDescription.length < 20) return res.status(400).json({ error: 'Job description must contain at least 20 characters.' });
  if (jobDescription.length > 12000) return res.status(413).json({ error: 'Job description must be 12,000 characters or fewer.' });
  try {
    const analysis = await analyzeResume({ resumeText, jobDescription });
    return res.json({ ...analysis, dataHandling: 'Input is processed for this request only and is not saved by this in-memory demo API.' });
  } catch (error) {
    console.error('Resume AI analysis failed:', error.message);
    return res.status(error.statusCode || 502).json({ error: error.message || 'Resume analysis failed.' });
  }
});

async function getRejectionJob(jobId) {
  if (!jobId) return null;
  if (typeof jobId !== 'string' || !mongoose.Types.ObjectId.isValid(jobId)) {
    const error = new Error('Select a valid job listing or continue without one.');
    error.statusCode = 400;
    throw error;
  }
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('Job details are unavailable because MongoDB is not connected.');
    error.statusCode = 503;
    throw error;
  }
  const job = await Job.findById(jobId).lean();
  if (!job) {
    const error = new Error('The selected job listing could not be found.');
    error.statusCode = 404;
    throw error;
  }
  return job;
}

app.post('/api/rejection/questions', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
  if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending information to an AI provider.' });
  try {
    const job = await getRejectionJob(req.body?.jobId);
    const savedProfile = await CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean();
    const profile = savedProfile?.confirmed || {};
    const gaps = computeGaps(profile, job || {});
    const known = {
      skills: (profile.existingSkills || []).filter(skill => ['verified', 'self-declared'].includes(skill.confidence)).map(skill => skill.name),
      yearsExperience: profile.yearsExperience,
      workAuthorizationCountries: profile.workAuthorizationCountries || []
    };
    const questions = await planQuestions({
      stage: req.body?.stage,
      feedbackType: req.body?.feedbackType,
      gaps,
      known
    });
    return res.json({
      ...questions,
      gaps,
      stage: req.body?.stage || 'unknown',
      dataHandling: 'Inputs are processed for this request and are not saved by this API.'
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Could not prepare reflection questions.' });
  }
}));

app.post('/api/rejection/report', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
  if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending information to an AI provider.' });
  const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
  const pastedText = typeof req.body?.pastedText === 'string' ? req.body.pastedText.trim() : '';
  if (resumeText.length > 20000) return res.status(413).json({ error: 'Resume text must be 20,000 characters or fewer.' });
  if (pastedText.length > 12000) return res.status(413).json({ error: 'Feedback text must be 12,000 characters or fewer.' });
  if (req.body?.answers !== undefined && !Array.isArray(req.body.answers)) return res.status(400).json({ error: 'answers must be an array.' });
  try {
    const job = await getRejectionJob(req.body?.jobId);
    const profile = getProfile(req.user.id);
    const gaps = computeGaps(profile, job || {});
    const known = {
      skills: (profile.existingSkills || []).filter(skill => ['verified', 'self-declared'].includes(skill.confidence)).map(skill => skill.name),
      yearsExperience: profile.yearsExperience,
      workAuthorizationCountries: profile.workAuthorizationCountries || []
    };
    const report = await generateReport({
      resumeText,
      pastedText,
      jobId: req.body?.jobId,
      stage: req.body?.stage,
      feedbackType: req.body?.feedbackType,
      answers: req.body?.answers,
      gaps,
      known
    });
    return res.json({ ...report, dataHandling: 'Inputs are processed for this request and temporarily cached in memory; no pasted feedback or resume is written to persistent storage.' });
  } catch (error) {
    return res.status(error.statusCode || 502).json({ error: error.message || 'Could not generate the reflection report.' });
  }
}));

app.post('/api/auth/demo', (req, res) => {
  const requestedEmail = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 120) : '';
  const email = requestedEmail || 'demo@example.com';
  const token = issueDemoAccessToken(email, secret);
  setAccessCookie(res, token, DEMO_SESSION_TTL_SECONDS);
  return res.json({ user: { id: 'demo-user', name: 'Demo Candidate', email } });
});

app.get('/api/jobs/sync-status', asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.json({
    mongodbConnected: false,
    configured: {
      theirstack: Boolean(process.env.THEIRSTACK_API_KEY),
      adzuna: Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim()),
      greenhouse: false, lever: false, ashby: false
    },
    latestRuns: []
  });
  try {
    const registry = getCompanyRegistry();
    const latestRuns = await JobSyncRun.aggregate([
      { $sort: { startedAt: -1 } },
      { $group: { _id: { provider: '$provider', sourceId: '$sourceId' }, run: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$run' } },
      { $project: { _id: 0, provider: 1, sourceId: 1, status: 1, startedAt: 1, completedAt: 1, fetched: 1, normalized: 1, inserted: 1, updated: 1, rejected: 1, pages: 1, creditsEstimated: 1, nextOffset: 1, error: 1 } }
    ]);
    return res.json({
      mongodbConnected: true,
      configured: {
        theirstack: Boolean(process.env.THEIRSTACK_API_KEY),
        adzuna: Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim()),
        greenhouse: registry.some(company => company.atsProvider === 'greenhouse'),
        lever: registry.some(company => company.atsProvider === 'lever'),
        ashby: registry.some(company => company.atsProvider === 'ashby')
      },
      latestRuns
    });
  } catch (error) {
    return res.status(500).json({ error: `Unable to read sync status: ${error.message}` });
  }
}));

function isSyncAuthorized(req) {
  const expected = process.env.JOB_SYNC_TOKEN || '';
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!expectedBuffer.length || expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

app.post('/api/admin/jobs/sync', asyncRoute(async (req, res) => {
  if (!process.env.JOB_SYNC_TOKEN) return res.status(503).json({ error: 'Set JOB_SYNC_TOKEN on the server to enable manual synchronization.' });
  if (!isSyncAuthorized(req)) return res.status(401).json({ error: 'Invalid job synchronization token.' });
  const providers = req.body?.providers;
  if (providers !== undefined && (!Array.isArray(providers) || !providers.length || providers.some(provider => !['theirstack', 'adzuna', 'greenhouse', 'lever', 'ashby'].includes(provider)))) {
    return res.status(400).json({ error: 'providers must be a non-empty array of supported source names.' });
  }
  try {
    return res.json(await synchronizeJobs({ providers }));
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
}));

app.get('/api/jobs', optionalAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const allowed = ['q', 'location', 'country', 'workplaceType', 'employmentType', 'experienceLevel', 'skills', 'postedWithinDays', 'status', 'sort', 'page', 'limit', 'recommended'];
  for (const key of Object.keys(req.query)) {
    if (!allowed.includes(key)) return res.status(400).json({ error: `Unsupported job filter: ${key}` });
    if (typeof req.query[key] !== 'string') return res.status(400).json({ error: `${key} must be a single string value.` });
  }
  const query = {};
  if (req.query.recommended !== undefined && !['true', 'false'].includes(req.query.recommended)) {
    return res.status(400).json({ error: 'recommended must be true or false.' });
  }
  if (req.query.sort && !['newest', 'oldest', 'priority'].includes(req.query.sort)) return res.status(400).json({ error: 'sort must be priority, newest, or oldest.' });
  if (req.query.experienceLevel && !['entry', 'internship', 'mid', 'senior'].includes(req.query.experienceLevel)) return res.status(400).json({ error: 'experienceLevel must be internship, entry, mid, or senior.' });
  if (req.query.workplaceType && !['remote', 'hybrid', 'onsite'].includes(req.query.workplaceType)) return res.status(400).json({ error: 'workplaceType must be remote, hybrid, or onsite.' });
  if (req.query.status && !['active', 'expired', 'closed', 'unverified', 'unknown'].includes(req.query.status)) return res.status(400).json({ error: 'Unsupported job status.' });
  if (req.query.page && !/^\d+$/.test(req.query.page)) return res.status(400).json({ error: 'page must be a positive integer.' });
  if (req.query.limit && !/^\d+$/.test(req.query.limit)) return res.status(400).json({ error: 'limit must be a positive integer.' });
  if (req.query.postedWithinDays && (!Number.isInteger(Number(req.query.postedWithinDays)) || Number(req.query.postedWithinDays) < 1 || Number(req.query.postedWithinDays) > 365)) return res.status(400).json({ error: 'postedWithinDays must be an integer from 1 to 365.' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const searchFields = ['title', 'companyName', 'description', 'requiredSkills', 'preferredSkills'];
    const termConditions = terms.map(term => {
      const pattern = new RegExp(escapedRegex(term), 'i');
      return { $or: searchFields.map(field => ({ [field]: pattern })) };
    });
    if (termConditions.length === 1) query.$or = termConditions[0].$or;
    else {
      query.$and ||= [];
      query.$and.push(...termConditions);
    }
  }
  const textFilterFields = ['location', 'country', 'employmentType', 'experienceRequirements', 'status'];
  for (const field of textFilterFields) {
    if (typeof req.query[field] === 'string' && req.query[field].trim()) {
      const filter = new RegExp(escapedRegex(req.query[field].trim().slice(0, 80)), 'i');
      if (field === 'country') {
        query.$and ||= [];
        query.$and.push({ $or: [{ country: filter }, { countryCode: filter }] });
      } else {
        query[field] = filter;
      }
    }
  }
  if (['remote', 'hybrid', 'onsite'].includes(req.query.workplaceType)) query.workplaceType = req.query.workplaceType;
  if (typeof req.query.skills === 'string' && req.query.skills.trim()) {
    const skills = req.query.skills.split(',').map(skill => skill.trim()).filter(Boolean).slice(0, 10);
    if (skills.length) query.requiredSkills = { $in: skills.map(skill => new RegExp(escapedRegex(skill), 'i')) };
  }
  if (req.query.experienceLevel === 'entry') query.experienceRequirements = { $regex: /\b(?:0|1|2)\b|entry|junior|graduate/i };
  if (req.query.experienceLevel === 'internship') query.employmentType = /intern/i;
  if (req.query.experienceLevel === 'mid') query.experienceRequirements = { $regex: /\b[3-7]\b|mid.level/i };
  if (req.query.experienceLevel === 'senior') query.experienceRequirements = { $regex: /\b[5-9]\b|senior|lead/i };
  const days = Number(req.query.postedWithinDays);
  if (Number.isInteger(days) && days > 0 && days <= 365) query.postedAt = { $gte: new Date(Date.now() - days * 86400000) };
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 30));
  const sort = req.query.sort === 'oldest' ? { postedAt: 1, lastDiscoveredAt: -1 } : { postedAt: -1, lastDiscoveredAt: -1 };
  try {
    let profile = {};
    if (req.user?.tokenType === 'demo') {
      profile = getProfile(req.user.id);
    } else if (req.user?.id) {
      const savedProfile = await CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean();
      profile = savedProfile?.confirmed || {};
      const analyzedResume = req.user?.id
        ? await ResumeDocument.findOne({
          userId: req.user.id,
          originalText: { $ne: '' },
          extractionStatus: 'complete'
        }).sort({ analyzedAt: -1, createdAt: -1 }).select('extractedData originalText').lean()
        : null;
      profile = buildRecommendationProfile(profile, analyzedResume?.extractedData, analyzedResume?.originalText || '');
    }

    if (req.query.recommended === 'true') {
      const candidateSkills = (profile.existingSkills || [])
        .filter(skill => ['verified', 'self-declared'].includes(skill.confidence))
        .map(skill => typeof skill.name === 'string' ? skill.name.trim() : '')
        .filter(Boolean);
      if (!candidateSkills.length) {
        return res.json({
          items: [],
          pagination: { page, limit, total: 0, pages: 0 },
          recommendationInfo: {
            status: 'needs-profile',
            message: 'Analyze a resume in Career DNA or save reviewed skills to get personalized job recommendations.'
          },
          filters: { indiaPrioritized: true }
        });
      }

      query.$and ||= [];
      const preferredRoles = (profile.preferredRoles || [])
        .filter(role => typeof role === 'string' && role.trim())
        .slice(0, 10);
      const roleTerms = [...new Set(preferredRoles
        .flatMap(role => role.split(/\s+/))
        .map(term => term.trim())
        .filter(term => term.length >= 3 && !['engineer', 'developer', 'specialist', 'manager', 'analyst', 'designer'].includes(term.toLowerCase())))];
      const roleTitleConditions = roleTerms.map(term => ({
        title: new RegExp(`(^|[^a-zA-Z0-9])${escapedRegex(term)}($|[^a-zA-Z0-9])`, 'i')
      }));
      query.$and.push({
        $or: [
          { requiredSkills: { $in: candidateSkills.map(skill => new RegExp(`^${escapedRegex(skill)}$`, 'i')) } },
          { preferredSkills: { $in: candidateSkills.map(skill => new RegExp(`^${escapedRegex(skill)}$`, 'i')) } },
          { description: { $in: candidateSkills.map(skill => new RegExp(`(^|[^a-zA-Z0-9])${escapedRegex(skill)}($|[^a-zA-Z0-9])`, 'i')) } },
          { title: { $in: candidateSkills.map(skill => new RegExp(`(^|[^a-zA-Z0-9])${escapedRegex(skill)}($|[^a-zA-Z0-9])`, 'i')) } },
          ...roleTitleConditions
        ]
      });
      const records = await Job.find(query).sort({ postedAt: -1, lastDiscoveredAt: -1 }).lean();
      const recommendationResult = recommendJobs(records.map(job => toJobResponse(job, profile)), profile);
      const total = recommendationResult.items.length;
      const start = (page - 1) * limit;
      return res.json({
        items: recommendationResult.items.slice(start, start + limit),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        recommendationInfo: {
          status: recommendationResult.status,
          message: recommendationResult.message
        },
        filters: { indiaPrioritized: true }
      });
    }

    if (req.query.sort === 'priority') {
      const records = await Job.find(query).sort({ postedAt: -1, lastDiscoveredAt: -1 }).lean();
      const rankedJobs = sortJobsByPriority(records.map(job => ({
        ...toJobResponse(job, profile),
        priority: priorityFor(job, profile)
      })));
      const total = rankedJobs.length;
      const start = (page - 1) * limit;
      return res.json({
        items: rankedJobs.slice(start, start + limit),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        filters: { indiaPrioritized: true },
        sort: 'priority'
      });
    }

    const [records, total] = await Promise.all([
      Job.aggregate([
        { $match: query },
        { $addFields: { indiaPriority: { $cond: [{ $eq: ['$countryCode', 'IN'] }, 0, 1] } } },
        { $sort: { indiaPriority: 1, ...sort } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { indiaPriority: 0 } }
      ]),
      Job.countDocuments(query)
    ]);
    return res.json({
      items: records.map(job => toJobResponse(job, profile)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      filters: { indiaPrioritized: true }
    });
  } catch (error) {
    console.error(`Job search failed: ${error.message}`);
    return res.status(500).json({ error: 'Job search failed. Check the API logs and MongoDB connection.' });
  }
}));

app.get('/api/saved', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const records = await SavedJob.find({ userId: req.user.id }).sort({ savedAt: -1 }).select('jobId savedAt').lean();
    return res.json(records.map(record => ({ jobId: String(record.jobId), savedAt: record.savedAt })));
  }
  return res.json([...getSaved(req.user.id)].map(jobId => ({ jobId })));
}));
app.get('/api/saved/jobs', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.json([]);
  const savedRecords = await SavedJob.find({ userId: req.user.id }).sort({ savedAt: -1 }).select('jobId').lean();
  const ids = savedRecords.map(record => record.jobId);
  const jobs = await Job.find({ _id: { $in: ids } }).sort({ postedAt: -1 }).lean();
  return res.json(jobs.map(job => toJobResponse(job, getProfile(req.user.id))));
}));
app.post('/api/saved/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || !await Job.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Job not found' });
  await SavedJob.updateOne(
    { userId: req.user.id, jobId: req.params.id },
    { $setOnInsert: { userId: req.user.id, jobId: req.params.id, savedAt: new Date() } },
    { upsert: true }
  );
  const records = await SavedJob.find({ userId: req.user.id }).sort({ savedAt: -1 }).select('jobId savedAt').lean();
  return res.json({ saved: records.map(record => ({ jobId: String(record.jobId), savedAt: record.savedAt })) });
}));
app.delete('/api/saved/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    await SavedJob.deleteOne({ userId: req.user.id, jobId: req.params.id });
    const records = await SavedJob.find({ userId: req.user.id }).sort({ savedAt: -1 }).select('jobId savedAt').lean();
    return res.json({ saved: records.map(record => ({ jobId: String(record.jobId), savedAt: record.savedAt })) });
  }
  getSaved(req.user.id).delete(req.params.id);
  return res.json({ saved: [...getSaved(req.user.id)].map(jobId => ({ jobId })) });
}));

app.get('/api/profile', requireAuth, asyncRoute(async (req, res) => {
  const profile = getProfile(req.user.id);
  if (mongoose.connection.readyState === 1) {
    const record = await CandidateProfile.findOne({ userId: req.user.id }).lean();
    if (record?.confirmed && typeof record.confirmed === 'object') Object.assign(profile, record.confirmed);
  }
  return res.json(profile);
}));
app.put('/api/profile', requireAuth, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const profile = getProfile(req.user.id);
  for (const field of [
    'fullName', 'email', 'phone', 'location', 'linkedIn', 'github', 'portfolio', 'objective',
    'workplacePreference', 'employmentPreference', 'availability'
  ]) {
    if (typeof body[field] === 'string') profile[field] = body[field].trim().slice(0, 500);
  }
  if (Array.isArray(body.interests)) profile.interests = body.interests.filter(x => typeof x === 'string').slice(0, 20);
  if (Array.isArray(body.learningGoals)) profile.learningGoals = body.learningGoals.filter(x => typeof x === 'string').slice(0, 20);
  if (Array.isArray(body.preferredRoles)) profile.preferredRoles = body.preferredRoles.filter(x => typeof x === 'string').slice(0, 20);
  if (Array.isArray(body.preferredLocations)) profile.preferredLocations = body.preferredLocations.filter(x => typeof x === 'string').slice(0, 20);
  if (Number.isFinite(body.weeklyBudgetHours)) profile.weeklyBudgetHours = Math.max(1, Math.min(60, body.weeklyBudgetHours));
  if (Number.isFinite(body.maxEffortMinutes)) profile.maxEffortMinutes = Math.max(10, Math.min(480, body.maxEffortMinutes));
  if (Number.isFinite(body.yearsExperience)) profile.yearsExperience = Math.max(0, Math.min(60, body.yearsExperience));
  if (body.yearsExperience === null) profile.yearsExperience = null;
  if (Array.isArray(body.workAuthorizationCountries)) {
    profile.workAuthorizationCountries = body.workAuthorizationCountries
      .filter(country => typeof country === 'string')
      .map(country => country.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (Array.isArray(body.existingSkills)) {
    profile.existingSkills = body.existingSkills
      .filter(x => x && typeof x.name === 'string' && ['verified', 'self-declared', 'learning'].includes(x.confidence))
      .slice(0, 50);
  }
  for (const field of ['education', 'projects', 'experience', 'achievements']) {
    if (Array.isArray(body[field])) profile[field] = body[field].filter(item => item && typeof item === 'object').slice(0, 50);
  }
  if (mongoose.connection.readyState === 1) {
    await CandidateProfile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { confirmed: profile, updatedByCandidateAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return res.json(profile);
}));

app.get('/api/profile/record', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({ userId: req.user.id, confirmed: getProfile(req.user.id), persistence: 'memory' });
  }
  const record = await CandidateProfile.findOne({ userId: req.user.id }).lean();
  return res.json({
    userId: req.user.id,
    confirmed: record?.confirmed || getProfile(req.user.id),
    updatedByCandidateAt: record?.updatedByCandidateAt || null,
    persistence: 'mongodb'
  });
}));

app.put('/api/profile/record', requireAuth, asyncRoute(async (req, res) => {
  const confirmed = req.body?.confirmed;
  if (!confirmed || typeof confirmed !== 'object' || Array.isArray(confirmed)) {
    return res.status(400).json({ error: 'confirmed profile data must be an object.' });
  }
  const safeConfirmed = JSON.parse(JSON.stringify(confirmed));
  const profile = getProfile(req.user.id);
  Object.assign(profile, safeConfirmed);
  if (mongoose.connection.readyState !== 1) {
    return res.json({ userId: req.user.id, confirmed: profile, persistence: 'memory' });
  }
  const record = await CandidateProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { confirmed: safeConfirmed, updatedByCandidateAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return res.json({ userId: req.user.id, confirmed: record.confirmed, updatedByCandidateAt: record.updatedByCandidateAt, persistence: 'mongodb' });
}));

app.post('/api/profile/resumes', requireAuth, asyncRoute(async (req, res) => {
  const originalText = typeof req.body?.originalText === 'string' ? req.body.originalText.trim() : '';
  if (originalText.length > resumeTextLimit) return res.status(413).json({ error: `Resume text must be ${resumeTextLimit} characters or fewer.` });
  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 240) : '';
  const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType.trim().slice(0, 80) : 'text/plain';
  const fileSize = Number.isFinite(req.body?.fileSize) ? req.body.fileSize : 0;
  if (!fileName || !/\.(pdf|docx)$/i.test(fileName)) return res.status(400).json({ error: 'Only PDF and DOCX resume metadata is supported.' });
  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > 10 * 1024 * 1024) return res.status(413).json({ error: 'Resume files must be smaller than 10 MB.' });
  if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'].includes(fileType)) {
    return res.status(400).json({ error: 'Unsupported resume file type.' });
  }
  const extractedData = req.body?.extractedData && typeof req.body.extractedData === 'object' && !Array.isArray(req.body.extractedData)
    ? req.body.extractedData : {};
  const evidenceReferences = Array.isArray(req.body?.evidenceReferences) ? req.body.evidenceReferences.slice(0, 500) : [];
  const data = {
    userId: req.user.id,
    fileName,
    fileType,
    fileSize,
    originalText,
    extractedData,
    evidenceReferences,
    extractionStatus: ['not-started', 'complete', 'failed'].includes(req.body?.extractionStatus) ? req.body.extractionStatus : 'not-started',
    analyzedAt: req.body?.analyzedAt ? new Date(req.body.analyzedAt) : null
  };
  if (mongoose.connection.readyState !== 1) {
    const id = randomUUID();
    const record = { id, ...data, createdAt: new Date().toISOString(), analyzedAt: null };
    resumeRecords.set(id, record);
    return res.status(201).json({ ...record, persistence: 'memory-only' });
  }
  const document = await ResumeDocument.create(data);
  return res.status(201).json({ id: String(document._id), fileName: document.fileName, fileType: document.fileType, fileSize: document.fileSize, extractionStatus: document.extractionStatus, analyzedAt: document.analyzedAt, createdAt: document.createdAt, persistence: 'mongodb' });
}));

app.delete('/api/profile/resumes/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    const record = resumeRecords.get(req.params.id);
    if (!record || record.userId !== req.user.id) return res.status(404).json({ error: 'Resume record not found.' });
    resumeRecords.delete(req.params.id);
    return res.json({ deleted: true });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Resume record not found.' });
  const result = await ResumeDocument.deleteOne({ _id: req.params.id, userId: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Resume record not found.' });
  return res.json({ deleted: true });
}));

app.post('/api/profile/resumes/:id/analyze', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
  if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending resume text to an AI provider.' });
  const resumeText = typeof req.body?.resumeText === 'string' ? req.body.resumeText.trim() : '';
  if (resumeText.length < 30) return res.status(400).json({ error: 'Resume text must contain at least 30 characters.' });
  if (resumeText.length > resumeTextLimit) return res.status(413).json({ error: `Resume text must be ${resumeTextLimit} characters or fewer.` });
  const extraction = await extractResumeProfile({ resumeText });
  if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)) {
    const updated = await ResumeDocument.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { originalText: resumeText, extractedData: extraction, extractionStatus: 'complete', analyzedAt: new Date() } }
    );
    if (!updated) return res.status(404).json({ error: 'Resume record not found.' });
  } else {
    const record = resumeRecords.get(req.params.id);
    if (!record || record.userId !== req.user.id) return res.status(404).json({ error: 'Resume record not found.' });
    record.originalText = resumeText;
    record.extractedData = extraction;
    record.extractionStatus = 'complete';
    record.analyzedAt = new Date().toISOString();
  }
  return res.json({ ...extraction, analysisStatus: 'complete', dataHandling: 'The extracted data remains a draft until you approve profile updates.' });
}));

app.get('/api/profile/resumes', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json([...resumeRecords.values()]
      .filter(record => record.userId === req.user.id)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map(({ originalText, extractedData, evidenceReferences, ...metadata }) => metadata));
  }
  const documents = await ResumeDocument.find({ userId: req.user.id })
    .select('fileName fileType fileSize extractionStatus analyzedAt createdAt')
    .sort({ createdAt: -1 }).lean();
  return res.json(documents.map(document => ({ id: String(document._id), ...document })));
}));

app.get('/api/profile/resumes/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    const record = resumeRecords.get(req.params.id);
    if (!record || record.userId !== req.user.id) return res.status(404).json({ error: 'Resume record not found.' });
    return res.json(record);
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Resume record not found.' });
  const document = await ResumeDocument.findOne({ _id: req.params.id, userId: req.user.id }).lean();
  if (!document) return res.status(404).json({ error: 'Resume record not found.' });
  return res.json({ id: String(document._id), ...document });
}));

app.post('/api/profile/job-analysis', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.body?.jobId)) {
    return res.status(400).json({ error: 'A stored job is required for resume alignment analysis.' });
  }
  const job = await Job.findById(req.body.jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job listing not found.' });
  const profile = getProfile(req.user.id);
  const match = matchJob(job, profile);
  const requirementMappings = (job.requiredSkills || []).map(requirement => ({
    requirement,
    status: match.matchedSkills.includes(requirement) ? 'supported-by-profile' : 'not-demonstrated',
    evidence: match.matchedSkills.includes(requirement) ? `Skill is listed in the confirmed Career DNA profile: ${requirement}.` : 'The confirmed Career DNA profile does not list this required skill.'
  }));
  if (job.experienceRequirements) requirementMappings.push({
    requirement: job.experienceRequirements,
    status: match.experienceMatch === 'meets-known-years' ? 'supported-by-profile' : match.experienceMatch === 'below-known-years' ? 'not-demonstrated' : 'requires-candidate-confirmation',
    evidence: match.experienceMatch === 'meets-known-years' ? 'Years of experience in the confirmed profile meet the stated requirement.' : 'The available profile data cannot fully establish this requirement.'
  });
  return res.json({
    job: { id: String(job._id), title: job.title, company: job.companyName, description: job.description, location: job.location, employmentType: job.employmentType },
    alignment: { skillMatch: match.skillMatch, matchedSkills: match.matchedSkills, missingSkills: match.missingSkills, experienceMatch: match.experienceMatch, eligibilityMatch: match.eligibilityMatch, category: match.category },
    requirementMappings,
    recommendations: [
      ...match.missingSkills.map(skill => ({ type: 'skills-to-learn', title: `Review the ${skill} requirement`, reason: 'This required skill is not listed in the confirmed profile.', nextStep: `Only add ${skill} after you confirm genuine experience or learning evidence.` })),
      ...(match.matchedSkills.length ? [{ type: 'highlight-existing', title: 'Highlight matched skills', reason: 'These skills are already listed in Career DNA and align with the role.', nextStep: 'Review relevant projects or experience before tailoring wording.' }] : []),
      { type: 'evidence-check', title: 'Review the original listing', reason: 'Alignment is based on stored job fields and confirmed profile data, not hiring predictions.', nextStep: 'Compare the requirements with your original resume before editing.' }
    ],
    note: 'This is an evidence comparison, not a prediction of hiring success. No resume content was changed.'
  });
}));

app.get('/api/profile/tailored-resumes', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json([]);
    const query = { userId: req.user.id };
    if (req.query.jobId && mongoose.Types.ObjectId.isValid(req.query.jobId)) query.targetJobId = req.query.jobId;
    const versions = await TailoredResume.find(query).sort({ updatedAt: -1 }).select('-sections').lean();
    return res.json(versions.map(version => ({ ...version, id: String(version._id), targetJobId: String(version.targetJobId) })));
}));

app.post('/api/profile/tailored-resumes', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.body?.jobId)) return res.status(400).json({ error: 'A stored job is required for a tailored resume.' });
    const job = await Job.findById(req.body.jobId).lean();
    if (!job) return res.status(404).json({ error: 'Job listing not found.' });
    const proofPoints = (Array.isArray(req.body?.proofPoints) ? req.body.proofPoints : [])
      .filter(item => item && item.reviewed === true && ['resume', 'profile'].includes(item.sourceType))
      .slice(0, 30)
      .map(item => ({
        requirement: typeof item.requirement === 'string' ? item.requirement.trim().slice(0, 120) : '',
        text: typeof item.text === 'string' ? item.text.trim().slice(0, 1000) : '',
        sourceType: item.sourceType,
        sourceLabel: typeof item.sourceLabel === 'string' ? item.sourceLabel.trim().slice(0, 160) : '',
        lineStart: Number.isInteger(item.lineStart) && item.lineStart > 0 ? item.lineStart : null
      }))
      .filter(item => item.requirement && item.text);
    const savedProfile = await CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean();
    const profile = savedProfile?.confirmed || {};
    const sourceResume = await ResumeDocument.findOne({
      userId: req.user.id,
      originalText: { $ne: '' },
      extractionStatus: 'complete'
    }).sort({ createdAt: -1 }).select('extractedData').lean();
    const sections = buildTailoredSections(profile, sourceResume?.extractedData || {});
    if (proofPoints.length) {
      sections.evidence = proofPoints
        .map(item => `${item.requirement}: ${item.text} (${item.sourceLabel}${item.lineStart ? `, line ${item.lineStart}` : ''})`)
        .join('\n');
    }
    const version = await TailoredResume.create({
      userId: req.user.id,
      targetJobId: job._id,
      versionName: typeof req.body?.versionName === 'string' && req.body.versionName.trim() ? req.body.versionName.trim().slice(0, 160) : `${job.title} - Draft`,
      sections,
      proofPoints,
      sourceResumeId: sourceResume ? String(sourceResume._id) : ''
    });
    return res.status(201).json({ ...version.toObject(), id: String(version._id), targetJobId: String(version.targetJobId) });
}));

app.get('/api/profile/tailored-resumes/:id', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const version = await TailoredResume.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
    return res.json({ ...version, id: String(version._id), targetJobId: String(version.targetJobId) });
}));

app.post('/api/profile/tailored-resumes/:id/approve', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const version = await TailoredResume.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { approvalStatus: 'candidate-approved' } },
      { new: true }
    ).lean();
    if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
    return res.json({ ...version, id: String(version._id), targetJobId: String(version.targetJobId) });
}));

app.post('/api/profile/tailored-resumes/:id/suggestions', requireAuth, aiRateLimit, asyncRoute(async (req, res) => {
    if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending profile information to an AI provider.' });
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const version = await TailoredResume.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
    const job = await Job.findById(version.targetJobId).lean();
    if (!job) return res.status(404).json({ error: 'Job listing not found.' });
    const [savedProfile, resume] = await Promise.all([
      CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean(),
      ResumeDocument.findOne({ userId: req.user.id, originalText: { $ne: '' } })
        .sort({ createdAt: -1 })
        .select('originalText')
        .lean()
    ]);
    const suggestions = await generateResumeSuggestions({
      profile: savedProfile?.confirmed || {},
      resumeText: resume?.originalText || '',
      job,
      sections: version.sections
    });
    return res.json(suggestions);
}));

app.post('/api/profile/tailored-resumes/:id/suggestions/accept', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const suggestion = req.body?.suggestion;
    const allowedSections = ['summary', 'skills', 'projects', 'experience', 'education', 'achievements'];
    if (
      !suggestion
      || !allowedSections.includes(suggestion.section)
      || typeof suggestion.proposedText !== 'string'
      || suggestion.proposedText.trim().length === 0
      || suggestion.proposedText.length > 3000
      || typeof suggestion.sourceText !== 'string'
      || suggestion.sourceText.trim().length < 8
      || !['resume', 'profile'].includes(suggestion.sourceType)
      || suggestion.applyAllowed !== true
      || suggestion.reviewRequired !== true
    ) return res.status(400).json({ error: 'A source-backed, reviewed tailoring suggestion is required.' });
    const version = await TailoredResume.findOne({ _id: req.params.id, userId: req.user.id });
    if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
    const [savedProfile, resume] = await Promise.all([
      CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean(),
      ResumeDocument.findOne({ userId: req.user.id, originalText: { $ne: '' } })
        .sort({ createdAt: -1 })
        .select('originalText')
        .lean()
    ]);
    const sourceText = suggestion.sourceType === 'resume'
      ? resume?.originalText || ''
      : JSON.stringify(savedProfile?.confirmed || {});
    if (!validateExactQuote(suggestion.sourceText, sourceText, 8)) {
      return res.status(400).json({ error: 'The suggestion source could not be verified against your current resume or confirmed profile. Generate new recommendations.' });
    }
    const section = suggestion.section.slice(0, 80);
    const proposedText = suggestion.proposedText.slice(0, 4000);
    version.sections = { ...(version.sections || {}), [section]: proposedText };
    version.approvalStatus = 'draft';
    version.applicationId = '';
    version.acceptedSuggestions.push({
      section,
      proposedText,
      sourceText: suggestion.sourceText.slice(0, 2000),
      requirement: typeof suggestion.requirement === 'string' ? suggestion.requirement.slice(0, 160) : '',
      rationale: typeof suggestion.rationale === 'string' ? suggestion.rationale.slice(0, 500) : '',
      acceptedAt: new Date().toISOString()
    });
    await version.save();
    return res.json({ ...version.toObject(), id: String(version._id), targetJobId: String(version.targetJobId) });
}));

app.post('/api/profile/tailored-resumes/:id/duplicate', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const source = await TailoredResume.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!source) return res.status(404).json({ error: 'Tailored resume not found.' });
    const duplicate = await TailoredResume.create({
      userId: req.user.id,
      targetJobId: source.targetJobId,
      versionName: `${source.versionName} - Copy`.slice(0, 160),
      sections: source.sections,
      sourceResumeId: source.sourceResumeId,
      proofPoints: source.proofPoints,
      acceptedSuggestions: source.acceptedSuggestions,
      approvalStatus: 'draft'
    });
    return res.status(201).json({ ...duplicate.toObject(), id: String(duplicate._id), targetJobId: String(duplicate.targetJobId) });
}));

app.put('/api/profile/tailored-resumes/:id', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const sections = req.body?.sections;
    if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return res.status(400).json({ error: 'Resume sections must be an object.' });
    const safeSections = Object.fromEntries(Object.entries(sections).slice(0, 20).map(([key, value]) => [String(key).slice(0, 80), typeof value === 'string' ? value.slice(0, 12000) : '']));
    const updates = { sections: safeSections, approvalStatus: 'draft', applicationId: '' };
    if (typeof req.body?.versionName === 'string' && req.body.versionName.trim()) updates.versionName = req.body.versionName.trim().slice(0, 160);
    const version = await TailoredResume.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { $set: updates }, { new: true }).lean();
    if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
    return res.json({ ...version, id: String(version._id), targetJobId: String(version.targetJobId) });
}));

app.delete('/api/profile/tailored-resumes/:id', requireAuth, asyncRoute(async (req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Tailored resume not found.' });
    const deleted = await TailoredResume.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) return res.status(404).json({ error: 'Tailored resume not found.' });
    return res.status(204).end();
}));

app.get('/api/planner', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const profile = getProfile(req.user.id);
  const savedProfile = await CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean();
  if (savedProfile?.confirmed) Object.assign(profile, savedProfile.confirmed);
  const jobs = await Job.find({ status: { $nin: ['closed', 'expired'] } }).sort({ postedAt: -1 }).limit(200).lean();
  const recommendations = jobs.map(job => ({ ...toJobResponse(job, profile), priority: priorityFor(job, profile) }))
    .sort((a, b) => (b.priority.score ?? -1) - (a.priority.score ?? -1));
  return res.json({ weeklyBudgetHours: profile.weeklyBudgetHours, maxEffortMinutes: profile.maxEffortMinutes, recommendations, persistence: 'mongodb' });
}));
app.put('/api/planner', requireAuth, asyncRoute(async (req, res) => {
  const profile = getProfile(req.user.id);
  if (Number.isFinite(req.body?.weeklyBudgetHours)) profile.weeklyBudgetHours = Math.max(1, Math.min(60, req.body.weeklyBudgetHours));
  if (Number.isFinite(req.body?.maxEffortMinutes)) profile.maxEffortMinutes = Math.max(10, Math.min(480, req.body.maxEffortMinutes));
  if (mongoose.connection.readyState === 1) {
    await CandidateProfile.findOneAndUpdate(
      { userId: req.user.id },
      {
        $set: {
          'confirmed.weeklyBudgetHours': profile.weeklyBudgetHours,
          'confirmed.maxEffortMinutes': profile.maxEffortMinutes,
          updatedByCandidateAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  return res.json({
    weeklyBudgetHours: profile.weeklyBudgetHours,
    maxEffortMinutes: profile.maxEffortMinutes,
    persistence: mongoose.connection.readyState === 1 ? 'mongodb' : 'memory-only'
  });
}));

app.get('/api/trust/:jobId', asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!mongoose.Types.ObjectId.isValid(req.params.jobId)) return res.status(404).json({ error: 'Job not found' });
  const job = await Job.findById(req.params.jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const similar = await Job.find({
    _id: { $ne: job._id },
    companyDomain: job.companyDomain,
    normalizedTitle: job.normalizedTitle,
    normalizedLocation: job.normalizedLocation
  }).limit(10).select('title companyName location status').lean();
  const listing = toJobResponse(job);
  return res.json({
    jobId: listing.id,
    ...listing.trust,
    status: listing.status,
    sources: listing.sources,
    originalUrl: job.applicationUrl,
    lastVerifiedAt: listing.lastVerifiedAt,
    similarListings: similar.map(item => ({ id: String(item._id), title: item.title, company: item.companyName, location: item.location, status: item.status })),
    isDemo: false
  });
}));
app.post('/api/trust/company-search', trustSearchRateLimit, asyncRoute(async (req, res) => {
  const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
  if (companyName.length < 2 || companyName.length > 100) {
    return res.status(400).json({ error: 'Company name must be between 2 and 100 characters.' });
  }

  const submittedSiteUrl = req.body?.officialSiteUrl;
  if (submittedSiteUrl !== undefined && submittedSiteUrl !== '' && typeof submittedSiteUrl !== 'string') {
    return res.status(400).json({ error: 'Company website must be a URL.' });
  }
  if (typeof submittedSiteUrl === 'string' && submittedSiteUrl.length > 2048) {
    return res.status(400).json({ error: 'Company website URL is too long.' });
  }

  let officialSiteUrl = '';
  if (submittedSiteUrl) {
    try {
      officialSiteUrl = parseOfficialSiteUrl(submittedSiteUrl).toString();
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const [webSearchResult, adzunaResult, siteResult] = await Promise.allSettled([
    searchTavilyCompany(companyName),
    searchAdzunaCompany(companyName),
    checkOfficialSite(companyName, officialSiteUrl)
  ]);
  let research;
  if (webSearchResult.status === 'fulfilled') {
    try {
      research = await researchCompanyWithGroq({
        companyName,
        officialSiteUrl,
        searchResults: webSearchResult.value.sources,
        searchQuery: webSearchResult.value.query
      });
    } catch (error) {
      research = {
        status: 'unavailable',
        message: error.message || 'Groq company analysis is unavailable.',
        sources: webSearchResult.value.sources,
        searchQuery: webSearchResult.value.query,
        checkedAt: webSearchResult.value.checkedAt,
        provider: 'tavily + groq'
      };
    }
  } else {
    research = {
      status: 'unavailable',
      message: webSearchResult.reason.message || 'Public web search is unavailable.',
      sources: [],
      provider: 'tavily + groq'
    };
  }
  return res.json({
    companyName,
    research,
    adzuna: adzunaResult.status === 'fulfilled'
      ? adzunaResult.value
      : { status: 'unavailable', message: adzunaResult.reason.message },
    officialSite: siteResult.status === 'fulfilled'
      ? siteResult.value
      : {
          status: 'unavailable',
          message: 'The submitted site could not be checked. Confirm the URL and try again.'
        }
  });
}));
app.post('/api/trust/:jobId/reports', requireAuth, asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.jobId)) return res.status(404).json({ error: 'Job not found' });
  if (!await Job.exists({ _id: req.params.jobId })) return res.status(404).json({ error: 'Job not found' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!reason) return res.status(400).json({ error: 'A report reason is required' });
  const report = { id: randomUUID(), jobId: req.params.jobId, userId: req.user.id, reason, createdAt: new Date().toISOString() };
  reports.push(report);
  return res.status(201).json({ reportId: report.id, message: 'Report saved in demo memory for this session.' });
}));
app.post('/api/trust/:jobId/reviewed', requireAuth, asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.jobId) || !await Job.exists({ _id: req.params.jobId })) return res.status(404).json({ error: 'Job not found' });
  if (!reviewedJobs.has(req.user.id)) reviewedJobs.set(req.user.id, new Set());
  reviewedJobs.get(req.user.id).add(req.params.jobId);
  return res.json({ jobId: req.params.jobId, reviewed: true });
}));

app.get('/api/resume/evidence', requireAuth, asyncRoute(async (req, res) => {
  if (!req.query.jobId) {
    return res.json({
      isDemo: false,
      evidenceAvailable: false,
      notice: 'Select a stored job to compare it with your parsed resume.',
      requirements: []
    });
  }
  if (!mongoose.Types.ObjectId.isValid(req.query.jobId)) {
    return res.status(400).json({ error: 'Select a stored job to compare against your resume.' });
  }
  const job = mongoose.connection.readyState === 1
    ? await Job.findById(req.query.jobId).lean()
    : null;
  if (!job) return res.status(404).json({ error: 'Job listing not found or unavailable.' });

  const [resume, savedProfile] = await Promise.all([
    mongoose.connection.readyState === 1
      ? ResumeDocument.findOne({ userId: req.user.id, originalText: { $ne: '' } })
        .sort({ createdAt: -1 })
        .select('fileName originalText')
        .lean()
      : Promise.resolve([...resumeRecords.values()].find(record => record.userId === req.user.id && record.originalText) || null),
    mongoose.connection.readyState === 1
      ? CandidateProfile.findOne({ userId: req.user.id }).select('confirmed').lean()
      : Promise.resolve(null)
  ]);
  const profile = savedProfile?.confirmed || {};
  const evidence = buildResumeEvidence(job, resume, profile);
  if (!resume?.originalText) {
    evidence.notice = evidence.evidenceAvailable
      ? 'No parsed resume is available. The listed matches come from your confirmed Career DNA and need your review.'
      : 'Add a resume or confirmed profile details before comparing evidence with this job.';
  }
  return res.json(evidence);
}));
app.post('/api/resume/drafts', requireAuth, asyncRoute(async (req, res) => {
  const evidenceId = String(req.body?.evidenceId || '');
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 2000) : '';
  if (!content) return res.status(400).json({ error: 'Draft content is required' });
  if (mongoose.connection.readyState === 1) {
    const draft = await ResumeDraft.create({ userId: req.user.id, evidenceId, content });
    return res.status(201).json({ ...draft.toObject(), id: String(draft._id), persistence: 'mongodb' });
  }
  const draft = { id: randomUUID(), userId: req.user.id, evidenceId, content, status: 'draft', approvedAt: null, createdAt: new Date().toISOString(), persistence: 'memory-only' };
  resumeDrafts.push(draft);
  return res.status(201).json(draft);
}));
app.get('/api/resume/drafts', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const drafts = await ResumeDraft.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json(drafts.map(draft => ({ ...draft, id: String(draft._id) })));
  }
  return res.json(resumeDrafts.filter(item => item.userId === req.user.id));
}));
app.post('/api/resume/drafts/:id/approve', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)) {
    const draft = await ResumeDraft.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: { status: 'candidate-approved-draft', approvedAt: new Date() } },
      { new: true }
    ).lean();
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    return res.json({ ...draft, id: String(draft._id), message: 'Draft approved for your review only. No application was submitted.' });
  }
  const draft = resumeDrafts.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  draft.status = 'candidate-approved-draft';
  draft.approvedAt = new Date().toISOString();
  return res.json({ ...draft, message: 'Draft approved for your review only. No application was submitted.' });
}));

app.get('/api/insights', requireAuth, asyncRoute(async (req, res) => {
  const records = mongoose.connection.readyState === 1
    ? await Application.find({ userId: req.user.id }).select('status createdAt updatedAt').lean()
    : applications.filter(item => item.userId === req.user.id);
  return res.json({
    ...summarizeApplications(records),
    persistence: mongoose.connection.readyState === 1 ? 'mongodb' : 'memory-demo'
  });
}));

app.get('/api/privacy', requireAuth, (req, res) => res.json({
  demoOnly: mongoose.connection.readyState !== 1,
  persistence: mongoose.connection.readyState === 1
    ? 'MongoDB stores account data, confirmed profiles, resume metadata and extracted text, tailored resume drafts, saved jobs, applications, application events, and extension connection records. Original PDF/DOCX file bytes are not retained. Demo reports and authored drafts are held in API memory and reset on restart.'
    : 'MongoDB is not connected. Profile and workflow data use API memory and reset when the API restarts. Resume file bytes remain in the browser; this API stores only submitted metadata and text.',
  policies: [
    { category: 'Account', purpose: 'Authenticate the candidate and protect private workflows', retention: 'MongoDB until account deletion' },
    { category: 'Confirmed profile and preferences', purpose: 'Personalize matching and recommendations', retention: 'MongoDB until account deletion' },
    { category: 'Resume metadata and extracted text', purpose: 'Support candidate-reviewed profile extraction and resume history', retention: 'MongoDB until resume or account deletion; original file bytes are not stored' },
    { category: 'Tailored resume drafts', purpose: 'Save candidate-edited role-specific resume versions', retention: 'MongoDB until draft or account deletion' },
    { category: 'Saved jobs and application history', purpose: 'Track candidate-selected opportunities and status events', retention: 'MongoDB until account deletion' },
    { category: 'Authentication session', purpose: 'Keep the candidate signed in', retention: 'JWT expires after two hours; the client also stores its token until logout or removal' },
    { category: 'Interview practice notes', purpose: 'Let candidates revisit their own answer practice', retention: 'Browser local storage until cleared by the candidate or browser' },
    { category: 'Extension credential', purpose: 'Authorize explicit supported-field autofill', retention: 'API hash remains until revoked/expired; Chrome clears the raw token when a revoked token is next used or the candidate clears it' },
    { category: 'Candidate-authored drafts', purpose: 'Keep application statements available for candidate review', retention: 'MongoDB until account deletion; API memory until restart when MongoDB is unavailable' },
    { category: 'Reports and reviewed listings', purpose: 'Support the current demo workflows', retention: 'API memory until restart; not currently persisted' },
    { category: 'Extension connections', purpose: 'Allow candidate-authorized profile autofill', retention: 'MongoDB until revoked, expired, or account deletion' }
  ],
  externalAiUse: getAIProviderStatus().configured
    ? `Resume analysis sends text only after candidate consent to the configured ${getAIProviderStatus().provider} provider.`
    : 'Resume text is not sent to an AI provider until one is configured and the candidate consents.'
}));
app.get('/api/privacy/export', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.user.id;
  const exportData = {
    profile: getProfile(userId),
    savedJobs: [...getSaved(userId)],
    applications: applications.filter(item => item.userId === userId),
    reports: reports.filter(item => item.userId === userId),
    resumeDrafts: resumeDrafts.filter(item => item.userId === userId),
    resumes: [...resumeRecords.values()].filter(item => item.userId === userId),
    reviewedJobs: [...(reviewedJobs.get(userId) || [])]
  };
  if (mongoose.connection.readyState !== 1) return res.json(exportData);
  const [profile, saved, persistedApplications, events, resumes, tailoredResumes, connections, persistedDrafts] = await Promise.all([
    CandidateProfile.findOne({ userId }).select('confirmed updatedByCandidateAt').lean(),
    SavedJob.find({ userId }).select('jobId savedAt').lean(),
    Application.find({ userId }).lean(),
    ApplicationEvent.find({ userId }).lean(),
    ResumeDocument.find({ userId }).lean(),
    TailoredResume.find({ userId }).lean(),
    ExtensionConnection.find({ userId }).select('-tokenHash').lean(),
    ResumeDraft.find({ userId }).lean()
  ]);
  return res.json({
    ...exportData,
    profile: profile?.confirmed || exportData.profile,
    savedJobs: saved.map(record => ({ jobId: String(record.jobId), savedAt: record.savedAt })),
    applications: persistedApplications,
    applicationEvents: events,
    resumes,
    tailoredResumes,
    extensionConnections: connections,
    resumeDrafts: persistedDrafts
  });
}));
app.delete('/api/account', requireAuth, asyncRoute(async (req, res) => {
  const userId = req.user.id;
  if (mongoose.connection.readyState === 1) {
    await Promise.all([
      CandidateProfile.deleteOne({ userId }),
      ResumeDocument.deleteMany({ userId }),
      ResumeDraft.deleteMany({ userId }),
      TailoredResume.deleteMany({ userId }),
      ApplicationEvent.deleteMany({ userId }),
      Application.deleteMany({ userId }),
      ExtensionConnection.deleteMany({ userId }),
      SavedJob.deleteMany({ userId }),
      ...(mongoose.Types.ObjectId.isValid(userId) ? [User.deleteOne({ _id: userId })] : [])
    ]);
  }
  profiles.delete(userId);
  savedJobs.delete(userId);
  reviewedJobs.delete(userId);
  for (let index = applications.length - 1; index >= 0; index--) if (applications[index].userId === userId) applications.splice(index, 1);
  for (let index = reports.length - 1; index >= 0; index--) if (reports[index].userId === userId) reports.splice(index, 1);
  for (let index = resumeDrafts.length - 1; index >= 0; index--) if (resumeDrafts[index].userId === userId) resumeDrafts.splice(index, 1);
  for (const [resumeId, record] of resumeRecords.entries()) if (record.userId === userId) resumeRecords.delete(resumeId);
  clearAccessCookie(res);
  return res.json({ deleted: true, message: 'Account data was deleted from available storage.' });
}));

app.get('/api/applications', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    const records = await Application.find({ userId: req.user.id }).sort({ updatedAt: -1 }).lean();
    const events = await ApplicationEvent.find({ userId: req.user.id }).sort({ occurredAt: 1 }).lean();
    return res.json(records.map(record => applicationResponse(
      record,
      events.filter(event => String(event.applicationId) === String(record._id))
    )));
  }
  return res.json(applications.filter(item => item.userId === req.user.id));
}));
app.post('/api/applications', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!mongoose.Types.ObjectId.isValid(req.body?.jobId)) return res.status(404).json({ error: 'Job not found' });
  const job = await Job.findById(req.body.jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (['closed', 'expired'].includes(job.status)) return res.status(400).json({ error: 'This listing is not currently active and cannot be planned.' });
  const status = req.body?.status || 'Planned';
  if (!safeStatus(status)) return res.status(400).json({ error: 'Invalid application status' });
  const jobId = String(job._id);
  const officialApplicationUrl = job.applicationUrl || '';
  if (req.body?.status === 'APPLICATION_STARTED' && !isOfficialApplicationUrl(officialApplicationUrl)) {
    return res.status(400).json({ error: 'This listing does not have a reliable official application URL.' });
  }
  const persisted = await Application.findOne({ userId: req.user.id, jobId: job._id });
  if (persisted) {
    const events = await ApplicationEvent.find({ applicationId: persisted._id }).sort({ occurredAt: 1 }).lean();
    return res.json(applicationResponse(persisted.toObject(), events));
  }
  const created = await Application.create({
    userId: req.user.id,
    jobId: job._id,
    jobTitle: job.title,
    companyName: job.companyName,
    officialApplicationUrl,
    status,
    notes: typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 2000) : '',
    interviewDate: typeof req.body?.interviewDate === 'string' ? req.body.interviewDate.trim().slice(0, 80) : ''
  });
  const event = await ApplicationEvent.create({
    applicationId: created._id, userId: req.user.id, status, source: 'candidate'
  });
  return res.status(201).json(applicationResponse(created.toObject(), [event.toObject()]));
  /*
  const existing = applications.find(item => item.userId === req.user.id && item.jobId === jobId);
  if (existing) return res.status(200).json(existing);
  const application = {
    id: randomUUID(), userId: req.user.id, jobId, jobTitle: job.title, companyName: job.companyName, status,
    history: [{ status, at: new Date().toISOString() }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  applications.push(application);
  return res.status(201).json(application);
  */
}));

app.post('/api/applications/:id/tailored-resume', requireAuth, asyncRoute(async (req, res) => {
  const application = mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)
    ? await Application.findOne({ _id: req.params.id, userId: req.user.id })
    : applications.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(req.body?.tailoredResumeId)) {
    return res.status(400).json({ error: 'A persisted tailored resume is required.' });
  }
  const version = await TailoredResume.findOne({ _id: req.body.tailoredResumeId, userId: req.user.id });
  if (!version) return res.status(404).json({ error: 'Tailored resume not found.' });
  if (String(version.targetJobId) !== String(application.jobId)) return res.status(400).json({ error: 'The tailored resume targets a different job.' });
  if (version.approvalStatus !== 'candidate-approved') return res.status(400).json({ error: 'Approve the tailored resume before associating it with an application.' });
  version.applicationId = String(application._id);
  await version.save();
  return res.json({
    ...applicationResponse(application.toObject()),
    tailoredResumeId: String(version._id),
    tailoredResumeName: version.versionName
  });
}));

app.post('/api/applications/:id/submit', requireAuth, asyncRoute(async (req, res) => {
  if (req.body?.approvalConfirmed !== true) return res.status(400).json({ error: 'Explicit approval is required before recording an application as submitted.' });
  if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)) {
    const application = await Application.findOne({ _id: req.params.id, userId: req.user.id });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status === 'SUBMITTED') return res.json(applicationResponse(application.toObject()));
    application.status = 'SUBMITTED';
    await application.save();
    const event = await ApplicationEvent.create({
      applicationId: application._id,
      userId: req.user.id,
      status: 'SUBMITTED',
      source: 'candidate'
    });
    const events = await ApplicationEvent.find({ applicationId: application._id }).sort({ occurredAt: 1 }).lean();
    return res.json({
      ...applicationResponse(application.toObject(), events),
      submissionNote: 'Recorded after explicit approval. CareerPilot did not submit a third-party form.'
    });
  }
  const application = applications.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.status === 'Applied') return res.json(application);
  application.status = 'Applied';
  application.history.push({ status: 'Applied', at: new Date().toISOString(), approvalConfirmed: true });
  application.updatedAt = new Date().toISOString();
  return res.json({ ...application, submissionNote: 'Recorded after explicit approval. CareerPilot did not submit a third-party form.' });
}));
app.patch('/api/applications/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)) {
    const application = await Application.findOne({ _id: req.params.id, userId: req.user.id });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!safeStatus(req.body?.status)) return res.status(400).json({ error: 'Invalid application status' });
    const changed = application.status !== req.body.status;
    application.status = req.body.status;
    if (typeof req.body?.notes === 'string') application.notes = req.body.notes.trim().slice(0, 2000);
    if (typeof req.body?.interviewDate === 'string') application.interviewDate = req.body.interviewDate.trim().slice(0, 80);
    await application.save();
    if (changed) await ApplicationEvent.create({ applicationId: application._id, userId: req.user.id, status: application.status, source: 'candidate' });
    const events = await ApplicationEvent.find({ applicationId: application._id }).sort({ occurredAt: 1 }).lean();
    return res.json(applicationResponse(application.toObject(), events));
  }
  const application = applications.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (!safeStatus(req.body?.status)) return res.status(400).json({ error: 'Invalid application status' });
  if (application.status !== req.body.status) {
    application.status = req.body.status;
    application.history.push({ status: req.body.status, at: new Date().toISOString() });
    application.updatedAt = new Date().toISOString();
  }
  return res.json(application);
}));

app.use((error, req, res, next) => {
  console.error(`Unhandled API error for ${req.method} ${req.path}: ${error.message}`);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'The API could not complete this request. Check server logs for details.' });
});

const httpServer = app.listen(port, () => {
  console.log(`CareerPilot HTTP server listening on ${port}; MongoDB readiness is reported separately.`);
});

function sanitizedMongoError(error) {
  const nestedErrors = [...(error.reason?.servers?.values() || [])]
    .map(server => server.error)
    .filter(Boolean);
  const details = [error, error.cause, ...nestedErrors]
    .filter(Boolean)
    .map(item => `${item.code || ''} ${item.syscall || ''} ${item.message || ''}`)
    .join(' ');
  if (/querySrv/i.test(details) && /ECONNREFUSED/i.test(details)) {
    return 'Atlas SRV DNS lookup was refused by the configured Node.js resolver. Check MONGODB_DNS_SERVERS and network access to DNS.';
  }
  if (/querySrv/i.test(details) && /ETIMEOUT|ETIMEDOUT/i.test(details)) {
    return 'Atlas SRV DNS lookup timed out. Check the configured resolver and network access to DNS.';
  }
  if (/authentication failed|bad auth|AuthenticationFailed/i.test(details)) {
    return 'MongoDB authentication failed. Verify the Atlas database username and password.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(details)) {
    return 'MongoDB hostname could not be resolved. Verify the Atlas cluster hostname and DNS configuration.';
  }
  const message = String(error.message || error)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, 'MongoDB URI <redacted>')
    .replace(/(password|passwd|pwd)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>');
  return `${error.name || 'MongoDB error'}: ${message.slice(0, 500)}`;
}

mongoose.connection.on('disconnected', () => {
  mongoReady = false;
  console.error('MongoDB disconnected; database-backed features are unavailable until reconnection.');
});
mongoose.connection.on('connected', () => {
  if (mongoModelsInitialized) mongoReady = true;
});

async function connectMongo() {
  if (shuttingDown || !process.env.MONGODB_URI) return;
  try {
    const configuredDnsServers = (process.env.MONGODB_DNS_SERVERS || '')
      .split(',')
      .map(server => server.trim())
      .filter(Boolean);
    if (configuredDnsServers.length) {
      setServers(configuredDnsServers);
      console.log(`MongoDB DNS override configured (${configuredDnsServers.length} resolver(s)).`);
    }

    const timeoutMs = Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 30000;
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs
    });
    await Promise.all([
      Job.init(), JobSource.init(), JobSyncRun.init(), User.init(),
      CandidateProfile.init(), Application.init(), ApplicationEvent.init(), ExtensionConnection.init(), SavedJob.init(), ResumeDraft.init()
    ]);

    mongoModelsInitialized = true;
    mongoReady = true;
    console.log(`MongoDB connected; database "${mongoose.connection.name}" is ready.`);
    if (!jobSyncStarted) {
      startJobSyncScheduler();
      jobSyncStarted = true;
    }
  } catch (error) {
    mongoReady = false;
    console.error(`MongoDB connection failed: ${sanitizedMongoError(error)}`);
    await mongoose.disconnect().catch(disconnectError => {
      console.error(`MongoDB cleanup after connection failure failed: ${sanitizedMongoError(disconnectError)}`);
    });
    if (!shuttingDown && !mongoRetryTimer) {
      const retryMs = Math.max(1000, Number(process.env.MONGODB_RETRY_INTERVAL_MS) || 15000);
      console.error(`MongoDB will retry connection in ${Math.ceil(retryMs / 1000)} seconds.`);
      mongoRetryTimer = setTimeout(() => {
        mongoRetryTimer = null;
        void connectMongo();
      }, retryMs);
    }
  }
}

if (!process.env.MONGODB_URI) {
  console.error('MongoDB is not configured. Database-backed features remain unavailable.');
} else {
  void connectMongo();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    if (mongoRetryTimer) clearTimeout(mongoRetryTimer);
    httpServer.close();
    mongoose.disconnect().finally(() => process.exit(0));
  });
}
