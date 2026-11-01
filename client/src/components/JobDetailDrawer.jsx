import React, { useEffect } from 'react';
import Badge from './Badge';
import {
  IconX,
  IconMapPin,
  IconClock,
  IconShieldCheck,
  IconExternalLink,
  IconBookmark,
  IconPlus,
  IconCheckCircle,
  IconAlertCircle,
  IconFileText
} from './Icons';

export default function JobDetailDrawer({
  job,
  isOpen,
  onClose,
  isSaved,
  isPlanned,
  onSave,
  onPlan,
  onTrust,
  onAskAI,
  onBuildEvidence
}) {
  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !job) return null;

  const matchScore = job.skillMatch;
  const isClosed = ['closed', 'confirmed-closed', 'expired'].includes(job.status);

  return (
    <div className="drawer-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer-panel animate-slide-left" onClick={e => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-info">
            <span className="drawer-eyebrow">OPPORTUNITY AUDIT</span>
            <h2 className="drawer-title">{job.title}</h2>
            <div className="drawer-meta">
              <span className="font-semibold text-slate-800">{job.company}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-600">
                <IconMapPin size={13} />
                {job.location}
              </span>
              <span>•</span>
              <span className="text-slate-600">{job.employmentType || 'Full-time'}</span>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
            <IconX size={20} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="drawer-body">
          {/* Quick Metrics Bar */}
          <div className="drawer-metrics-grid">
            <div className="drawer-metric-box">
              <span className="metric-box-label">Skill Match</span>
              <span className="metric-box-value text-blue-600">
                {Number.isFinite(matchScore) ? `${matchScore}%` : 'Unassessed'}
              </span>
              <span className="metric-box-sub">Role category: {job.category || 'unassessed'}</span>
            </div>

            <div className="drawer-metric-box">
              <span className="metric-box-label">Trust Status</span>
              <span className="metric-box-value">
                <Badge kind={job.status === 'active' ? 'ok' : 'warn'} size="sm">
                  {job.status?.replaceAll('-', ' ') || 'needs-review'}
                </Badge>
              </span>
              <span className="metric-box-sub">
                {job.lastVerifiedAt
                  ? `Checked ${new Date(job.lastVerifiedAt).toLocaleDateString()}`
                  : 'Provider feed unverified'}
              </span>
            </div>

            <div className="drawer-metric-box">
              <span className="metric-box-label">Estimated Effort</span>
              <span className="metric-box-value text-slate-800">{Number.isFinite(job.estimatedMinutes) ? `~${job.estimatedMinutes} min` : 'Unknown'}</span>
              <span className="metric-box-sub">{Number.isFinite(job.estimatedMinutes) ? 'Review & tailored evidence' : 'The listing does not provide effort data'}</span>
            </div>

            <div className="drawer-metric-box">
              <span className="metric-box-label">Compensation</span>
              <span className="metric-box-value text-slate-800">
                {job.salary?.text || 'Not disclosed'}
              </span>
              <span className="metric-box-sub">Direct stated salary</span>
            </div>
          </div>

          {/* TrustLens Verification Notice */}
          <div className="trust-audit-card">
            <div className="audit-card-header">
              <div className="flex items-center gap-2">
                <IconShieldCheck size={18} className="text-blue-600" />
                <h4 className="font-semibold text-slate-900">TrustLens Audit Summary</h4>
              </div>
              <button
                type="button"
                className="btn btn-subtle btn-xs"
                onClick={() => {
                  onClose();
                  onTrust(job.id);
                }}
              >
                Deep TrustLens View
              </button>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              <strong>Source:</strong> {job.trust?.source || 'Public job provider feed'}
            </p>
            {job.trust?.deadline && (
              <p className="text-sm text-slate-600 mt-1">
                <strong>Deadline:</strong> {job.trust.deadline}
              </p>
            )}
            {job.trust?.flags?.map((flag, idx) => (
              <div key={idx} className="audit-flag-pill mt-2">
                <span className="text-amber-600 mr-1.5">•</span>
                <span>{flag}</span>
              </div>
            ))}
          </div>

          {/* Skill Breakdown */}
          <div className="drawer-section">
            <div className="proofpath-drawer-cta">
              <div>
                <strong>Prepare an evidence-backed application</strong>
                <p>Check which job requirements your resume and profile can support.</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onClose();
                  onBuildEvidence?.(job);
                }}
              >
                <IconFileText size={14} className="mr-1.5" />
                Build evidence
              </button>
            </div>
            <h4 className="section-subtitle">Skills & Requirements Match</h4>
            <p className="text-sm text-slate-600 mb-3">{job.why}</p>

            <div className="matched-skills-group">
              <span className="group-label text-emerald-700">Matched Skills ({job.matchedSkills?.length || 0})</span>
              <div className="chips-row">
                {job.matchedSkills?.length ? (
                  job.matchedSkills.map(skill => (
                    <span key={skill} className="skill-chip chip-matched">
                      ✓ {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500 italic">No direct keyword overlap found with verified skills.</span>
                )}
              </div>
            </div>

            <div className="missing-skills-group mt-3">
              <span className="group-label text-amber-700">Missing / Unverified Skills ({job.missingSkills?.length || 0})</span>
              <div className="chips-row">
                {job.missingSkills?.length ? (
                  job.missingSkills.map(skill => (
                    <span key={skill} className="skill-chip chip-missing">
                      + {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500 italic">All detected key requirements match your profile!</span>
                )}
              </div>
            </div>
          </div>

          {/* Role Description */}
          <div className="drawer-section">
            <h4 className="section-subtitle">Role Overview</h4>
            <div className="drawer-description-text">
              {job.description || 'No detailed description supplied by provider feed.'}
            </div>
          </div>

          {/* Eligibility & Experience */}
          <div className="drawer-section">
            <h4 className="section-subtitle">Eligibility & Experience Requirements</h4>
            <div className="eligibility-table">
              <div className="eligibility-row">
                <span className="eligibility-key">Required Experience:</span>
                <span className="eligibility-val">{job.experienceRequirements || 'Not stated'}</span>
              </div>
              <div className="eligibility-row">
                <span className="eligibility-key">Workplace Arrangement:</span>
                <span className="eligibility-val capitalize">{job.workplaceType || 'On-site'}</span>
              </div>
              <div className="eligibility-row">
                <span className="eligibility-key">Country / Jurisdiction:</span>
                <span className="eligibility-val">{job.country || 'India'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          <button
            type="button"
            className={`btn ${isSaved ? 'btn-secondary' : 'btn-outline'}`}
            onClick={() => onSave(job.id)}
          >
            <IconBookmark size={15} filled={isSaved} className="mr-1.5" />
            {isSaved ? 'Saved in Collection' : 'Save Opportunity'}
          </button>

          <button
            type="button"
            className={`btn ${isPlanned ? 'btn-outline-ok' : 'btn-primary'}`}
            disabled={isClosed}
            onClick={() => onPlan(job.id)}
          >
            {isPlanned ? (
              <>
                <IconCheckCircle size={15} className="mr-1.5 text-emerald-600" />
                Planned in TimeBudget
              </>
            ) : (
              <>
                <IconPlus size={15} className="mr-1.5" />
                Add to Application Planner
              </>
            )}
          </button>

          {job.applicationUrl && (
            <a
              href={job.applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              title="Open source application portal in new tab"
            >
              <span>Apply on Employer Page</span>
              <IconExternalLink size={14} className="ml-1.5" />
            </a>
          )}
          {onAskAI && (
            <button type="button" className="btn btn-secondary" onClick={() => onAskAI(job)}>
              <span>Ask AI about this job</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
