import React, { useEffect, useMemo, useState } from 'react';
import JobCard from '../components/JobCard';
import { buildExternalJobSearches } from '../data/externalJobSearches';
import { getTargetCompanies } from '../data/targetCompanies';
import {
  IconSearch,
  IconMapPin,
  IconBriefcase,
  IconKanban,
  IconTable,
  IconX,
  IconShieldCheck,
  IconExternalLink
} from '../components/Icons';

const EMPTY_ROLES = [];

export default function DiscoverJobs({
  jobs = [],
  recommendedOnly = true,
  recommendationInfo = null,
  profile = null,
  preferredRoles = EMPTY_ROLES,
  sortBy = 'match',
  onSortChange,
  onRecommendationModeChange,
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
  onApply,
  onSelectJob,
  onTrust,
  onAskAI
}) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [targetRole, setTargetRole] = useState(preferredRoles[0] || '');
  const roleOptions = useMemo(() => {
    const roles = [...preferredRoles, 'Software Engineer', 'Data Engineer', 'AI / Machine Learning Engineer', 'Frontend Developer', 'Backend Developer', 'Cloud / DevOps Engineer', 'Mobile Developer'];
    return [...new Set(roles.map(role => String(role || '').trim()).filter(Boolean))];
  }, [preferredRoles]);
  const targetCompanies = useMemo(() => getTargetCompanies(targetRole), [targetRole]);
  const externalSearchSkills = (profile?.existingSkills || [])
    .filter(skill => typeof skill === 'string' || ['verified', 'self-declared'].includes(skill?.confidence))
    .map(skill => typeof skill === 'string' ? skill : skill.name)
    .filter(Boolean);
  const externalJobSearches = useMemo(() => buildExternalJobSearches({
    role: targetRole,
    skills: externalSearchSkills,
    location: location || profile?.preferredLocations?.[0] || profile?.location,
    country: country || profile?.workAuthorizationCountries?.[0] || profile?.location
  }), [targetRole, externalSearchSkills.join('|'), location, country, profile?.preferredLocations, profile?.location, profile?.workAuthorizationCountries]);

  useEffect(() => {
    if (preferredRoles.length) setTargetRole(preferredRoles[0]);
  }, [preferredRoles]);

  // Sort jobs locally if desired
  const sortedJobs = [...jobs].sort((a, b) => {
    if (sortBy === 'priority') {
      const aPriority = a.priority?.score;
      const bPriority = b.priority?.score;
      if (!Number.isFinite(aPriority)) return Number.isFinite(bPriority) ? 1 : 0;
      if (!Number.isFinite(bPriority)) return -1;
      return bPriority - aPriority || (Number.isFinite(b.skillMatch) ? b.skillMatch : -1) - (Number.isFinite(a.skillMatch) ? a.skillMatch : -1);
    }
    if (sortBy === 'match') {
      if (!Number.isFinite(a.skillMatch)) return Number.isFinite(b.skillMatch) ? 1 : 0;
      if (!Number.isFinite(b.skillMatch)) return -1;
      return b.skillMatch - a.skillMatch;
    }
    if (sortBy === 'effort') {
      return (Number.isFinite(a.estimatedMinutes) ? a.estimatedMinutes : Number.POSITIVE_INFINITY)
        - (Number.isFinite(b.estimatedMinutes) ? b.estimatedMinutes : Number.POSITIVE_INFINITY);
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
            Search listings from configured provider feeds. India is prioritized; source status, freshness, and match uncertainty remain visible. Demonstration records are not live listings.
          </p>
        </div>

        {/* View Switcher & Sort */}
        <div className="filter-controls-right">
          <button
            type="button"
            className={`btn btn-sm ${recommendedOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onRecommendationModeChange?.(!recommendedOnly)}
            aria-pressed={recommendedOnly}
          >
            {recommendedOnly ? 'Explore more jobs' : 'Show recommendations'}
          </button>
          <div className="sort-dropdown-wrap">
            <label htmlFor="sort-select" className="text-xs text-slate-500 mr-2">Sort by:</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={e => onSortChange?.(e.target.value)}
              className="form-select-sm"
            >
              <option value="priority">Highest Profile Priority</option>
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

      <section className="target-companies-panel" aria-labelledby="target-companies-title">
        <div className="target-companies-heading">
          <div>
            <h2 id="target-companies-title">Explore official company career sites</h2>
            <p>Browse companies that commonly hire for your target role. These links open official career pages; openings are not verified by CareerPilot.</p>
          </div>
          <label className="target-role-select">
            <span>Target role</span>
            <select
              className="form-select-sm"
              value={targetRole}
              onChange={event => setTargetRole(event.target.value)}
              aria-label="Target role for company suggestions"
            >
              {!targetRole && <option value="">Choose a role</option>}
              {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>
        <div className="target-company-list">
          {targetCompanies.map(company => (
            <a
              className="target-company-link"
              key={company.name}
              href={company.careersUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{company.name}</span>
              <IconExternalLink size={14} />
            </a>
          ))}
        </div>
        <p className="target-companies-footnote">Suggestions are role-category based, not live vacancy or hiring-status checks.</p>
      </section>

      <section className="external-job-search-panel" aria-labelledby="external-job-search-title">
        <div className="target-companies-heading">
          <div>
            <h2 id="external-job-search-title">Search and apply on job platforms</h2>
            <p>Open external results personalized with your target role, profile skills, and location. Review each listing and apply on that platform.</p>
          </div>
        </div>
        <div className="external-search-context">
          <span><strong>Role:</strong> {targetRole || 'Choose a target role above'}</span>
          {profile?.existingSkills?.length > 0 && (
            <span><strong>Skills:</strong> {externalSearchSkills.slice(0, 3).join(', ') || 'Add skills in Career DNA'}
            </span>
          )}
          <span><strong>Location:</strong> {location || profile?.preferredLocations?.[0] || profile?.location || 'Any location'}</span>
        </div>
        <div className="external-job-search-links">
          {externalJobSearches.map(platform => (
            <a
              className="external-job-search-link"
              href={platform.url}
              key={platform.id}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Search ${platform.name} jobs in a new tab`}
            >
              <span>Search {platform.name}</span>
              <IconExternalLink size={14} />
            </a>
          ))}
        </div>
        <p className="target-companies-footnote">External listings are not imported, verified, or ranked by CareerPilot. Applications are completed on the job platform.</p>
      </section>

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
        <div className="results-meta-pill" title="Skill overlap is a comparison with saved profile skills, not a prediction of employer decisions.">
          {recommendedOnly ? (
            <span>{recommendationInfo?.message || 'Recommended from your saved skills and role preferences; match percentages are not hiring probabilities.'}</span>
          ) : (
            <>
              <IconShieldCheck size={14} className="text-emerald-600 mr-1" />
              <span>Conservative trust checks applied</span>
            </>
          )}
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
            onApply={onApply}
            onSelect={onSelectJob}
            onTrust={onTrust}
            onAskAI={onAskAI}
          />
        ))}

        {!sortedJobs.length && (
          <div className="empty-state-panel">
            <IconSearch size={36} className="text-slate-400 mb-3" />
            <h3 className="empty-title">
              {recommendedOnly && recommendationInfo?.status === 'needs-profile'
                ? 'Finish your profile to get recommendations'
                : recommendedOnly
                  ? 'No matching recommendations found'
                  : 'No opportunities match your search'}
            </h3>
            <p className="empty-desc">
              {recommendedOnly
                ? recommendationInfo?.message || 'Try Explore More Jobs to browse all listings, or broaden your saved role preferences.'
                : 'Try broadening your keyword, removing location constraints, or clearing filters.'}
            </p>
            {recommendedOnly && recommendationInfo?.status === 'needs-profile' && (
              <a className="btn btn-primary btn-sm mt-3" href="#career-dna">Review Career DNA</a>
            )}
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
