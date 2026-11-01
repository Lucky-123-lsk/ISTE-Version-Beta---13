import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './services/api';
import './styles.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JobDetailDrawer from './components/JobDetailDrawer';
import JobChatAssistant from './components/JobChatAssistant';
import Toast from './components/Toast';
import AuthPage from './components/AuthPage';
import Onboarding from './components/Onboarding';

// Pages
import Overview from './pages/Overview';
import DiscoverJobs from './pages/DiscoverJobs';
import SavedJobs from './pages/SavedJobs';
import CareerDNA from './pages/CareerDNA';
import TrustLens from './pages/TrustLens';
import TimeBudgetPlanner from './pages/TimeBudgetPlanner';
import Applications from './pages/Applications';
import ProofPath from './pages/ProofPath';
import SkillGaps from './pages/SkillGaps';
import InterviewPrep from './pages/InterviewPrep';
import AIStudio from './pages/AIStudio';
import RejectionCoach from './pages/RejectionCoach';
import PrivacyVault from './pages/PrivacyVault';
import Settings from './pages/Settings';
import TailoringStudio from './pages/TailoringStudio';

const pageTitles = {
  overview: 'Workspace Overview',
  discover: 'Discover Jobs',
  saved: 'Saved Jobs',
  'career-dna': 'Profile',
  trustlens: 'TrustLens',
  planner: 'TimeBudget Planner',
  applications: 'My Applications',
  proofpath: 'ProofPath Studio',
  'skill-gaps': 'Skill Gap Analysis',
  'interview-prep': 'Interview Preparation',
  'ai-studio': 'AI Studio',
  tailoring: 'Resume Tailoring Studio',
  'rejection-coach': 'Rejection Coach',
  privacy: 'PrivacyVault',
  settings: 'Settings'
};

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [route, setRoute] = useState(location.hash.slice(1) || 'overview');
  const [jobs, setJobs] = useState([]);
  const [savedJobRecords, setSavedJobRecords] = useState([]);
  const [saved, setSaved] = useState([]);
  const [applications, setApplications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [planner, setPlanner] = useState(null);
  const [insights, setInsights] = useState(null);
  const [privacy, setPrivacy] = useState(null);
  const [aiStatus, setAIStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [workplaceFilter, setWorkplaceFilter] = useState('');
  const [employmentFilter, setEmploymentFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('');
  const [postedWithinDays, setPostedWithinDays] = useState('');
  const [jobPage, setJobPage] = useState(1);
  const [jobPagination, setJobPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [jobSort, setJobSort] = useState('priority');
  const [recommendedOnly, setRecommendedOnly] = useState(true);
  const [recommendationInfo, setRecommendationInfo] = useState(null);

  // Selected for TrustLens and Drawer
  const [trustJobId, setTrustJobId] = useState('');
  const [proofPathJobId, setProofPathJobId] = useState('');
  const [proofPathJob, setProofPathJob] = useState(null);
  const [selectedTailoringJobId, setSelectedTailoringJobId] = useState('');
  const [proofPathSelection, setProofPathSelection] = useState({ jobId: '', items: [] });
  const [drawerJob, setDrawerJob] = useState(null);
  const [chatJob, setChatJob] = useState(null);

  // UI state
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const resetRoute = useCallback(() => {
    setRoute('overview');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  // Core data refresh function
  const refresh = useCallback(async () => {
    try {
      const [
        savedData,
        savedRecords,
        applicationData,
        profileData,
        plannerData,
        insightData,
        privacyData,
        aiProviderStatus
      ] = await Promise.all([
        api('/saved'),
        api('/saved/jobs'),
        api('/applications'),
        api('/profile'),
        api('/planner'),
        api('/insights'),
        api('/privacy'),
        api('/ai/status')
      ]);

      setSavedJobRecords(savedRecords || []);
      setSaved((savedData || []).map(item => item.jobId));
      setApplications(applicationData || []);
      setProfile(profileData);
      setPlanner(plannerData);
      setInsights(insightData);
      setPrivacy(privacyData);
      setAIStatus(aiProviderStatus);
    } catch (refreshErr) {
      console.warn('Initial data load warning:', refreshErr.message);
    }
  }, []);

  // Jobs query loader
  const loadJobs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(jobPage), limit: '30', sort: jobSort });
    if (recommendedOnly) params.set('recommended', 'true');
    if (search.trim()) params.set('q', search.trim());
    if (locationFilter.trim()) params.set('location', locationFilter.trim());
    if (countryFilter.trim()) params.set('country', countryFilter.trim());
    if (workplaceFilter) params.set('workplaceType', workplaceFilter);
    if (employmentFilter) params.set('employmentType', employmentFilter);
    if (experienceFilter) params.set('experienceLevel', experienceFilter);
    if (postedWithinDays) params.set('postedWithinDays', postedWithinDays);

    try {
      const [result, status] = await Promise.all([
        api(`/jobs?${params.toString()}`),
        api('/jobs/sync-status')
      ]);

      if (result && result.items) {
        setJobs(result.items);
        setJobPagination(result.pagination || { page: 1, pages: 1, total: result.items.length });
        setRecommendationInfo(result.recommendationInfo || null);
        setSyncStatus(status);
        if (result.items.length && !trustJobId) {
          setTrustJobId(result.items[0].id);
        }
      }
    } catch (loadErr) {
      console.warn('Jobs query warning:', loadErr.message);
    }
  }, [search, locationFilter, countryFilter, workplaceFilter, employmentFilter, experienceFilter, postedWithinDays, jobPage, trustJobId, recommendedOnly, jobSort]);
  const loadJobsRef = useRef(loadJobs);

  useEffect(() => {
    loadJobsRef.current = loadJobs;
  }, [loadJobs]);

  // Initial load
  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = location.hash.slice(1) || 'overview';
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);

    const init = async () => {
      localStorage.removeItem('careerpilot_token');
      try {
        const auth = await api('/auth/me', { skipDemo: true });
        setUser(auth.user);
        await refresh();
        await loadJobsRef.current();
      } catch (authError) {
        resetRoute();
        if (!['Authentication required', 'Your session is invalid or expired. Please sign in again.'].includes(authError.message)) {
          setError(authError.message);
        }
      } finally {
        setAuthReady(true);
        setBusy(false);
      }
    };

    init();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [refresh, resetRoute]);

  const completeAuthentication = async (authenticatedUser, onboarding = false) => {
    resetRoute();
    setUser(authenticatedUser);
    setNeedsOnboarding(onboarding);
    if (!onboarding) {
      setBusy(true);
      await refresh();
      await loadJobs();
      setBusy(false);
    }
  };

  const useDemo = async () => {
    try {
      const auth = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ email: 'demo@example.com' }), skipDemo: true });
      await completeAuthentication(auth.user);
    } catch (demoError) {
      setError(demoError.message);
    }
  };

  const logout = async () => {
    resetRoute();
    localStorage.removeItem('careerpilot_token');
    setUser(null);
    try {
      await api('/auth/logout', { method: 'POST', skipDemo: true });
    } catch (logoutError) {
      setError(`Signed out of this page, but the server could not clear the session cookie: ${logoutError.message}`);
    }
  };

  const applyOnCompanySite = async job => {
    if (!job.applicationUrl || !/^https?:\/\//i.test(job.applicationUrl)) {
      setError('This listing does not have a reliable official application URL.');
      return;
    }
    await runAction(
      () => api('/applications', { method: 'POST', body: JSON.stringify({ jobId: job.id, status: 'APPLICATION_STARTED' }) }),
      'Application started. Review and submit it manually on the employer site.'
    );
  };

  // Debounced jobs reloading when search or filters change
  useEffect(() => {
    if (busy || route !== 'discover') return undefined;
    const timer = window.setTimeout(() => {
      loadJobs().catch(e => setError(e.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [busy, route, loadJobs]);

  // Unified action runner with immediate dynamic state updates
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

  // Toggle Save job action
  const toggleSaved = id => {
    const isCurrentlySaved = saved.includes(id);
    // Optimistic UI update
    setSaved(curr => (isCurrentlySaved ? curr.filter(x => x !== id) : [...curr, id]));

    runAction(
      () => api(`/saved/${id}`, { method: isCurrentlySaved ? 'DELETE' : 'POST' }),
      isCurrentlySaved ? 'Opportunity removed from saved collection.' : 'Opportunity saved to your workspace.'
    );
  };

  // Add to Planner action
  const addToPlanner = id => {
    // Optimistic check
    const existing = applications.find(a => a.jobId === id);
    if (!existing) {
      const targetJob = jobs.find(j => j.id === id);
      const optimisticApp = {
        id: 'opt-' + Date.now(),
        jobId: id,
        jobTitle: targetJob?.title || 'Planned Role',
        companyName: targetJob?.company || 'Company',
        status: 'Planned',
        history: [{ status: 'Planned', at: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setApplications(curr => [optimisticApp, ...curr]);
    }

    return runAction(
      () => api('/applications', { method: 'POST', body: JSON.stringify({ jobId: id, status: 'Planned' }) }),
      'Added to your application planner. No application was submitted.'
    );
  };

  // Application status change
  const handleStatusChange = (appId, newStatus) => {
    // Optimistic update
    setApplications(curr =>
      curr.map(app =>
        app.id === appId
          ? {
              ...app,
              status: newStatus,
              history: [...(app.history || []), { status: newStatus, at: new Date().toISOString() }],
              updatedAt: new Date().toISOString()
            }
          : app
      )
    );

    runAction(
      () => api(`/applications/${appId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) }),
      `Application milestone updated to "${newStatus}".`
    );
  };

  // Update application notes / interview date
  const handleUpdateApplication = (appId, updates) => {
    setApplications(curr =>
      curr.map(app => (app.id === appId ? { ...app, ...updates, updatedAt: new Date().toISOString() } : app))
    );

    runAction(
      () => api(`/applications/${appId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
      'Application notes and interview details saved.'
    );
  };

  // Open TrustLens for a job
  const handleInspectTrust = id => {
    setTrustJobId(id);
    window.location.hash = 'trustlens';
  };

  const handleStartProofPath = job => {
    setProofPathJobId(job.id);
    setProofPathJob(job);
    setSelectedTailoringJobId(job.id);
    setProofPathSelection({ jobId: job.id, items: [] });
    setDrawerJob(null);
    window.location.hash = 'proofpath';
  };

  const handleContinueToTailoring = (job, evidenceItems) => {
    setProofPathJob(job);
    setSelectedTailoringJobId(job.id);
    setProofPathSelection({ jobId: job.id, items: evidenceItems });
    window.location.hash = 'tailoring';
  };

  // Open Drawer for a job
  const handleSelectJob = job => {
    setDrawerJob(job);
  };

  const searchSkillAnalysisJobs = useCallback(async ({ role, location, skill }) => {
    const params = new URLSearchParams({
      page: '1',
      limit: '100',
      sort: 'priority',
      recommended: 'false'
    });
    const query = [role, skill].filter(Boolean).join(' ');
    if (query) params.set('q', query);
    if (location) params.set('location', location);
    return api(`/jobs?${params.toString()}`);
  }, []);
  const skillGapSavedJobs = useMemo(
    () => savedJobRecords.length ? savedJobRecords : jobs.filter(job => saved.includes(job.id)),
    [savedJobRecords, jobs, saved]
  );

  const handleAskAI = job => {
    setChatJob(job);
    setIsChatOpen(true);
  };

  const toggleAIChat = context => {
    if (context === null) {
      setChatJob(null);
      return;
    }
    setIsChatOpen(current => !current);
  };

  const currentTitle = pageTitles[route] || 'Overview';

  if (!authReady) return <div className="loading-screen">Loading your secure workspace...</div>;
  if (!user) return <AuthPage onAuthenticated={completeAuthentication} onDemo={useDemo} />;
  if (needsOnboarding) return <Onboarding user={user} onComplete={async () => { setNeedsOnboarding(false); setBusy(true); await refresh(); await loadJobs(); setBusy(false); }} />;

  // Render current active page
  let pageContent;
  if (route === 'discover') {
    pageContent = (
      <DiscoverJobs
        jobs={jobs}
        recommendedOnly={recommendedOnly}
        recommendationInfo={recommendationInfo}
        profile={profile}
        preferredRoles={profile?.preferredRoles || []}
        sortBy={jobSort}
        onSortChange={setJobSort}
        onRecommendationModeChange={enabled => {
          setRecommendedOnly(enabled);
          setJobSort('priority');
          setJobPage(1);
        }}
        syncStatus={syncStatus}
        saved={saved}
        applications={applications}
        search={search}
        setSearch={val => { setSearch(val); setJobPage(1); }}
        location={locationFilter}
        setLocation={val => { setLocationFilter(val); setJobPage(1); }}
        country={countryFilter}
        setCountry={val => { setCountryFilter(val); setJobPage(1); }}
        workplace={workplaceFilter}
        setWorkplace={val => { setWorkplaceFilter(val); setJobPage(1); }}
        employment={employmentFilter}
        setEmployment={val => { setEmploymentFilter(val); setJobPage(1); }}
        experience={experienceFilter}
        setExperience={val => { setExperienceFilter(val); setJobPage(1); }}
        postedWithinDays={postedWithinDays}
        setPostedWithinDays={val => { setPostedWithinDays(val); setJobPage(1); }}
        pagination={jobPagination}
        page={jobPage}
        setPage={setJobPage}
        onSave={toggleSaved}
        onPlan={addToPlanner}
        onApply={applyOnCompanySite}
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
        onAskAI={handleAskAI}
      />
    );
  } else if (route === 'saved') {
    const currentSavedJobs = savedJobRecords.length > 0
      ? savedJobRecords
      : jobs.filter(j => saved.includes(j.id));

    pageContent = (
      <SavedJobs
        savedJobs={currentSavedJobs}
        saved={saved}
        applications={applications}
        onSave={toggleSaved}
        onPlan={addToPlanner}
        onApply={applyOnCompanySite}
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
        onAskAI={handleAskAI}
      />
    );
  } else if (route === 'career-dna') {
    pageContent = (
      <CareerDNA
        profile={profile}
        jobs={jobs}
        onSaveProfile={next =>
          runAction(async () => {
            await api('/profile', { method: 'PUT', body: JSON.stringify(next) });
            await loadJobs();
          }, 'Profile updated.')
        }
        onSelectJob={handleSelectJob}
        onAskAI={handleAskAI}
      />
    );
  } else if (route === 'trustlens') {
    pageContent = (
      <TrustLens
        jobs={jobs}
        selectedId={trustJobId}
        setSelectedId={setTrustJobId}
        onReview={id =>
          runAction(() => api(`/trust/${id}/reviewed`, { method: 'POST' }), 'Listing marked as candidate-reviewed.')
        }
        onReport={(id, rsn) =>
          runAction(
            () => api(`/trust/${id}/reports`, { method: 'POST', body: JSON.stringify({ reason: rsn }) }),
            'Listing audit report recorded in session memory.'
          )
        }
      />
    );
  } else if (route === 'planner') {
    pageContent = (
      <TimeBudgetPlanner
        planner={planner}
        applications={applications}
        onSaveBudget={next =>
          runAction(() => api('/planner', { method: 'PUT', body: JSON.stringify(next) }), 'TimeBudget settings saved.')
        }
        onPlan={addToPlanner}
        onSelectJob={handleSelectJob}
        onAskAI={handleAskAI}
      />
    );
  } else if (route === 'applications') {
    pageContent = (
      <Applications
        items={applications}
        jobs={jobs}
        onChangeStatus={handleStatusChange}
        onUpdateApp={handleUpdateApplication}
        onSelectJob={handleSelectJob}
      />
    );
  } else if (route === 'proofpath') {
    pageContent = (
      <ProofPath
        jobs={jobs}
        applications={applications}
        initialJobId={proofPathJobId}
        initialJob={proofPathJob}
        onJobChange={setProofPathJobId}
        onAddToPlanner={addToPlanner}
        onContinueToTailoring={handleContinueToTailoring}
      />
    );
  } else if (route === 'skill-gaps') {
    pageContent = (
      <SkillGaps
        profile={profile}
        saved={saved}
        savedJobs={skillGapSavedJobs}
        aiStatus={aiStatus}
        onSearchJobs={searchSkillAnalysisJobs}
        onSelectJob={handleSelectJob}
        onPrepareJob={handleStartProofPath}
      />
    );
  } else if (route === 'interview-prep') {
    pageContent = (
      <InterviewPrep
        jobs={jobs}
        applications={applications}
        profile={profile}
      />
    );
  } else if (route === 'ai-studio') {
    pageContent = <AIStudio status={aiStatus} jobs={jobs} />;
  } else if (route === 'tailoring') {
    const tailoringJobs = proofPathJob && !jobs.some(job => job.id === proofPathJob.id)
      ? [...jobs, proofPathJob]
      : jobs;
    pageContent = (
      <TailoringStudio
        jobs={tailoringJobs}
        applications={applications}
        aiStatus={aiStatus}
        selectedJobId={selectedTailoringJobId || drawerJob?.id || ''}
        proofPathSelection={proofPathSelection.jobId === (selectedTailoringJobId || drawerJob?.id) ? proofPathSelection : null}
        onError={setError}
      />
    );
  } else if (route === 'rejection-coach') {
    pageContent = <RejectionCoach jobs={jobs} />;
  } else if (route === 'privacy') {
    pageContent = (
      <PrivacyVault
        privacy={privacy}
        onExport={() => api('/privacy/export')}
        onDelete={async () => {
          if (!window.confirm('Permanently delete your CareerPilot account, related API records, and interview notes saved in this browser? This action cannot be undone.')) return;
          try {
            await api('/account', { method: 'DELETE' });
            localStorage.removeItem('careerpilot_interview_prep_notes');
            resetRoute();
            setNotice('Account data deletion completed. Refresh to start a new session.');
            setUser(null);
            return true;
          } catch (deleteError) {
            setError(deleteError.message);
            return false;
          }
        }}
      />
    );
  } else if (route === 'settings') {
    pageContent = <Settings />;
  } else {
    // Default: Redesigned Overview Dashboard
    pageContent = (
      <Overview
        applications={applications}
        saved={saved}
        jobs={jobs}
        planner={planner}
        profile={profile}
        onSave={toggleSaved}
        onPlan={addToPlanner}
        onApply={applyOnCompanySite}
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
        onAskAI={handleAskAI}
        onSelectApplication={() => { window.location.hash = 'applications'; }}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* Modern Sidebar Navigation */}
      <Sidebar
        currentRoute={route}
        counts={{
          savedCount: saved.length,
          appsCount: applications.length
        }}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
      />

      {/* Main Content Area */}
      <div className="app-main-viewport">
        {/* Top Header Bar */}
        <Header
          currentTitle={currentTitle}
          profile={profile}
          syncStatus={syncStatus}
          isFallback={!syncStatus?.mongodbConnected}
          onLogout={logout}
        />

        {/* Page Main Content */}
        <main className="app-content-body">
          {error && (
            <div className="notice notice-error mb-4" role="alert">
              <span>{error}</span>
              <button
                type="button"
                className="ml-auto text-xs underline font-semibold"
                onClick={() => setError('')}
              >
                Dismiss
              </button>
            </div>
          )}

          {busy ? (
            <div className="card loading-card">
              <div className="spinner-blue" />
              <p className="text-sm font-semibold text-slate-700 mt-3">
                Loading your candidate workspace...
              </p>
            </div>
          ) : (
            pageContent
          )}
        </main>
      </div>

      {/* Slide-over Job Details Drawer */}
      <JobDetailDrawer
        job={drawerJob}
        isOpen={Boolean(drawerJob)}
        onClose={() => setDrawerJob(null)}
        isSaved={drawerJob ? saved.includes(drawerJob.id) : false}
        isPlanned={drawerJob ? applications.some(a => a.jobId === drawerJob.id && a.status === 'Planned') : false}
        onSave={toggleSaved}
        onPlan={addToPlanner}
        onTrust={handleInspectTrust}
        onAskAI={handleAskAI}
        onBuildEvidence={handleStartProofPath}
      />

      <JobChatAssistant
        isOpen={isChatOpen}
        onToggle={toggleAIChat}
        job={chatJob}
        status={aiStatus}
      />

      {/* Toast Notification */}
      <Toast
        message={notice}
        onDismiss={() => setNotice('')}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
