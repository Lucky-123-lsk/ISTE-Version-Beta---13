import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconCpu,
  IconLock,
  IconShieldCheck,
  IconAlertCircle,
  IconCheckCircle
} from '../components/Icons';
import { api } from '../services/api';

export default function AIStudio({ status, jobs = [] }) {
  const [resumeText, setResumeText] = useState(
    'Built responsive web applications using React, JavaScript, and Tailwind CSS. Integrated REST APIs with Node.js microservices and maintained high performance and test coverage.'
  );
  const [jobId, setJobId] = useState(jobs[0]?.id || '');
  const [jobDescription, setJobDescription] = useState(jobs[0]?.description || '');
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const selectedJob = jobs.find(job => job.id === jobId) || jobs[0];

  useEffect(() => {
    if (!jobId && jobs.length) setJobId(jobs[0].id);
    if (selectedJob) setJobDescription(selectedJob.description);
  }, [jobId, jobs, selectedJob?.id]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setAnalysis(null);
    setWorking(true);
    try {
      const result = await api('/ai/resume-analysis', {
        method: 'POST',
        body: JSON.stringify({ resumeText, jobDescription, consentAccepted: consent })
      });
      setAnalysis(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (!status) {
    return <div className="card">Loading server AI provider configuration...</div>;
  }

  return (
    <div className="aistudio-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">AI Studio — Evidence-Gated Analysis</h1>
          <p className="page-subtitle">
            Configure server-side AI adapters (Gemini, Groq, Ollama) and run deterministic quote verification. Personal data is never transmitted without explicit consent.
          </p>
        </div>
      </div>

      {/* Provider Status Card */}
      <div className="card provider-status-card mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-3">
            <div className="provider-icon-badge">
              <IconCpu size={24} className="text-blue-600" />
            </div>
            <div>
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                SERVER-SIDE ADAPTER
              </span>
              <h2 className="text-lg font-bold text-slate-900 capitalize">
                {status.provider === 'none' ? 'No Provider Active' : status.provider}
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">{status.message}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <Badge kind={status.configured ? 'ok' : 'warn'} size="md">
              {status.configured ? 'Adapter Connected' : 'Configuration Pending'}
            </Badge>
            {status.model && (
              <span className="text-xs font-mono text-slate-500">Model: {status.model}</span>
            )}
          </div>
        </div>

        <div className="security-guarantee-strip mt-4">
          <IconLock size={14} className="text-slate-500 mr-1.5" />
          <span className="text-xs text-slate-600">
            <strong>Security Boundary:</strong> Browser code never sees API keys. Provider credentials are kept strictly on the server in <code>server/.env</code>.
          </span>
        </div>
      </div>

      {/* Interactive Analysis Form */}
      <form onSubmit={handleSubmit} className="card ai-form-card mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-2">
          Evidence-Aware Resume-to-Job Matching
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Enter candidate resume text and target job description. Only statements substantiated by exact quotes in your resume receive the supported status.
        </p>

        <div className="form-row mb-3">
          <label className="form-label">
            Target Opportunity
            <select
              value={jobId}
              onChange={e => setJobId(e.target.value)}
              className="form-select mt-1"
            >
              {jobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.title} — {job.company}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row mb-3">
          <label className="form-label">
            Job Description & Requirements
            <textarea
              rows={4}
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              className="form-textarea mt-1"
              required
            />
          </label>
        </div>

        <div className="form-row mb-4">
          <label className="form-label">
            Candidate Resume Text
            <textarea
              rows={6}
              value={resumeText}
              onChange={e => setResumeText(e.target.value)}
              placeholder="Paste relevant resume experience sections here..."
              className="form-textarea mt-1 font-mono text-xs"
              required
            />
          </label>
        </div>

        {/* Mandatory Consent Checkbox */}
        <div className="consent-gate-box mb-4">
          <label className="candidate-confirm-checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            <span className="text-xs text-slate-800 font-semibold">
              I consent to sending this text to the configured server AI provider for this single request. The API does not store this text in persistent storage.
            </span>
          </label>
        </div>

        {error && <div className="notice notice-error mb-4">{error}</div>}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!status.configured || !consent || working}
          >
            {working ? 'Evaluating Exact Resume Quotes...' : 'Run Evidence Analysis'}
          </button>
          {!status.configured && (
            <span className="text-xs text-amber-600 font-medium">
              Configure AI_PROVIDER and restart server to activate live analysis.
            </span>
          )}
        </div>
      </form>

      {/* Analysis Output Section */}
      {analysis && (
        <div className="card analysis-result-card animate-fade-in">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <div>
              <span className="text-xs uppercase font-bold text-blue-600 tracking-wider">
                AUDITED ANALYSIS RESULTS
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                Exact Quote Verification
              </h3>
            </div>
            <Badge kind="blue" size="sm">
              {analysis.provider} • {analysis.model}
            </Badge>
          </div>

          <div className="space-y-4 mt-4">
            {(analysis.requirements || []).map((item, idx) => (
              <div key={idx} className="analysis-requirement-card">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-slate-900">{item.requirement}</h4>
                  <Badge
                    kind={item.status === 'supported-by-exact-quote' ? 'ok' : 'warn'}
                    size="sm"
                  >
                    {item.status === 'supported-by-exact-quote'
                      ? 'Supported by Exact Quote'
                      : 'Insufficient Evidence'}
                  </Badge>
                </div>

                {item.status === 'supported-by-exact-quote' && item.evidenceQuote && (
                  <blockquote className="citation-quote-box my-2 text-xs">
                    “{item.evidenceQuote}”
                  </blockquote>
                )}

                <p className="text-xs text-slate-700">{item.claim || item.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

