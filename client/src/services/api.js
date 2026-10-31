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
  drafts: [
    {
      id: 'draft-demo-1',
      evidenceId: 'req-react',
      content: 'Engineered modular React component library reducing dashboard render latencies by 35%.',
      status: 'candidate-approved-draft',
      approvedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString()
    }
  ]
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
  const token = localStorage.getItem('careerpilot_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    let response = await requestApi(`/api${path}`, { ...options, headers });
    if (response.status === 401 && path !== '/auth/demo') {
      const authResponse = await requestApi('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@example.com' })
      });
      const authPayload = await readApiPayload(authResponse);
      if (!authResponse.ok) throw new Error(authPayload.error || 'Unable to start demo session');
      localStorage.setItem('careerpilot_token', authPayload.token);
      response = await requestApi(`/api${path}`, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${authPayload.token}` }
      });
    }

    if (response.status === 503 || response.status === 502) {
      // Graceful fallback for MongoDB offline or AI provider unavailable
      return handleFallback(path, options);
    }

    const payload = await readApiPayload(response);
    if (!response.ok) {
      if (response.status === 503) return handleFallback(path, options);
      throw new Error(payload.error || 'Request failed');
    }
    return payload;
  } catch (err) {
    // If server is not running or network failed, use graceful demo fallback
    return handleFallback(path, options, err);
  }
};

// Graceful fallback handler for local evaluation without running MongoDB
function handleFallback(path, options = {}, originalError = null) {
  const method = (options.method || 'GET').toUpperCase();

  // Auth demo
  if (path === '/auth/demo') {
    return { token: 'demo-local-jwt', user: { id: 'demo-user', name: 'Demo Candidate', email: 'demo@example.com' } };
  }

  // Jobs query
  if (path.startsWith('/jobs?')) {
    const urlParams = new URLSearchParams(path.split('?')[1] || '');
    const q = (urlParams.get('q') || '').toLowerCase();
    const loc = (urlParams.get('location') || '').toLowerCase();
    const workplace = urlParams.get('workplaceType');
    const employment = urlParams.get('employmentType');

    let items = SAMPLE_JOBS.filter(j => {
      const matchText = (j.title + ' ' + j.company + ' ' + j.skills.join(' ')).toLowerCase();
      if (q && !matchText.includes(q)) return false;
      if (loc && !j.location.toLowerCase().includes(loc)) return false;
      if (workplace && j.workplaceType !== workplace) return false;
      if (employment && j.employmentType !== employment) return false;
      return true;
    });

    return {
      items,
      pagination: { page: 1, limit: 30, total: items.length, pages: 1 },
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
    const recommendations = SAMPLE_JOBS.map(job => {
      const matchScore = job.skillMatch || 50;
      const effortEfficiency = Math.max(10, Math.round(100 - (job.estimatedMinutes / 90) * 50));
      const score = Math.round(matchScore * 0.4 + effortEfficiency * 0.35 + 25);
      return {
        ...job,
        priority: {
          score,
          recommendation: score >= 75 ? 'Review First' : score >= 55 ? 'Consider' : 'Consider Later',
          factors: {
            skillMatch: matchScore,
            eligibility: 75,
            opportunityQuality: 60,
            timeEfficiency: effortEfficiency
          },
          explanation: `${matchScore}% skill overlap with estimated application effort of ~${job.estimatedMinutes} mins.`
        }
      };
    }).sort((a, b) => b.priority.score - a.priority.score);

    return {
      weeklyBudgetHours: fallbackState.planner.weeklyBudgetHours,
      maxEffortMinutes: fallbackState.planner.maxEffortMinutes,
      recommendations,
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
    const pending = apps.filter(a => ['Planned', 'Applied', 'Assessment'].includes(a.status)).length;
    return {
      applications: apps.length,
      interviews,
      rejections,
      pending,
      dataSufficiency: apps.length < 10 ? 'Very limited data' : 'Early observations',
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
      terminalOutcomeCount: interviews + rejections
    };
  }

  // Resume Evidence & Drafts
  if (path === '/resume/evidence' && method === 'GET') {
    return {
      isDemo: true,
      notice: 'Sample evidence only. No external file has been uploaded or parsed.',
      requirements: [
        {
          id: 'req-react',
          requirement: 'React & UI Architecture',
          status: 'supported',
          evidence: {
            page: 1,
            lineStart: 4,
            lineEnd: 6,
            text: 'Engineered modular React component library reducing dashboard render latencies by 35%.'
          },
          suggestion: 'Highlight the React interface performance optimization and component modularity.'
        },
        {
          id: 'req-api',
          requirement: 'REST API & Microservices Integration',
          status: 'requires-confirmation',
          evidence: null,
          suggestion: 'Confirm genuine REST API contract integration before adding as a factual resume statement.'
        },
        {
          id: 'req-ml',
          requirement: 'Machine Learning Pipelines & Vector DB',
          status: 'insufficient-evidence',
          evidence: null,
          suggestion: 'No supporting evidence found in candidate profile. Do not present as verified experience.'
        }
      ]
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
      createdAt: new Date().toISOString()
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
      persistence: 'Candidate profile, saved jobs, application history, and demo state are maintained for your session and reset on server restart or deletion.',
      policies: [
        { category: 'Job listings', purpose: 'Search and match collected opportunities', retention: 'Cached per session; refreshed by provider synchronization' },
        { category: 'Candidate Profile', purpose: 'Personalize recommendations and skill matching', retention: 'Until session restart or manual deletion' },
        { category: 'Resume evidence', purpose: 'Grounded citation of candidate claims', retention: 'No resume file is permanently stored without candidate action' },
        { category: 'Application tracking', purpose: 'Timeline records and reality-check analytics', retention: 'Until session restart or manual deletion' }
      ],
      externalAiUse: 'AI requests are sent ONLY with explicit candidate consent and never leak API keys to the browser.'
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
    return { deleted: true, message: 'All demo session data cleared.' };
  }

  if (originalError) throw originalError;
  return {};
}
