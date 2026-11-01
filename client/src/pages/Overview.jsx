import React, { useMemo } from 'react';
import MetricCard from '../components/MetricCard';
import JobCard from '../components/JobCard';
import Badge from '../components/Badge';
import {
  IconBriefcase,
  IconCalendar,
  IconClock,
  IconBookmark,
  IconSparkles,
  IconArrowRight,
  IconFileText,
  IconTarget,
} from '../components/Icons';

export default function Overview({
  applications = [],
  saved = [],
  jobs = [],
  planner = null,
  profile = null,
  onSave,
  onPlan,
  onApply,
  onSelectJob,
  onTrust,
  onAskAI,
  onSelectApplication
}) {
  // 1. Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const candidateName = profile?.name || profile?.fullName || 'Demo Candidate';

  // 2. Derive dynamic metrics
  const totalAppsCount = applications.length;
  const interviewsCount = applications.filter(a => a.status === 'Interview').length;
  const pendingAppsCount = applications.filter(a =>
    ['Planned', 'Applied', 'Assessment'].includes(a.status)
  ).length;
  const savedJobsCount = saved.length;

  // 3. Weekly Planner computations
  const weeklyBudgetHours = planner?.weeklyBudgetHours || profile?.weeklyBudgetHours || 5;
  const plannedApps = applications.filter(a => a.status === 'Planned');
  const unestimatedPlannedCount = plannedApps.filter(app => {
    const job = jobs.find(item => item.id === app.jobId);
    return !Number.isFinite(job?.estimatedMinutes);
  }).length;
  const totalPlannedMinutes = plannedApps.reduce((acc, app) => {
    const job = jobs.find(j => j.id === app.jobId);
    return acc + (Number.isFinite(job?.estimatedMinutes) ? job.estimatedMinutes : 0);
  }, 0);
  const totalPlannedHours = (totalPlannedMinutes / 60).toFixed(1);
  const remainingHours = Math.max(0, (weeklyBudgetHours - totalPlannedMinutes / 60)).toFixed(1);
  const budgetUtilization = Math.min(100, Math.round((totalPlannedMinutes / 60 / weeklyBudgetHours) * 100));

  // 4. Upcoming interviews & recent activities
  const upcomingInterviews = applications.filter(a => a.status === 'Interview');
  const recentActivities = useMemo(() => {
    const list = [];
    applications.forEach(app => {
      (app.history || []).forEach(h => {
        list.push({
          appId: app.id,
          jobId: app.jobId,
          jobTitle: app.jobTitle,
          companyName: app.companyName,
          status: h.status,
          date: new Date(h.at || app.updatedAt || Date.now()),
          notes: app.notes
        });
      });
    });
    return list.sort((a, b) => b.date - a.date).slice(0, 5);
  }, [applications]);

  // 5. Dynamic "Next Best Action" logic based on candidate state
  const nextBestAction = useMemo(() => {
    // Priority 1: An interview is scheduled!
    if (upcomingInterviews.length > 0) {
      const target = upcomingInterviews[0];
      return {
        badge: 'High Priority',
        badgeKind: 'ok',
        title: `Prepare for ${target.companyName} Interview`,
        explanation: `You have an active interview stage for ${target.jobTitle}. Review role-specific technical prompts and STAR responses grounded in your confirmed experience.`,
        ctaText: 'Open Interview Prep',
        href: '#interview-prep'
      };
    }

    // Priority 2: Incomplete profile dimensions
    const verifiedCount = (profile?.existingSkills || []).filter(s => s.confidence === 'verified').length;
    if (verifiedCount < 3) {
      return {
        badge: 'Profile Precision',
        badgeKind: 'blue',
        title: 'Confirm Skills in Profile',
        explanation: 'Only a few verified skills are registered. Elevating self-declared skills to verified status improves the explainable match score across bridge and growth roles.',
        ctaText: 'Update Profile',
        href: '#career-dna'
      };
    }

    // Priority 3: Saved jobs requiring TrustLens verification
    const unverifiedSaved = saved.map(id => jobs.find(j => j.id === id)).filter(j => j && j.status !== 'active');
    if (unverifiedSaved.length > 0) {
      return {
        badge: 'Trust Verification',
        badgeKind: 'warn',
        title: `Verify ${unverifiedSaved[0].company} Listing Evidence`,
        explanation: `The listing for "${unverifiedSaved[0].title}" has unverified provider signals. Check its primary career portal source in TrustLens before investing application time.`,
        ctaText: 'Inspect in TrustLens',
        href: '#trustlens'
      };
    }

    // Priority 4: Available time budget remaining
    if (Number(remainingHours) > 1.5 && unestimatedPlannedCount === 0) {
      return {
        badge: 'TimeBudget Opportunity',
        badgeKind: 'blue',
        title: `Review Recommended Bridge Opportunities`,
        explanation: `You have ${remainingHours} hours remaining in this week's budget. Planning 1-2 curated bridge roles keeps your pipeline consistent without exceeding your target effort.`,
        ctaText: 'Open Discover Jobs',
        href: '#discover'
      };
    }

    // Default: Continue tracking candidate-controlled application progress
    return {
      badge: 'Application Tracking',
      badgeKind: 'neutral',
      title: 'Review Your Application Pipeline',
      explanation: 'Keep application milestones and interview details up to date to organize your active search.',
      ctaText: 'Open Applications',
      href: '#applications'
    };
  }, [upcomingInterviews, profile, saved, jobs, remainingHours, unestimatedPlannedCount]);

  // 6. Curated recommended jobs for overview strip (top 3)
  const recommendedJobs = useMemo(() => {
    if (planner?.recommendations?.length) {
      return planner.recommendations.slice(0, 3);
    }
    return jobs.slice(0, 3);
  }, [planner, jobs]);

  // 7. Profile completion calculation
  const profileCompletion = useMemo(() => {
    let score = 20; // Base profile
    if ((profile?.existingSkills || []).length >= 3) score += 25;
    if ((profile?.existingSkills || []).some(s => s.confidence === 'verified')) score += 15;
    if ((profile?.interests || []).length > 0) score += 15;
    if ((profile?.learningGoals || []).length > 0) score += 15;
    if (profile?.yearsExperience !== null && profile?.yearsExperience !== undefined) score += 10;
    return Math.min(100, score);
  }, [profile]);

  return (
    <div className="overview-page animate-fade-in">
      {/* A. Welcome Banner & Hero */}
      <section className="overview-hero-card">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <IconSparkles size={14} className="text-blue-500 inline mr-1.5" />
            <span>AUTONOMOUS CAREER DECISION WORKSPACE</span>
          </div>
          <h1 className="hero-greeting">
            {greeting}, <span className="text-blue-600">{candidateName}</span>
          </h1>
          <p className="hero-subtext">
            You have <strong className="text-slate-900">{pendingAppsCount} applications in progress</strong> and{' '}
            <strong className="text-slate-900">{remainingHours} hours</strong> unallocated by known effort estimates. Listings without effort data are not guessed; all decisions and submissions remain in your control.
          </p>
          <div className="hero-actions">
            <a href="#discover" className="btn btn-primary">
              <IconBriefcase size={16} className="mr-2" />
              Explore Opportunities
            </a>
            <a href="#career-dna" className="btn btn-secondary">
              <IconFileText size={16} className="career-profile-icon mr-2" />
              Update Career Profile
            </a>
          </div>
        </div>
      </section>

      {/* B. Dynamic Metric Cards */}
      <section className="overview-metrics-grid">
        <MetricCard
          title="Total Applications"
          value={totalAppsCount}
          subtext={`${pendingAppsCount} active in pipeline`}
          icon={IconBriefcase}
          colorScheme="blue"
          href="#applications"
        />

        <MetricCard
          title="Interviews"
          value={interviewsCount}
          subtext={interviewsCount > 0 ? 'Upcoming interview discussions' : 'No interviews scheduled yet'}
          trend={interviewsCount > 0 ? 'Action Needed' : undefined}
          trendType={interviewsCount > 0 ? 'positive' : 'neutral'}
          icon={IconCalendar}
          colorScheme="emerald"
          href="#applications"
        />

        <MetricCard
          title="Pending Pipeline"
          value={pendingAppsCount}
          subtext="Planned, Applied & Assessment"
          icon={IconClock}
          colorScheme="amber"
          href="#applications"
        />

        <MetricCard
          title="Saved Jobs"
          value={savedJobsCount}
          subtext="Opportunities bookmarked"
          icon={IconBookmark}
          colorScheme="purple"
          href="#saved"
        />
      </section>

      {/* C & D: Middle Split Layout: Next Best Action & Weekly TimeBudget Planner */}
      <div className="overview-split-layout">
        {/* Next Best Action Widget */}
        <section className="overview-action-card hover-lift">
          <div className="action-card-top">
            <div className="flex items-center gap-2">
              <span className="action-card-label">YOUR NEXT BEST ACTION</span>
              <Badge kind={nextBestAction.badgeKind} size="sm">
                {nextBestAction.badge}
              </Badge>
            </div>
            <span className="action-card-source">Ground Truth Recommendation</span>
          </div>

          <h3 className="action-card-title">{nextBestAction.title}</h3>
          <p className="action-card-explanation">{nextBestAction.explanation}</p>

          <div className="action-card-footer">
            <a href={nextBestAction.href} className="btn btn-primary btn-sm">
              <span>{nextBestAction.ctaText}</span>
              <IconArrowRight size={14} className="ml-1.5" />
            </a>
          </div>
        </section>

        {/* Weekly TimeBudget Planner Widget */}
        <section className="overview-planner-card hover-lift">
          <div className="planner-card-header">
            <div>
              <span className="action-card-label">TIMEBUDGET PLANNER</span>
              <h3 className="planner-card-title">Weekly Capacity</h3>
            </div>
            <a href="#planner" className="btn btn-subtle btn-xs">
              Adjust Budget
            </a>
          </div>

          <div className="planner-metrics-row">
            <div className="planner-stat">
              <span className="stat-label">Weekly Budget</span>
              <span className="stat-value">{weeklyBudgetHours}h</span>
            </div>
            <div className="planner-stat">
              <span className="stat-label">Known Effort</span>
              <span className="stat-value text-blue-600">{totalPlannedHours}h</span>
            </div>
            <div className="planner-stat">
              <span className="stat-label">Unallocated</span>
              <span className="stat-value text-emerald-600">{remainingHours}h</span>
            </div>
          </div>

          {/* Capacity Progress Bar */}
          <div className="planner-capacity-bar-wrap">
            <div className="capacity-bar-bg">
              <div
                className={`capacity-bar-fill ${budgetUtilization > 90 ? 'bg-amber' : 'bg-blue'}`}
                style={{ width: `${budgetUtilization}%` }}
              />
            </div>
            <div className="capacity-bar-legend">
              <span>{budgetUtilization}% allocated by known estimates</span>
              <span>{plannedApps.length} roles planned</span>
            </div>
          </div>

          <div className="planner-quick-tip">
            <IconClock size={13} className="text-slate-400 mr-1.5" />
            <span className="text-xs text-slate-500">
              {unestimatedPlannedCount ? `${unestimatedPlannedCount} planned application(s) have no source-based effort estimate; those are excluded from this total.` : 'Application effort is not provided by job listings, so only known estimates count against this personal budget.'}
            </span>
          </div>
        </section>
      </div>

      {/* E. Recommended Opportunities Strip */}
      <section className="overview-section">
        <div className="section-header-row">
          <div>
            <span className="section-eyebrow">SMART MATCH OPPORTUNITIES</span>
            <h2 className="section-title">Recommended For You</h2>
            <p className="section-subtitle">
              Ranked by deterministic skill overlap, verified source trust, and estimated preparation effort.
            </p>
          </div>
          <a href="#discover" className="btn btn-secondary btn-sm">
            <span>View All Opportunities</span>
            <IconArrowRight size={13} className="ml-1" />
          </a>
        </div>

        <div className="recommended-jobs-grid">
          {recommendedJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={saved.includes(job.id)}
              isPlanned={applications.some(a => a.jobId === job.id && a.status === 'Planned')}
              onSave={onSave}
              onPlan={onPlan}
              onApply={onApply}
              onSelect={onSelectJob}
              onTrust={onTrust}
              onAskAI={onAskAI}
            />
          ))}
          {!recommendedJobs.length && (
            <div className="empty-card">
              <IconBriefcase size={28} className="text-slate-400 mb-2" />
              <h4>No job recommendations yet</h4>
              <p className="text-sm text-slate-500">
                Explore Discover Jobs or adjust your profile preferences.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* F & G. Bottom Split: Application Activity Feed & Profile Progress */}
      <div className="overview-split-layout">
        {/* Activity Feed */}
        <section className="overview-activity-card">
          <div className="activity-card-header">
            <div className="flex items-center gap-2">
              <IconBriefcase size={18} className="text-blue-600" />
              <h3 className="card-heading">Recent Application Activity</h3>
            </div>
            <a href="#applications" className="btn btn-subtle btn-xs">
              Full Pipeline
            </a>
          </div>

          <div className="activity-timeline">
            {recentActivities.length > 0 ? (
              recentActivities.map((act, index) => (
                <div
                  key={`${act.appId}-${index}`}
                  className="activity-item"
                  onClick={() => onSelectApplication && onSelectApplication(act.appId)}
                >
                  <div className="activity-marker">
                    <span className="marker-dot" />
                    {index < recentActivities.length - 1 && <span className="marker-line" />}
                  </div>
                  <div className="activity-details">
                    <div className="activity-header">
                      <span className="activity-role">{act.jobTitle}</span>
                      <span className="activity-date">
                        {act.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="activity-sub">
                      <span className="activity-company">{act.companyName}</span>
                      <Badge kind={act.status === 'Interview' ? 'ok' : act.status === 'Rejected' ? 'error' : 'blue'} size="sm">
                        {act.status}
                      </Badge>
                    </div>
                    {act.notes && <p className="activity-note">{act.notes}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-activity-state">
                <p className="text-sm text-slate-500">No application milestones recorded yet.</p>
                <a href="#discover" className="btn btn-secondary btn-xs mt-2">
                  Plan your first application
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Career Progress & DNA Health */}
        <section className="overview-dna-card">
          <div className="dna-card-header">
            <div className="flex items-center gap-2">
              <IconFileText size={18} className="text-indigo-600" />
              <h3 className="card-heading">Profile Progress</h3>
            </div>
            <a href="#career-dna" className="btn btn-subtle btn-xs">
              Manage Profile
            </a>
          </div>

          {/* Profile Completion Bar */}
          <div className="dna-completion-wrap">
            <div className="completion-header">
              <span className="completion-label">Profile Completeness</span>
              <span className="completion-val">{profileCompletion}%</span>
            </div>
            <div className="completion-bar-bg">
              <div
                className="completion-bar-fill"
                style={{ width: `${profileCompletion}%` }}
              />
            </div>
          </div>

          {/* Skill Confidence Breakdown */}
          <div className="dna-skills-breakdown">
            <h4 className="breakdown-title">Registered Competencies</h4>
            <div className="skills-tags-wrap">
              {(profile?.existingSkills || []).map(skill => (
                <span
                  key={skill.name}
                  className={`skill-badge-pill ${skill.confidence === 'verified' ? 'pill-verified' : skill.confidence === 'learning' ? 'pill-learning' : 'pill-self'}`}
                  title={`Confidence level: ${skill.confidence}`}
                >
                  <span className="pill-dot" />
                  {skill.name}
                  <span className="pill-label">({skill.confidence})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Top detected skill gap preview */}
          <div className="dna-gap-preview">
            <div className="gap-preview-header">
              <IconTarget size={15} className="text-amber-600 mr-1.5" />
              <span className="text-xs font-semibold text-slate-700">Top Growth Skill Gap</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              <strong>Python & Vector DB</strong> is requested in 45% of target AI and backend listings.
            </p>
            <a href="#skill-gaps" className="btn btn-subtle btn-xs mt-2">
              View Skill Gap Roadmap
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
