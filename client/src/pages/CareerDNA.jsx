import React, { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../components/Badge';
import { api } from '../services/api';

const recordText = records => (records || []).map(item => `${item.title || ''}|${item.details || ''}`).join('\n');
const parseRecords = value => String(value || '').split('\n').map(line => {
  const [title, ...details] = line.split('|');
  return { title: title.trim(), details: details.join('|').trim() };
}).filter(item => item.title).slice(0, 50);

const confidenceLabel = value => value === 'verified' ? 'Verified' : value === 'learning' ? 'Learning' : 'Self-Declared';

export default function CareerDNA({ profile, jobs = [], onSaveProfile, onSelectJob }) {
  const [form, setForm] = useState(null);
  const [resumeRecords, setResumeRecords] = useState([]);
  const [selectedResume, setSelectedResume] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [resumeStatus, setResumeStatus] = useState('Not uploaded');
  const [resumeError, setResumeError] = useState('');
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [analysisWorking, setAnalysisWorking] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName || profile.name || '',
      email: profile.email || '',
      location: profile.location || '',
      linkedIn: profile.linkedIn || '',
      github: profile.github || '',
      portfolio: profile.portfolio || '',
      objective: profile.objective || '',
      skills: (profile.existingSkills || []).map(skill => `${skill.name}|${skill.confidence || 'self-declared'}`).join('\n'),
      interests: (profile.interests || []).join(', '),
      goals: (profile.learningGoals || []).join(', '),
      roles: (profile.preferredRoles || []).join(', '),
      yearsExperience: profile.yearsExperience ?? '',
      authorization: (profile.workAuthorizationCountries || []).join(', '),
      education: recordText(profile.education),
      projects: recordText(profile.projects),
      experience: recordText(profile.experience),
      achievements: recordText(profile.achievements)
    });
  }, [profile]);

  useEffect(() => {
    api('/profile/resumes').then(setResumeRecords).catch(() => setResumeRecords([]));
  }, []);

  const update = (name, value) => setForm(current => ({ ...current, [name]: value }));
  const skills = useMemo(() => String(form?.skills || '').split('\n').map(line => {
    const [name, confidence = 'self-declared'] = line.split('|');
    return { name: name.trim(), confidence: confidence.trim() };
  }).filter(skill => skill.name), [form?.skills]);

  const submitProfile = event => {
    event.preventDefault();
    onSaveProfile({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      location: form.location.trim(),
      linkedIn: form.linkedIn.trim(),
      github: form.github.trim(),
      portfolio: form.portfolio.trim(),
      objective: form.objective.trim(),
      existingSkills: skills.filter(skill => ['verified', 'self-declared', 'learning'].includes(skill.confidence)),
      interests: form.interests.split(',').map(value => value.trim()).filter(Boolean),
      learningGoals: form.goals.split(',').map(value => value.trim()).filter(Boolean),
      preferredRoles: form.roles.split(',').map(value => value.trim()).filter(Boolean),
      yearsExperience: form.yearsExperience === '' ? null : Number(form.yearsExperience),
      workAuthorizationCountries: form.authorization.split(',').map(value => value.trim()).filter(Boolean),
      education: parseRecords(form.education),
      projects: parseRecords(form.projects),
      experience: parseRecords(form.experience),
      achievements: parseRecords(form.achievements)
    });
    setSavedNotice('Career DNA updated.');
    window.setTimeout(() => setSavedNotice(''), 2500);
  };

  const selectResume = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setResumeError('');
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setResumeError('Choose a PDF or DOCX file smaller than 10 MB.');
      return;
    }
    setResumeStatus('Uploading');
    try {
      const record = await api('/profile/resumes', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, originalText: '' })
      });
      setSelectedResume({ ...record, file, previewUrl: URL.createObjectURL(file) });
      setResumeRecords(current => [record, ...current]);
      setResumeStatus('Uploaded');
    } catch (error) {
      setResumeStatus('Upload failed');
      setResumeError(error.message);
    }
  };

  const analyzeResume = async () => {
    if (!selectedResume || !analysisConsent) return;
    setAnalysisWorking(true);
    setResumeError('');
    setResumeStatus('Analyzing');
    try {
      const result = await api(`/profile/resumes/${selectedResume.id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ resumeText, consentAccepted: true })
      });
      setResumeAnalysis(result);
      setResumeStatus('Analysis ready for review');
      setResumeRecords(current => current.map(item => item.id === selectedResume.id ? { ...item, extractionStatus: 'complete' } : item));
    } catch (error) {
      setResumeStatus('Analysis failed');
      setResumeError(error.message);
    } finally {
      setAnalysisWorking(false);
    }
  };

  const applyExtractedSkills = () => {
    if (!resumeAnalysis?.technicalSkills?.length) return;
    const existing = new Map(skills.map(skill => [skill.name.toLowerCase(), skill]));
    resumeAnalysis.technicalSkills.forEach(skill => {
      if (!existing.has(skill.name.toLowerCase())) existing.set(skill.name.toLowerCase(), { name: skill.name, confidence: 'self-declared' });
    });
    update('skills', [...existing.values()].map(skill => `${skill.name}|${skill.confidence}`).join('\n'));
    setSavedNotice('Extracted skills added as self-declared. Save Career DNA to confirm.');
  };

  const removeResume = async id => {
    try {
      await api(`/profile/resumes/${id}`, { method: 'DELETE' });
      setResumeRecords(current => current.filter(item => item.id !== id));
      if (selectedResume?.id === id) {
        setSelectedResume(null);
        setResumeAnalysis(null);
        setResumeStatus('Not uploaded');
      }
    } catch (error) {
      setResumeError(error.message);
    }
  };

  if (!form) return <div className="card loading-card">Loading Career DNA...</div>;
  const completenessFields = [form.fullName, form.email, form.location, form.objective, form.skills, form.interests, form.roles, form.goals];
  const completeness = Math.round(completenessFields.filter(Boolean).length / completenessFields.length * 100);
  const categoryCounts = skills.reduce((counts, skill) => {
    const key = /react|javascript|html|css|frontend/i.test(skill.name) ? 'Frontend' : /node|python|java|api|backend/i.test(skill.name) ? 'Backend' : /sql|mongo|data|ai|machine/i.test(skill.name) ? 'Data and AI' : 'Tools';
    return { ...counts, [key]: (counts[key] || 0) + 1 };
  }, {});
  const maxCategory = Math.max(1, ...Object.values(categoryCounts));
  const chartColors = ['#2563EB', '#059669', '#D97706', '#7C3AED'];
  let chartAngle = 0;
  const chartStops = Object.entries(categoryCounts).map(([category, count], index) => {
    const end = chartAngle + (count / Math.max(skills.length, 1)) * 360;
    const stop = `${chartColors[index % chartColors.length]} ${chartAngle}deg ${end}deg`;
    chartAngle = end;
    return stop;
  }).join(', ') || '#E2E8F0 0deg 360deg';
  const timeline = [
    ...parseRecords(form.education).map(item => ({ ...item, type: 'Education' })),
    ...parseRecords(form.experience).map(item => ({ ...item, type: 'Experience' })),
    ...parseRecords(form.projects).map(item => ({ ...item, type: 'Project' })),
    ...parseRecords(form.achievements).map(item => ({ ...item, type: 'Achievement' }))
  ];
  const pathways = ['bridge', 'growth', 'stretch'].map(category => ({ category, jobs: jobs.filter(job => job.category === category) }));

  return <div className="career-dna-page animate-fade-in">
    <div className="page-header-row"><div><h1 className="page-title">Career DNA and Profile Analytics</h1><p className="page-subtitle">Maintain your candidate-confirmed profile, preserve historical resumes separately, and review analytics calculated from your saved information.</p></div><Badge kind="blue">{completeness}% complete</Badge></div>
    <div className="pathway-cards-grid">{pathways.map(({ category, jobs: categoryJobs }) => <article className={`pathway-card pathway-${category} hover-lift`} key={category}><div className="pathway-header"><Badge>{category === 'bridge' ? 'Bridge Roles' : category === 'growth' ? 'Growth Roles' : 'Stretch Roles'}</Badge><span className="pathway-count">{categoryJobs.length} matches</span></div><h3>{category === 'bridge' ? 'Immediate transition' : category === 'growth' ? 'Skill expansion' : 'Long-term trajectory'}</h3><p className="muted sm">Missing skills are growth signals, not automatic disqualifications.</p>{categoryJobs.slice(0, 2).map(job => <button className="pathway-job-item" type="button" key={job.id} onClick={() => onSelectJob?.(job)}>{job.title}<span>{job.company}</span></button>)}</article>)}</div>
    <form className="card profile-form" onSubmit={submitProfile}><div className="section-heading"><div><h2>Candidate Profile</h2><p className="muted sm">These values are candidate-confirmed and separate from resume extraction drafts.</p></div><button className="btn btn-primary" type="submit">Save Profile</button></div>{savedNotice && <div className="notice notice-success">{savedNotice}</div>}<div className="form-grid-2">{[['fullName', 'Full Name'], ['email', 'Email'], ['location', 'Location'], ['yearsExperience', 'Years of Experience'], ['linkedIn', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Portfolio']].map(([name, label]) => <label className="form-label" key={name}>{label}<input name={name} value={form[name]} onChange={event => update(name, event.target.value)} type={name === 'yearsExperience' ? 'number' : 'text'} /></label>)}</div><label className="form-label">Career Objective<textarea rows="3" value={form.objective} onChange={event => update('objective', event.target.value)} /></label><div className="form-grid-2">{[['interests', 'Interests (comma separated)'], ['goals', 'Learning Goals (comma separated)'], ['roles', 'Preferred Roles (comma separated)'], ['authorization', 'Work Authorization (comma separated)']].map(([name, label]) => <label className="form-label" key={name}>{label}<input value={form[name]} onChange={event => update(name, event.target.value)} /></label>)}</div>{[['education', 'Education (one entry per line: Title|Details)'], ['projects', 'Projects (one entry per line: Title|Details)'], ['experience', 'Experience (one entry per line: Title|Details)'], ['achievements', 'Achievements (one entry per line: Title|Details)']].map(([name, label]) => <label className="form-label" key={name}>{label}<textarea rows="3" value={form[name]} onChange={event => update(name, event.target.value)} /></label>)}<label className="form-label">Skill inventory (one skill per line: Skill|verified, self-declared, or learning)<textarea rows="6" value={form.skills} onChange={event => update('skills', event.target.value)} /></label></form>
    <div className="analytics-grid"><section className="card analytics-card"><div className="section-heading"><div><h2>Skill Inventory</h2><p className="muted sm">Candidate-maintained competency signals</p></div><Badge>{skills.length} skills</Badge></div><div className="skill-inventory">{skills.map(skill => <span className={`skill-chip ${skill.confidence}`} key={`${skill.name}-${skill.confidence}`}>{skill.name}<small>{confidenceLabel(skill.confidence)}</small></span>)}{!skills.length && <p className="muted">Add skills in your profile to build your inventory.</p>}</div></section><section className="card analytics-card"><div className="section-heading"><div><h2>Skill Distribution</h2><p className="muted sm">Grouped from your saved skill names</p></div><Badge kind="blue">Analytics</Badge></div><div className="distribution-visual"><div className="skill-donut" style={{ background: `conic-gradient(${chartStops})` }}><div className="skill-donut-center"><strong>{skills.length}</strong><span>skills</span></div></div><div className="distribution-chart">{Object.entries(categoryCounts).map(([category, count], index) => <div className="distribution-row" key={category}><span><i style={{ background: chartColors[index % chartColors.length] }} />{category}</span><div className="distribution-track"><span style={{ width: `${count / maxCategory * 100}%`, background: chartColors[index % chartColors.length] }} /></div><strong>{count}</strong></div>)}{!skills.length && <p className="muted">Add skills to see distribution.</p>}</div></div></section></div>
    <section className="card"><div className="section-heading"><div><h2>Profile Completeness</h2><p className="muted sm">Calculated from fields you maintain; it is not a hiring prediction.</p></div><strong>{completeness}%</strong></div><div className="capacity-track"><span style={{ width: `${completeness}%` }} /></div></section>
    <section className="card resume-management"><div className="section-heading"><div><h2>Resume Records</h2><p className="muted sm">Original files and extraction drafts remain separate from Career DNA.</p></div><Badge>{resumeRecords.length} saved</Badge></div><input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectResume} hidden /><button className="btn btn-secondary" type="button" onClick={() => fileInput.current?.click()}>Upload or Replace Resume</button><span className="muted sm">{resumeStatus}</span>{resumeError && <div className="notice notice-error">{resumeError}</div>}{resumeRecords.map(record => <div className="resume-record" key={record.id}><div><strong>{record.fileName || 'Resume file'}</strong><span className="muted sm">{record.extractionStatus} · {record.analyzedAt ? new Date(record.analyzedAt).toLocaleDateString() : 'Not analyzed'}</span></div><button className="btn btn-sm" type="button" onClick={() => removeResume(record.id)}>Remove</button></div>)}{selectedResume && <div className="resume-analysis"><label className="form-label">Paste resume text for evidence-aware analysis<textarea rows="8" value={resumeText} onChange={event => setResumeText(event.target.value)} placeholder="PDF/DOCX metadata is stored; paste text here for analysis." /></label><label className="candidate-confirm-checkbox"><input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} /> I consent to sending this resume text to the configured AI provider.</label><button className="btn btn-primary" type="button" disabled={!analysisConsent || analysisWorking} onClick={analyzeResume}>{analysisWorking ? 'Analyzing...' : 'Analyze Resume'}</button>{resumeAnalysis && <div className="extraction-review"><div className="section-heading"><h3>Extraction Review Draft</h3><Badge kind="warn">Not yet confirmed</Badge></div><p className="muted sm">Review extracted skills before adding anything to Career DNA.</p><div className="skill-inventory">{(resumeAnalysis.technicalSkills || []).map(skill => <span className="skill-chip self-declared" key={skill.name}>{skill.name}<small>{skill.evidenceQuote || 'No exact quote'}</small></span>)}</div><button className="btn btn-secondary" type="button" onClick={applyExtractedSkills}>Add Skills as Self-Declared</button></div>}</div>}</section>
    <section className="card"><div className="section-heading"><h2>Evidence Timeline</h2><Badge>{timeline.length} records</Badge></div><div className="activity-timeline">{timeline.map((item, index) => <div className="activity-item" key={`${item.type}-${item.title}-${index}`}><span className="activity-dot" /><div><strong>{item.title}</strong><p className="muted sm">{item.type} · {item.details || 'Candidate-maintained record'}</p></div></div>)}{!timeline.length && <p className="muted">Add education, experience, projects, or achievements to build your timeline.</p>}</div></section>
  </div>;
}
