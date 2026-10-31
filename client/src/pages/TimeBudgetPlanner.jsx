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
  onSelectJob
}) {
  const [budgetHours, setBudgetHours] = useState(planner?.weeklyBudgetHours || 5);
  const [maxEffort, setMaxEffort] = useState(planner?.maxEffortMinutes || 90);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (planner) {
      setBudgetHours(planner.weeklyBudgetHours || 5);
      setMaxEffort(planner.maxEffortMinutes || 90);
      setIsDirty(false);
    }
  }, [planner]);

  const handleSave = () => {
    onSaveBudget({ weeklyBudgetHours: budgetHours, maxEffortMinutes: maxEffort });
    setIsDirty(false);
  };

  const recommendations = planner?.recommendations || [];

  // Calculate planned applications and time
  const plannedApps = applications.filter(a => a.status === 'Planned');
  const plannedMinutes = plannedApps.reduce((acc, app) => {
    const job = recommendations.find(j => j.id === app.jobId);
    return acc + (job?.estimatedMinutes || 30);
  }, 0);
  const plannedHours = (plannedMinutes / 60).toFixed(1);
  const remainingHours = Math.max(0, budgetHours - plannedMinutes / 60).toFixed(1);
  const budgetUtilization = Math.min(100, Math.round(((plannedMinutes / 60) / budgetHours) * 100));

  return (
    <div className="planner-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">TimeBudget Planner</h1>
          <p className="page-subtitle">
            Prioritize high-impact applications based on your actual weekly bandwidth. Scores are deterministic, explainable calculations that you can adjust and override at any time.
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
              disabled={!isDirty}
              onClick={handleSave}
            >
              {isDirty ? 'Save TimeBudget' : 'Budget Saved'}
            </button>
            <span className="text-xs text-slate-400 mt-1 block text-center">
              Recalculates priority efficiency scores
            </span>
          </div>
        </div>

        {/* Live Budget Utilization Meter */}
        <div className="budget-meter-strip">
          <div className="meter-labels">
            <span>
              <strong>{plannedHours} hours</strong> planned across <strong>{plannedApps.length}</strong> applications
            </span>
            <span className="text-emerald-700 font-semibold">{remainingHours} hours remaining</span>
          </div>
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
              Calculated using: Skill Fit (35%) + Known Eligibility (25%) + Time Efficiency (15%) + Opportunity Baseline (25%).
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
                  <span className="score-val">{job.priority?.score ?? 70}</span>
                  <span className="score-lbl">Score</span>
                </div>

                <div className="priority-job-details">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="job-row-title" onClick={() => onSelectJob(job)}>
                      {job.title}
                    </h3>
                    <span className="job-row-company">at {job.company}</span>
                    <Badge kind={job.priority?.recommendation === 'Review First' ? 'ok' : 'blue'} size="sm">
                      {job.priority?.recommendation || 'Consider'}
                    </Badge>
                    <Badge kind={job.status === 'active' ? 'ok' : 'warn'} size="sm">
                      {job.status?.replaceAll('-', ' ')}
                    </Badge>
                  </div>

                  <p className="job-row-explanation">{job.priority?.explanation || job.why}</p>

                  {/* Factor Breakdown Chips */}
                  <div className="factors-row">
                    <span className="factor-pill">
                      Skill Overlap: <strong>{factors.skillMatch ?? job.skillMatch ?? '50'}%</strong>
                    </span>
                    <span className="factor-pill">
                      Estimated Effort: <strong>~{job.estimatedMinutes || 25} min</strong>
                    </span>
                    <span className="factor-pill">
                      Eligibility Match:{' '}
                      <strong>{job.eligibilityMatch?.replaceAll('-', ' ') || 'unrestricted'}</strong>
                    </span>
                    <span className="factor-pill">
                      Time Efficiency: <strong>{factors.timeEfficiency ?? 75}/100</strong>
                    </span>
                  </div>
                </div>

                <div className="priority-job-actions">
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

