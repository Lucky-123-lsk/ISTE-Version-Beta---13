import { SAMPLE_JOBS, INITIAL_APPLICATIONS } from '../data/sampleJobs';

// In-memory demo state for graceful offline/no-MongoDB fallback
let fallbackState = {
  savedIds: new Set(['demo-job-1']),
  applications: [...INITIAL_APPLICATIONS],
  profile: {
    name: 'Alex Chen',
    title: 'Frontend & AI Candidate',
    existingSkills: [
      { name: 'React', confidence: 'verified' },
      { name: 'JavaScript', confidence: 'verified' },
      { name: 'Node.js', confidence: 'self-declared' },
      { name: 'HTML/CSS', confidence: 'verified' },
      { name: 'REST APIs', confidence: 'self-declared' }
    ],
    transferableSkills: ['Project delivery', 'API integration', 'Documentation', 'Agile teamwork'],
    interests: ['AI/ML applications', 'Web development', 'Full-stack systems'],
    learningGoals: ['Python', 'Machine learning fundamentals', 'TypeScript'],
    weeklyBudgetHours: 5,
    maxEffortMinutes: 90,
    preferredRoles: ['Frontend Engineer', 'Full Stack AI Engineer', 'Web Developer'],
    yearsExperience: 2,
    workAuthorizationCountries: ['India']
  },
  planner: {
    weeklyBudgetHours: 5,
    maxEffortMinutes: 90
  },
  reviewedIds: new Set(['demo-job-1']),
  reports: [],
  drafts: []
};

const requestApi = async (url, options) => {
  try {
    return await fetch(url, { credentials: 'include', ...options });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('NETWORK_OFFLINE');
    }
    throw error;
  }
};

const readApiPayload = async response => {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(
      response.status >= 500
        ? 'API_UNAVAILABLE'
        : `The API returned an invalid response (HTTP ${response.status}).`
    );
  }
};

export const api = async (path, options = {}) => {
  const { skipDemo = false, ...requestOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const response = await requestApi(`/api${path}`, { ...requestOptions, headers });

    if (!skipDemo && (response.status === 503 || response.status === 502)) {
      // Graceful fallback for MongoDB offline or AI provider unavailable
      return handleFallback(path, requestOptions);
    }

    const payload = await readApiPayload(response);
    if (!response.ok) {
      if (response.status === 503 && !skipDemo) return handleFallback(path, requestOptions);
      throw new Error(payload.error || 'Request failed');
    }
    return payload;
  } catch (err) {
    if (skipDemo || err.message !== 'NETWORK_OFFLINE') throw err;
    return handleFallback(path, requestOptions, err);
  }
};

// Graceful fallback handler for local evaluation without running MongoDB
function handleFallback(path, options = {}, originalError = null) {
  const method = (options.method || 'GET').toUpperCase();

  // Auth demo
  if (path === '/auth/demo') {
    return { user: { id: 'demo-user', name: 'Demo Candidate', email: 'demo@example.com' } };
  }

  // Jobs query
  if (path.startsWith('/jobs?')) {
    const urlParams = new URLSearchParams(path.split('?')[1] || '');
    const q = (urlParams.get('q') || '').toLowerCase();
    const loc = (urlParams.get('location') || '').toLowerCase();
    const workplace = urlParams.get('workplaceType');
    const employment = urlParams.get('employmentType');
    const recommendedOnly = urlParams.get('recommended') === 'true';

    let items = SAMPLE_JOBS.filter(j => {
      const matchText = `${j.title} ${j.company} ${(j.skills || []).join(' ')} ${j.description || ''}`.toLowerCase();
      if (q && q.split(/\s+/).filter(Boolean).some(term => !matchText.includes(term))) return false;
      if (loc && !j.location.toLowerCase().includes(loc)) return false;
      if (workplace && j.workplaceType !== workplace) return false;
      if (employment && j.employmentType !== employment) return false;
      return true;
    });

    let recommendationInfo = null;
    if (recommendedOnly) {
      const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
      const knownSkills = (fallbackState.profile.existingSkills || [])
        .filter(skill => ['verified', 'self-declared'].includes(skill.confidence))
        .map(skill => normalize(skill.name))
        .filter(Boolean);
      if (!knownSkills.length) {
        items = [];
        recommendationInfo = {
          status: 'needs-profile',
          message: 'Review and save resume-extracted skills in Career DNA to get personalized job recommendations.'
        };
      } else {
        const preferredRoles = (fallbackState.profile.preferredRoles || []).map(normalize).filter(Boolean);
        items = items.flatMap(job => {
          const requirements = job.requiredSkills?.length ? job.requiredSkills : job.skills || [];
          const matchedSkills = requirements.filter(skill => knownSkills.includes(normalize(skill)));
          const profileMatch = requirements.length ? Math.round(matchedSkills.length / requirements.length * 100) : null;
          if (!Number.isFinite(profileMatch) || profileMatch < 35) return [];
          const title = normalize(job.title);
          const roleAligned = preferredRoles.some(role => title.includes(role) || role.includes(title)
            || role.split(/\s+/).some(word => word.length >= 4 && title.split(/\s+/).includes(word)));
          if (preferredRoles.length && !roleAligned) return [];
          return [{
            ...job,
            skillMatch: profileMatch,
            matchedSkills,
            recommendation: {
              profileMatch,
              roleAligned,
              explanation: 'Matched against saved profile skills and preferred roles. Profile match is not a hiring probability.'
            }
          }];
        }).sort((left, right) => right.skillMatch - left.skillMatch);
        recommendationInfo = {
          status: 'ready',
          message: 'Demo recommendations are based on saved sample profile data. Profile match is not a hiring probability.'
        };
      }
    }

    return {
      items,
      pagination: { page: 1, limit: 30, total: items.length, pages: 1 },
      ...(recommendationInfo ? { recommendationInfo } : {}),
      isDemoFallback: true,
      filters: { indiaPrioritized: true }
    };
  }

  // Jobs sync status
  if (path === '/jobs/sync-status') {
    return {
      mongodbConnected: false,
      configured: { theirstack: false, adzuna: false, greenhouse: true, lever: true, ashby: true },
      latestRuns: [
        { provider: 'greenhouse', sourceId: 'northwind', status: 'completed', fetched: 12, normalized: 12 },
        { provider: 'lever', sourceId: 'contoso', status: 'completed', fetched: 8, normalized: 8 }
      ],
      isDemoFallback: true
    };
  }

  // Saved IDs
  if (path === '/saved' && method === 'GET') {
    return [...fallbackState.savedIds].map(jobId => ({ jobId }));
  }

  // Saved Jobs full records
  if (path === '/saved/jobs' && method === 'GET') {
    return SAMPLE_JOBS.filter(j => fallbackState.savedIds.has(j.id));
  }

  // Save a job
  if (path.startsWith('/saved/') && method === 'POST') {
    const id = path.replace('/saved/', '');
    fallbackState.savedIds.add(id);
    return { saved: [...fallbackState.savedIds].map(jobId => ({ jobId })) };
  }

  // Remove saved job
  if (path.startsWith('/saved/') && method === 'DELETE') {
    const id = path.replace('/saved/', '');
    fallbackState.savedIds.delete(id);
    return { saved: [...fallbackState.savedIds].map(jobId => ({ jobId })) };
  }

  // Candidate Profile
  if (path === '/profile' && method === 'GET') {
    return fallbackState.profile;
  }
  if (path === '/profile' && method === 'PUT') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    fallbackState.profile = { ...fallbackState.profile, ...body };
    return fallbackState.profile;
  }

  // Planner
  if (path === '/planner' && method === 'GET') {
    const recommendations = SAMPLE_JOBS.map(job => ({
      ...job,
      estimatedMinutes: null,
      priority: {
        score: null,
        recommendation: 'Review',
        confidence: 'Demo data; not assessed',
        factors: {
          skillMatch: null,
          eligibility: null,
          experienceSuitability: null,
          interestAlignment: null,
          verificationFreshness: null
        },
        explanation: 'This is a curated demo opportunity, not a live listing or scored recommendation.'
      }
    }));

    return {
      weeklyBudgetHours: fallbackState.planner.weeklyBudgetHours,
      maxEffortMinutes: fallbackState.planner.maxEffortMinutes,
      recommendations,
      persistence: 'memory-demo',
      isDemoFallback: true
    };
  }

  if (path === '/planner' && method === 'PUT') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    fallbackState.planner = { ...fallbackState.planner, ...body };
    return fallbackState.planner;
  }

  // Trust details
  if (path.startsWith('/trust/') && method === 'GET') {
    const jobId = path.replace('/trust/', '').split('/')[0];
    const job = SAMPLE_JOBS.find(j => j.id === jobId) || SAMPLE_JOBS[0];
    return {
      jobId: job.id,
      ...job.trust,
      status: job.status,
      sources: job.sources,
      originalUrl: job.applicationUrl,
      lastVerifiedAt: job.lastVerifiedAt,
      similarListings: SAMPLE_JOBS.filter(j => j.id !== job.id).slice(0, 2).map(j => ({
        id: j.id, title: j.title, company: j.company, location: j.location, status: j.status
      })),
      isDemo: true
    };
  }

  if (path.includes('/reviewed') && method === 'POST') {
    const jobId = path.split('/')[2];
    fallbackState.reviewedIds.add(jobId);
    return { jobId, reviewed: true };
  }

  if (path.includes('/reports') && method === 'POST') {
    const jobId = path.split('/')[2];
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    fallbackState.reports.push({ jobId, reason: body.reason, createdAt: new Date().toISOString() });
    return { reportId: 'report-' + Date.now(), message: 'Report recorded in demo memory.' };
  }

  // Applications
  if (path === '/applications' && method === 'GET') {
    return fallbackState.applications;
  }
  if (path === '/applications' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const existing = fallbackState.applications.find(a => a.jobId === body.jobId);
    if (existing) return existing;
    const targetJob = SAMPLE_JOBS.find(j => j.id === body.jobId);
    const newApp = {
      id: 'app-' + Date.now(),
      jobId: body.jobId,
      jobTitle: targetJob?.title || 'Planned Role',
      companyName: targetJob?.company || 'Company',
      status: body.status || 'Planned',
      history: [{ status: body.status || 'Planned', at: new Date().toISOString() }],
      notes: 'Added from planner recommendations.',
      interviewDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fallbackState.applications = [newApp, ...fallbackState.applications];
    return newApp;
  }
  if (path.startsWith('/applications/') && method === 'PATCH') {
    const id = path.replace('/applications/', '');
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const app = fallbackState.applications.find(a => a.id === id);
    if (app && body.status) {
      app.status = body.status;
      app.history.push({ status: body.status, at: new Date().toISOString() });
      app.updatedAt = new Date().toISOString();
      if (body.notes !== undefined) app.notes = body.notes;
      if (body.interviewDate !== undefined) app.interviewDate = body.interviewDate;
      return app;
    }
  }

  // Insights / RealityCheck
  if (path === '/insights' && method === 'GET') {
    const apps = fallbackState.applications;
    const interviews = apps.filter(a => a.status === 'Interview').length;
    const rejections = apps.filter(a => a.status === 'Rejected').length;
    const assessments = apps.filter(a => a.status === 'Assessment').length;
    const offers = apps.filter(a => a.status === 'Offer').length;
    const withdrawn = apps.filter(a => a.status === 'Withdrawn').length;
    const pending = apps.filter(a => ['Saved', 'Planned', 'Application Started', 'Applied', 'Submitted', 'Under Review', 'On Hold', 'Unknown'].includes(a.status)).length;
    const outcomeSampleSize = interviews + rejections + offers + withdrawn;
    const dates = apps.map(app => new Date(app.createdAt || app.updatedAt)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a - b);
    return {
      applications: apps.length,
      interviews,
      rejections,
      assessments,
      offers,
      withdrawn,
      pending,
      dataSufficiency: outcomeSampleSize < 5 ? 'Insufficient evidence' : outcomeSampleSize < 20 ? 'Preliminary observations' : 'Cautious observations',
      knownFacts: apps.length
        ? [`${apps.length} application records are tracked in your workspace.`, `${interviews} interview outcome(s) observed so far.`]
        : ['No application outcomes recorded yet.'],
      unsupportedConclusions: [
        'Resume quality caused a rejection.',
        'A specific missing skill caused an application outcome.',
        'A chosen career path is unsuitable based on limited samples.'
      ],
      recommendedNextStep: 'Continue tracking outcomes objectively. Gather direct recruiter feedback where possible.',
      sampleSize: apps.length,
      outcomeSampleSize,
      terminalOutcomeCount: outcomeSampleSize,
      observationPeriod: dates.length ? { from: dates[0].toISOString(), to: dates[dates.length - 1].toISOString() } : null,
      reliableConclusion: outcomeSampleSize >= 20,
      persistence: 'memory-demo',
      isDemo: true
    };
  }

  // Resume Evidence & Drafts
  if (path.startsWith('/resume/evidence') && method === 'GET') {
    return {
      isDemo: false,
      evidenceAvailable: false,
      notice: 'No job-grounded resume evidence has been generated. Upload and review a resume before using evidence-based suggestions.',
      requirements: []
    };
  }

  if (path === '/resume/drafts' && method === 'GET') {
    return fallbackState.drafts;
  }
  if (path === '/resume/drafts' && method === 'POST') {
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const draft = {
      id: 'draft-' + Date.now(),
      evidenceId: body.evidenceId,
      content: body.content,
      status: 'draft',
      approvedAt: null,
      createdAt: new Date().toISOString(),
      persistence: 'memory-only'
    };
    fallbackState.drafts = [draft, ...fallbackState.drafts];
    return draft;
  }
  if (path.includes('/approve') && method === 'POST') {
    const id = path.split('/')[3];
    const draft = fallbackState.drafts.find(d => d.id === id);
    if (draft) {
      draft.status = 'candidate-approved-draft';
      draft.approvedAt = new Date().toISOString();
      return draft;
    }
  }

  // AI Status
  if (path === '/ai/status') {
    return {
      provider: 'gemini',
      configured: false,
      model: 'gemini-2.5-flash',
      message: 'Provider adapter ready on server. Add your server-side API key in server/.env when ready for live analysis.'
    };
  }

  // Privacy
  if (path === '/privacy') {
    return {
      demoOnly: true,
      persistence: 'The offline demo fallback keeps mock profile, saved jobs, applications, and drafts in browser memory. They are reset when the page reloads. Resume file bytes and AI analysis are not retained by this fallback.',
      policies: [
        { category: 'Sample job listings', purpose: 'Demonstrate the interface', retention: 'Bundled examples; not live or verified' },
        { category: 'Demo profile and applications', purpose: 'Demonstrate candidate workflows', retention: 'Browser memory until page reload' },
        { category: 'Candidate-authored drafts', purpose: 'Demonstrate draft workflow', retention: 'Browser memory until page reload' }
      ],
      externalAiUse: 'The offline demo does not contact an AI provider. Live server AI requires configuration and candidate consent.'
    };
  }

  if (path === '/privacy/export') {
    return {
      profile: fallbackState.profile,
      savedJobs: [...fallbackState.savedIds],
      applications: fallbackState.applications,
      drafts: fallbackState.drafts,
      reports: fallbackState.reports,
      exportedAt: new Date().toISOString()
    };
  }

  if (path === '/account' && method === 'DELETE') {
    fallbackState.savedIds.clear();
    fallbackState.applications = [];
    fallbackState.reports = [];
    fallbackState.drafts = [];
    return { deleted: true, message: 'All in-memory demo data cleared.' };
  }

  if (originalError) throw originalError;
  return {};
}
