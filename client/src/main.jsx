import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const requestApi = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not reach the CareerPilot API. Start the server with `npm start` from the project root, then try again.');
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
    throw new Error(response.status >= 500
      ? 'The CareerPilot API is unavailable. Restart the server with `npm start` from the project root, then try again.'
      : `The API returned an invalid response (HTTP ${response.status}).`);
  }
};

const api = async (path, options = {}) => {
  const token = localStorage.getItem('careerpilot_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  let response = await requestApi(`/api${path}`, { ...options, headers });
  if (response.status === 401 && path === '/auth/legacy-demo-never') {
    const authResponse = await requestApi('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com' })
    });
    const authPayload = await readApiPayload(authResponse);
    if (!authResponse.ok) throw new Error(authPayload.error || 'Unable to start a demo session');
    localStorage.setItem('careerpilot_token', authPayload.token);
    response = await requestApi(`/api${path}`, {
      ...options,
      headers: { ...headers, Authorization: `Bearer ${authPayload.token}` }
    });
  }
  const payload = await readApiPayload(response);
  if (!response.ok) throw new Error(payload.error || `Request failed (HTTP ${response.status}) for ${path}`);
  return payload;
};

const navigation = [
  ['Workspace', [['overview', 'Overview'], ['discover', 'Discover Jobs'], ['saved', 'Saved Jobs'], ['career-dna', 'Career DNA'], ['trustlens', 'TrustLens']]],
  ['Applications', [['planner', 'TimeBudget Planner'], ['applications', 'My Applications']]],
  ['Career Intelligence', [['proofpath', 'ProofPath Studio'], ['ai-studio', 'AI Studio'], ['rejection-coach', 'Rejection Coach'], ['realitycheck', 'RealityCheck']]],
  ['Account', [['privacy', 'PrivacyVault'], ['settings', 'Settings']]]
];
const pageTitles = Object.fromEntries(navigation.flatMap(([, items]) => items));
const applicationStatuses = ['Saved', 'Planned', 'Applied', 'Assessment', 'Interview', 'Rejected', 'Offer', 'Withdrawn'];

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', termsAccepted: false, privacyAccepted: false });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError('');
    setWorking(true);
    try {
      const payload = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(mode === 'register' ? form : { email: form.email, password: form.password }) });
      localStorage.setItem('careerpilot_token', payload.token);
      onAuthenticated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  };
  return <main className="auth-page"><section className="card auth-card">
    <p className="eyebrow">CAREERPILOT AI</p>
    <h1>{mode === 'login' ? 'Welcome back' : 'Create your candidate account'}</h1>
    <p className="muted">Use your own account to save your profile, track applications, and connect assisted application tools.</p>
    <form onSubmit={submit}>
      {mode === 'register' && <label>Full name<input required minLength="2" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>}
      <label>Email<input type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <label>Password<input type="password" required minLength="10" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
      {mode === 'register' && <><label>Confirm password<input type="password" required minLength="10" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} /></label><label className="check-label"><input type="checkbox" required checked={form.termsAccepted} onChange={event => setForm({ ...form, termsAccepted: event.target.checked })} /> I accept the terms.</label><label className="check-label"><input type="checkbox" required checked={form.privacyAccepted} onChange={event => setForm({ ...form, privacyAccepted: event.target.checked })} /> I accept the privacy policy.</label></>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="btn primary" disabled={working}>{working ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>
    <button className="btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create a new account' : 'I already have an account'}</button>
  </section></main>;
}

function Badge({ children, kind = '' }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'overview');
  const [jobs, setJobs] = useState([]);
  const [savedJobRecords, setSavedJobRecords] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [planner, setPlanner] = useState(null);
  const [insights, setInsights] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [privacy, setPrivacy] = useState(null);
  const [aiStatus, setAIStatus] = useState(null);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [workplaceFilter, setWorkplaceFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');
  const [postedWithinDays, setPostedWithinDays] = useState('');
  const [jobPage, setJobPage] = useState(1);
  const [jobPagination, setJobPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [syncStatus, setSyncStatus] = useState(null);
  const [trustJobId, setTrustJobId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem('careerpilot_token')));
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    const [savedData, savedRecords, applicationData, profileData, plannerData, insightData, evidenceData, privacyData, aiProviderStatus] = await Promise.all([
      api('/saved'),
      api('/saved/jobs'),
      api('/applications'),
      api('/profile'),
      api('/planner'),
      api('/insights'),
      api('/resume/evidence'),
      api('/privacy'),
      api('/ai/status')
    ]);
    setSavedJobRecords(savedRecords);
    setSaved(savedData.map(item => item.jobId));
    setApplications(applicationData);
    setProfile(profileData);
    setPlanner(plannerData);
    setInsights(insightData);
    setEvidence(evidenceData);
    setPrivacy(privacyData);
    setAIStatus(aiProviderStatus);
  }, []);

  const loadJobs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(jobPage), limit: '30', sort: 'newest' });
    if (search.trim()) params.set('q', search.trim());
    if (locationFilter.trim()) params.set('location', locationFilter.trim());
    if (countryFilter.trim()) params.set('country', countryFilter.trim());
    if (workplaceFilter) params.set('workplaceType', workplaceFilter);
    if (employmentFilter) params.set('employmentType', employmentFilter);
    if (experienceFilter) params.set('experienceLevel', experienceFilter);
    if (postedWithinDays) params.set('postedWithinDays', postedWithinDays);
    const [result, status] = await Promise.all([
      api(`/jobs?${params.toString()}`),
      api('/jobs/sync-status')
    ]);
    setJobs(result.items);
    setJobPagination(result.pagination);
    setSyncStatus(status);
    if (result.items.length && !trustJobId) setTrustJobId(result.items[0].id);
  }, [search, locationFilter, countryFilter, workplaceFilter, employmentFilter, experienceFilter, postedWithinDays, jobPage, trustJobId]);

  useEffect(() => {
    const onHashChange = () => setRoute(location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', onHashChange);
    const load = async () => {
      try {
        if (!localStorage.getItem('careerpilot_token')) return;
        const session = await api('/auth/me');
        setUser(session.user);
        await refresh();
      } catch (loadError) {
        localStorage.removeItem('careerpilot_token');
        setAuthenticated(false);
        setError(`${loadError.message} If this continues, refresh the page after confirming the API is running on port 4000.`);
      } finally {
        setBusy(false);
      }
    };
    load();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [refresh]);

  useEffect(() => {
    if (busy) return undefined;
    const timer = window.setTimeout(() => {
      loadJobs().catch(loadError => setError(loadError.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [busy, loadJobs]);

  const runAction = async (action, successMessage) => {
    setError('');
    try {
      await action();
      await refresh();
      setNotice(successMessage);
      return true;
    } catch (actionError) {
      setError(actionError.message);
      return false;
    }
  };

  const toggleSaved = id => runAction(
    () => api(`/saved/${id}`, { method: saved.includes(id) ? 'DELETE' : 'POST' }),
    saved.includes(id) ? 'Removed from saved jobs.' : 'Job saved.'
  );
  const addToPlanner = id => runAction(
    () => api('/applications', { method: 'POST', body: JSON.stringify({ jobId: id, status: 'Planned' }) }),
    'Added to your application planner. No application was submitted.'
  );
  const applyToJob = async job => {
    if (!job.applicationUrl) {
      setError('This listing does not provide a reliable official application URL.');
      return;
    }
    const application = await api('/applications', {
      method: 'POST',
      body: JSON.stringify({ jobId: job.id, status: 'APPLICATION_STARTED' })
    });
    window.open(job.applicationUrl, '_blank', 'noopener,noreferrer');
    setApplications(current => [application, ...current.filter(item => item.id !== application.id)]);
    setNotice(`Application started for ${job.title}. Review and submit on the employer website.`);
  };

  const currentTitle = pageTitles[route] || 'Overview';

  let page;
  if (route === 'discover' || route === 'saved') {
    const list = route === 'saved' ? savedJobRecords : jobs;
    page = <JobDiscovery jobs={list} syncStatus={syncStatus} saved={saved} search={search} setSearch={value => { setSearch(value); setJobPage(1); }} location={locationFilter} setLocation={value => { setLocationFilter(value); setJobPage(1); }} country={countryFilter} setCountry={value => { setCountryFilter(value); setJobPage(1); }} workplace={workplaceFilter} setWorkplace={value => { setWorkplaceFilter(value); setJobPage(1); }} employment={employmentFilter} setEmployment={value => { setEmploymentFilter(value); setJobPage(1); }} experience={experienceFilter} setExperience={value => { setExperienceFilter(value); setJobPage(1); }} postedWithinDays={postedWithinDays} setPostedWithinDays={value => { setPostedWithinDays(value); setJobPage(1); }} pagination={jobPagination} page={jobPage} setPage={setJobPage} onSave={toggleSaved} onPlan={addToPlanner} onApply={applyToJob} onTrust={id => { setTrustJobId(id); window.location.hash = 'trustlens'; }} emptySaved={route === 'saved'} />;
  } else if (route === 'career-dna') {
    page = <CareerDNA profile={profile} jobs={jobs} onSave={next => runAction(async () => { await api('/profile', { method: 'PUT', body: JSON.stringify(next) }); await loadJobs(); }, 'Career DNA profile updated.')} />;
  } else if (route === 'trustlens') {
    page = <TrustLens jobs={jobs} selectedId={trustJobId} setSelectedId={setTrustJobId} onReview={id => runAction(() => api(`/trust/${id}/reviewed`, { method: 'POST' }), 'Listing marked as reviewed.')} onReport={(id, reason) => runAction(() => api(`/trust/${id}/reports`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Report recorded in demo memory.')} />;
  } else if (route === 'planner') {
    page = <TimeBudget planner={planner} onSave={next => runAction(() => api('/planner', { method: 'PUT', body: JSON.stringify(next) }), 'Application time budget saved.')} onPlan={addToPlanner} />;
  } else if (route === 'applications') {
    page = <Applications items={applications} jobs={jobs} onChange={(id, status) => runAction(() => api(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }), 'Application status updated.')} />;
  } else if (route === 'proofpath') {
    page = <ProofPath evidence={evidence} onDraft={draft => api('/resume/drafts', { method: 'POST', body: JSON.stringify(draft) })} onApprove={id => api(`/resume/drafts/${id}/approve`, { method: 'POST' })} />;
  } else if (route === 'ai-studio') {
    page = <AIStudio status={aiStatus} jobs={jobs} />;
  } else if (route === 'rejection-coach') {
    page = <RejectionCoach jobs={jobs} />;
  } else if (route === 'realitycheck') {
    page = <RealityCheck insights={insights} />;
  } else if (route === 'privacy') {
    page = <PrivacyVault privacy={privacy} onExport={() => api('/privacy/export')} onDelete={async () => {
      if (!window.confirm('Delete all demo account data from server memory?')) return;
      try {
        await api('/account', { method: 'DELETE' });
        localStorage.removeItem('careerpilot_token');
        setNotice('Demo account data deleted. Reload to start a new demo session.');
      } catch (deleteError) {
        setError(deleteError.message);
      }
    }} />;
  } else if (route === 'settings') {
    page = <Settings onPair={() => api('/extension/pair', { method: 'POST', body: JSON.stringify({ name: 'CareerPilot Chrome extension' }) })} />;
  } else {
    page = <Overview applications={applications} saved={saved} jobs={jobs} planner={planner} onPlan={addToPlanner} onTrust={id => { setTrustJobId(id); window.location.hash = 'trustlens'; }} />;
  }

  if (!authenticated) return <AuthScreen onAuthenticated={() => window.location.reload()} />;
  return <div className="app">
    <aside className="side">
      <a className="logo" href="#overview"><i /><span>CareerPilot AI</span></a>
      {navigation.map(([group, items]) => <section key={group}><h4>{group}</h4>{items.map(([id, label]) => <a key={id} className={route === id ? 'on' : ''} href={`#${id}`} aria-current={route === id ? 'page' : undefined}><span>{label}</span></a>)}</section>)}
    </aside>
    <div className="content">
      <div className="demo">Job listings come from configured provider feeds; verify the original posting before applying. AI requests are sent only after your explicit consent.</div>
      <header className="top"><span className="sp" /><span className="muted">{user?.name || user?.email || 'Candidate'}</span><button className="btn sm" onClick={async () => { await api('/auth/logout', { method: 'POST' }); localStorage.removeItem('careerpilot_token'); setAuthenticated(false); }}>Log out</button></header>
      <main>
        <div className="crumb">Workspace / {currentTitle}</div>
        <h1>{currentTitle}</h1>
        {error && <div className="notice error" role="alert">{error}</div>}
        {busy ? <div className="card">Loading your workspace...</div> : page}
      </main>
    </div>
    {notice && <button className="toast" onClick={() => setNotice('')} role="status">{notice}</button>}
  </div>;
}

function Overview({ applications, saved, jobs, planner, onPlan, onTrust }) {
  const recommendations = planner?.recommendations || jobs;
  return <>
    <div className="welcome"><div><p className="eyebrow">YOUR CAREER DECISION WORKSPACE</p><h2>Make your next move with evidence.</h2><p className="muted">Explore opportunities, understand listing uncertainty, and decide how to use your time.</p></div><a className="btn primary" href="#discover">Explore jobs</a></div>
    <div className="metrics">
      <Metric label="Applications tracked" value={applications.length} />
      <Metric label="Interviews recorded" value={applications.filter(item => item.status === 'Interview').length} />
      <Metric label="Saved opportunities" value={saved.length} />
      <Metric label="Weekly time budget" value={planner ? `${planner.weeklyBudgetHours} hrs` : '...'} />
    </div>
    <div className="grid overview-grid">
      <section className="card"><div className="section-heading"><div><p className="eyebrow">TIMEBUDGET</p><h2>Recommended for you</h2></div><a href="#planner">Open planner</a></div>
        {recommendations.slice(0, 3).map(job => <div className="recommendation-row" key={job.id}><div><strong>{job.title}</strong><div className="muted sm">{job.company} - {job.estimatedMinutes} min estimated effort</div><p className="muted sm">{job.why || job.priority?.explanation}</p></div><div className="recommendation-actions"><Badge kind="warn">{job.priority?.recommendation || 'Review listing'}</Badge><button className="btn sm" onClick={() => onPlan(job.id)}>Plan</button></div></div>)}
      </section>
      <section className="card"><p className="eyebrow">YOUR NEXT ACTIONS</p><h2>Stay in control</h2><div className="action-list"><a href="#career-dna">Review your Career DNA profile</a><a href="#trustlens">Check listing evidence in TrustLens</a><a href="#proofpath">Review resume evidence before using a claim</a><a href="#realitycheck">See what your application data can support</a></div></section>
    </div>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">TRUSTLENS</p><h2>Listings that need a closer look</h2></div><a href="#trustlens">Review all</a></div>
      {jobs.slice(0, 2).map(job => <div className="row" key={job.id}><span><b>{job.title}</b><small>{job.company} - {job.trust.status.replaceAll('-', ' ')}</small></span><button className="btn sm" onClick={() => onTrust(job.id)}>Review evidence</button></div>)}
    </section>
  </>;
}

function Metric({ label, value }) {
  return <div className="card metric"><small>{label}</small><strong>{value}</strong></div>;
}

function JobDiscovery({
  jobs, syncStatus, saved, search, setSearch, location, setLocation, country, setCountry,
  workplace, setWorkplace, employment, setEmployment, experience, setExperience,
  postedWithinDays, setPostedWithinDays, pagination, page, setPage,
  onSave, onPlan, onApply, onTrust, emptySaved
}) {
  return <>
    <p className="muted">Search collected listings from configured job providers. Source and verification state are shown for each record; India is prioritized, not required.</p>
    {syncStatus && <div className="notice">{syncStatus.mongodbConnected ? 'Job database connected.' : 'Job database unavailable. Configure MongoDB to search stored listings.'} Configured sources: {Object.entries(syncStatus.configured || {}).filter(([, configured]) => configured).map(([provider]) => provider).join(', ') || 'none'}. {syncStatus.latestRuns?.length ? `Latest sync: ${syncStatus.latestRuns.map(run => `${run.provider} ${run.status}${run.error ? ` (${run.error})` : ''}`).join('; ')}.` : 'No synchronization runs have been recorded.'}</div>}
    {!emptySaved && <div className="card search">
      <input aria-label="Search jobs" placeholder="Role, company, or skill" value={search} onChange={event => setSearch(event.target.value)} />
      <input aria-label="Filter by location" placeholder="City, state, or location" value={location} onChange={event => setLocation(event.target.value)} />
      <input aria-label="Filter by country" placeholder="Country" value={country} onChange={event => setCountry(event.target.value)} />
      <select aria-label="Workplace type" value={workplace} onChange={event => setWorkplace(event.target.value)}><option value="">Any workplace</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select>
      <select aria-label="Employment type" value={employment} onChange={event => setEmployment(event.target.value)}><option value="">Any employment type</option><option value="internship">Internship</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option></select>
      <select aria-label="Experience level" value={experience} onChange={event => setExperience(event.target.value)}><option value="">Any experience</option><option value="internship">Internship roles</option><option value="entry">Entry level / graduate</option><option value="mid">Mid-level</option><option value="senior">Senior</option></select>
      <select aria-label="Posting date" value={postedWithinDays} onChange={event => setPostedWithinDays(event.target.value)}><option value="">Any posting date</option><option value="7">Past 7 days</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option></select>
    </div>}
    <p className="muted sm">{emptySaved ? jobs.length : pagination.total} opportunities {emptySaved ? 'saved' : 'found'}</p>
    {jobs.map(job => <article className="card job job-expanded" key={job.id}>
      <div className="job-main"><div className="section-heading"><div><h2>{job.title}</h2><p className="muted">{job.company} - {job.location} - {job.employmentType || 'Employment type not supplied'}</p></div><Badge kind={job.status === 'active' ? 'ok' : 'warn'}>{job.status}</Badge></div>
        <p>{job.description || 'The source did not provide a description.'}</p><div className="tags">{job.skills.map(skill => <Badge key={skill}>{skill}</Badge>)}</div>
        <div className="why-box"><strong>Skill match: {job.skillMatch === null ? 'not assessed' : `${job.skillMatch}%`}</strong><p className="muted sm">{job.why}</p><p className="muted sm">Matched: {job.matchedSkills?.join(', ') || 'none listed'}{job.missingSkills?.length ? ` · Missing: ${job.missingSkills.join(', ')}` : ''}</p><p className="muted sm">Eligibility: {job.eligibilityMatch?.replaceAll('-', ' ')} · Relevant experience: {job.experienceRequirements || 'not stated'} ({job.experienceMatch?.replaceAll('-', ' ')})</p></div>
        <div className="trust-inline"><Badge kind="warn">Needs verification: {job.status !== 'active' ? 'yes' : 'recheck before applying'}</Badge><span className="muted sm">Source: {job.sources?.map(source => source.provider).join(', ') || 'unknown'} · Last checked: {job.lastVerifiedAt ? new Date(job.lastVerifiedAt).toLocaleDateString() : 'not verified'}</span></div>
        <div className="trust-inline">{job.applicationUrl ? <a className="sm" href={job.applicationUrl} target="_blank" rel="noreferrer">Original application page</a> : <span className="muted sm">Application URL not supplied</span>}{job.postedAt && <span className="muted sm">Posted {new Date(job.postedAt).toLocaleDateString()}</span>}</div>
      </div>
      <div className="match"><strong>{job.skillMatch === null ? '—' : `${job.skillMatch}%`}</strong><div className="muted sm">skill match</div><div className="muted sm">{job.salary?.text || 'Salary not supplied'}</div>
        <button className="btn sm" aria-pressed={saved.includes(job.id)} onClick={() => onSave(job.id)}>{saved.includes(job.id) ? 'Saved' : 'Save job'}</button>
        <button className="btn sm" onClick={() => onTrust(job.id)}>Trust details</button>
        <button className="btn sm primary" disabled={['closed', 'expired'].includes(job.status)} onClick={() => onPlan(job.id)}>Add to planner</button>
        <button className="btn sm primary" disabled={!job.applicationUrl || ['closed', 'expired'].includes(job.status)} onClick={() => onApply(job)}>{job.applicationUrl ? 'Apply on company site' : 'No official apply link'}</button>
      </div>
    </article>)}
    {!jobs.length && <div className="card empty-state"><h2>{emptySaved ? 'No saved jobs yet' : 'No collected jobs match'}</h2><p className="muted">Check provider configuration and synchronization status, then adjust the filters.</p></div>}
    {!emptySaved && pagination.pages > 1 && <div className="button-row"><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</button><span className="muted sm">Page {page} of {pagination.pages}</span><button className="btn" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next page</button></div>}
  </>;
}

function CareerDNA({ profile, jobs, onSave }) {
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (profile) setForm({
      ...profile,
      existingSkillsText: profile.existingSkills.map(skill => `${skill.name}|${skill.confidence}`).join('\n'),
      interestsText: profile.interests.join(', '),
      goalsText: profile.learningGoals.join(', '),
      rolesText: profile.preferredRoles.join(', '),
      yearsExperienceText: profile.yearsExperience ?? '',
      workAuthorizationText: (profile.workAuthorizationCountries || []).join(', ')
    });
  }, [profile]);
  if (!form) return <div className="card">Loading Career DNA...</div>;
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const save = event => {
    event.preventDefault();
    const existingSkills = form.existingSkillsText.split('\n').filter(Boolean).map(line => {
      const [name, confidence = 'self-declared'] = line.split('|');
      return { name: name.trim(), confidence: confidence.trim() };
    });
    onSave({
      existingSkills,
      interests: form.interestsText.split(',').map(value => value.trim()).filter(Boolean),
      learningGoals: form.goalsText.split(',').map(value => value.trim()).filter(Boolean),
      preferredRoles: form.rolesText.split(',').map(value => value.trim()).filter(Boolean),
      yearsExperience: form.yearsExperienceText === '' ? null : Number(form.yearsExperienceText),
      workAuthorizationCountries: form.workAuthorizationText.split(',').map(value => value.trim()).filter(Boolean)
    });
  };
  const careerGroups = [
    ['Bridge Roles', 'Jobs with a strong detected skill overlap.', jobs.filter(job => job.category === 'bridge')],
    ['Growth Roles', 'Jobs with some detected skill overlap and clear missing skills.', jobs.filter(job => job.category === 'growth')],
    ['Stretch Roles', 'Jobs with lower detected overlap; review the skill gaps.', jobs.filter(job => job.category === 'stretch')]
  ];
  return <>
    <p className="muted">Your profile can change with your goals. Missing skills are gaps to understand, not an automatic rejection.</p>
    <div className="career-paths">
      {careerGroups.map(([label, explanation, matches]) => <div className="card path-card" key={label}><p className="eyebrow">CAREER DNA PATH</p><h2>{label}</h2><p className="muted">{explanation}</p>{matches.slice(0, 3).map(job => <p className="sm" key={job.id}><a href="#discover">{job.title} - {job.company}</a></p>)}{!matches.length && <span className="muted sm">No matching collected listings on this page.</span>}</div>)}
    </div>
    <form className="card profile-form" onSubmit={save}>
      <h2>Candidate profile dimensions</h2>
      <label>Skills (one per line: skill|verified, skill|self-declared, or skill|learning)<textarea name="existingSkillsText" value={form.existingSkillsText} onChange={change} rows="4" /></label>
      <label>Career interests (comma separated)<input name="interestsText" value={form.interestsText} onChange={change} /></label>
      <label>Learning goals (comma separated)<input name="goalsText" value={form.goalsText} onChange={change} /></label>
      <label>Preferred roles (comma separated)<input name="rolesText" value={form.rolesText} onChange={change} /></label>
      <label>Relevant years of experience (optional)<input name="yearsExperienceText" type="number" min="0" max="60" step="0.5" value={form.yearsExperienceText} onChange={change} /></label>
      <label>Work authorization countries (optional, comma separated)<input name="workAuthorizationText" value={form.workAuthorizationText} onChange={change} /></label>
      <button className="btn primary" type="submit">Save Career DNA</button>
    </form>
  </>;
}

function TrustLens({ jobs, selectedId, setSelectedId, onReview, onReport }) {
  const [reason, setReason] = useState('');
  const [trustData, setTrustData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const job = jobs.find(item => item.id === selectedId) || jobs[0];
  useEffect(() => {
    if (!job) return;
    setLoadError('');
    api(`/trust/${job.id}`).then(setTrustData).catch(error => setLoadError(error.message));
  }, [job?.id]);
  if (!job) return <div className="card">No collected listings are available to review yet.</div>;
  const trust = trustData?.jobId === job.id ? trustData : job.trust;
  return <>
    <p className="muted">TrustLens shows checked signals and unknowns. Uncertainty is not proof that a listing is fake.</p>
    <div className="trust-layout">
      <section className="card"><label>Choose a listing<select value={job.id} onChange={event => setSelectedId(event.target.value)}>{jobs.map(item => <option key={item.id} value={item.id}>{item.title} - {item.company}</option>)}</select></label>
        <p className="eyebrow">TRUSTLENS ASSESSMENT</p><h2>{job.title}</h2><p className="muted">{job.company} - {job.location}</p>
        <Badge kind="warn">{trust.status.replaceAll('-', ' ')}</Badge>
        {loadError && <div className="notice error" role="alert">{loadError}</div>}
        <dl className="trust-signals"><dt>Source</dt><dd>{trust.source}</dd><dt>Deadline</dt><dd>{trust.deadline}</dd><dt>Duplicate check</dt><dd>{trust.duplicate}</dd><dt>Application status</dt><dd>{trust.application}</dd></dl>
        <p className="muted sm">Original application URL: {trustData?.originalUrl || job.applicationUrl || 'not supplied by source'}</p>
        <div className="notice">A provider response is evidence that the source returned this record, not a guarantee of employer legitimacy or continued availability. Check the original listing before applying.</div>
        <div className="button-row"><button className="btn" onClick={() => onReview(job.id)}>Mark as reviewed</button><button className="btn" disabled={!reason.trim()} onClick={async () => { if (await onReport(job.id, reason)) setReason(''); }}>Report listing</button></div>
        <label>Report reason<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe the issue you noticed" /></label>
      </section>
      <aside className="card"><h2>Verification evidence</h2><p className="muted">Statuses reflect provider evidence. Temporary fetch failures do not mark listings expired.</p>{(trust.flags || []).map(flag => <div className="notice" key={flag}>{flag}</div>)}<h3>Sources</h3>{(trust.sources || []).map(source => <p className="muted sm" key={`${source.provider}-${source.externalJobId}`}>{source.provider} · {source.status} · last checked {source.lastVerifiedAt ? new Date(source.lastVerifiedAt).toLocaleString() : 'unknown'} · <a href={source.applicationUrl || source.sourceUrl} target="_blank" rel="noreferrer">open source</a></p>)}<h3>Similar listings</h3>{trust.similarListings?.length ? trust.similarListings.map(item => <p className="muted sm" key={item.id}>{item.title} - {item.company} - {item.location}</p>) : <p className="muted sm">No close same-company, same-location match found.</p>}<h3>Actions</h3><ul><li>Review the source independently.</li><li>Compare role, company, location, and description.</li><li>Do not share payment or sensitive data with an unverified listing.</li></ul></aside>
    </div>
  </>;
}

function TimeBudget({ planner, onSave, onPlan }) {
  const [hours, setHours] = useState(planner?.weeklyBudgetHours || 5);
  const [effort, setEffort] = useState(planner?.maxEffortMinutes || 90);
  useEffect(() => { if (planner) { setHours(planner.weeklyBudgetHours); setEffort(planner.maxEffortMinutes); } }, [planner]);
  if (!planner) return <div className="card">Loading planner recommendations...</div>;
  return <>
    <p className="muted">Prioritize by detected skill overlap, separate eligibility signals, listing status, and estimated review effort. Treat unknown eligibility as unknown; a skill match cannot override a known restriction.</p>
    <div className="card budget-controls"><label>Weekly application budget (hours)<input type="number" min="1" max="60" value={hours} onChange={event => setHours(Number(event.target.value))} /></label><label>Maximum effort per application (minutes)<input type="number" min="10" max="480" value={effort} onChange={event => setEffort(Number(event.target.value))} /></label><button className="btn primary" onClick={() => onSave({ weeklyBudgetHours: hours, maxEffortMinutes: effort })}>Save time budget</button></div>
    <div className="card"><h2>Your weekly application budget: {planner.weeklyBudgetHours} hours</h2>{planner.recommendations.map(job => <article className="recommendation-row" key={job.id}><div className="recommendation-copy"><div className="section-heading"><strong>{job.title}</strong><Badge kind="warn">{job.priority.recommendation}</Badge></div><p className="muted sm">{job.company} - {job.skillMatch === null ? 'skill match not assessed' : `${job.skillMatch}% skill match`} - eligibility {job.eligibilityMatch?.replaceAll('-', ' ')}</p><div className="tags"><Badge kind="warn">Listing: {job.status}</Badge><Badge>{job.category} role</Badge></div><p className="muted sm">{job.priority.explanation}</p><div className="factor-list">{Object.entries(job.priority.factors).map(([name, value]) => <span key={name}>{name}: {value ?? 'unknown'}</span>)}</div></div><button className="btn sm" disabled={['closed', 'expired'].includes(job.status)} onClick={() => onPlan(job.id)}>Add to planner</button></article>)}</div>
    <div className="notice">A 30-minute task at a slightly lower match may fit your week better than a multi-hour application. You can override every suggestion.</div>
  </>;
}

function Applications({ items, jobs, onChange }) {
  return <><p className="muted">Track changes over time. Status updates record an event; they do not submit applications.</p><div className="card scroll"><table><thead><tr><th>Role</th><th>Company</th><th>Status</th><th>Timeline</th></tr></thead><tbody>{items.map(application => {
    const job = jobs.find(item => item.id === application.jobId) || {};
    const title = job.title || application.jobTitle || 'Job listing';
    const company = job.company || application.companyName || 'Company not available';
    return <tr key={application.id}><td>{title}</td><td>{company}</td><td><select value={application.status} aria-label={`Status for ${title}`} onChange={event => onChange(application.id, event.target.value)}>{applicationStatuses.map(status => <option key={status}>{status}</option>)}</select></td><td>{(application.history || []).map((item, index) => <div className="sm" key={`${application.id}-${index}`}>{item.status} - {new Date(item.at).toLocaleDateString()}</div>)}</td></tr>;
  })}</tbody></table>{!items.length && <div className="empty-state"><h2>No applications tracked</h2><p className="muted">Add a role to the planner to start recording its progress.</p></div>}</div></>;
}

function ProofPath({ evidence, onDraft, onApprove }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('req-react');
  const [content, setContent] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    api('/resume/drafts').then(setDrafts).catch(loadError => setError(loadError.message));
  }, []);
  if (!evidence) return <div className="card">Loading sample evidence...</div>;
  const selected = evidence.requirements.find(item => item.id === selectedId) || evidence.requirements[0];
  const createDraft = async () => {
    setWorking(true);
    try {
      const created = await onDraft({ evidenceId: selected.id, content });
      setDrafts(current => [created, ...current]);
      setContent('');
      setConfirmed(false);
      setError('');
    } catch (draftError) {
      setError(draftError.message);
    } finally {
      setWorking(false);
    }
  };
  const approve = async id => {
    setWorking(true);
    try {
      const approved = await onApprove(id);
      setDrafts(current => current.map(item => item.id === id ? approved : item));
      setError('');
    } catch (approvalError) {
      setError(approvalError.message);
    } finally {
      setWorking(false);
    }
  };
  return <>
    <p className="muted">{evidence.notice} Factual suggestions require evidence or your explicit confirmation.</p>
    <div className="proof-layout">
      <section className="card"><p className="eyebrow">JOB REQUIREMENTS</p><h2>Evidence review</h2>{evidence.requirements.map(item => <button className={`requirement ${selected.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setContent(item.suggestion); setConfirmed(false); }}><span>{item.requirement}</span><Badge kind={item.status === 'supported' ? 'ok' : 'warn'}>{item.status.replaceAll('-', ' ')}</Badge></button>)}<div className="evidence-preview"><h3>Resume evidence</h3>{selected.evidence ? <blockquote>Page {selected.evidence.page}, lines {selected.evidence.lineStart}-{selected.evidence.lineEnd}: “{selected.evidence.text}”</blockquote> : <p className="notice">{selected.status === 'requires-confirmation' ? 'Requires your confirmation. Add a factual claim only if it reflects genuine experience.' : 'Insufficient evidence found. Do not present this requirement as a supported resume claim.'}</p>}</div></section>
      <section className="card"><p className="eyebrow">PROOFPATH STUDIO</p><h2>Draft your own wording</h2><p className="muted">You write and control the draft. This prototype does not generate resume claims.</p>{error && <div className="notice error" role="alert">{error}</div>}<textarea value={content} onChange={event => setContent(event.target.value)} rows="6" placeholder="Write an application statement using evidence you can verify." /><label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm this wording is accurate and reflects my genuine experience.</label><button className="btn primary" disabled={!content.trim() || !confirmed || working} onClick={createDraft}>Save candidate draft</button><div className="notice">Approving a draft records your review only. No application submission feature exists.</div>
        {drafts.map(draft => <div className="draft-item" key={draft.id}><p>{draft.content}</p><Badge kind={draft.status === 'candidate-approved-draft' ? 'ok' : ''}>{draft.status}</Badge>{draft.status === 'draft' && <button className="btn sm" disabled={working} onClick={() => approve(draft.id)}>Approve draft</button>}</div>)}
      </section>
    </div>
  </>;
}

function AIStudio({ status, jobs }) {
  const [resumeText, setResumeText] = useState('');
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const [jobDescription, setJobDescription] = useState(jobs[0]?.description || '');
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const selectedJob = jobs.find(job => job.id === jobId);

  useEffect(() => {
    if (!jobId && jobs.length) setJobId(jobs[0].id);
    if (selectedJob) setJobDescription(selectedJob.description);
  }, [jobId, jobs, selectedJob?.id]);

  const submit = async event => {
    event.preventDefault();
    setError('');
    setAnalysis(null);
    setWorking(true);
    try {
      const result = await api('/ai/resume-analysis', {
        method: 'POST',
        body: JSON.stringify({ resumeText, jobDescription, consentAccepted: consent })
      });
      setAnalysis(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  };

  if (!status) return <div className="card">Loading AI provider status...</div>;
  return <>
    <p className="muted">AI providers are accessed only by the server. Configure credentials in the server environment when you are ready; never paste API keys into this page.</p>
    <div className="card ai-provider-card">
      <div><p className="eyebrow">SERVER AI ADAPTER</p><h2>{status.provider === 'none' ? 'No provider selected' : status.provider}</h2><p className="muted">{status.message}</p></div>
      <div className="provider-meta"><Badge kind={status.configured ? 'ok' : 'warn'}>{status.configured ? 'Configured' : 'Not configured'}</Badge>{status.model && <span className="muted sm">Model: {status.model}</span>}</div>
    </div>
    <form className="card ai-form" onSubmit={submit}>
      <h2>Evidence-aware resume analysis</h2>
      <p className="muted sm">Enter sample text for now. This request is not stored by the demo API. When using a hosted provider, its own retention and privacy terms apply.</p>
      <label>Job listing<select value={jobId} onChange={event => setJobId(event.target.value)}>{jobs.map(job => <option key={job.id} value={job.id}>{job.title} - {job.company} (demo)</option>)}</select></label>
      <label>Job description<textarea value={jobDescription} onChange={event => setJobDescription(event.target.value)} rows="5" minLength="20" maxLength="12000" required /></label>
      <label>Resume text<textarea value={resumeText} onChange={event => setResumeText(event.target.value)} rows="8" minLength="30" maxLength="20000" placeholder="Paste resume text for analysis. Avoid including information you do not want sent to the configured provider." required /></label>
      <label className="check-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I understand this sends the text to the configured AI provider under its terms.</label>
      {error && <div className="notice error" role="alert">{error}</div>}
      {!status.configured && <div className="notice">To enable analysis, configure `AI_PROVIDER` and the relevant key or local endpoint in `server/.env`, then restart the API.</div>}
      <button className="btn primary" type="submit" disabled={!status.configured || !consent || working}>{working ? 'Analyzing...' : 'Analyze resume evidence'}</button>
    </form>
    {analysis && <section className="card"><p className="eyebrow">ANALYSIS RESULT</p><h2>Evidence review</h2><p className="muted sm">Provider: {analysis.provider} - {analysis.model}. {analysis.dataHandling}</p><div className="notice">{analysis.evidencePolicy}</div>{analysis.requirements.map((item, index) => <article className="analysis-item" key={`${item.requirement}-${index}`}><div className="section-heading"><h3>{item.requirement}</h3><Badge kind={item.status === 'supported-by-exact-quote' ? 'ok' : 'warn'}>{item.status === 'supported-by-exact-quote' ? 'Exact resume quote found' : 'Insufficient evidence'}</Badge></div>{item.status === 'supported-by-exact-quote' && item.evidenceQuote && <blockquote>{item.evidenceQuote}</blockquote>}<p>{item.status === 'supported-by-exact-quote' && item.claim ? item.claim : 'No factual claim is displayed as supported without an exact matching resume quote.'}</p>{item.recommendation && <p className="muted sm">{item.recommendation}</p>}</article>)}</section>}
  </>;
}

function RejectionCoach({ jobs }) {
  const stages = [
    ['unknown', 'Unknown'],
    ['resume-screening', 'Resume screening'],
    ['online-assessment', 'Online assessment'],
    ['technical-interview', 'Technical interview'],
    ['hr-interview', 'HR interview'],
    ['final-selection', 'Final selection']
  ];
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState('unknown');
  const [feedbackType, setFeedbackType] = useState('unknown');
  const [jobId, setJobId] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [consent, setConsent] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId && jobs.length) setJobId(jobs[0].id);
  }, [jobs, jobId]);

  const loadQuestions = async nextStage => {
    if (!consent) {
      setError('Please consent before sending information to the configured AI provider.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await api('/rejection/questions', {
        method: 'POST',
        body: JSON.stringify({ stage: nextStage, feedbackType, jobId, consentAccepted: consent })
      });
      setQuestions([...(result.fixedQuestions || []), ...(result.plannedQuestions || [])]);
      setQuestionIndex(0);
      setStep(1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  };

  const goToFeedback = nextStage => {
    setStage(nextStage);
    loadQuestions(nextStage);
  };

  const saveAnswerAndContinue = answer => {
    const current = questions[questionIndex];
    if (current) setAnswers(previous => {
      const next = { ...previous };
      if (answer.trim()) next[current.id] = { question: current.question, answer: answer.trim() };
      else delete next[current.id];
      return next;
    });
    if (questionIndex + 1 < questions.length) {
      setQuestionIndex(index => index + 1);
    } else {
      setStep(3);
    }
  };

  const createReport = async () => {
    setWorking(true);
    setError('');
    try {
      const result = await api('/rejection/report', {
        method: 'POST',
        body: JSON.stringify({
          stage,
          feedbackType,
          jobId: jobId || undefined,
          resumeText,
          pastedText,
          answers: Object.values(answers),
          consentAccepted: consent
        })
      });
      setReport(result);
      setStep(4);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(false);
    }
  };

  const progress = step === 4 ? 100 : Math.min(95, Math.round((step / 3) * 100));
  const currentQuestion = questions[questionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id]?.answer || '' : '';

  return <>
    <p className="muted">Reflect on the information you choose to share. The rejection stage is context only and does not establish a cause.</p>
    <section className="card rejection-panel">
      <div className="section-heading"><div><p className="eyebrow">CANDIDATE-CONTROLLED REFLECTION</p><h2>{step === 4 ? 'Your reflection report' : 'Rejection Coach'}</h2></div><span className="muted sm">{step === 4 ? 'Complete' : `Step ${Math.min(step + 1, 4)} of 4`}</span></div>
      <div className="rejection-progress" role="progressbar" aria-label="Reflection progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {working && <div className="notice" role="status">Preparing your reflection securely...</div>}

      {step === 0 && <div className="rejection-step">
        <h3>Share only what is useful</h3>
        <label>Related job (optional)<select value={jobId} onChange={event => setJobId(event.target.value)}><option value="">Continue without a selected job</option>{jobs.map(job => <option value={job.id} key={job.id}>{job.title} - {job.company}</option>)}</select></label>
        <label>Application stage<select value={stage} onChange={event => setStage(event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Resume text (optional; contact details are masked before provider requests)<textarea value={resumeText} onChange={event => setResumeText(event.target.value)} rows="5" maxLength="20000" placeholder="Paste relevant resume text, or skip it." /></label>
        <label className="check-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I consent to sending the information I provide here to the configured AI provider. The API does not save these inputs to persistent storage.</label>
        <div className="button-row"><button className="btn primary" disabled={working || !consent} onClick={() => loadQuestions(stage)}>Continue</button><button className="btn" disabled={working || !consent} onClick={() => goToFeedback('unknown')}>Skip stage</button></div>
      </div>}

      {step === 1 && <div className="rejection-step">
        <h3>Was any feedback shared?</h3>
        <label>Feedback type<select value={feedbackType} onChange={event => setFeedbackType(event.target.value)}><option value="unknown">Prefer not to say / unknown</option><option value="written">Yes, written feedback</option><option value="verbal">Yes, verbal feedback</option><option value="none">No feedback</option></select></label>
        <label>Optional feedback text<textarea value={pastedText} onChange={event => setPastedText(event.target.value)} rows="5" maxLength="12000" placeholder="You may paste relevant feedback. Email addresses and phone numbers are masked before AI requests." /></label>
        <div className="button-row"><button className="btn primary" onClick={() => setStep(2)}>Continue</button><button className="btn" onClick={() => { setPastedText(''); setFeedbackType('unknown'); setStep(2); }}>Skip this step</button></div>
      </div>}

      {step === 2 && currentQuestion && <div className="rejection-step">
        <p className="eyebrow">OPTIONAL QUESTION {questionIndex + 1} OF {questions.length}</p>
        <h3>{currentQuestion.question}</h3>
        <p className="muted sm">{currentQuestion.why_it_helps}</p>
        <textarea value={currentAnswer} onChange={event => setAnswers(previous => ({ ...previous, [currentQuestion.id]: { question: currentQuestion.question, answer: event.target.value } }))} rows="4" maxLength="1500" placeholder="Your answer is optional." />
        <div className="button-row"><button className="btn primary" onClick={() => saveAnswerAndContinue(currentAnswer)}>{questionIndex + 1 < questions.length ? 'Continue' : 'Review inputs'}</button><button className="btn" onClick={() => saveAnswerAndContinue('')}>Skip this question</button></div>
      </div>}

      {step === 3 && <div className="rejection-step">
        <h3>Ready when you are</h3><p className="muted">The report distinguishes employer statements from other possibilities. Any missing evidence stays unknown; the stage alone is not treated as a cause.</p>
        <div className="button-row"><button className="btn primary" disabled={working || !consent} onClick={createReport}>Generate reflection report</button><button className="btn" disabled={working} onClick={() => setStep(4)}>Skip report</button></div>
      </div>}

      {step === 4 && report && <div className="rejection-report">
        <div className="notice">{report.summary}</div>
        <div className="notice"><strong>Confidence: {report.confidence}</strong><br />{report.confidence_basis}</div>
        <h3>Possible factors</h3>
        {report.possible_factors?.length ? report.possible_factors.map((factor, index) => <article className="rejection-factor" key={`${factor.source}-${index}`}>
          <div className="section-heading"><strong>{factor.factor}</strong><Badge kind={factor.source === 'employer-stated' ? 'ok' : 'warn'}>{factor.source === 'employer-stated' ? 'Employer-stated' : 'Possible, not confirmed'}</Badge></div>
          <p className="sm"><strong>Evidence:</strong> {factor.evidence}</p>
          {factor.interpretation && <p className="sm"><strong>Reflection:</strong> {factor.interpretation}</p>}
          {factor.next_step && <p className="sm"><strong>Possible next step:</strong> {factor.next_step}</p>}
          {factor.note && <p className="muted sm">{factor.note}</p>}
        </article>) : <p className="muted">No specific factors could be supported by the information shared.</p>}
        <h3>Not determinable from available information</h3>
        <ul>{report.not_determinable?.map((item, index) => <li key={index}>{item}</li>)}</ul>
        <p className="notice">{report.note}</p>
        <p className="muted sm">{report.dataHandling}</p>
        <button className="btn" onClick={() => {
          setStep(0);
          setStage('unknown');
          setFeedbackType('unknown');
          setResumeText('');
          setPastedText('');
          setConsent(false);
          setQuestions([]);
          setQuestionIndex(0);
          setAnswers({});
          setReport(null);
          setError('');
        }}>Start another reflection</button>
      </div>}
      {step === 4 && !report && <div className="rejection-step"><p className="muted">No report was generated. Your answers remain under your control.</p><button className="btn" onClick={() => setStep(0)}>Return to start</button></div>}
    </section>
  </>;
}

function RealityCheck({ insights }) {
  if (!insights) return <div className="card">Loading outcome insights...</div>;
  return <>
    <p className="muted">RealityCheck separates recorded outcomes from conclusions that the data cannot support.</p>
    <div className="metrics"><Metric label="Applications" value={insights.applications} /><Metric label="Interviews" value={insights.interviews} /><Metric label="Rejections" value={insights.rejections} /><Metric label="Pending" value={insights.pending} /></div>
    <div className="card"><div className="section-heading"><h2>Evidence level</h2><Badge kind="warn">{insights.dataSufficiency}</Badge></div><p className="muted">Sample size: {insights.sampleSize}. Pending applications are not treated as rejections.</p><h3>What we know</h3><ul>{insights.knownFacts.map(item => <li key={item}>{item}</li>)}</ul><h3>What we cannot conclude</h3><ul>{insights.unsupportedConclusions.map(item => <li key={item}>{item}</li>)}</ul><div className="notice"><strong>Suggested next step:</strong> {insights.recommendedNextStep}</div></div>
  </>;
}

function PrivacyVault({ privacy, onExport, onDelete }) {
  const [exportText, setExportText] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  if (!privacy) return <div className="card">Loading privacy controls...</div>;
  const exportData = async () => {
    setExporting(true);
    setError('');
    try {
      setExportText(JSON.stringify(await onExport(), null, 2));
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting(false);
    }
  };
  return <>
    <p className="muted">Privacy is part of the product experience. This page accurately describes the current in-memory demo behavior.</p>
    <div className="notice"><strong>Current mode:</strong> {privacy.persistence}</div>
    <div className="card privacy-table"><h2>Data and purpose</h2><table><thead><tr><th>Category</th><th>Purpose</th><th>Retention</th></tr></thead><tbody>{privacy.policies.map(policy => <tr key={policy.category}><td>{policy.category}</td><td>{policy.purpose}</td><td>{policy.retention}</td></tr>)}</tbody></table><p className="muted sm">{privacy.externalAiUse}</p></div>
    <div className="card"><h2>Your data controls</h2><div className="button-row"><button className="btn" disabled={exporting} onClick={exportData}>{exporting ? 'Preparing export...' : 'Download / view my data'}</button><button className="btn danger" onClick={onDelete}>Delete demo account data</button></div>{error && <div className="notice error" role="alert">{error}</div>}{exportText && <pre className="export-preview">{exportText}</pre>}<p className="muted sm">Data is held in server memory only for this demo session and is removed when the server restarts or you request account deletion.</p></div>
  </>;
}

function Settings({ onPair }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const pair = async () => {
    try {
      setError('');
      const result = await onPair();
      setToken(result.token);
    } catch (pairError) {
      setError(pairError.message);
    }
  };
  return <div className="card"><h2>Candidate control settings</h2><p className="muted">These principles are enforced in the assisted workflow.</p><ul><li>Questionable listings remain visible with uncertainty labels.</li><li>Recommendations can be overridden by the candidate.</li><li>No application is submitted by this product.</li><li>Resume wording is entered and confirmed by the candidate.</li></ul><hr /><h3>Chrome extension</h3><p className="muted">Generate a short-lived scoped token, then paste it into the extension popup. The extension only fills fields for your review.</p><button className="btn primary" onClick={pair}>Generate extension token</button>{token && <div className="notice"><strong>Copy this token now:</strong><code className="token">{token}</code></div>}{error && <div className="notice error">{error}</div>}</div>;
}

createRoot(document.getElementById('root')).render(<App />);
