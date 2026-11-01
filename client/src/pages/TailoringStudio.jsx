import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import { api } from '../services/api';

const sectionLabels = {
  summary: 'Summary',
  skills: 'Skills',
  projects: 'Projects',
  experience: 'Experience',
  education: 'Education',
  achievements: 'Achievements',
  evidence: 'ProofPath Evidence Notes'
};

export default function TailoringStudio({
  jobs = [],
  applications = [],
  aiStatus = null,
  selectedJobId = '',
  proofPathSelection = null,
  onError
}) {
  const [jobId, setJobId] = useState(selectedJobId || jobs[0]?.id || '');
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState(null);
  const [sections, setSections] = useState({});
  const [versionName, setVersionName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');

  const loadVersions = async nextJobId => {
    const result = await api(`/profile/tailored-resumes?jobId=${encodeURIComponent(nextJobId)}`);
    setVersions(result || []);
    setVersion(null);
    setSuggestions([]);
  };

  useEffect(() => {
    if (!jobId) return;
    loadVersions(jobId).catch(error => onError?.(error.message));
  }, [jobId]);

  const loadVersion = async id => {
    try {
      const result = await api(`/profile/tailored-resumes/${id}`);
      setVersion(result);
      setVersionName(result.versionName);
      setSections(result.sections || {});
      setSelectedApplicationId(result.applicationId || '');
      setSuggestions([]);
      setMessage('');
    } catch (error) {
      onError?.(error.message);
    }
  };

  const approveVersion = async () => {
    setWorking(true);
    try {
      const result = await api(`/profile/tailored-resumes/${version.id}/approve`, { method: 'POST' });
      setVersion(result);
      setMessage('Draft approved for this candidate-controlled application workflow.');
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const attachToApplication = async () => {
    if (!selectedApplicationId) return;
    setWorking(true);
    try {
      const result = await api(`/applications/${selectedApplicationId}/tailored-resume`, {
        method: 'POST',
        body: JSON.stringify({ tailoredResumeId: version.id })
      });
      setVersion(current => ({ ...current, applicationId: result.tailoredResumeId }));
      setMessage('Approved tailored version associated with the tracked application. No external submission occurred.');
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const createVersion = async () => {
    setWorking(true);
    try {
      const proofPoints = proofPathSelection?.jobId === jobId ? proofPathSelection.items : [];
      const result = await api('/profile/tailored-resumes', {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          versionName: `${jobs.find(job => job.id === jobId)?.title || 'Role'} - Draft`,
          proofPoints
        })
      });
      setVersions(current => [result, ...current]);
      await loadVersion(result.id);
      const sourceMessage = result.sourceResumeId
        ? 'Draft prefilled from your latest analyzed resume and confirmed profile.'
        : 'Draft created from your confirmed profile.';
      setMessage(`${sourceMessage}${proofPoints.length ? ` ${proofPoints.length} reviewed ProofPath evidence note${proofPoints.length === 1 ? '' : 's'} added for editing.` : ''} Review and edit every section before using it.`);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const saveVersion = async event => {
    event.preventDefault();
    setWorking(true);
    try {
      const result = await api(`/profile/tailored-resumes/${version.id}`, {
        method: 'PUT',
        body: JSON.stringify({ versionName, sections })
      });
      setVersion(result);
      setVersions(current => current.map(item => item.id === result.id ? { ...item, versionName: result.versionName, updatedAt: result.updatedAt } : item));
      setMessage('Draft saved.');
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const generateSuggestions = async () => {
    if (!consent) return;
    setWorking(true);
    try {
      const savedVersion = await api(`/profile/tailored-resumes/${version.id}`, {
        method: 'PUT',
        body: JSON.stringify({ versionName, sections })
      });
      setVersion(savedVersion);
      const result = await api(`/profile/tailored-resumes/${version.id}/suggestions`, {
        method: 'POST',
        skipDemo: true,
        body: JSON.stringify({ consentAccepted: true })
      });
      setSuggestions(result.suggestions || []);
      setMessage(result.message || `${result.suggestions?.length || 0} tailoring recommendation${result.suggestions?.length === 1 ? '' : 's'} ready for review.`);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const acceptSuggestion = async suggestion => {
    setWorking(true);
    try {
      const result = await api(`/profile/tailored-resumes/${version.id}/suggestions/accept`, {
        method: 'POST',
        skipDemo: true,
        body: JSON.stringify({ suggestion })
      });
      setVersion(result);
      setSections(result.sections || {});
      setSuggestions(current => current.filter(item => item.id !== suggestion.id));
      setMessage(`${sectionLabels[suggestion.section] || suggestion.section} updated and saved. Review the full draft before approving it.`);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const downloadTextDraft = () => {
    if (!version) return;
    const body = Object.entries(sectionLabels)
      .map(([key, label]) => `${label.toUpperCase()}\n${String(sections[key] || '').trim()}`)
      .filter(block => !block.endsWith('\n'))
      .join('\n\n');
    const file = new Blob([`${versionName}\n${selectedJob?.company || ''}\n\n${body}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${versionName || 'tailored-resume'}.txt`.replace(/[<>:"/\\|?*]+/g, '-');
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Plain-text draft downloaded for review.');
  };

  const printDraft = () => {
    if (!version) return;
    window.print();
  };

  const selectedJob = jobs.find(job => job.id === jobId);
  if (!jobs.length) return <div className="card empty-state"><h2>No target opportunities available</h2><p className="muted">Collect a job before creating a tailored draft.</p></div>;

  return (
    <div className="tailoring-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Resume Tailoring Studio</h1>
          <p className="page-subtitle">
            Get job-specific AI recommendations grounded in your resume and confirmed profile. Review the source, apply only useful suggestions, then edit and approve the draft yourself.
          </p>
        </div>
        <Badge kind="blue">Candidate controlled</Badge>
      </div>

      <div className="card tailoring-toolbar">
        <label className="form-label">
          Target opportunity
          <select
            value={jobId}
            onChange={event => {
              setJobId(event.target.value);
              loadVersions(event.target.value).catch(error => onError?.(error.message));
            }}
          >
            {jobs.map(job => <option key={job.id} value={job.id}>{job.title} — {job.company}</option>)}
          </select>
        </label>
        <div className="job-context">
          <strong>{selectedJob?.title}</strong>
          <span className="muted sm">{selectedJob?.company} · {selectedJob?.location}</span>
          {Number.isFinite(selectedJob?.skillMatch) && (
            <span className="muted sm">Profile skill match: {selectedJob.skillMatch}% · not a hiring probability</span>
          )}
        </div>
      </div>

      <div className="tailoring-layout">
        <aside className="card">
          <div className="section-heading">
            <h2>Saved versions</h2>
            <Badge>{versions.length}</Badge>
          </div>
          {proofPathSelection?.jobId === jobId && proofPathSelection.items.length > 0 && (
            <p className="proofpath-tailoring-handoff">
              {proofPathSelection.items.length} reviewed ProofPath evidence note{proofPathSelection.items.length === 1 ? '' : 's'} will be included in the next draft.
            </p>
          )}
          <button className="btn btn-primary" type="button" disabled={working} onClick={createVersion}>
            Create tailored draft
          </button>
          {versions.map(item => (
            <button
              className={`version-item ${version?.id === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => loadVersion(item.id)}
            >
              {item.versionName}
              <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </aside>

        <section className="card">
          {!version ? (
            <div className="empty-state">
              <h2>Select or create a draft</h2>
              <p className="muted">Create a job-specific draft first to get tailored AI recommendations.</p>
            </div>
          ) : (
            <>
              <form onSubmit={saveVersion}>
                <div className="section-heading">
                  <h2>Edit draft</h2>
                  <Badge>{version.approvalStatus === 'candidate-approved' ? 'Approved' : 'Draft'}</Badge>
                </div>
                <label className="form-label">
                  Version name
                  <input value={versionName} onChange={event => setVersionName(event.target.value)} />
                </label>
                {Object.entries(sectionLabels).map(([key, label]) => (
                  <label className="form-label tailoring-section-editor" key={key}>
                    {label}
                    {key === 'evidence' && <span className="muted sm">Source notes are for your review; move substantiated claims into the appropriate resume section.</span>}
                    <textarea
                      rows={key === 'evidence' ? 3 : 4}
                      value={sections[key] || ''}
                      onChange={event => setSections(current => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
                <div className="button-row">
                  <button className="btn btn-primary" type="submit" disabled={working}>Save draft</button>
                  {version.approvalStatus !== 'candidate-approved' && (
                    <button className="btn btn-secondary" type="button" disabled={working} onClick={approveVersion}>Approve version</button>
                  )}
                  <button className="btn" type="button" onClick={downloadTextDraft}>Download text</button>
                  <button className="btn" type="button" onClick={printDraft}>Print / Save as PDF</button>
                </div>
              </form>

              <div className="suggestion-panel tailoring-ai-panel">
                <div className="section-heading">
                  <div>
                    <h2>AI tailoring coach</h2>
                    <p className="muted sm">
                      Get specific edits for this role, each tied to an exact resume/profile source or clearly labeled as an evidence gap.
                    </p>
                  </div>
                  <Badge kind={aiStatus?.configured ? 'ok' : 'warn'}>
                    {aiStatus?.configured ? 'AI ready' : 'AI unavailable'}
                  </Badge>
                </div>

                <p className="tailoring-ai-privacy">
                  With your consent, the job description, current draft, relevant resume text, and relevant profile fields are sent to the configured AI provider. Parsed resume text may include contact details; review your provider’s retention policy before continuing.
                </p>
                {!aiStatus?.configured && (
                  <p className="tailoring-ai-status" role="status">
                    {aiStatus?.message || 'AI provider status is not available. Check the server AI configuration.'}
                  </p>
                )}
                <label className="candidate-confirm-checkbox tailoring-ai-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={event => setConsent(event.target.checked)}
                  />
                  I consent to sending this job description, resume text, relevant profile fields, and current draft to the configured AI provider.
                </label>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!consent || working || !aiStatus?.configured}
                  onClick={generateSuggestions}
                >
                  {working ? 'Reviewing your draft…' : 'Get tailoring recommendations'}
                </button>

                {message && <div className="notice notice-success mt-3">{message}</div>}

                {suggestions.length > 0 && (
                  <div className="tailoring-suggestions">
                    <div className="tailoring-suggestions-heading">
                      <h3>Recommendations for {selectedJob?.title}</h3>
                      <span>{suggestions.length} for your review</span>
                    </div>
                    {suggestions.map(suggestion => (
                      <article className="tailoring-suggestion-card" key={suggestion.id}>
                        <div className="tailoring-suggestion-topline">
                          <div>
                            <strong>{suggestion.requirement}</strong>
                            <span>{sectionLabels[suggestion.section] || suggestion.section}</span>
                          </div>
                          <Badge kind={suggestion.priority === 'high' ? 'warn' : 'subtle'} size="sm">
                            {suggestion.priority} priority
                          </Badge>
                        </div>
                        <p className="tailoring-suggestion-action">{suggestion.recommendation}</p>
                        <p className="muted sm">{suggestion.rationale}</p>
                        {suggestion.sourceText ? (
                          <blockquote className="tailoring-suggestion-source">
                            <span>{suggestion.sourceType === 'resume' ? 'Resume evidence' : 'Confirmed profile evidence'}</span>
                            “{suggestion.sourceText}”
                          </blockquote>
                        ) : (
                          <div className="tailoring-suggestion-gap">
                            No supporting source was found. Do not add this as a resume claim.
                          </div>
                        )}
                        {suggestion.applyAllowed && (
                          <div className="tailoring-suggestion-proposal">
                            <span>Suggested wording · review before use</span>
                            <p>{suggestion.proposedText}</p>
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              disabled={working}
                              onClick={() => acceptSuggestion(suggestion)}
                            >
                              Replace {sectionLabels[suggestion.section]} section
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="suggestion-panel application-association">
                <div className="section-heading">
                  <div>
                    <h2>Application association</h2>
                    <p className="muted sm">Associate this approved version with a tracked application. This records preparation only.</p>
                  </div>
                  <Badge>{version.applicationId ? 'Associated' : 'Not associated'}</Badge>
                </div>
                <select
                  value={selectedApplicationId}
                  onChange={event => setSelectedApplicationId(event.target.value)}
                  disabled={version.approvalStatus !== 'candidate-approved'}
                >
                  <option value="">Select a tracked application</option>
                  {applications.filter(application => application.jobId === jobId).map(application => (
                    <option value={application.id} key={application.id}>
                      {application.jobTitle} — {application.status}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!selectedApplicationId || version.approvalStatus !== 'candidate-approved' || working}
                  onClick={attachToApplication}
                >
                  Associate approved version
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
