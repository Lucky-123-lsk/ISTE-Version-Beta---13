import React from 'react';
import Badge from './Badge';
import {
  IconBookmark,
  IconMapPin,
  IconClock,
  IconShieldCheck,
  IconExternalLink,
  IconPlus,
  IconCheckCircle
} from './Icons';

export default function JobCard({
  job,
  isSaved = false,
  isPlanned = false,
  onSave,
  onPlan,
  onApply,
  onSelect,
  onTrust,
  onAskAI,
  variant = 'default' // 'default', 'compact', 'horizontal'
}) {
  const matchScore = job.skillMatch;
  const matchLabel = job.skillMatchSource === 'profile-skills-in-description' ? 'Profile Skills Match' : 'Skills Match';
  const trustStatus = job.trust?.status || job.status || 'needs-review';
  const effortMinutes = Number.isFinite(job.estimatedMinutes) ? job.estimatedMinutes : null;
  const salaryText = job.salary?.text || null;
  const applicationUrl = /^https?:\/\//i.test(job.applicationUrl || '') ? job.applicationUrl : null;

  // Derive trust badge kind
  const getTrustBadge = status => {
    switch (status) {
      case 'active':
        return { label: 'Listed Active at Source', kind: 'ok' };
      case 'confirmed-closed':
      case 'closed':
        return { label: 'Closed Listing', kind: 'error' };
      case 'possibly-outdated':
      case 'expired':
        return { label: 'Possibly Outdated', kind: 'warn' };
      case 'needs-review':
      case 'unverified':
      default:
        return { label: 'Needs Verification', kind: 'warn' };
    }
  };

  const trustBadge = getTrustBadge(trustStatus);

  // Derive match badge kind
  const getMatchKind = score => {
    if (score === null || score === undefined) return 'neutral';
    if (score >= 75) return 'ok';
    if (score >= 50) return 'blue';
    return 'warn';
  };

  const isClosed = ['closed', 'confirmed-closed', 'expired'].includes(job.status);

  return (
    <article className={`job-card-premium ${variant === 'horizontal' ? 'job-card-horizontal' : ''} hover-lift`}>
      <div className="job-card-top">
        <div className="job-main-info">
          <div className="job-title-row">
            <h3 className="job-title">{job.title}</h3>
            {job.recommendation && <Badge kind="blue" size="sm">Recommended</Badge>}
            {job.isSample && (
              <span className="sample-provenance-tag" title="Curated demonstration record; not a live or source-verified listing">
                Sample
              </span>
            )}
          </div>
          <div className="job-company-row">
            <span className="job-company">{job.company}</span>
            <span className="job-meta-dot">•</span>
            <span className="job-location">
              <IconMapPin size={12} className="meta-icon" />
              {job.location}
            </span>
            {job.employmentType && (
              <>
                <span className="job-meta-dot">•</span>
                <span className="job-type">{job.employmentType}</span>
              </>
            )}
            {job.workplaceType && (
              <>
                <span className="job-meta-dot">•</span>
                <span className="job-workplace capitalize">{job.workplaceType}</span>
              </>
            )}
          </div>
        </div>

        {/* Top right actions: bookmark */}
        <div className="job-card-header-actions">
          <button
            type="button"
            className={`action-btn-bookmark ${isSaved ? 'saved' : ''}`}
            onClick={e => {
              e.stopPropagation();
              onSave(job.id);
            }}
            title={isSaved ? 'Remove from saved' : 'Save opportunity'}
            aria-label={isSaved ? 'Remove from saved' : 'Save opportunity'}
          >
            <IconBookmark size={16} filled={isSaved} />
          </button>
        </div>
      </div>

      {/* Salary & Match Bar */}
      <div className="job-indicators-row">
        <div className="match-indicator-wrap" title={`${job.why || 'Skill overlap calculation'} Skills Match is not a prediction of selection odds.`}>
          <div className="match-pill">
            <span className="match-label">{matchLabel}</span>
            <span className={`match-value text-${getMatchKind(matchScore)}`}>
              {Number.isFinite(matchScore) ? `${matchScore}%` : 'Unassessed'}
            </span>
          </div>
          {Number.isFinite(matchScore) && (
            <div className="match-mini-bar">
              <div
                className={`match-mini-fill bg-${getMatchKind(matchScore)}`}
                style={{ width: `${Math.min(100, matchScore)}%` }}
              />
            </div>
          )}
        </div>

        <div className="trust-indicator-wrap" onClick={() => onTrust && onTrust(job.id)}>
          <Badge kind={trustBadge.kind} size="sm" dot>
            {trustBadge.label}
          </Badge>
        </div>

        <div className="effort-indicator-wrap" title={effortMinutes === null ? 'The listing does not provide application effort data' : 'Estimated time to review requirements and prepare application evidence'}>
          <IconClock size={13} className="text-slate-400" />
          <span className="effort-text">{effortMinutes === null ? 'Effort unknown' : `~${effortMinutes}m effort`}</span>
        </div>

        {salaryText && (
          <div className="salary-pill" title="Disclosed compensation">
            {salaryText}
          </div>
        )}
      </div>

      {/* Skill Chips */}
      {job.skills?.length > 0 && (
        <div className="job-skills-chips">
          {job.skills.slice(0, 5).map(skill => {
            const isMatched = job.matchedSkills?.includes(skill);
            const isMissing = job.missingSkills?.includes(skill);
            return (
              <span
                key={skill}
                className={`skill-chip ${isMatched ? 'chip-matched' : isMissing ? 'chip-missing' : ''}`}
              >
                {isMatched && <span className="chip-indicator">✓</span>}
                {skill}
              </span>
            );
          })}
          {job.skills.length > 5 && (
            <span className="skill-chip-more">+{job.skills.length - 5} more</span>
          )}
        </div>
      )}

      {/* Rationale explanation if available */}
      {job.why && (
        <div className="job-why-snippet">
          <span className="why-label">Match Signal:</span>
          <span className="why-text">{job.why}</span>
        </div>
      )}

      {/* Footer Actions */}
      <div className="job-card-footer">
        <div className="footer-left">
          {applicationUrl && (
            <a
              href={applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
              onClick={e => e.stopPropagation()}
            >
              <span>Original Source</span>
              <IconExternalLink size={12} />
            </a>
          )}
          {job.trust?.source && (
            <span className="provider-tag" title={job.isSample ? 'Demonstration data only' : 'Source provider'}>
              {job.isSample ? 'Demo Sample' : `via ${job.sources?.[0]?.provider || 'Provider Feed'}`}
            </span>
          )}
        </div>

        <div className="footer-right">
          {onAskAI && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={event => {
                event.stopPropagation();
                onAskAI(job);
              }}
            >
              <span>Ask AI</span>
            </button>
          )}
          {applicationUrl && <a href={applicationUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onApply?.(job); }}>Apply on company site</a>}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSelect(job)}
          >
            Review Details
          </button>

          <button
            type="button"
            className={`btn btn-sm ${isPlanned ? 'btn-outline-ok' : 'btn-primary'}`}
            disabled={isClosed}
            onClick={e => {
              e.stopPropagation();
              onPlan(job.id);
            }}
          >
            {isPlanned ? (
              <>
                <IconCheckCircle size={13} className="mr-1" />
                Planned
              </>
            ) : (
              <>
                <IconPlus size={13} className="mr-1" />
                Add to Planner
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
