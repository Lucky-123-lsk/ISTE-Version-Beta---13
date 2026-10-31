import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './services/api';
import './styles.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JobDetailDrawer from './components/JobDetailDrawer';
import Toast from './components/Toast';

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
import RealityCheck from './pages/RealityCheck';
import PrivacyVault from './pages/PrivacyVault';
import Settings from './pages/Settings';
import TailoringStudio from './pages/TailoringStudio';

const pageTitles = {
  overview: 'Workspace Overview',
  discover: 'Discover Jobs',
  saved: 'Saved Jobs',
  'career-dna': 'Career DNA',
  trustlens: 'TrustLens',
  planner: 'TimeBudget Planner',
  applications: 'My Applications',
  proofpath: 'ProofPath Studio',
  'skill-gaps': 'Skill Gap Analysis',
  'interview-prep': 'Interview Preparation',
  'ai-studio': 'AI Studio',
  tailoring: 'Resume Tailoring Studio',
  'rejection-coach': 'Rejection Coach',
  realitycheck: 'RealityCheck',
  privacy: 'PrivacyVault',
  settings: 'Settings'
};

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

  // Selected for TrustLens and Drawer
  const [trustJobId, setTrustJobId] = useState('');
  const [drawerJob, setDrawerJob] = useState(null);

  // UI state
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
        evidenceData,
        privacyData,
        aiProviderStatus
      ] = await Promise.all([
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

      setSavedJobRecords(savedRecords || []);
      setSaved((savedData || []).map(item => item.jobId));
      setApplications(applicationData || []);
      setProfile(profileData);
      setPlanner(plannerData);
      setInsights(insightData);
      setEvidence(evidenceData);
      setPrivacy(privacyData);
      setAIStatus(aiProviderStatus);
    } catch (refreshErr) {
      console.warn('Initial data load warning:', refreshErr.message);
    }
  }, []);

  // Jobs query loader
  const loadJobs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(jobPage), limit: '30', sort: 'newest' });
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
        setSyncStatus(status);
        if (result.items.length && !trustJobId) {
          setTrustJobId(result.items[0].id);
        }
      }
    } catch (loadErr) {
      console.warn('Jobs query warning:', loadErr.message);
    }
  }, [search, locationFilter, countryFilter, workplaceFilter, employmentFilter, experienceFilter, postedWithinDays, jobPage, trustJobId]);

  // Initial load
  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = location.hash.slice(1) || 'overview';
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHashChange);

    const init = async () => {
      try {
        if (!localStorage.getItem('careerpilot_token')) {
          const auth = await api('/auth/demo', {
            method: 'POST',
            body: JSON.stringify({ email: 'demo@example.com' })
          });
          if (auth?.token) {
            localStorage.setItem('careerpilot_token', auth.token);
          }
        }
        await refresh();
        await loadJobs();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };

    init();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [refresh, loadJobs]);

  // Debounced jobs reloading when search or filters change
  useEffect(() => {
    if (busy) return undefined;
    const timer = window.setTimeout(() => {
      loadJobs().catch(e => setError(e.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [busy, loadJobs]);

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

    runAction(
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

  // Open Drawer for a job
  const handleSelectJob = job => {
    setDrawerJob(job);
  };

  const currentTitle = pageTitles[route] || 'Overview';

  // Render current active page
  let pageContent;
  if (route === 'discover') {
    pageContent = (
      <DiscoverJobs
        jobs={jobs}
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
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
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
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
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
          }, 'Career DNA profile updated.')
        }
        onSelectJob={handleSelectJob}
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
        evidence={evidence}
        onDraft={draft => api('/resume/drafts', { method: 'POST', body: JSON.stringify(draft) })}
        onApprove={id => api(`/resume/drafts/${id}/approve`, { method: 'POST' })}
      />
    );
  } else if (route === 'skill-gaps') {
    pageContent = (
      <SkillGaps
        profile={profile}
        jobs={jobs}
        saved={saved}
        onSelectJob={handleSelectJob}
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
    pageContent = <TailoringStudio jobs={jobs} applications={applications} selectedJobId={drawerJob?.id || ''} onError={setError} />;
  } else if (route === 'rejection-coach') {
    pageContent = <RejectionCoach jobs={jobs} />;
  } else if (route === 'realitycheck') {
    pageContent = <RealityCheck insights={insights} applications={applications} />;
  } else if (route === 'privacy') {
    pageContent = (
      <PrivacyVault
        privacy={privacy}
        onExport={() => api('/privacy/export')}
        onDelete={async () => {
          if (!window.confirm('Delete all demo account data and active session history?')) return;
          try {
            await api('/account', { method: 'DELETE' });
            localStorage.removeItem('careerpilot_token');
            setNotice('Demo session data cleared. Refresh to start a clean workspace.');
            await refresh();
          } catch (deleteError) {
            setError(deleteError.message);
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
        onSelectJob={handleSelectJob}
        onTrust={handleInspectTrust}
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
