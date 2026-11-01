import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconTarget, IconSparkles, IconBriefcase, IconArrowRight } from '../components/Icons';
import { api } from '../services/api';
import { extractMentionedSkills, filterSavedJobsForSkillGap } from '../data/skillGapSearch';

const skillAliasGroups = [
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['nodejs', 'node.js', 'node js'],
  ['react', 'react.js', 'reactjs'],
  ['nextjs', 'next.js'],
  ['vuejs', 'vue.js', 'vue'],
  ['postgresql', 'postgres'],
  ['mongodb', 'mongo db'],
  ['kubernetes', 'k8s'],
  ['aws', 'amazon web services'],
  ['restapis', 'rest api', 'rest apis', 'restful api', 'restful apis'],
  ['cicd', 'ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment']
];

const skillAliases = new Map(
  skillAliasGroups.flatMap(([canonical, ...aliases]) =>
    [canonical, ...aliases].map(alias => [normalizeSkill(alias), normalizeSkill(canonical)]))
);

function normalizeSkill(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, '');
}

function canonicalSkill(value) {
  const normalized = normalizeSkill(value);
  return skillAliases.get(normalized) || normalized;
}

function getRequirements(job) {
  const required = Array.isArray(job.requiredSkills) ? job.requiredSkills : [];
  const preferred = Array.isArray(job.preferredSkills) ? job.preferredSkills : [];
  const listed = Array.isArray(job.skills) ? job.skills : [];
  const fallback = required.length || preferred.length ? [] : listed.length ? listed : extractMentionedSkills(job);
  const unique = new Map();
  for (const [skill, importance] of [
    ...required.map(name => [name, 'required']),
    ...preferred.map(name => [name, 'preferred']),
    ...fallback.map(name => [name, listed.length ? 'listed' : 'mentioned'])
  ]) {
    const name = String(skill || '').trim();
    const key = canonicalSkill(name);
    if (key && !unique.has(key)) unique.set(key, { name, key, importance });
    else if (key && importance === 'required') unique.get(key).importance = 'required';
  }
  return [...unique.values()];
}

function hasStructuredRequirements(job) {
  return [job.requiredSkills, job.preferredSkills, job.skills]
    .some(skills => Array.isArray(skills) && skills.length > 0);
}

function getProfileEvidence(profile) {
  const evidence = new Map();
  for (const item of profile?.existingSkills || []) {
    const name = typeof item === 'string' ? item : item?.name;
    const confidence = typeof item === 'string' ? 'self-declared' : item?.confidence;
    const key = canonicalSkill(name);
    if (!key || !['verified', 'self-declared', 'learning'].includes(confidence)) continue;
    const rank = confidence === 'verified' ? 3 : confidence === 'self-declared' ? 2 : 1;
    if (!evidence.has(key) || evidence.get(key).rank < rank) {
      evidence.set(key, { name: String(name).trim(), confidence, rank });
    }
  }
  for (const goal of profile?.learningGoals || []) {
    const name = String(goal || '').trim();
    const key = canonicalSkill(name);
    if (key && !evidence.has(key)) evidence.set(key, { name, confidence: 'learning', rank: 1 });
  }
  return evidence;
}

function getSkillStatus(skillKey, evidence) {
  return evidence.get(skillKey)?.confidence || 'not-confirmed';
}

function evidenceWeight(status) {
  if (status === 'verified') return 1;
  if (status === 'self-declared') return 0.7;
  if (status === 'learning') return 0.25;
  return 0;
}

function getLearningAction(skillName) {
  const skill = skillName.toLowerCase();
  if (skill.includes('python')) return 'Build a small Python service, document how to run it, and add tests that demonstrate the skill.';
  if (skill.includes('docker') || skill.includes('linux')) return 'Containerize a small app and document the build, run, and troubleshooting steps.';
  if (skill.includes('typescript')) return 'Add strict TypeScript types to a small feature and demonstrate how the types prevent invalid states.';
  if (skill.includes('rest') || skill.includes('api')) return 'Build a small API integration with input validation, error handling, and a short usage guide.';
  if (skill.includes('flutter') || skill.includes('dart')) return 'Build a small mobile feature and document its state, persistence, and test coverage.';
  return `Build a focused project that demonstrates ${skillName}, with a README and a verifiable example.`;
}

function formatRoleName(job) {
  return String(job.title || 'Untitled role').trim();
}

export default function SkillGaps({ profile, saved = [], savedJobs = [], aiStatus, onSearchJobs, onSelectJob, onPrepareJob }) {
  const [sample, setSample] = useState('loaded');
  const profileTargetRole = String(profile?.preferredRoles?.find(role => typeof role === 'string' && role.trim()) || profile?.title || '').trim();
  const [roleInput, setRoleInput] = useState(profileTargetRole);
  const [locationInput, setLocationInput] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState({ role: '', location: '', skill: '' });
  const [searchResults, setSearchResults] = useState(null);
  const [searchTotal, setSearchTotal] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [aiConsent, setAIConsent] = useState(false);
  const [aiAnalysis, setAIAnalysis] = useState(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState('');
  const searchRequestId = useRef(0);
  const roleWasEdited = useRef(false);
  const evidence = useMemo(() => getProfileEvidence(profile), [profile]);

  useEffect(() => {
    if (profileTargetRole && !roleWasEdited.current) setRoleInput(profileTargetRole);
  }, [profileTargetRole]);

  const runSearch = useCallback(async next => {
    const requestId = ++searchRequestId.current;
    setSearching(true);
    setSearchError('');
    setAIAnalysis(null);
    setAIError('');
    try {
      if (sample === 'saved') {
        const items = filterSavedJobsForSkillGap(savedJobs, next);
        if (requestId !== searchRequestId.current) return;
        setSearchResults(items);
        setSearchTotal(items.length);
      } else if (onSearchJobs) {
        const result = await onSearchJobs(next);
        if (requestId !== searchRequestId.current) return;
        const items = Array.isArray(result?.items) ? result.items : [];
        setSearchResults(items);
        setSearchTotal(Number.isInteger(result?.pagination?.total) ? result.pagination.total : items.length);
      } else {
        throw new Error('Job search is unavailable. Please try again later.');
      }
      if (requestId === searchRequestId.current) setAppliedSearch(next);
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearchResults([]);
        setSearchTotal(0);
        setSearchError(error.message || 'Unable to search matching job listings.');
      }
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  }, [sample, onSearchJobs, savedJobs]);

  useEffect(() => {
    const next = {
      role: roleInput.trim(),
      location: locationInput.trim(),
      skill: skillInput.trim()
    };
    if (!next.role && !next.location && !next.skill) return undefined;
    const timer = window.setTimeout(() => {
      runSearch(next);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      searchRequestId.current += 1;
    };
  }, [roleInput, locationInput, skillInput, runSearch]);

  const relevantJobs = useMemo(() => {
    const unique = new Map();
    const sourceJobs = searchResults || (sample === 'saved' ? savedJobs : []);
    sourceJobs.forEach((job, index) => {
      const id = job.id ?? `${job.title || 'job'}-${job.company || 'company'}-${index}`;
      unique.set(id, job);
    });
    return [...unique.values()];
  }, [savedJobs, sample, searchResults]);

  const analysisJobs = relevantJobs;

  const skillSignals = useMemo(() => {
    const signals = new Map();
    for (const job of analysisJobs) {
      for (const requirement of getRequirements(job)) {
        const signal = signals.get(requirement.key) || {
          ...requirement,
          jobs: new Map(),
          requiredCount: 0,
          preferredCount: 0,
          listedCount: 0,
          mentionedCount: 0
        };
        signal.jobs.set(job.id || `${job.title}-${job.company}`, job);
        if (requirement.importance === 'required') signal.requiredCount += 1;
        else if (requirement.importance === 'preferred') signal.preferredCount += 1;
        else if (requirement.importance === 'mentioned') signal.mentionedCount += 1;
        else signal.listedCount += 1;
        signals.set(requirement.key, signal);
      }
    }
    const query = normalizeSkill(appliedSearch.skill);
    return [...signals.values()]
      .map(signal => ({ ...signal, jobs: [...signal.jobs.values()], count: signal.jobs.size }))
      .filter(signal => !query || normalizeSkill(signal.name).includes(query))
      .sort((a, b) => b.requiredCount - a.requiredCount || b.count - a.count || a.name.localeCompare(b.name));
  }, [analysisJobs, appliedSearch.skill]);

  const structuredJobCount = analysisJobs.filter(hasStructuredRequirements).length;
  const descriptionSkillJobCount = analysisJobs.filter(job =>
    !hasStructuredRequirements(job) && extractMentionedSkills(job).length > 0
  ).length;
  const structuredCoverage = analysisJobs.length ? Math.round((structuredJobCount / analysisJobs.length) * 100) : 0;

  const readiness = useMemo(() => {
    let earned = 0;
    let possible = 0;
    let assessedSkills = 0;
    for (const job of analysisJobs) {
      for (const requirement of getRequirements(job)) {
        const weight = requirement.importance === 'required' ? 2 : 1;
        const status = getSkillStatus(requirement.key, evidence);
        possible += weight;
        earned += weight * evidenceWeight(status);
        if (status !== 'not-confirmed') assessedSkills += 1;
      }
    }
    return {
      score: possible ? Math.round((earned / possible) * 100) : null,
      assessedSkills,
      requirementCount: analysisJobs.reduce((total, job) => total + getRequirements(job).length, 0)
    };
  }, [analysisJobs, evidence]);

  const roleHeatmap = useMemo(() => {
    const roles = new Map();
    for (const job of relevantJobs) {
      const role = formatRoleName(job);
      if (!roles.has(role)) roles.set(role, { name: role, jobs: new Map(), skills: new Map() });
      const row = roles.get(role);
      row.jobs.set(job.id || `${job.title}-${job.company}`, job);
      for (const requirement of getRequirements(job)) {
        const skill = row.skills.get(requirement.key) || { ...requirement, count: 0 };
        skill.count += 1;
        if (requirement.importance === 'required') skill.importance = 'required';
        row.skills.set(requirement.key, skill);
      }
    }
    return [...roles.values()]
      .map(role => ({ ...role, jobs: [...role.jobs.values()] }))
      .sort((a, b) => b.jobs.length - a.jobs.length)
      .slice(0, 5);
  }, [relevantJobs]);

  const heatmapSkills = useMemo(() => {
    const counts = new Map();
    for (const role of roleHeatmap) {
      for (const [key, skill] of role.skills) {
        const count = counts.get(key) || { key, name: skill.name, count: 0 };
        count.count += skill.count;
        counts.set(key, count);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [roleHeatmap]);

  const collectionDates = analysisJobs
    .map(job => new Date(job.lastDiscoveredAt || job.postedAt))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  const unconfirmedCount = skillSignals.filter(skill => getSkillStatus(skill.key, evidence) === 'not-confirmed').length;
  const learningCount = skillSignals.filter(skill => getSkillStatus(skill.key, evidence) === 'learning').length;
  const prioritizedSkills = [...skillSignals].sort((left, right) => {
    const rank = status => status === 'not-confirmed' ? 0
      : status === 'learning' ? 1
        : status === 'self-declared' ? 2 : 3;
    return rank(getSkillStatus(left.key, evidence)) - rank(getSkillStatus(right.key, evidence))
      || right.requiredCount - left.requiredCount
      || right.count - left.count;
  });
  const searchContextRole = appliedSearch.role || appliedSearch.skill || appliedSearch.location
    || (sample === 'saved' ? 'Saved opportunities' : 'Loaded opportunities');
  const analysisSampleName = sample === 'saved' ? 'saved shortlist' : 'loaded opportunities';

  const handleSearch = event => {
    event.preventDefault();
    const next = {
      role: roleInput.trim(),
      location: locationInput.trim(),
      skill: skillInput.trim()
    };
    if (!next.role && !next.location && !next.skill) {
      setSearchError('Enter a target role, location, or skill before searching.');
      return;
    }
    runSearch(next);
  };

  const handleAIAnalysis = async () => {
    if (!aiConsent) {
      setAIError('Confirm consent before sending role and skill data to the AI provider.');
      return;
    }
    setAILoading(true);
    setAIError('');
    try {
      const result = await api('/ai/skill-gap-analysis', {
        method: 'POST',
        skipDemo: true,
        body: JSON.stringify({
          consentAccepted: true,
          role: searchContextRole,
          jobCount: analysisJobs.length,
          skills: skillSignals.slice(0, 30).map(skill => ({
            name: skill.name,
            status: getSkillStatus(skill.key, evidence),
            listingCount: skill.count,
            requiredCount: skill.requiredCount,
            preferredCount: skill.preferredCount,
            descriptionMentionCount: skill.mentionedCount
          }))
        })
      });
      setAIAnalysis(result);
    } catch (error) {
      setAIError(error.message || 'AI skill analysis could not be completed.');
    } finally {
      setAILoading(false);
    }
  };

  return (
    <div className="skillgaps-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Skill Gap Analysis</h1>
          <p className="page-subtitle">
            Compare your Career DNA skill evidence with listings for your preferred role or a role you search.
          </p>
        </div>
      </div>

      <form className="skill-analysis-controls card" aria-label="Analysis filters" onSubmit={handleSearch}>
        <label>
          <span>Job sample</span>
          <select className="form-input" value={sample} onChange={event => {
            setSample(event.target.value);
            setSearchTotal(null);
            setAIAnalysis(null);
          }}>
            <option value="loaded">Loaded opportunities</option>
            <option value="saved">Saved opportunities ({saved.length})</option>
          </select>
        </label>
        <label>
          <span>Target role</span>
          <input
            className="form-input"
            list="skill-analysis-role-suggestions"
            value={roleInput}
            onChange={event => {
              roleWasEdited.current = true;
              setSearchTotal(null);
              setRoleInput(event.target.value);
            }}
            placeholder="e.g. Data Engineer AI"
          />
          <datalist id="skill-analysis-role-suggestions">
            {[...(profile?.preferredRoles || []), profile?.title]
              .filter((role, index, list) => typeof role === 'string' && role.trim() && list.indexOf(role) === index)
              .map(role => <option key={role} value={role} />)}
          </datalist>
        </label>
        <label>
          <span>Location</span>
          <input className="form-input" value={locationInput} onChange={event => { setSearchTotal(null); setLocationInput(event.target.value); }} placeholder="Any location" />
        </label>
        <label>
          <span>Find a skill</span>
          <input className="form-input" value={skillInput} onChange={event => { setSearchTotal(null); setSkillInput(event.target.value); }} placeholder="e.g. Python" />
        </label>
        <button className="btn btn-primary skill-search-button" type="submit" disabled={searching}>
          <IconArrowRight /> {searching ? 'Searching…' : 'Go'}
        </button>
      </form>
      {searchError && <div className="notice notice-error skill-analysis-notice" role="alert">{searchError}</div>}
      {searching && (
        <div className="skill-search-feedback" role="status">
          Searching {sample === 'saved' ? 'saved opportunities' : 'indexed job listings'} for {[roleInput.trim(), locationInput.trim(), skillInput.trim()].filter(Boolean).join(' · ')}…
        </div>
      )}
      {!searching && searchTotal !== null && !searchError && (
        <div className={`skill-search-feedback ${searchTotal ? 'is-results' : 'is-empty'}`} role="status">
          {searchTotal
            ? `Found ${searchTotal} matching ${sample === 'saved' ? 'saved opportunit' : 'listing'}${searchTotal === 1 ? (sample === 'saved' ? 'y' : '') : (sample === 'saved' ? 'ies' : 's')}. Analysis below is based on these results.`
            : sample === 'saved'
              ? 'No saved opportunities match these filters. Try a broader role, location, or skill.'
              : `No indexed listings matched “${[roleInput.trim(), locationInput.trim(), skillInput.trim()].filter(Boolean).join(' · ')}”. Try broader filters or load more listings.`}
        </div>
      )}

      {sample === 'saved' && (
        <section className="card skill-saved-shortlist" aria-labelledby="skill-saved-shortlist-title">
          <div className="skill-section-heading">
            <span className="skill-heading-icon"><IconBriefcase /></span>
            <div>
              <h2 id="skill-saved-shortlist-title">Your saved-job shortlist</h2>
              <p>Saved jobs are your review queue. Open one to inspect it, or continue to evidence preparation before applying on the employer site.</p>
            </div>
          </div>
          {relevantJobs.length ? (
            <div className="skill-saved-job-list">
              {relevantJobs.map(job => (
                <article className="skill-saved-job" key={job.id || `${job.title}-${job.company}`}>
                  <div className="skill-saved-job-info">
                    <strong>{job.title || 'Untitled role'}</strong>
                    <span>{[job.company, job.location].filter(Boolean).join(' · ') || 'Listing details unavailable'}</span>
                    <small>{getRequirements(job).length
                      ? `${getRequirements(job).length} skill signals available for comparison`
                      : 'No recognizable skill labels found in the listing yet'}</small>
                  </div>
                  <div className="skill-saved-job-actions">
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => onSelectJob?.(job)}>
                      Review listing
                    </button>
                    <button className="btn btn-primary btn-sm" type="button" onClick={() => onPrepareJob?.(job)}>
                      Prepare evidence
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="skill-visual-empty">No saved jobs match the current filters. Clear the filters or save opportunities from Discover Jobs to build your shortlist.</p>
          )}
        </section>
      )}

      <div className="skill-analysis-meta">
        <span><strong>{analysisJobs.length}</strong> unique listings in this analysis</span>
        <span><strong>{structuredCoverage}%</strong> have structured skill requirements ({structuredJobCount}/{analysisJobs.length})</span>
        {descriptionSkillJobCount > 0 && (
          <span><strong>{descriptionSkillJobCount}</strong> more listing{descriptionSkillJobCount === 1 ? '' : 's'} have skills mentioned in descriptions</span>
        )}
        {Number.isInteger(searchTotal) && searchTotal > analysisJobs.length && (
          <span>Showing {analysisJobs.length} of {searchTotal} matching listings</span>
        )}
        {collectionDates.length > 0 && (
          <span>Observed {collectionDates[0].toLocaleDateString()} – {collectionDates.at(-1).toLocaleDateString()}</span>
        )}
      </div>

      <section className="skill-analysis-overview">
        <article className="card readiness-card">
          <div className="skill-section-heading">
            <span className="skill-heading-icon"><IconTarget /></span>
            <div>
              <h2>Role evidence coverage</h2>
              <p>{analysisSampleName}: {searchContextRole}</p>
            </div>
          </div>
          {readiness.score === null ? (
            <div className="readiness-empty">No recognizable skill signals are available to calculate profile evidence coverage.</div>
          ) : (
            <div className="readiness-result">
              <div
                className="readiness-ring"
                style={{ '--readiness-value': `${readiness.score}%` }}
                role="img"
                aria-label={`${readiness.score}% profile evidence coverage`}
              >
                <span>{readiness.score}<small>%</small></span>
              </div>
              <div className="readiness-copy">
                <strong>{readiness.assessedSkills} of {readiness.requirementCount} skill signals have profile evidence</strong>
                <p>Explicitly required skills count twice as much as preferred or listed skills. Skills inferred from description text are counted as mentions, not requirements. Verified skills receive full credit, self-declared skills partial credit, and learning skills limited credit.</p>
              </div>
            </div>
          )}
          <div className="readiness-legend">
            <span><i className="evidence-dot verified" /> Verified</span>
            <span><i className="evidence-dot declared" /> Self-declared</span>
            <span><i className="evidence-dot learning" /> Learning</span>
            <span><i className="evidence-dot unconfirmed" /> Not confirmed</span>
          </div>
        </article>

        <article className="card skill-demand-card">
          <div className="skill-section-heading">
            <span className="skill-heading-icon"><IconSparkles /></span>
            <div>
              <h2>Most repeated skill signals</h2>
              <p>Frequency in this {analysisSampleName}, not market-wide demand. Description mentions are not necessarily requirements.</p>
            </div>
          </div>
          {skillSignals.length ? (
            <div className="skill-demand-list">
              {skillSignals.slice(0, 6).map(skill => {
                const status = getSkillStatus(skill.key, evidence);
                const percentage = analysisJobs.length ? Math.max(4, Math.round(skill.count / analysisJobs.length * 100)) : 0;
                return (
                  <div className="skill-demand-row" key={skill.key}>
                    <div className="skill-demand-label">
                      <strong>{skill.name}</strong>
                      <span>
                        {skill.count}/{analysisJobs.length} listings
                        {skill.mentionedCount ? ` · mentioned in ${skill.mentionedCount} description${skill.mentionedCount === 1 ? '' : 's'}` : ''}
                        {' · '}{statusLabel(status)}
                      </span>
                    </div>
                    <div className="skill-demand-track" aria-label={`${skill.name} listed in ${skill.count} of ${analysisJobs.length} jobs`}>
                      <span className={`skill-demand-fill status-${status}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="skill-visual-empty">No recognizable skill signals match these filters. Add a listing with skill tags or a detailed description.</p>}
        </article>
      </section>

      <section className="card skill-heatmap-card">
        <div className="skill-section-heading">
          <span className="skill-heading-icon"><IconBriefcase /></span>
          <div>
            <h2>Role × skill evidence map</h2>
            <p>Top roles in the selected sample, compared with your current profile evidence.</p>
          </div>
        </div>
        {roleHeatmap.length && heatmapSkills.length ? (
          <div className="skill-heatmap-scroll">
            <table className="skill-heatmap">
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  {heatmapSkills.map(skill => <th scope="col" key={skill.key}>{skill.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {roleHeatmap.map(role => (
                  <tr key={role.name}>
                    <th scope="row">
                      <span>{role.name}</span>
                      <small>{role.jobs.length} listing{role.jobs.length === 1 ? '' : 's'}</small>
                    </th>
                    {heatmapSkills.map(skill => {
                      const requirement = role.skills.get(skill.key);
                      const status = requirement ? getSkillStatus(skill.key, evidence) : 'not-required';
                      return (
                        <td key={skill.key}>
                          <span
                            className={`heatmap-cell status-${status}`}
                            title={requirement ? `${skill.name}: ${statusLabel(status)}; ${requirement.count} listing(s)` : `${skill.name}: not listed for this role`}
                            aria-label={requirement ? `${skill.name}: ${statusLabel(status)}` : `${skill.name}: not required`}
                          >
                            {requirement ? status === 'verified' ? '✓' : status === 'self-declared' ? '•' : status === 'learning' ? '↗' : '○' : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="skill-visual-empty">No skill signals are available for the selected listings yet. Listing descriptions are checked for common technical skills when structured skill data is missing.</p>}
        <div className="heatmap-legend">
          <span><i className="evidence-dot verified" /> Verified</span>
          <span><i className="evidence-dot declared" /> Self-declared</span>
          <span><i className="evidence-dot learning" /> Learning</span>
          <span><i className="evidence-dot unconfirmed" /> Requirement not confirmed in profile</span>
          <span>— Not listed for that role</span>
        </div>
      </section>

      <section className="card skill-priority-card">
        <div className="skill-section-heading">
          <span className="skill-heading-icon"><IconTarget /></span>
          <div>
            <h2>Skills to verify or develop</h2>
            <p>Prioritized by repeated appearance and explicit requirement status. Description mentions are not necessarily requirements. Confirm your experience before treating an unlisted skill as a gap.</p>
          </div>
        </div>
        <div className="skill-priority-list">
          {prioritizedSkills.slice(0, 12).map((skill, index) => {
            const status = getSkillStatus(skill.key, evidence);
            return (
              <article className="skill-priority-row" key={skill.key}>
                <span className="skill-priority-number">{index + 1}</span>
                <div className="skill-priority-main">
                  <div className="skill-priority-title">
                    <strong>{skill.name}</strong>
                    <span className={`skill-status-pill status-${status}`}>{statusLabel(status)}</span>
                  </div>
                  <p>                  {skill.requiredCount} required · {skill.preferredCount} preferred
                  {skill.listedCount ? ` · ${skill.listedCount} listed` : ''}
                  {skill.mentionedCount ? ` · mentioned in ${skill.mentionedCount} description${skill.mentionedCount === 1 ? '' : 's'} (not necessarily required)` : ''}
                  {` · appears in ${skill.count} job${skill.count === 1 ? '' : 's'}`}</p>
                  <div className="skill-project-suggestion">
                    <IconSparkles />
                    <span>{status === 'not-confirmed' ? 'If you have this skill, add evidence to Career DNA. If not, try: ' : status === 'learning' ? 'Turn your learning into visible evidence: ' : 'Strengthen your proof with a concrete example: '}{getLearningAction(skill.name)}</span>
                  </div>
                  {skill.jobs.length > 0 && (
                    <div className="skill-related-jobs">
                      {skill.jobs.slice(0, 3).map((job, jobIndex) => (
                        <button className="skill-related-job" type="button" key={job.id || `${job.title}-${jobIndex}`} onClick={() => onSelectJob?.(job)}>
                          {job.title || 'View listing'} <IconArrowRight />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {!skillSignals.length && (
            <div className="skill-visual-empty">
              {analysisJobs.length ? 'No recognizable skill signals found in the selected listings.' : sample === 'saved' && !saved.length ? 'Save jobs from Discover Jobs to create a shortlist for comparison and evidence preparation.' : 'No matching job listings are loaded. Adjust the filters or load opportunities to begin.'}
            </div>
          )}
        </div>
        {skillSignals.length > 0 && (
          <div className="skill-priority-summary">
            {unconfirmedCount} skill{unconfirmedCount === 1 ? '' : 's'} not confirmed in your profile · {learningCount} currently marked as learning.
          </div>
        )}
      </section>

      <section className="card skill-ai-card">
        <div className="skill-section-heading">
          <span className="skill-heading-icon"><IconSparkles /></span>
          <div>
            <h2>AI learning recommendations</h2>
            <p>Get project ideas for the highest-priority learning and unconfirmed skills in this {analysisSampleName}.</p>
          </div>
        </div>
        <label className="skill-ai-consent">
          <input type="checkbox" checked={aiConsent} onChange={event => setAIConsent(event.target.checked)} />
          <span>I agree to send the target role, extracted or listed skill labels and counts, and profile skill evidence statuses to the configured AI provider. Description mentions may not be job requirements. My resume text and contact details are not included.</span>
        </label>
        <div className="skill-ai-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!analysisJobs.length || !skillSignals.length || aiLoading || aiStatus?.configured === false}
            onClick={handleAIAnalysis}
          >
            <IconSparkles /> {aiLoading ? 'Analyzing…' : aiStatus?.configured === false ? 'AI not configured' : 'Analyze with AI'}
          </button>
          {!aiStatus?.configured && (
            <span className="skill-ai-status">
              {aiStatus?.message || 'AI provider status is not available yet. Try analysis to check the server configuration.'}
            </span>
          )}
          {analysisJobs.length > 0 && !skillSignals.length && (
            <span className="skill-ai-status">No recognizable skill signals are available in these listings. Add skill tags or a fuller job description to enable AI guidance.</span>
          )}
        </div>
        {aiError && <div className="notice notice-error mt-3" role="alert">{aiError}</div>}
        {aiAnalysis?.recommendations?.length > 0 && (
          <div className="skill-ai-recommendations">
            {aiAnalysis.recommendations.map((recommendation, index) => (
              <article className="skill-ai-recommendation" key={`${recommendation.skill}-${index}`}>
                <span className="skill-status-pill status-learning">{recommendation.skill}</span>
                <p><strong>Try:</strong> {recommendation.nextStep}</p>
                <p><strong>Proof to keep:</strong> {recommendation.proof}</p>
              </article>
            ))}
            <p className="skill-ai-footnote">{aiAnalysis.message}</p>
          </div>
        )}
        {aiAnalysis && !aiAnalysis.recommendations?.length && (
          <p className="skill-ai-footnote">{aiAnalysis.message}</p>
        )}
      </section>
    </div>
  );
}

function statusLabel(status) {
  if (status === 'verified') return 'Verified';
  if (status === 'self-declared') return 'Self-declared';
  if (status === 'learning') return 'Learning';
  if (status === 'not-required') return 'Not required';
  return 'Not confirmed';
}
