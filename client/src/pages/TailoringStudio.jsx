import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import { api } from '../services/api';

const sectionLabels = {
  summary: 'Summary',
  skills: 'Skills',
  projects: 'Projects',
  experience: 'Experience',
  education: 'Education',
  achievements: 'Achievements'
};

export default function TailoringStudio({ jobs = [], applications = [], selectedJobId = '', onError }) {
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
      const result = await api('/profile/tailored-resumes', {
        method: 'POST',
        body: JSON.stringify({ jobId, versionName: `${jobs.find(job => job.id === jobId)?.title || 'Role'} - Draft` })
      });
      setVersions(current => [result, ...current]);
      await loadVersion(result.id);
      setMessage('Draft created. Review every section before using it.');
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
      const result = await api(`/profile/tailored-resumes/${version.id}/suggestions`, {
        method: 'POST',
        body: JSON.stringify({ consentAccepted: true })
      });
      setSuggestions(result.suggestions || []);
      setMessage(`${result.suggestions?.length || 0} suggestions ready for review.`);
    } catch (error) {
      onError?.(error.message);
    } finally {
      setWorking(false);
    }
  };

  const acceptSuggestion = async suggestion => {
    try {
      const result = await api(`/profile/tailored-resumes/${version.id}/suggestions/accept`, {
        method: 'POST',
        body: JSON.stringify({ suggestion })
      });
      setVersion(result);
      setSections(result.sections || {});
      setSuggestions(current => current.filter(item => item.id !== suggestion.id));
      setMessage('Suggestion accepted and saved.');
    } catch (error) {
      onError?.(error.message);
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

  return <div className="tailoring-page animate-fade-in">
    <div className="page-header-row"><div><h1 className="page-title">Resume Tailoring Studio</h1><p className="page-subtitle">Create candidate-controlled drafts from confirmed Career DNA. AI suggestions remain review-only until you explicitly accept them.</p></div><Badge kind="blue">Candidate controlled</Badge></div>
    <div className="card tailoring-toolbar"><label className="form-label">Target opportunity<select value={jobId} onChange={event => { setJobId(event.target.value); loadVersions(event.target.value).catch(error => onError?.(error.message)); }}>{jobs.map(job => <option key={job.id} value={job.id}>{job.title} — {job.company}</option>)}</select></label><div className="job-context"><strong>{selectedJob?.title}</strong><span className="muted sm">{selectedJob?.company} · {selectedJob?.location}</span></div></div>
    <div className="tailoring-layout">
      <aside className="card"><div className="section-heading"><h2>Saved versions</h2><Badge>{versions.length}</Badge></div><button className="btn btn-primary" type="button" disabled={working} onClick={createVersion}>Create tailored draft</button>{versions.map(item => <button className={`version-item ${version?.id === item.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => loadVersion(item.id)}>{item.versionName}<span>{new Date(item.updatedAt).toLocaleDateString()}</span></button>)}</aside>
      <section className="card">{!version ? <div className="empty-state"><h2>Select or create a draft</h2><p className="muted">Your confirmed profile remains separate from historical resumes and tailored versions.</p></div> : <><form onSubmit={saveVersion}><div className="section-heading"><h2>Edit draft</h2><Badge>{version.approvalStatus === 'candidate-approved' ? 'Approved' : 'Draft'}</Badge></div><label className="form-label">Version name<input value={versionName} onChange={event => setVersionName(event.target.value)} /></label>{Object.entries(sectionLabels).map(([key, label]) => <label className="form-label" key={key}>{label}<textarea rows="4" value={sections[key] || ''} onChange={event => setSections(current => ({ ...current, [key]: event.target.value }))} /></label>)}<div className="button-row"><button className="btn btn-primary" type="submit" disabled={working}>Save draft</button>{version.approvalStatus !== 'candidate-approved' && <button className="btn btn-secondary" type="button" disabled={working} onClick={approveVersion}>Approve version</button>}<button className="btn" type="button" onClick={downloadTextDraft}>Download text</button><button className="btn" type="button" onClick={printDraft}>Print / Save as PDF</button></div></form><div className="suggestion-panel"><div className="section-heading"><div><h2>AI suggestions</h2><p className="muted sm">Only grounded suggestions from confirmed profile evidence are eligible.</p></div><Badge kind="warn">Review required</Badge></div><label className="candidate-confirm-checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> I consent to sending my confirmed profile and this draft to the configured AI provider.</label><button className="btn btn-secondary" type="button" disabled={!consent || working} onClick={generateSuggestions}>Generate suggestions</button>{suggestions.map(suggestion => <article className="suggestion-card" key={suggestion.id}><strong>{sectionLabels[suggestion.section] || suggestion.section}</strong><p>{suggestion.proposedText}</p><p className="muted sm">{suggestion.rationale}</p><p className="muted sm">Source evidence: {suggestion.sourceText}</p><button className="btn btn-primary btn-sm" type="button" onClick={() => acceptSuggestion(suggestion)}>Accept suggestion</button></article>)}</div><div className="suggestion-panel application-association"><div className="section-heading"><div><h2>Application association</h2><p className="muted sm">Associate this approved version with a tracked application. This records preparation only.</p></div><Badge>{version.applicationId ? 'Associated' : 'Not associated'}</Badge></div><select value={selectedApplicationId} onChange={event => setSelectedApplicationId(event.target.value)} disabled={version.approvalStatus !== 'candidate-approved'}><option value="">Select a tracked application</option>{applications.filter(application => application.jobId === jobId).map(application => <option value={application.id} key={application.id}>{application.jobTitle} — {application.status}</option>)}</select><button className="btn btn-secondary" type="button" disabled={!selectedApplicationId || version.approvalStatus !== 'candidate-approved' || working} onClick={attachToApplication}>Associate approved version</button></div>{message && <div className="notice notice-success">{message}</div>}</>}</section>
    </div>
  </div>;
}
