import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { randomUUID, timingSafeEqual } from 'crypto';
import mongoose from 'mongoose';
import Job from './models/job.js';
import JobSource from './models/jobSource.js';
import JobSyncRun from './models/jobSyncRun.js';
import { analyzeResume, getAIProviderStatus } from './services/aiProvider.js';
import { computeGaps, generateReport, getFixedQuestions, planQuestions } from './services/rejectionCoach.js';
import { getCompanyRegistry } from './config/jobCompanies.js';
import { startJobSyncScheduler } from './services/jobIngestion/scheduler.js';
import { synchronizeJobs } from './services/jobIngestion/sync.js';
import { matchJob } from './services/jobMatching.js';

const app = express();
const port = process.env.PORT || 4000;
const secret = process.env.JWT_SECRET || 'local-demo-secret-change-before-deploy';
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
  workAuthorizationCountries: []
});
const profiles = new Map([['demo-user', demoProfile()]]);
const savedJobs = new Map([['demo-user', new Set()]]);
const applications = [];
const reports = [];
const reviewedJobs = new Map([['demo-user', new Set()]]);
const resumeDrafts = [];

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      req.user = jwt.verify(token, secret);
    } catch {
      req.user = null;
    }
  }
  next();
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
  const staleVerification = job.lastVerifiedAt
    && Date.now() - new Date(job.lastVerifiedAt).getTime() > verificationAge * 86400000;
  const currentStatus = job.status === 'active' && staleVerification ? 'unknown' : job.status;
  const sources = job.sourceRecords.map(source => ({
    provider: source.provider,
    externalJobId: source.externalJobId,
    boardId: source.boardId,
    sourceUrl: source.sourceUrl,
    applicationUrl: source.applicationUrl,
    status: source.status === 'active' && source.lastVerifiedAt
      && Date.now() - new Date(source.lastVerifiedAt).getTime() > verificationAge * 86400000
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
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    eligibilityMatch: match.eligibilityMatch,
    experienceMatch: match.experienceMatch,
    category: match.category,
    match: match.skillMatch ?? 0,
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
    estimatedMinutes: Math.min(120, Math.max(15, Math.round((job.description?.length || 0) / 80))),
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
  const effort = Math.min(120, Math.max(15, Math.round((job.description?.length || 0) / 80)));
  const effortEfficiency = Math.max(0, 100 * (1 - effort / (profile.maxEffortMinutes * 2)));
  const skillScore = match.skillMatch ?? 50;
  const eligibilityScore = match.eligibilityMatch.startsWith('does-not-') ? 0 : match.eligibilityMatch === 'unknown' ? 50 : 75;
  const score = Math.round(skillScore * 0.35 + eligibilityScore * 0.25 + effortEfficiency * 0.15 + 50 * 0.25);
  const blocked = ['closed', 'expired'].includes(status) || match.eligibilityMatch.startsWith('does-not-');
  const requiresReview = status !== 'active' || match.eligibilityMatch === 'unknown';
  const recommendation = blocked ? 'Skip'
    : requiresReview ? 'Review First'
      : score >= 75 ? 'Review First'
        : score >= 55 ? 'Consider' : 'Consider Later';
  return {
    score,
    recommendation,
    factors: {
      skillMatch: match.skillMatch,
      eligibility: eligibilityScore,
      opportunityQuality: 50,
      timeEfficiency: Math.round(effortEfficiency)
    },
    explanation: blocked
      ? 'A closed, expired, or known-ineligible listing cannot be promoted by a high skill score.'
      : `${match.explanation} Review provider status and original listing before applying.`
  };
}

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeStatus(status) {
  return ['Saved', 'Planned', 'Applied', 'Assessment', 'Interview', 'Rejected', 'Offer', 'Withdrawn'].includes(status);
}

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'jobs-mongodb', mongodbConnected: mongoose.connection.readyState === 1 }));
app.get('/api/ai/status', (req, res) => res.json(getAIProviderStatus()));
app.post('/api/ai/resume-analysis', requireAuth, async (req, res) => {
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

app.post('/api/rejection/questions', requireAuth, asyncRoute(async (req, res) => {
  if (req.body?.consentAccepted !== true) return res.status(400).json({ error: 'Consent is required before sending information to an AI provider.' });
  try {
    const job = await getRejectionJob(req.body?.jobId);
    const profile = getProfile(req.user.id);
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

app.post('/api/rejection/report', requireAuth, asyncRoute(async (req, res) => {
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
  const email = typeof req.body?.email === 'string' ? req.body.email.slice(0, 120) : 'demo@example.com';
  const token = jwt.sign({ id: 'demo-user', email }, secret, { expiresIn: '12h' });
  return res.json({ token, user: { id: 'demo-user', name: 'Demo Candidate', email } });
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
  const allowed = ['q', 'location', 'country', 'workplaceType', 'employmentType', 'experienceLevel', 'skills', 'postedWithinDays', 'status', 'sort', 'page', 'limit'];
  for (const key of Object.keys(req.query)) {
    if (!allowed.includes(key)) return res.status(400).json({ error: `Unsupported job filter: ${key}` });
    if (typeof req.query[key] !== 'string') return res.status(400).json({ error: `${key} must be a single string value.` });
  }
  const query = {};
  if (req.query.sort && !['newest', 'oldest'].includes(req.query.sort)) return res.status(400).json({ error: 'sort must be newest or oldest.' });
  if (req.query.experienceLevel && !['entry', 'internship', 'mid', 'senior'].includes(req.query.experienceLevel)) return res.status(400).json({ error: 'experienceLevel must be internship, entry, mid, or senior.' });
  if (req.query.workplaceType && !['remote', 'hybrid', 'onsite'].includes(req.query.workplaceType)) return res.status(400).json({ error: 'workplaceType must be remote, hybrid, or onsite.' });
  if (req.query.status && !['active', 'expired', 'closed', 'unverified', 'unknown'].includes(req.query.status)) return res.status(400).json({ error: 'Unsupported job status.' });
  if (req.query.page && !/^\d+$/.test(req.query.page)) return res.status(400).json({ error: 'page must be a positive integer.' });
  if (req.query.limit && !/^\d+$/.test(req.query.limit)) return res.status(400).json({ error: 'limit must be a positive integer.' });
  if (req.query.postedWithinDays && (!Number.isInteger(Number(req.query.postedWithinDays)) || Number(req.query.postedWithinDays) < 1 || Number(req.query.postedWithinDays) > 365)) return res.status(400).json({ error: 'postedWithinDays must be an integer from 1 to 365.' });
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q) {
    const pattern = new RegExp(escapedRegex(q), 'i');
    query.$or = [{ title: pattern }, { companyName: pattern }, { description: pattern }, { requiredSkills: pattern }, { preferredSkills: pattern }];
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
    const profile = req.user?.id ? getProfile(req.user.id) : {};
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

app.get('/api/saved', requireAuth, (req, res) => res.json([...getSaved(req.user.id)].map(jobId => ({ jobId }))));
app.get('/api/saved/jobs', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const ids = [...getSaved(req.user.id)];
  const jobs = await Job.find({ _id: { $in: ids } }).sort({ postedAt: -1 }).lean();
  return res.json(jobs.map(job => toJobResponse(job, getProfile(req.user.id))));
}));
app.post('/api/saved/:id', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || !await Job.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Job not found' });
  getSaved(req.user.id).add(req.params.id);
  return res.json({ saved: [...getSaved(req.user.id)].map(jobId => ({ jobId })) });
}));
app.delete('/api/saved/:id', requireAuth, (req, res) => {
  getSaved(req.user.id).delete(req.params.id);
  return res.json({ saved: [...getSaved(req.user.id)].map(jobId => ({ jobId })) });
});

app.get('/api/profile', requireAuth, (req, res) => res.json(getProfile(req.user.id)));
app.put('/api/profile', requireAuth, (req, res) => {
  const body = req.body || {};
  const profile = getProfile(req.user.id);
  if (Array.isArray(body.interests)) profile.interests = body.interests.filter(x => typeof x === 'string').slice(0, 20);
  if (Array.isArray(body.learningGoals)) profile.learningGoals = body.learningGoals.filter(x => typeof x === 'string').slice(0, 20);
  if (Array.isArray(body.preferredRoles)) profile.preferredRoles = body.preferredRoles.filter(x => typeof x === 'string').slice(0, 20);
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
  return res.json(profile);
});

app.get('/api/planner', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  const profile = getProfile(req.user.id);
  const jobs = await Job.find({ status: { $nin: ['closed', 'expired'] } }).sort({ postedAt: -1 }).limit(200).lean();
  const recommendations = jobs.map(job => ({ ...toJobResponse(job, profile), priority: priorityFor(job, profile) }))
    .sort((a, b) => b.priority.score - a.priority.score);
  return res.json({ weeklyBudgetHours: profile.weeklyBudgetHours, maxEffortMinutes: profile.maxEffortMinutes, recommendations });
}));
app.put('/api/planner', requireAuth, (req, res) => {
  const profile = getProfile(req.user.id);
  if (Number.isFinite(req.body?.weeklyBudgetHours)) profile.weeklyBudgetHours = Math.max(1, Math.min(60, req.body.weeklyBudgetHours));
  if (Number.isFinite(req.body?.maxEffortMinutes)) profile.maxEffortMinutes = Math.max(10, Math.min(480, req.body.maxEffortMinutes));
  return res.json({ weeklyBudgetHours: profile.weeklyBudgetHours, maxEffortMinutes: profile.maxEffortMinutes });
});

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

app.get('/api/resume/evidence', requireAuth, (req, res) => res.json({
  isDemo: true,
  notice: 'Sample evidence only. No resume file has been uploaded or parsed.',
  requirements: [
    { id: 'req-react', requirement: 'React experience', status: 'supported', evidence: { page: 1, lineStart: 4, lineEnd: 5, text: 'Built user interfaces with React and JavaScript.' }, suggestion: 'Highlight the React interface work.' },
    { id: 'req-api', requirement: 'REST API experience', status: 'requires-confirmation', evidence: null, suggestion: 'Confirm genuine REST API experience before adding a factual claim.' },
    { id: 'req-ml', requirement: 'Machine learning experience', status: 'insufficient-evidence', evidence: null, suggestion: 'No supporting evidence found in this sample.' }
  ]
}));
app.post('/api/resume/drafts', requireAuth, (req, res) => {
  const evidenceId = String(req.body?.evidenceId || '');
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 2000) : '';
  if (!content) return res.status(400).json({ error: 'Draft content is required' });
  const draft = { id: randomUUID(), userId: req.user.id, evidenceId, content, status: 'draft', approvedAt: null, createdAt: new Date().toISOString() };
  resumeDrafts.push(draft);
  return res.status(201).json(draft);
});
app.get('/api/resume/drafts', requireAuth, (req, res) => {
  return res.json(resumeDrafts.filter(item => item.userId === req.user.id));
});
app.post('/api/resume/drafts/:id/approve', requireAuth, (req, res) => {
  const draft = resumeDrafts.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  draft.status = 'candidate-approved-draft';
  draft.approvedAt = new Date().toISOString();
  return res.json({ ...draft, message: 'Draft approved for your review only. No application was submitted.' });
});

app.get('/api/insights', requireAuth, (req, res) => {
  const mine = applications.filter(item => item.userId === req.user.id);
  const count = status => mine.filter(item => item.status === status).length;
  const terminal = count('Interview') + count('Rejected') + count('Offer') + count('Withdrawn');
  return res.json({
    applications: mine.length,
    interviews: count('Interview'),
    rejections: count('Rejected'),
    pending: count('Planned') + count('Applied') + count('Assessment'),
    dataSufficiency: mine.length < 10 ? 'Very limited data' : 'Early observations',
    knownFacts: mine.length ? [`${mine.length} application records are available.`, `${count('Interview')} interview outcomes are recorded.`] : ['No application outcomes have been recorded yet.'],
    unsupportedConclusions: ['Resume quality caused a rejection.', 'A specific skill caused an outcome.', 'A career path is unsuitable.'],
    recommendedNextStep: 'Continue tracking outcomes and record recruiter feedback when available.',
    sampleSize: mine.length,
    terminalOutcomeCount: terminal
  });
});

app.get('/api/privacy', requireAuth, (req, res) => res.json({
  demoOnly: true,
  persistence: 'Job listings and synchronization logs are stored in MongoDB. Candidate profile, saved jobs, application history, and other demo workflow state remain in server memory and reset on API restart.',
  policies: [
    { category: 'Job listings', purpose: 'Search and match collected job opportunities', retention: 'Persisted in MongoDB; refreshed by provider synchronization' },
    { category: 'Profile', purpose: 'Personalize demo recommendations', retention: 'Until server restart or account deletion' },
    { category: 'Resume evidence', purpose: 'Show evidence-linked demo suggestions', retention: 'No uploaded resume is stored in this prototype' },
    { category: 'Application history', purpose: 'Track statuses and calculate observed counts', retention: 'Until server restart or account deletion' }
  ],
  externalAiUse: getAIProviderStatus().configured
    ? `Resume analysis sends text only after candidate consent to the configured ${getAIProviderStatus().provider} provider.`
    : 'Resume text is not sent to an AI provider until one is configured and the candidate consents.'
}));
app.get('/api/privacy/export', requireAuth, (req, res) => {
  const userId = req.user.id;
  return res.json({
    profile: getProfile(userId),
    savedJobs: [...getSaved(userId)],
    applications: applications.filter(item => item.userId === userId),
    reports: reports.filter(item => item.userId === userId)
  });
});
app.delete('/api/account', requireAuth, (req, res) => {
  const userId = req.user.id;
  profiles.delete(userId);
  savedJobs.delete(userId);
  reviewedJobs.delete(userId);
  for (let index = applications.length - 1; index >= 0; index--) if (applications[index].userId === userId) applications.splice(index, 1);
  for (let index = reports.length - 1; index >= 0; index--) if (reports[index].userId === userId) reports.splice(index, 1);
  for (let index = resumeDrafts.length - 1; index >= 0; index--) if (resumeDrafts[index].userId === userId) resumeDrafts.splice(index, 1);
  return res.json({ deleted: true, message: 'Demo account data was deleted from server memory.' });
});

app.get('/api/applications', requireAuth, (req, res) => res.json(applications.filter(item => item.userId === req.user.id)));
app.post('/api/applications', requireAuth, asyncRoute(async (req, res) => {
  if (mongoose.connection.readyState !== 1) return databaseUnavailable(res);
  if (!mongoose.Types.ObjectId.isValid(req.body?.jobId)) return res.status(404).json({ error: 'Job not found' });
  const job = await Job.findById(req.body.jobId).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (['closed', 'expired'].includes(job.status)) return res.status(400).json({ error: 'This listing is not currently active and cannot be planned.' });
  const status = req.body?.status || 'Planned';
  if (!safeStatus(status)) return res.status(400).json({ error: 'Invalid application status' });
  const jobId = String(job._id);
  const existing = applications.find(item => item.userId === req.user.id && item.jobId === jobId);
  if (existing) return res.status(200).json(existing);
  const application = {
    id: randomUUID(), userId: req.user.id, jobId, jobTitle: job.title, companyName: job.companyName, status,
    history: [{ status, at: new Date().toISOString() }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  applications.push(application);
  return res.status(201).json(application);
}));
app.patch('/api/applications/:id', requireAuth, (req, res) => {
  const application = applications.find(item => item.id === req.params.id && item.userId === req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (!safeStatus(req.body?.status)) return res.status(400).json({ error: 'Invalid application status' });
  if (application.status !== req.body.status) {
    application.status = req.body.status;
    application.history.push({ status: req.body.status, at: new Date().toISOString() });
    application.updatedAt = new Date().toISOString();
  }
  return res.json(application);
});

app.use((error, req, res, next) => {
  console.error(`Unhandled API error for ${req.method} ${req.path}: ${error.message}`);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'The API could not complete this request. Check server logs for details.' });
});

const httpServer = app.listen(port, () => console.log(`CareerPilot API listening on ${port}`));
if (!process.env.MONGODB_URI) {
  console.error('Job discovery is disabled until MONGODB_URI is configured.');
} else {
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS) || 5000
  }).then(async () => {
    await Promise.all([Job.init(), JobSource.init(), JobSyncRun.init()]);
    console.log('MongoDB connected; job records and sync runs are persistent.');
    startJobSyncScheduler();
  }).catch(error => {
    console.error(`MongoDB connection failed: ${error.message}`);
    return mongoose.disconnect();
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    httpServer.close();
    mongoose.disconnect().finally(() => process.exit(0));
  });
}
