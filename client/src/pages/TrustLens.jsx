import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconShieldCheck,
  IconAlertCircle,
  IconCheckCircle,
  IconExternalLink
} from '../components/Icons';
import { api } from '../services/api';

export default function TrustLens({
  jobs = [],
  selectedId,
  setSelectedId,
  onReview,
  onReport
}) {
  const [reason, setReason] = useState('');
  const [trustData, setTrustData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState('');

  const job = jobs.find(item => item.id === selectedId) || jobs[0];

  useEffect(() => {
    if (!job) return;
    setLoadError('');
    setReportSuccess('');
    let active = true;
    api(`/trust/${job.id}`)
      .then(data => {
        if (active) setTrustData(data);
      })
      .catch(error => {
        if (active) setLoadError(error.message);
      });
    return () => {
      active = false;
    };
  }, [job?.id]);

  const trust = trustData?.jobId === job?.id ? trustData : job?.trust || {};

  const handleReport = async () => {
    if (!reason.trim()) return;
    setIsReporting(true);
    const success = await onReport(job.id, reason.trim());
    if (success) {
      setReason('');
      setReportSuccess('Listing report recorded in session memory. Flag logged for operator review.');
    }
    setIsReporting(false);
  };

  const getStatusBadge = status => {
    switch (status) {
      case 'active':
        return { label: 'Verified Source Record', kind: 'ok' };
      case 'confirmed-closed':
      case 'closed':
        return { label: 'Confirmed Closed', kind: 'error' };
      case 'possibly-outdated':
      case 'expired':
        return { label: 'Possibly Outdated', kind: 'warn' };
      case 'needs-review':
      default:
        return { label: 'Needs Independent Review', kind: 'warn' };
    }
  };

  const statusBadge = job ? getStatusBadge(trust.status || job.status) : null;

  return (
    <div className="trustlens-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">TrustLens — Company & Listing Verification</h1>
          <p className="page-subtitle">
            Research any company with cited Gemini web results, then compare separate job-board and submitted-site signals. No single result proves legal status or guarantees a job is genuine.
          </p>
        </div>
      </div>

      <CompanySearchPanel />
      {loadError && (
        <p className="trust-search-error" role="alert">
          Could not load the selected listing audit: {loadError}
        </p>
      )}
      {!job ? (
        <div className="card empty-state-panel">
          <IconShieldCheck size={36} className="text-slate-400 mb-2" />
          <h3>No opportunities selected for listing audit</h3>
          <p>Company search is available above even when there are no indexed jobs.</p>
        </div>
      ) : (
      <div className="trustlens-grid">
        {/* Left Column: Job Selector & Primary Signals */}
        <div className="trustlens-main-card">
          {/* Job Select Dropdown */}
          <div className="mb-4">
            <label className="form-label">
              Select Opportunity for Verification Audit
              <select
                value={job.id}
                onChange={e => setSelectedId(e.target.value)}
                className="form-select mt-1"
              >
                {jobs.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.title} — {item.company} ({item.status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Opportunity Header */}
          <div className="opportunity-audit-banner">
            <div>
              <span className="text-xs uppercase font-bold text-blue-600 tracking-wider">
                PRIMARY VERIFICATION AUDIT
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">{job.title}</h2>
              <p className="text-sm text-slate-600">
                {job.company} • {job.location}
              </p>
            </div>
            <div className="mt-2 sm:mt-0">
              <Badge kind={statusBadge.kind} size="md" dot>
                {statusBadge.label}
              </Badge>
            </div>
          </div>

          {/* Audit Signals Table */}
          <div className="audit-signals-table mt-4">
            <div className="signal-row">
              <span className="signal-key">Source Provider Feed</span>
              <span className="signal-val font-semibold">{trust.source || 'Aggregator feed'}</span>
            </div>
            <div className="signal-row">
              <span className="signal-key">Application Page Link</span>
              <span className="signal-val">
                {trustData?.originalUrl || job.applicationUrl ? (
                  <a
                    href={trustData?.originalUrl || job.applicationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>{trustData?.originalUrl || job.applicationUrl}</span>
                    <IconExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-slate-400 italic">No canonical application URL supplied</span>
                )}
              </span>
            </div>
            <div className="signal-row">
              <span className="signal-key">Last Verified Timestamp</span>
              <span className="signal-val">
                {job.lastVerifiedAt
                  ? `${new Date(job.lastVerifiedAt).toLocaleString()} (${Math.round(
                      (Date.now() - new Date(job.lastVerifiedAt).getTime()) / 3600000
                    )} hours ago)`
                  : 'Not verified by automated crawler'}
              </span>
            </div>
            <div className="signal-row">
              <span className="signal-key">Application Deadline</span>
              <span className="signal-val">{trust.deadline || 'Not published by employer'}</span>
            </div>
            <div className="signal-row">
              <span className="signal-key">Duplicate Check Audit</span>
              <span className="signal-val">{trust.duplicate || 'No duplicates detected'}</span>
            </div>
          </div>

          {/* Operator Principle Box */}
          <div className="principle-info-box mt-4">
            <IconAlertCircle size={17} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong>Verification Principle:</strong> A positive provider response confirms the source published this listing. It is not an ironclad guarantee that the employer has not paused hiring. Always cross-check the company’s direct careers page before submitting personal documents.
            </p>
          </div>

          {/* Candidate Actions: Mark Reviewed & Report */}
          <div className="trust-actions-box mt-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Candidate Audit Actions</h3>
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onReview(job.id)}
              >
                <IconCheckCircle size={15} className="mr-1.5 text-emerald-600" />
                Mark As Candidate-Reviewed
              </button>
            </div>

            {/* Report Form */}
            <div className="report-form mt-4">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Notice an issue? Report this listing for audit:
              </label>
              <textarea
                rows={3}
                placeholder="Describe reason (e.g. Broken application URL, expired role on company site, suspicious payment request, role filled)..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="form-textarea w-full text-sm"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={!reason.trim() || isReporting}
                  onClick={handleReport}
                >
                  {isReporting ? 'Submitting Report...' : 'Submit Listing Audit Report'}
                </button>
                {reportSuccess && (
                  <span className="text-xs text-emerald-700 font-medium">{reportSuccess}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Verification Evidence & Cross-Source Similar Listings */}
        <div className="trustlens-side-card">
          <h3 className="side-card-title">Verification Evidence Trail</h3>
          <p className="text-xs text-slate-500 mb-3">
            Evidence harvested from public ATS APIs, domain matching, and provider feeds.
          </p>

          {/* Flags */}
          <div className="flags-stack mb-4">
            {(trust.flags || []).map((flag, idx) => (
              <div key={idx} className="flag-pill-box">
                <span className="flag-dot" />
                <span className="flag-text">{flag}</span>
              </div>
            ))}
            {(!trust.flags || !trust.flags.length) && (
              <div className="flag-pill-box">
                <span className="flag-dot bg-slate-400" />
                <span className="flag-text">Single source observation. No anomalous flags logged.</span>
              </div>
            )}
          </div>

          {/* Sources breakdown */}
          <h4 className="text-xs font-semibold uppercase text-slate-600 tracking-wider mb-2">
            Ingestion Sources
          </h4>
          <div className="sources-list mb-6">
            {(trust.sources || job.sources || []).map((src, i) => (
              <div key={i} className="source-item-card">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 capitalize">{src.provider}</span>
                  <Badge kind={src.status === 'active' ? 'ok' : 'warn'} size="sm">
                    {src.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Last checked: {src.lastVerifiedAt ? new Date(src.lastVerifiedAt).toLocaleString() : 'Unknown'}
                </div>
                {src.verificationEvidence && (
                  <p className="text-xs text-slate-600 mt-1 italic">
                    "{src.verificationEvidence}"
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Similar Listings Comparison */}
          <h4 className="text-xs font-semibold uppercase text-slate-600 tracking-wider mb-2">
            Cross-Source Duplicate & Similar Listings
          </h4>
          <div className="similar-jobs-list">
            {trust.similarListings?.length ? (
              trust.similarListings.map(item => (
                <div
                  key={item.id}
                  className="similar-job-item"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="font-medium text-slate-800">{item.title}</span>
                  <span className="text-xs text-slate-500">
                    {item.company} • {item.location}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic">
                No duplicate same-company listings detected in the current index.
              </p>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function CompanySearchPanel() {
  const [companyName, setCompanyName] = useState('');
  const [officialSiteUrl, setOfficialSiteUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async event => {
    event.preventDefault();
    setError('');
    setResult(null);
    setIsSearching(true);
    try {
      const data = await api('/trust/company-search', {
        method: 'POST',
        skipDemo: true,
        body: JSON.stringify({ companyName, officialSiteUrl })
      });
      setResult(data);
    } catch (searchError) {
      setError(searchError.message);
    } finally {
      setIsSearching(false);
    }
  };

  const adzunaStatus = result?.adzuna?.status;
  const siteStatus = result?.officialSite?.status;
  const adzunaLabel = {
    listed: 'Listings found',
    'not-found': 'No matching listings',
    unavailable: 'Lookup unavailable'
  }[adzunaStatus] || '';
  const siteLabel = {
    reachable: 'HTTPS site responded',
    responded: 'Host responded',
    'not-provided': 'Not checked',
    'not-checked': 'Not checked',
    unavailable: 'Check unavailable'
  }[siteStatus] || '';

  return (
    <section className="trust-company-search card">
      <div className="trust-company-search-heading">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Search & verify a company</h2>
          <p className="text-sm text-slate-600 mt-1">
            Tavily searches public web sources and Groq analyzes the cited results; Adzuna is a separate job-listing check.
          </p>
        </div>
      </div>
      <form className="trust-company-search-form" onSubmit={handleSearch}>
        <label className="form-label">
          Company name
          <input
            className="form-input mt-1"
            type="text"
            minLength={2}
            maxLength={100}
            required
            value={companyName}
            onChange={event => setCompanyName(event.target.value)}
            placeholder="e.g. Acme Technologies"
          />
        </label>
        <label className="form-label">
          Company website (optional)
          <input
            className="form-input mt-1"
            type="url"
            maxLength={2048}
            value={officialSiteUrl}
            onChange={event => setOfficialSiteUrl(event.target.value)}
            placeholder="https://careers.example.com"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={isSearching}>
          {isSearching ? 'Searching and analyzing...' : 'Search and analyze'}
        </button>
      </form>

      {error && <p className="trust-search-error" role="alert">{error}</p>}

      {result && (
        <div className="trust-company-search-results">
          <section className="trust-company-ai-research" aria-labelledby="trust-company-ai-title">
            <div className="trust-company-ai-heading">
              <div>
                <h3 id="trust-company-ai-title" className="text-sm font-semibold text-slate-800">Public-web research with Groq AI</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {result.research?.provider || 'Tavily + Groq'}
                  {result.research?.model ? ` · ${result.research.model}` : ''}
                  {result.research?.checkedAt ? ` · checked ${new Date(result.research.checkedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <Badge kind={result.research?.status === 'grounded' ? 'ok' : 'warn'} size="sm">
                {result.research?.status === 'grounded'
                  ? 'Sources found'
                  : result.research?.status === 'insufficient-evidence'
                    ? 'Inconclusive'
                    : 'Unavailable'}
              </Badge>
            </div>
            <p className="trust-company-ai-summary">
              {result.research?.summary || result.research?.message || 'Company research did not return a result.'}
            </p>
            {result.research?.findings?.length > 0 && (
              <ul className="trust-company-ai-findings">
                {result.research.findings.map((finding, index) => (
                  <li key={`${finding.topic}-${index}`}>
                    <span className="trust-company-ai-topic">{finding.topic.replaceAll('_', ' ')}</span>
                    <div className="trust-company-ai-finding-detail">
                      <span>{finding.detail}</span>
                      <div className="trust-company-ai-finding-sources">
                        {(finding.sourceIds || []).map(sourceId => {
                          const source = result.research.sources?.find(item => item.id === sourceId);
                          return source ? (
                            <a href={source.url} key={source.id} target="_blank" rel="noopener noreferrer">
                              {source.title} <IconExternalLink size={11} />
                            </a>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <small>{finding.confidence} evidence</small>
                  </li>
                ))}
              </ul>
            )}
            {result.research?.sources?.length > 0 && (
              <div className="trust-company-ai-sources">
                <strong>Tavily Search sources</strong>
                <div>
                  {result.research.sources.map(source => (
                    <a href={source.url} key={source.id || source.url} target="_blank" rel="noopener noreferrer">
                      {source.title} <IconExternalLink size={12} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {result.research?.searchQuery && (
              <details className="trust-company-ai-queries">
                <summary>Search query used</summary>
                <ul><li>{result.research.searchQuery}</li></ul>
              </details>
            )}
            {result.research?.message && result.research.message !== result.research.summary && (
              <p className="trust-company-ai-disclaimer">{result.research.message}</p>
            )}
          </section>

          <div className="trust-company-signal-grid">
            <div className="trust-company-signal">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Adzuna listing presence</h3>
                <Badge kind={adzunaStatus === 'listed' ? 'ok' : 'warn'} size="sm">
                  {adzunaLabel}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                {result.adzuna?.message || (adzunaStatus === 'listed'
                  ? `Exact company-name matches in ${result.adzuna.checkedCountries.join(', ')}.`
                  : `No exact company-name match in ${result.adzuna?.checkedCountries?.join(', ') || 'the configured countries'}.`)}
              </p>
              {result.adzuna?.checkedAt && (
                <p className="text-xs text-slate-500 mt-1">
                  Checked {new Date(result.adzuna.checkedAt).toLocaleString()}
                </p>
              )}
            </div>
            <div className="trust-company-signal">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Submitted company website</h3>
                <Badge kind={siteStatus === 'reachable' ? 'ok' : 'warn'} size="sm">
                  {siteLabel}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mt-2">{result.officialSite?.message}</p>
              {result.officialSite?.siteUrl && (
                <a
                  href={result.officialSite.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="trust-company-site-link"
                >
                  Open submitted site <IconExternalLink size={12} />
                </a>
              )}
              {result.officialSite?.httpStatus && (
                <p className="text-xs text-slate-500 mt-1">HTTP status: {result.officialSite.httpStatus}</p>
              )}
              {result.officialSite?.domainNameSignal && (
                <p className="text-xs text-slate-500 mt-1">
                  Name/domain signal: {result.officialSite.domainNameSignal === 'name-match-candidate'
                    ? 'the domain name resembles the company name'
                    : 'no clear name match; review the domain manually'}
                </p>
              )}
            </div>
          </div>

          {result.adzuna?.listings?.length > 0 && (
            <div className="trust-company-listings">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Matching Adzuna listings ({result.adzuna.listings.length})
              </h3>
              {result.adzuna.listings.map((listing, index) => (
                <div className="trust-company-listing" key={`${listing.id}-${index}`}>
                  <div>
                    <span className="font-medium text-slate-800">{listing.title}</span>
                    <span className="text-xs text-slate-500 block">
                      {listing.company} · {listing.location} · {listing.country}
                    </span>
                  </div>
                  {listing.url && (
                    <a href={listing.url} target="_blank" rel="noreferrer" aria-label="Open Adzuna listing">
                      <IconExternalLink size={15} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="trust-company-disclaimer">
            Adzuna results only show matching listings returned by that board. The submitted-site check tests HTTPS reachability and a name/domain signal. Search results support public-web research, but none of these signals alone confirms legal registration, domain ownership, or job legitimacy.
          </p>
        </div>
      )}
    </section>
  );
}
