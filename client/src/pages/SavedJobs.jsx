import React, { useState } from 'react';
import JobCard from '../components/JobCard';
import { IconBookmark, IconArrowRight, IconSearch } from '../components/Icons';

export default function SavedJobs({
  savedJobs = [],
  saved = [],
  applications = [],
  onSave,
  onPlan,
  onApply,
  onSelectJob,
  onTrust,
  onAskAI
}) {
  const [sortBy, setSortBy] = useState('match');

  const sortedList = [...savedJobs].sort((a, b) => {
    if (sortBy === 'match') {
      if (!Number.isFinite(a.skillMatch)) return Number.isFinite(b.skillMatch) ? 1 : 0;
      if (!Number.isFinite(b.skillMatch)) return -1;
      return b.skillMatch - a.skillMatch;
    }
    if (sortBy === 'effort') {
      return (Number.isFinite(a.estimatedMinutes) ? a.estimatedMinutes : Number.POSITIVE_INFINITY)
        - (Number.isFinite(b.estimatedMinutes) ? b.estimatedMinutes : Number.POSITIVE_INFINITY);
    }
    return a.title.localeCompare(b.title);
  });

  return (
    <div className="saved-jobs-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Saved Opportunities</h1>
          <p className="page-subtitle">
            Curated roles you have bookmarked for review, source auditing, and time allocation.
          </p>
        </div>

        {savedJobs.length > 0 && (
          <div className="sort-dropdown-wrap">
            <label htmlFor="saved-sort" className="text-xs text-slate-500 mr-2">Sort by:</label>
            <select
              id="saved-sort"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="form-select-sm"
            >
              <option value="match">Highest Skill Match</option>
              <option value="effort">Lowest Review Effort</option>
              <option value="title">Role Title</option>
            </select>
          </div>
        )}
      </div>

      {savedJobs.length > 0 ? (
        <div className="jobs-grid-layout">
          {sortedList.map(job => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={true}
              isPlanned={applications.some(a => a.jobId === job.id && a.status === 'Planned')}
              onSave={onSave}
              onPlan={onPlan}
              onApply={onApply}
              onSelect={onSelectJob}
              onTrust={onTrust}
              onAskAI={onAskAI}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state-panel">
          <div className="empty-icon-circle">
            <IconBookmark size={32} className="text-slate-400" />
          </div>
          <h3 className="empty-title">No saved opportunities yet</h3>
          <p className="empty-desc">
            Bookmark opportunities in Discover Jobs to build your candidate-controlled decision pipeline.
          </p>
          <a href="#discover" className="btn btn-primary btn-sm mt-3">
            <IconSearch size={14} className="mr-1.5" />
            Discover Jobs
          </a>
        </div>
      )}
    </div>
  );
}
