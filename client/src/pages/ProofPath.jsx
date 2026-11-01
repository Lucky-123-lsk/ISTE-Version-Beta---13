import React, { useEffect, useMemo, useState } from 'react';
import Badge from '../components/Badge';
import { IconAlertCircle, IconCheckCircle, IconShieldCheck } from '../components/Icons';
import { api } from '../services/api';

export default function ProofPath({
  jobs = [],
  applications = [],
  initialJobId = '',
  initialJob = null,
  onJobChange,
  onAddToPlanner,
  onContinueToTailoring
}) {
  const [selectedJobId, setSelectedJobId] = useState(initialJobId);
  const [evidence, setEvidence] = useState(null);
  const [selectedCandidates, setSelectedCandidates] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialJobId) setSelectedJobId(initialJobId);
  }, [initialJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setEvidence(null);
      setSelectedCandidates({});
      return undefined;
    }

    let active = true;
    setEvidence(null);
    setSelectedCandidates({});
    setError('');
    setLoading(true);
    api(`/resume/evidence?jobId=${encodeURIComponent(selectedJobId)}`)
      .then(result => {
        if (active) setEvidence(result);
      })
      .catch(loadError => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [selectedJobId]);

  const requirements = evidence?.requirements || [];
  const availableJobs = initialJob && !jobs.some(job => job.id === initialJob.id)
    ? [...jobs, initialJob]
    : jobs;
  const selectedJob = availableJobs.find(job => job.id === selectedJobId);
  const isTracked = applications.some(application => application.jobId === selectedJobId);
  const selectedProofPoints = useMemo(() => {
    return requirements.flatMap(requirement =>
      (requirement.evidenceCandidates || [])
        .filter(candidate => selectedCandidates[candidate.id])
        .map(candidate => ({
          requirement: requirement.requirement,
          text: candidate.text,
          sourceType: candidate.sourceType,
          sourceLabel: candidate.sourceLabel,
          lineStart: candidate.lineStart || null,
          reviewed: true
        }))
    );
  }, [requirements, selectedCandidates]);

  const toggleCandidate = candidateId => {
    setSelectedCandidates(current => ({ ...current, [candidateId]: !current[candidateId] }));
  };

  const handleContinue = () => {
    if (!selectedJob || !onContinueToTailoring) return;
    onContinueToTailoring(selectedJob, selectedProofPoints);
  };

  return (
    <div className="proofpath-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">ProofPath — Evidence Review</h1>
          <p className="page-subtitle">
            Check what supports each job requirement, select only evidence that is genuinely yours, then carry it into the job-specific resume draft.
          </p>
        </div>
        <Badge kind="warn">Review required</Badge>
      </div>

      <section className="card proofpath-job-picker">
        <label className="form-label">
          Target opportunity
          <select
            className="form-select mt-1"
            value={selectedJobId}
            onChange={event => {
              setSelectedJobId(event.target.value);
              onJobChange?.(event.target.value);
            }}
          >
            <option value="">Select a job to review evidence</option>
            {availableJobs.map(job => (
              <option key={job.id} value={job.id}>
                {job.title} — {job.company}
              </option>
            ))}
          </select>
        </label>
        {selectedJob && (
          <div className="proofpath-selected-job">
            <strong>{selectedJob.title}</strong>
            <span>{selectedJob.company} · {selectedJob.location}</span>
            {selectedJob.applicationUrl && (
              <a href={selectedJob.applicationUrl} target="_blank" rel="noreferrer">
                Review original listing
              </a>
            )}
          </div>
        )}
      </section>

      {error && <div className="notice notice-error mb-4" role="alert">{error}</div>}

      {!selectedJobId ? (
        <div className="card proofpath-start-state">
          <IconShieldCheck size={34} className="text-blue-600" />
          <h2>Start from a job you’re considering</h2>
          <p>Open a job’s details and choose “Build evidence-backed application”, or select a target opportunity above.</p>
          <a className="btn btn-secondary btn-sm" href="#discover">Find a job</a>
        </div>
      ) : loading ? (
        <div className="card proofpath-start-state" aria-live="polite">
          <div className="spinner-blue" />
          <p>Comparing this job with your parsed resume and confirmed Career DNA…</p>
        </div>
      ) : evidence ? (
        <div className="proofpath-workflow">
          <section className="card proofpath-evidence-card">
            <div className="proofpath-section-heading">
              <div>
                <h2>Requirement evidence</h2>
                <p>{evidence.notice}</p>
              </div>
              <div className="proofpath-evidence-count">
                <strong>{selectedProofPoints.length}</strong>
                <span>selected</span>
              </div>
            </div>

            {requirements.length ? (
              <div className="proofpath-requirements">
                {requirements.map(requirement => {
                  const candidates = requirement.evidenceCandidates || [];
                  return (
                    <article className="proofpath-requirement-card" key={requirement.id}>
                      <div className="proofpath-requirement-heading">
                        <div>
                          <h3>{requirement.requirement}</h3>
                          <span className="proofpath-importance">{requirement.importance}</span>
                        </div>
                        <Badge
                          kind={requirement.status === 'supported' ? 'ok' : requirement.status === 'profile-match' ? 'warn' : 'neutral'}
                          size="sm"
                        >
                          {requirement.status === 'supported'
                            ? 'Resume match'
                            : requirement.status === 'profile-match'
                              ? 'Profile match · review'
                              : 'No direct evidence'}
                        </Badge>
                      </div>

                      {candidates.length ? (
                        <div className="proofpath-candidates">
                          {candidates.map(candidate => (
                            <label className="proofpath-candidate" key={candidate.id}>
                              <input
                                type="checkbox"
                                checked={Boolean(selectedCandidates[candidate.id])}
                                onChange={() => toggleCandidate(candidate.id)}
                              />
                              <span className="proofpath-candidate-content">
                                <span className="proofpath-candidate-source">
                                  {candidate.sourceLabel}
                                  {candidate.lineStart ? ` · line ${candidate.lineStart}` : ''}
                                  {candidate.confidence ? ` · ${candidate.confidence.replaceAll('-', ' ')}` : ''}
                                </span>
                                <span className="proofpath-candidate-text">{candidate.text}</span>
                              </span>
                            </label>
                          ))}
                          <p className="proofpath-review-hint">
                            Select a passage only if it accurately supports this requirement. Profile matches need your confirmation.
                          </p>
                        </div>
                      ) : (
                        <div className="proofpath-no-evidence">
                          <IconAlertCircle size={16} />
                          <span>No direct match was found. Don’t add this claim unless you have genuine supporting experience.</span>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="proofpath-no-evidence proofpath-no-requirements">
                <IconAlertCircle size={16} />
                <span>This listing does not expose structured skills. Review its original description and use Resume Tailoring Studio to prepare your application.</span>
              </div>
            )}
          </section>

          <aside className="card proofpath-next-step">
            <div className="proofpath-next-step-icon"><IconCheckCircle size={20} /></div>
            <h2>Continue to your tailored draft</h2>
            <p>
              Your selected source passages will be added as editable evidence notes in Resume Tailoring Studio. They are not automatically rewritten as achievements or submitted.
            </p>
            <div className="proofpath-next-step-summary">
              <span>Target role</span>
              <strong>{selectedJob?.title || 'Selected opportunity'}</strong>
              <span>Evidence selected</span>
              <strong>{selectedProofPoints.length} passage{selectedProofPoints.length === 1 ? '' : 's'}</strong>
            </div>
            {isTracked ? (
              <p className="proofpath-tracked-status">
                <IconCheckCircle size={14} /> This job is already in My Applications.
              </p>
            ) : (
              <button
                type="button"
                className="btn btn-secondary w-full mb-2"
                disabled={!selectedJob || !onAddToPlanner}
                onClick={() => onAddToPlanner(selectedJobId)}
              >
                Add to My Applications
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!selectedJob || !onContinueToTailoring}
              onClick={handleContinue}
            >
              Open Resume Tailoring Studio
            </button>
            <p className="proofpath-safety-note">
              You stay in control: the draft remains editable and requires your approval.
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
