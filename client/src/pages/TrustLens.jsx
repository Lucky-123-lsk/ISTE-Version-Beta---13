import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconShieldCheck,
  IconAlertCircle,
  IconCheckCircle,
  IconExternalLink,
  IconBriefcase,
  IconClock
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
    api(`/trust/${job.id}`)
      .then(setTrustData)
      .catch(error => setLoadError(error.message));
  }, [job?.id]);

  if (!job) {
    return (
      <div className="card empty-state-panel">
        <IconShieldCheck size={36} className="text-slate-400 mb-2" />
        <h3>No opportunities selected for TrustLens audit</h3>
      </div>
    );
  }

  const trust = trustData?.jobId === job.id ? trustData : job.trust;

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

  const statusBadge = getStatusBadge(trust.status || job.status);

  return (
    <div className="trustlens-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">TrustLens — Listing Integrity & Audit</h1>
          <p className="page-subtitle">
            Inspect source provenance, last verification timestamps, and uncertainty factors. Listings are never hidden silently, nor labeled fraudulent without direct evidence.
          </p>
        </div>
      </div>

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
    </div>
  );
}

