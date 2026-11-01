import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconClock,
  IconShieldCheck,
  IconPlus,
  IconCheckCircle,
  IconAlertCircle,
  IconBriefcase
} from '../components/Icons';

export default function TimeBudgetPlanner({
  planner,
  applications = [],
  onSaveBudget,
  onPlan,
  onSelectJob,
  onAskAI
}) {
  const [budgetHours, setBudgetHours] = useState(planner?.weeklyBudgetHours || 5);
  const [maxEffort, setMaxEffort] = useState(planner?.maxEffortMinutes || 90);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (planner) {
      setBudgetHours(planner.weeklyBudgetHours || 5);
      setMaxEffort(planner.maxEffortMinutes || 90);
      setIsDirty(false);
    }
  }, [planner]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const saved = await onSaveBudget({ weeklyBudgetHours: budgetHours, maxEffortMinutes: maxEffort });
      if (saved !== false) setIsDirty(false);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const recommendations = planner?.recommendations || [];

  // Calculate planned applications and time
  const plannedApps = applications.filter(a => a.status === 'Planned');
  const plannedMinutes = plannedApps.reduce((acc, app) => {
    const job = recommendations.find(j => j.id === app.jobId);
    return acc + (Number.isFinite(job?.estimatedMinutes) ? job.estimatedMinutes : 0);
  }, 0);
  const unestimatedPlannedCount = plannedApps.filter(app => {
    const job = recommendations.find(item => item.id === app.jobId);
    return !Number.isFinite(job?.estimatedMinutes);
  }).length;
  const plannedHours = (plannedMinutes / 60).toFixed(1);
  const remainingHours = Math.max(0, budgetHours - plannedMinutes / 60).toFixed(1);
  const budgetUtilization = Math.min(100, Math.round(((plannedMinutes / 60) / budgetHours) * 100));

  return (
    <div className="planner-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">TimeBudget Planner</h1>
          <p className="page-subtitle">
            Review explainable opportunity signals against your own weekly budget. Listings do not provide application effort estimates, so unknown effort is never guessed and remains outside the utilization total.
          </p>
        </div>
      </div>

      {/* Interactive Budget Controls Bar */}
      <div className="card budget-hero-card">
        <div className="budget-controls-grid">
          {/* Weekly Hours Input */}
          <div className="budget-field-group">
            <label className="budget-field-label">
              <IconClock size={15} className="mr-1 text-blue-600" />
              Weekly Application Budget (Hours)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={budgetHours}
                onChange={e => {
                  setBudgetHours(Number(e.target.value));
                  setIsDirty(true);
                }}
                className="budget-slider"
              />
              <span className="slider-value-pill">{budgetHours} hrs/week</span>
            </div>
            <div className="preset-buttons-row">
              {[3, 5, 8, 12].map(preset => (
                <button
                  key={preset}
                  type="button"
                  className={`btn-preset ${budgetHours === preset ? 'active' : ''}`}
                  onClick={() => {
                    setBudgetHours(preset);
                    setIsDirty(true);
                  }}
                >
                  {preset}h
                </button>
              ))}
            </div>
          </div>

          {/* Max Effort Input */}
          <div className="budget-field-group">
            <label className="budget-field-label">
              <IconBriefcase size={15} className="mr-1 text-indigo-600" />
              Maximum Effort Per Role (Minutes)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="15"
                max="180"
                step="15"
                value={maxEffort}
                onChange={e => {
                  setMaxEffort(Number(e.target.value));
                  setIsDirty(true);
                }}
                className="budget-slider"
              />
              <span className="slider-value-pill">{maxEffort} mins</span>
            </div>
            <div className="preset-buttons-row">
              {[20, 30, 45, 60, 90].map(preset => (
                <button
                  key={preset}
                  type="button"
                  className={`btn-preset ${maxEffort === preset ? 'active' : ''}`}
                  onClick={() => {
                    setMaxEffort(preset);
                    setIsDirty(true);
                  }}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          {/* Save Action */}
          <div className="budget-save-column">
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!isDirty || saving}
              onClick={handleSave}
            >
              {saving ? 'Saving...' : isDirty ? 'Save TimeBudget' : 'Budget Saved'}
            </button>
            <span className="text-xs text-slate-400 mt-1 block text-center">
              Saves your budget; unavailable effort data stays unknown
            </span>
          </div>
        </div>
        {saveError && <div className="notice notice-error mt-3">{saveError}</div>}

        {/* Live Budget Utilization Meter */}
        <div className="budget-meter-strip">
          <div className="meter-labels">
            <span>
              <strong>{plannedHours} hours estimated</strong> across <strong>{plannedApps.length}</strong> planned applications
            </span>
            <span className="text-emerald-700 font-semibold">{remainingHours} hours unallocated by known estimates</span>
          </div>
          {unestimatedPlannedCount > 0 && <p className="text-xs text-amber-700 mt-2">{unestimatedPlannedCount} planned application(s) have no source-based effort estimate and are excluded from the utilization bar.</p>}
          <div className="capacity-bar-bg mt-2">
            <div
              className={`capacity-bar-fill ${budgetUtilization > 90 ? 'bg-amber' : 'bg-blue'}`}
              style={{ width: `${budgetUtilization}%` }}
            />
          </div>
        </div>
      </div>

      {/* Priority Recommendations List */}
      <div className="planner-results-section mt-6">
        <div className="section-header-row mb-4">
          <div>
            <h2 className="section-title">Prioritized Opportunity Queue</h2>
            <p className="section-subtitle">
              Priority averages available skill, eligibility, experience, interest, and verification signals. Unknown factors are omitted; application effort is not estimated from description length.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {recommendations.map(job => {
            const isPlanned = applications.some(a => a.jobId === job.id && a.status === 'Planned');
            const factors = job.priority?.factors || {};
            const isClosed = ['closed', 'confirmed-closed', 'expired'].includes(job.status);

            return (
              <article key={job.id} className="priority-job-row hover-lift">
                <div className="priority-score-badge">
                  <span className="score-val">{Number.isFinite(job.priority?.score) ? job.priority.score : '—'}</span>
                  <span className="score-lbl">Score</span>
                </div>

                <div className="priority-job-details">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="job-row-title" onClick={() => onSelectJob(job)}>
                      {job.title}
                    </h3>
                    <span className="job-row-company">at {job.company}</span>
                    <Badge kind={job.priority?.recommendation === 'Apply First' ? 'ok' : job.priority?.recommendation === 'Skip' ? 'error' : 'warn'} size="sm">
                      {job.priority?.recommendation || 'Review'}
                    </Badge>
                    <Badge kind={job.status === 'active' ? 'ok' : 'warn'} size="sm">
                      {job.status?.replaceAll('-', ' ')}
                    </Badge>
                  </div>

                  <p className="job-row-explanation">{job.priority?.explanation || job.why}</p>

                  {/* Factor Breakdown Chips */}
                  <div className="factors-row">
                    <span className="factor-pill">
                      Skill Overlap: <strong>{Number.isFinite(factors.skillMatch ?? job.skillMatch) ? `${factors.skillMatch ?? job.skillMatch}%` : 'Unassessed'}</strong>
                    </span>
                    <span className="factor-pill">
                      Application effort: <strong>{Number.isFinite(job.estimatedMinutes) ? `~${job.estimatedMinutes} min` : 'Not provided'}</strong>
                    </span>
                    <span className="factor-pill">
                      Eligibility Match:{' '}
                      <strong>{job.eligibilityMatch?.replaceAll('-', ' ') || 'unknown'}</strong>
                    </span>
                    <span className="factor-pill">
                      Experience: <strong>{Number.isFinite(factors.experienceSuitability) ? `${factors.experienceSuitability}%` : 'Unknown'}</strong>
                    </span>
                    <span className="factor-pill">
                      Interest: <strong>{Number.isFinite(factors.interestAlignment) ? `${factors.interestAlignment}%` : 'Unknown'}</strong>
                    </span>
                    <span className="factor-pill">
                      Verification freshness: <strong>{Number.isFinite(factors.verificationFreshness) ? `${factors.verificationFreshness}%` : 'Unknown'}</strong>
                    </span>
                    <span className="factor-pill">
                      Signal coverage: <strong>{job.priority?.confidence || 'Unknown'}</strong>
                    </span>
                  </div>
                </div>

                <div className="priority-job-actions">
                  {onAskAI && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAskAI(job)}>
                      Ask AI
                    </button>
                  )}
                  <button
                    type="button"
                    className={`btn btn-sm ${isPlanned ? 'btn-outline-ok' : 'btn-primary'}`}
                    disabled={isClosed}
                    onClick={() => onPlan(job.id)}
                  >
                    {isPlanned ? (
                      <>
                        <IconCheckCircle size={14} className="mr-1 text-emerald-600" />
                        Planned
                      </>
                    ) : (
                      <>
                        <IconPlus size={14} className="mr-1" />
                        Add to Week
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onSelectJob(job)}
                  >
                    Review Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
