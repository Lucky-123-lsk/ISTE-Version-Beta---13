import React, { useState } from 'react';
import JobCard from '../components/JobCard';
import {
  IconSearch,
  IconMapPin,
  IconBriefcase,
  IconKanban,
  IconTable,
  IconX,
  IconShieldCheck
} from '../components/Icons';

export default function DiscoverJobs({
  jobs = [],
  syncStatus,
  saved = [],
  applications = [],
  search,
  setSearch,
  location,
  setLocation,
  country,
  setCountry,
  workplace,
  setWorkplace,
  employment,
  setEmployment,
  experience,
  setExperience,
  postedWithinDays,
  setPostedWithinDays,
  pagination,
  page,
  setPage,
  onSave,
  onPlan,
  onSelectJob,
  onTrust
}) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [sortBy, setSortBy] = useState('match'); // 'match' | 'newest' | 'effort'

  // Sort jobs locally if desired
  const sortedJobs = [...jobs].sort((a, b) => {
    if (sortBy === 'match') {
      return (b.skillMatch || 0) - (a.skillMatch || 0);
    }
    if (sortBy === 'effort') {
      return (a.estimatedMinutes || 25) - (b.estimatedMinutes || 25);
    }
    if (sortBy === 'newest') {
      return new Date(b.postedAt || 0) - new Date(a.postedAt || 0);
    }
    return 0;
  });

  const hasActiveFilters = Boolean(
    search || location || country || workplace || employment || experience || postedWithinDays
  );

  const resetFilters = () => {
    setSearch('');
    setLocation('');
    setCountry('');
    setWorkplace('');
    setEmployment('');
    setExperience('');
    setPostedWithinDays('');
  };

  return (
    <div className="discover-page animate-fade-in">
      {/* Header and Summary */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Discover Opportunities</h1>
          <p className="page-subtitle">
            Search verified listings from configured provider feeds. India is prioritized; opportunities feature transparent match and trust audits.
          </p>
        </div>

        {/* View Switcher & Sort */}
        <div className="filter-controls-right">
          <div className="sort-dropdown-wrap">
            <label htmlFor="sort-select" className="text-xs text-slate-500 mr-2">Sort by:</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="form-select-sm"
            >
              <option value="match">Highest Skill Match</option>
              <option value="newest">Newest Discovered</option>
              <option value="effort">Lowest Review Effort</option>
            </select>
          </div>

          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <IconKanban size={16} />
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <IconTable size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Modern Filter Card */}
      <div className="filter-card">
        <div className="search-inputs-grid">
          {/* Main Keyword Search */}
          <div className="search-input-wrap flex-2">
            <IconSearch size={16} className="search-input-icon" />
            <input
              type="text"
              placeholder="Role, title, company, or key skill (e.g. React, Python)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input-field"
              aria-label="Search opportunities"
            />
          </div>

          {/* Location Search */}
          <div className="search-input-wrap flex-1">
            <IconMapPin size={16} className="search-input-icon" />
            <input
              type="text"
              placeholder="City or state (e.g. Bengaluru, Remote)"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="search-input-field"
              aria-label="Filter by location"
            />
          </div>

          {/* Country Search */}
          <div className="search-input-wrap flex-1">
            <input
              type="text"
              placeholder="Country (India default)"
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="search-input-field"
              aria-label="Filter by country"
            />
          </div>
        </div>

        {/* Dropdowns Row */}
        <div className="dropdowns-row">
          <select
            value={workplace}
            onChange={e => setWorkplace(e.target.value)}
            className="filter-select"
            aria-label="Workplace type"
          >
            <option value="">Any Workplace</option>
            <option value="remote">Remote Only</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>

          <select
            value={employment}
            onChange={e => setEmployment(e.target.value)}
            className="filter-select"
            aria-label="Employment type"
          >
            <option value="">Any Employment Type</option>
            <option value="internship">Internship</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
          </select>

          <select
            value={experience}
            onChange={e => setExperience(e.target.value)}
            className="filter-select"
            aria-label="Experience level"
          >
            <option value="">Any Experience</option>
            <option value="internship">Internship / Student</option>
            <option value="entry">Entry Level / Graduate (0-2y)</option>
            <option value="mid">Mid-level (3-5y)</option>
            <option value="senior">Senior (5+ y)</option>
          </select>

          <select
            value={postedWithinDays}
            onChange={e => setPostedWithinDays(e.target.value)}
            className="filter-select"
            aria-label="Posting date recency"
          >
            <option value="">Any Posting Date</option>
            <option value="7">Past 7 days</option>
            <option value="30">Past 30 days</option>
            <option value="90">Past 90 days</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-subtle btn-sm text-red-600 hover:text-red-700"
              onClick={resetFilters}
            >
              <IconX size={14} className="mr-1" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="results-status-row">
        <span className="results-count">
          Showing <strong>{sortedJobs.length}</strong> {pagination?.total ? `of ${pagination.total}` : ''} opportunities
        </span>
        <div className="results-meta-pill">
          <IconShieldCheck size={14} className="text-emerald-600 mr-1" />
          <span>Conservative trust checks applied</span>
        </div>
      </div>

      {/* Job Cards Container */}
      <div className={`jobs-container ${viewMode === 'grid' ? 'jobs-grid-layout' : 'jobs-list-layout'}`}>
        {sortedJobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            isSaved={saved.includes(job.id)}
            isPlanned={applications.some(a => a.jobId === job.id && a.status === 'Planned')}
            onSave={onSave}
            onPlan={onPlan}
            onSelect={onSelectJob}
            onTrust={onTrust}
          />
        ))}

        {!sortedJobs.length && (
          <div className="empty-state-panel">
            <IconSearch size={36} className="text-slate-400 mb-3" />
            <h3 className="empty-title">No opportunities match your search</h3>
            <p className="empty-desc">
              Try broadening your keyword, removing location constraints, or clearing filters.
            </p>
            {hasActiveFilters && (
              <button type="button" className="btn btn-primary btn-sm mt-3" onClick={resetFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {pagination && pagination.pages > 1 && (
        <div className="pagination-bar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous Page
          </button>
          <span className="pagination-page-indicator">
            Page {page} of {pagination.pages}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage(page + 1)}
          >
            Next Page
          </button>
        </div>
      )}
    </div>
  );
}

