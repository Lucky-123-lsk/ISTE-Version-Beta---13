import React, { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../components/Badge';
import { SAMPLE_JOBS } from '../data/sampleJobs';
import { api } from '../services/api';

const profileSections = [
  { id: 'personal', label: 'Personal details', description: 'Contact information and professional links' },
  { id: 'academics', label: 'Academics', description: 'Education and qualifications' },
  { id: 'experience', label: 'Experience', description: 'Work history and achievements' },
  { id: 'projects', label: 'Projects', description: 'Selected work and accomplishments' },
  { id: 'skills', label: 'Skills', description: 'Your candidate-confirmed skills' },
  { id: 'preferences', label: 'Preferences', description: 'Roles, interests, and job preferences' },
  { id: 'resume', label: 'Resume', description: 'Saved resume versions and analysis' }
];

const recordText = records => (records || []).map(item => `${item.title || ''}|${item.details || ''}`).join('\n');
const parseRecords = value => String(value || '').split('\n').map(line => {
  const [title, ...details] = line.split('|');
  return { title: title.trim(), details: details.join('|').trim() };
}).filter(item => item.title).slice(0, 50);

const confidenceLabel = value => value === 'verified' ? 'Verified' : value === 'learning' ? 'Learning' : 'Self-Declared';
const normalizeSkill = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
const skillMixColors = ['#2563eb', '#0d9488', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#64748b'];
const skillAreaKeywords = [
  { area: 'Frontend', color: '#2563eb', terms: ['react', 'angular', 'vue', 'svelte', 'html', 'css', 'tailwind', 'bootstrap', 'next js', 'next.js', 'nuxt', 'web accessibility'] },
  { area: 'Languages', color: '#7c3aed', terms: ['javascript', 'typescript', 'python', 'java', 'c', 'c++', 'c#', 'go', 'golang', 'ruby', 'php', 'kotlin', 'swift', 'dart', 'rust'] },
  { area: 'Backend & APIs', color: '#0d9488', terms: ['node js', 'node.js', 'express', 'spring', 'django', 'flask', 'fastapi', 'rest api', 'graphql', 'microservices', '.net', 'asp.net'] },
  { area: 'Data & AI', color: '#db2777', terms: ['sql', 'mongodb', 'postgresql', 'mysql', 'pandas', 'numpy', 'machine learning', 'deep learning', 'artificial intelligence', 'tensorflow', 'pytorch', 'data analysis', 'tableau', 'power bi'] },
  { area: 'Cloud & DevOps', color: '#ea580c', terms: ['aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'linux', 'ci cd', 'jenkins'] },
  { area: 'Tools & Practices', color: '#0891b2', terms: ['git', 'github', 'gitlab', 'jira', 'agile', 'scrum', 'figma', 'testing', 'jest', 'cypress', 'playwright'] }
];
const firstText = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
const asList = value => Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value.trim()] : [];
const mergeCommaValues = (current, incoming) => [...new Map(
  [...String(current || '').split(','), ...asList(incoming)]
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => [value.toLowerCase(), value])
).values()].join(', ');
const mergeRecordLines = (current, incoming) => {
  const records = [...parseRecords(current), ...parseRecords(incoming)];
  return [...new Map(records.map(record => [`${record.title}|${record.details}`.toLowerCase(), record])).values()]
    .map(record => `${record.title}|${record.details}`)
    .join('\n');
};
const mergeSkillLines = (current, incoming) => {
  const skills = [...String(current || '').split('\n'), ...String(incoming || '').split('\n')]
    .map(line => line.trim())
    .filter(Boolean);
  return [...new Map(skills.map(line => [line.split('|')[0].trim().toLowerCase(), line])).values()].join('\n');
};
const recordLines = values => asList(values).map(item => {
  if (typeof item === 'string') return `${item.trim()}|`;
  if (!item || typeof item !== 'object') return '';
  const title = firstText(item.title, item.degree, item.role, item.position, item.jobTitle, item.name, item.institution, item.school, item.company, item.organization, item.projectName, item.project);
  const dates = firstText(item.dates, item.date, item.period, [item.startDate, item.endDate].filter(Boolean).join(' - '));
  const supportingDetails = ['responsibilities', 'highlights', 'technologies'].flatMap(key => asList(item[key]));
  const details = [
    item.company && item.company !== title ? item.company : '',
    item.companyName && item.companyName !== title ? item.companyName : '',
    item.institution && item.institution !== title ? item.institution : '',
    item.school && item.school !== title ? item.school : '',
    item.field,
    dates,
    item.location,
    item.details,
    item.description,
    item.summary,
    ...supportingDetails
  ].filter(value => typeof value === 'string' && value.trim());
  if (!title && !details.length) return '';
  return `${title || details.shift()}|${details.join(' · ')}`;
}).filter(Boolean).join('\n');

async function extractResumeText(file) {
  if (/\.pdf$/i.test(file.name)) {
    const [{ GlobalWorkerOptions, getDocument }, { default: workerUrl }] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]);
    GlobalWorkerOptions.workerSrc = workerUrl;
    const loadingTask = getDocument({ data: await file.arrayBuffer() });
    try {
      const pdf = await loadingTask.promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const lines = [];
        let currentLine = '';
        let currentY = null;
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const itemY = Array.isArray(item.transform) ? item.transform[5] : null;
          if (currentY !== null && typeof itemY === 'number' && Math.abs(itemY - currentY) > 2) {
            lines.push(currentLine.trim());
            currentLine = '';
          }
          currentLine += `${currentLine ? ' ' : ''}${item.str.trim()}`;
          if (typeof itemY === 'number') currentY = itemY;
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        pages.push(lines.join('\n'));
      }
      return pages.join('\n').trim();
    } finally {
      await loadingTask.destroy();
    }
  }
  const { default: mammoth } = await import('mammoth/mammoth.browser');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}

export default function CareerDNA({ profile, jobs = [], onSaveProfile, onSelectJob, onAskAI }) {
  const [form, setForm] = useState(null);
  const [activeSection, setActiveSection] = useState('personal');
  const [resumeRecords, setResumeRecords] = useState([]);
  const [selectedResume, setSelectedResume] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [resumeWorking, setResumeWorking] = useState(false);
  const [resumeStatus, setResumeStatus] = useState('Loading saved resumes...');
  const [resumeError, setResumeError] = useState('');
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [analysisWorking, setAnalysisWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const fileInput = useRef(null);
  const profileCardRef = useRef(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      fullName: profile.fullName || profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      location: profile.location || '',
      linkedIn: profile.linkedIn || '',
      github: profile.github || '',
      portfolio: profile.portfolio || '',
      objective: profile.objective || '',
      skills: (profile.existingSkills || []).map(skill => `${skill.name}|${skill.confidence || 'self-declared'}`).join('\n'),
      interests: (profile.interests || []).join(', '),
      goals: (profile.learningGoals || []).join(', '),
      roles: (profile.preferredRoles || []).join(', '),
      preferredLocations: (profile.preferredLocations || []).join(', '),
      workplacePreference: profile.workplacePreference || '',
      employmentPreference: profile.employmentPreference || '',
      availability: profile.availability || '',
      yearsExperience: profile.yearsExperience ?? '',
      authorization: (profile.workAuthorizationCountries || []).join(', '),
      weeklyBudgetHours: profile.weeklyBudgetHours ?? 5,
      maxEffortMinutes: profile.maxEffortMinutes ?? 90,
      education: recordText(profile.education),
      projects: recordText(profile.projects),
      experience: recordText(profile.experience),
      achievements: recordText(profile.achievements)
    });
  }, [profile]);

  useEffect(() => {
    api('/profile/resumes')
      .then(records => {
        setResumeRecords(records);
        setResumeStatus(records.length ? 'Saved resume versions are available below.' : 'No resume versions saved yet.');
      })
      .catch(error => {
        setResumeStatus('Unable to load saved resumes.');
        setResumeError(error.message);
      });
  }, []);

  const update = (name, value) => setForm(current => ({ ...current, [name]: value }));
  const skills = useMemo(() => String(form?.skills || '').split('\n').map(line => {
    const [name, confidence = 'self-declared'] = line.split('|');
    return { name: name.trim(), confidence: confidence.trim() };
  }).filter(skill => skill.name), [form?.skills]);
  const skillMix = useMemo(() => {
    const distinctSkills = [...new Map(skills.map(skill => [normalizeSkill(skill.name), skill.name])).values()];
    const visibleSkills = distinctSkills.length > 8 ? [...distinctSkills.slice(0, 7), 'Other skills'] : distinctSkills;
    return visibleSkills.map((name, index) => ({
      name,
      count: name === 'Other skills' ? distinctSkills.length - 7 : 1,
      color: skillMixColors[index]
    }));
  }, [skills]);
  const skillAreas = useMemo(() => {
    const areas = new Map();
    const distinctSkills = [...new Map(skills.map(skill => [normalizeSkill(skill.name), skill.name])).values()];
    distinctSkills.forEach(name => {
      const normalizedName = normalizeSkill(name);
      const match = skillAreaKeywords.find(({ terms }) => terms.some(term => {
        const normalizedTerm = normalizeSkill(term);
        return normalizedName === normalizedTerm || (normalizedTerm.length >= 4 && normalizedName.includes(normalizedTerm));
      }));
      const area = match?.area || 'Other';
      if (!areas.has(area)) areas.set(area, { area, color: match?.color || '#64748b', skills: [] });
      areas.get(area).skills.push(name);
    });
    return [...areas.values()].sort((left, right) => right.skills.length - left.skills.length || left.area.localeCompare(right.area));
  }, [skills]);
  const largestSkillArea = Math.max(0, ...skillAreas.map(area => area.skills.length));
  const skillMixTotal = skillMix.reduce((total, item) => total + item.count, 0);
  let skillMixOffset = 0;
  const skillMixGradient = skillMix.map(item => {
    const start = skillMixOffset / skillMixTotal * 100;
    skillMixOffset += item.count;
    const end = skillMixOffset / skillMixTotal * 100;
    return `${item.color} ${start}% ${end}%`;
  }).join(', ');
  const profileSkillNames = useMemo(() => new Set(skills
    .filter(skill => ['verified', 'self-declared'].includes(skill.confidence))
    .map(skill => normalizeSkill(skill.name))
    .filter(Boolean)), [skills]);
  const preferredRoleNames = useMemo(
    () => String(form?.roles || '').split(',').map(role => normalizeSkill(role)).filter(Boolean),
    [form?.roles]
  );
  const comparableJobs = jobs.filter(job => (job.requiredSkills || []).length || (job.skills || []).length);
  const usingSampleJobs = comparableJobs.length === 0;
  const roleFitJobs = usingSampleJobs ? SAMPLE_JOBS : comparableJobs;
  const roleFit = useMemo(() => {
    const roles = new Map();
    roleFitJobs.forEach(job => {
      const requiredSkills = [...new Set((job.requiredSkills || []).map(normalizeSkill).filter(Boolean))];
      const listedSkills = [...new Set((job.skills || []).map(normalizeSkill).filter(Boolean))];
      const comparedSkills = requiredSkills.length ? requiredSkills : listedSkills;
      if (!comparedSkills.length) return;
      const title = String(job.title || 'Untitled role').trim();
      const key = normalizeSkill(title);
      if (!roles.has(key)) roles.set(key, { title, listings: 0, required: 0, matched: 0, taggedOnlyListings: 0, gaps: new Map() });
      const role = roles.get(key);
      role.listings += 1;
      if (!requiredSkills.length) role.taggedOnlyListings += 1;
      comparedSkills.forEach(skill => {
        role.required += 1;
        if (profileSkillNames.has(skill)) role.matched += 1;
        else {
          const label = [...(job.requiredSkills || []), ...(job.skills || [])].find(item => normalizeSkill(item) === skill) || skill;
          role.gaps.set(label, (role.gaps.get(label) || 0) + 1);
        }
      });
    });
    return [...roles.values()]
      .map(role => ({
        ...role,
        score: Math.round(role.matched / role.required * 100),
        preferred: preferredRoleNames.some(preferred => normalizeSkill(role.title).includes(preferred) || preferred.includes(normalizeSkill(role.title))),
        missingSkills: [...role.gaps.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([skill]) => skill)
      }))
      .sort((left, right) => right.score - left.score || right.listings - left.listings || left.title.localeCompare(right.title))
      .slice(0, 5);
  }, [roleFitJobs, profileSkillNames, preferredRoleNames]);

  const submitProfile = async event => {
    event.preventDefault();
    setSaving(true);
    setSavedNotice('');
    try {
      const saved = await onSaveProfile({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        linkedIn: form.linkedIn.trim(),
        github: form.github.trim(),
        portfolio: form.portfolio.trim(),
        objective: form.objective.trim(),
        workplacePreference: form.workplacePreference,
        employmentPreference: form.employmentPreference,
        availability: form.availability.trim(),
        existingSkills: skills.filter(skill => ['verified', 'self-declared', 'learning'].includes(skill.confidence)),
        interests: form.interests.split(',').map(value => value.trim()).filter(Boolean),
        learningGoals: form.goals.split(',').map(value => value.trim()).filter(Boolean),
        preferredRoles: form.roles.split(',').map(value => value.trim()).filter(Boolean),
        preferredLocations: form.preferredLocations.split(',').map(value => value.trim()).filter(Boolean),
        yearsExperience: form.yearsExperience === '' ? null : Number(form.yearsExperience),
        workAuthorizationCountries: form.authorization.split(',').map(value => value.trim()).filter(Boolean),
        weeklyBudgetHours: Number(form.weeklyBudgetHours),
        maxEffortMinutes: Number(form.maxEffortMinutes),
        education: parseRecords(form.education),
        projects: parseRecords(form.projects),
        experience: parseRecords(form.experience),
        achievements: parseRecords(form.achievements)
      });
      if (saved !== false) {
        setSavedNotice('Your profile changes have been saved.');
        window.setTimeout(() => setSavedNotice(''), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const selectResume = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setResumeError('');
    setSelectedResume(null);
    setResumeText('');
    setResumeAnalysis(null);
    setAnalysisConsent(false);
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setResumeStatus('Choose a supported resume file.');
      setResumeError('Choose a PDF or DOCX file smaller than 10 MB.');
      return;
    }
    setResumeWorking(true);
    setResumeStatus('Reading resume text in your browser...');
    try {
      const extractedText = await extractResumeText(file);
      if (extractedText.length < 30) {
        throw new Error('No readable text was found. This may be a scanned resume; please use a text-based PDF or DOCX file.');
      }
      if (extractedText.length > 200000) {
        throw new Error('The extracted resume text is too long to analyze. Please upload a shorter version.');
      }
      setResumeText(extractedText);
      setResumeAnalysis(null);
      setAnalysisConsent(false);
      setResumeStatus('Resume text is ready. Confirm consent below to extract profile details.');
      const record = await api('/profile/resumes', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, originalText: '' })
      });
      setSelectedResume(record);
      setResumeRecords(current => [record, ...current]);
      setResumeStatus('Resume version saved. Confirm consent below to extract profile details.');
    } catch (error) {
      setResumeStatus('Unable to read or save this resume.');
      setResumeError(error.message);
    } finally {
      setResumeWorking(false);
    }
  };

  const analyzeResume = async () => {
    if (!selectedResume || !analysisConsent || !resumeText.trim()) return;
    setAnalysisWorking(true);
    setResumeError('');
    setResumeStatus('Extracting profile details...');
    try {
      const result = await api(`/profile/resumes/${selectedResume.id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ resumeText, consentAccepted: true })
      });
      setResumeAnalysis(result);
      setResumeStatus('Details extracted. Review and edit the profile fields below before saving.');
      setResumeRecords(current => current.map(item => item.id === selectedResume.id ? { ...item, extractionStatus: 'complete' } : item));
      const personal = result.personalInfo || {};
      const preferences = result.careerPreferences || {};
      const extractedSkills = [...asList(result.technicalSkills), ...asList(result.softSkills)]
        .map(skill => typeof skill === 'string' ? skill.trim() : firstText(skill?.name))
        .filter(Boolean);
      const fillText = (currentValue, ...values) => firstText(currentValue, ...values);
      setForm(current => ({
        ...current,
        fullName: fillText(personal.fullName, personal.name, [personal.firstName, personal.lastName].filter(Boolean).join(' '), current.fullName),
        email: fillText(personal.email, current.email),
        phone: fillText(personal.phone, personal.phoneNumber, current.phone),
        location: fillText(personal.location, personal.city, personal.address, current.location),
        linkedIn: fillText(personal.linkedIn, personal.linkedin, personal.linkedInUrl, personal.linkedinUrl, personal.linkedin_url, current.linkedIn),
        github: fillText(personal.github, personal.githubUrl, personal.github_url, current.github),
        portfolio: fillText(personal.portfolio, current.portfolio),
        objective: fillText(personal.summary, personal.objective, personal.professionalSummary, current.objective),
        education: mergeRecordLines(current.education, recordLines(result.education)),
        experience: mergeRecordLines(current.experience, recordLines(result.experience)),
        projects: mergeRecordLines(current.projects, recordLines(result.projects)),
        achievements: mergeRecordLines(current.achievements, recordLines([...(asList(result.achievements)), ...(asList(result.certifications))])),
        skills: mergeSkillLines(current.skills, [...new Set(extractedSkills)].map(skill => `${skill}|self-declared`).join('\n')),
        interests: mergeCommaValues(current.interests, preferences.interests),
        goals: mergeCommaValues(current.goals, preferences.learningGoals || preferences.goals),
        roles: mergeCommaValues(current.roles, preferences.preferredRoles || preferences.roles),
        preferredLocations: mergeCommaValues(current.preferredLocations, preferences.preferredLocations || preferences.locations),
        workplacePreference: fillText(current.workplacePreference, preferences.workplacePreference),
        employmentPreference: fillText(current.employmentPreference, preferences.employmentPreference),
        availability: fillText(current.availability, preferences.availability)
      }));
      setActiveSection('personal');
      setSavedNotice('Resume details added to your editable profile draft. Review each section and save your changes.');
    } catch (error) {
      setResumeStatus('Could not extract profile details.');
      setResumeError(error.message);
    } finally {
      setAnalysisWorking(false);
    }
  };

  const removeResume = async id => {
    try {
      await api(`/profile/resumes/${id}`, { method: 'DELETE' });
      setResumeRecords(current => current.filter(item => item.id !== id));
      if (selectedResume?.id === id) {
        setSelectedResume(null);
        setResumeAnalysis(null);
      }
      setResumeStatus('Resume version removed.');
    } catch (error) {
      setResumeError(error.message);
    }
  };

  if (!form) return <div className="card loading-card">Loading profile...</div>;

  const sectionHasData = id => {
    if (id === 'personal') return Boolean(form.fullName || form.email || form.phone || form.location || form.linkedIn || form.github || form.portfolio);
    if (id === 'academics') return parseRecords(form.education).length > 0;
    if (id === 'experience') return parseRecords(form.experience).length > 0;
    if (id === 'projects') return parseRecords(form.projects).length > 0 || parseRecords(form.achievements).length > 0;
    if (id === 'skills') return skills.length > 0;
    if (id === 'preferences') return Boolean(form.roles || form.preferredLocations || form.interests || form.goals || form.authorization || form.employmentPreference);
    return resumeRecords.length > 0;
  };
  const completeness = Math.round(profileSections.filter(sectionHasData).length / profileSections.length * 100);

  const renderRecordField = (name, label, placeholder) => (
    <label className="form-label" htmlFor={`career-${name}`}>
      {label}
      <span className="career-field-hint">One item per line. Use “Title | Details” to add context.</span>
      <textarea id={`career-${name}`} rows="5" value={form[name]} onChange={event => update(name, event.target.value)} placeholder={placeholder} />
    </label>
  );

  const renderSection = () => {
    switch (activeSection) {
      case 'academics':
        return <>
          <div className="career-editor-heading"><div><h2>Academics</h2><p>Add your education, degrees, certifications, or coursework.</p></div><Badge>{parseRecords(form.education).length ? `${parseRecords(form.education).length} saved` : 'Not added'}</Badge></div>
          {renderRecordField('education', 'Education and qualifications', 'BSc Computer Science | University name, 2022–2026')}
        </>;
      case 'experience':
        return <>
          <div className="career-editor-heading"><div><h2>Experience</h2><p>Share roles, internships, volunteering, or other relevant experience.</p></div><Badge>{parseRecords(form.experience).length ? `${parseRecords(form.experience).length} saved` : 'Not added'}</Badge></div>
          {renderRecordField('experience', 'Work experience', 'Frontend Developer | Company name, dates, and key contributions')}
          <label className="form-label" htmlFor="career-yearsExperience">Total years of experience<input id="career-yearsExperience" type="number" min="0" max="60" value={form.yearsExperience} onChange={event => update('yearsExperience', event.target.value)} /></label>
        </>;
      case 'projects':
        return <>
          <div className="career-editor-heading"><div><h2>Projects and achievements</h2><p>Highlight work and outcomes that support your career story.</p></div><Badge>{parseRecords(form.projects).length + parseRecords(form.achievements).length ? 'Saved' : 'Not added'}</Badge></div>
          {renderRecordField('projects', 'Projects', 'Career dashboard | Built a React application to track job applications')}
          {renderRecordField('achievements', 'Achievements', 'Hackathon finalist | Placed in the top 10 teams')}
        </>;
      case 'skills':
        return <>
          <div className="career-editor-heading"><div><h2>Skills</h2><p>Keep skills candidate-confirmed. Resume-extracted skills remain drafts until you save them.</p></div><Badge>{skills.length} skills</Badge></div>
          <label className="form-label" htmlFor="career-skills">Skill inventory<span className="career-field-hint">One skill per line: Skill | verified, self-declared, or learning</span><textarea id="career-skills" rows="9" value={form.skills} onChange={event => update('skills', event.target.value)} placeholder={'React | verified\nTypeScript | learning'} /></label>
          {skills.length > 0 && <div className="skill-inventory">{skills.map(skill => <span className={`skill-chip ${skill.confidence}`} key={`${skill.name}-${skill.confidence}`}>{skill.name}<small>{confidenceLabel(skill.confidence)}</small></span>)}</div>}
        </>;
      case 'preferences':
        return <>
          <div className="career-editor-heading"><div><h2>Career preferences</h2><p>Personalize your job recommendations and time budget.</p></div><Badge>{sectionHasData('preferences') ? 'Saved' : 'Not added'}</Badge></div>
          <div className="form-grid-2">
            <label className="form-label" htmlFor="career-roles">Preferred roles<input id="career-roles" value={form.roles} onChange={event => update('roles', event.target.value)} placeholder="Frontend Engineer, Product Designer" /></label>
            <label className="form-label" htmlFor="career-preferredLocations">Preferred locations<input id="career-preferredLocations" value={form.preferredLocations} onChange={event => update('preferredLocations', event.target.value)} placeholder="Bengaluru, Remote" /></label>
            <label className="form-label" htmlFor="career-employmentPreference">Employment type<select id="career-employmentPreference" value={form.employmentPreference} onChange={event => update('employmentPreference', event.target.value)}><option value="">Select an option</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></label>
            <label className="form-label" htmlFor="career-workplacePreference">Workplace preference<select id="career-workplacePreference" value={form.workplacePreference} onChange={event => update('workplacePreference', event.target.value)}><option value="">Select an option</option><option>Remote</option><option>Hybrid</option><option>On-site</option><option>Flexible</option></select></label>
            <label className="form-label" htmlFor="career-availability">Availability<input id="career-availability" value={form.availability} onChange={event => update('availability', event.target.value)} placeholder="Immediately, 30 days" /></label>
            <label className="form-label" htmlFor="career-authorization">Work authorization countries<input id="career-authorization" value={form.authorization} onChange={event => update('authorization', event.target.value)} placeholder="India, United States" /></label>
            <label className="form-label" htmlFor="career-interests">Interests<input id="career-interests" value={form.interests} onChange={event => update('interests', event.target.value)} placeholder="Web development, AI applications" /></label>
            <label className="form-label" htmlFor="career-goals">Learning goals<input id="career-goals" value={form.goals} onChange={event => update('goals', event.target.value)} placeholder="Python, machine learning" /></label>
            <label className="form-label" htmlFor="career-weeklyBudgetHours">Weekly application time budget (hours)<input id="career-weeklyBudgetHours" type="number" min="1" max="60" value={form.weeklyBudgetHours} onChange={event => update('weeklyBudgetHours', event.target.value)} /></label>
            <label className="form-label" htmlFor="career-maxEffortMinutes">Maximum effort per application (minutes)<input id="career-maxEffortMinutes" type="number" min="10" max="480" value={form.maxEffortMinutes} onChange={event => update('maxEffortMinutes', event.target.value)} /></label>
          </div>
        </>;
      case 'resume':
        return <>
          <div className="career-editor-heading"><div><h2>Resume</h2><p>Review saved resume versions or register an updated version.</p></div><Badge>{resumeRecords.length} saved</Badge></div>
          <p className="career-resume-status">{resumeStatus}</p>
          <button className="btn btn-secondary" type="button" onClick={() => fileInput.current?.click()}>Choose a resume at the top of this page</button>
          <p className="muted sm">Uploaded resume versions are listed here. Add a new version from the resume import panel above.</p>
          {resumeRecords.length > 0 ? <div className="career-resume-list">{resumeRecords.map(record => <div className="resume-record" key={record.id}><div><strong>{record.fileName || 'Resume file'}</strong><span className="muted sm">{record.extractionStatus || 'Saved'} · {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : 'Saved resume'}</span></div><button className="btn btn-sm" type="button" onClick={() => removeResume(record.id)}>Remove</button></div>)}</div> : <div className="career-empty-state"><strong>No resume added yet</strong><span>You can add a PDF or DOCX resume now, or come back and add one later.</span></div>}
          {selectedResume && <div className="resume-analysis">
            <p className="muted sm">Resume file details are saved as a version record. Paste its text below only if you want to run evidence-aware analysis.</p>
            <p className="muted sm">The extracted text is available in the resume import panel above. Analysis requires your consent there.</p>
            {resumeAnalysis && <div className="extraction-review"><div className="section-heading"><h3>Resume extraction draft</h3><Badge kind="warn">Review before saving</Badge></div><p className="muted sm">Extracted details have been added to the editable profile sections. Skills are marked self-declared.</p><div className="skill-inventory">{(resumeAnalysis.technicalSkills || []).map(skill => <span className="skill-chip self-declared" key={skill.name}>{skill.name}<small>{skill.evidenceQuote || 'No exact quote'}</small></span>)}</div><button className="btn btn-secondary" type="button" onClick={() => setActiveSection('skills')}>Review skills section</button></div>}
          </div>}
        </>;
      default:
        return <>
          <div className="career-editor-heading"><div><h2>Personal details</h2><p>Keep your contact and professional profile information current.</p></div><Badge>{sectionHasData('personal') ? 'Saved' : 'Not added'}</Badge></div>
          <div className="form-grid-2">
            <label className="form-label" htmlFor="career-fullName">Full name<input id="career-fullName" value={form.fullName} onChange={event => update('fullName', event.target.value)} /></label>
            <label className="form-label" htmlFor="career-email">Email<input id="career-email" type="email" value={form.email} onChange={event => update('email', event.target.value)} /></label>
            <label className="form-label" htmlFor="career-phone">Phone<input id="career-phone" type="tel" value={form.phone} onChange={event => update('phone', event.target.value)} /></label>
            <label className="form-label" htmlFor="career-location">Location<input id="career-location" value={form.location} onChange={event => update('location', event.target.value)} placeholder="City, country" /></label>
            <label className="form-label" htmlFor="career-linkedIn">LinkedIn URL<input id="career-linkedIn" type="url" value={form.linkedIn} onChange={event => update('linkedIn', event.target.value)} placeholder="https://linkedin.com/in/..." /></label>
            <label className="form-label" htmlFor="career-github">GitHub URL<input id="career-github" type="url" value={form.github} onChange={event => update('github', event.target.value)} placeholder="https://github.com/..." /></label>
            <label className="form-label" htmlFor="career-portfolio">Portfolio URL<input id="career-portfolio" type="url" value={form.portfolio} onChange={event => update('portfolio', event.target.value)} placeholder="https://..." /></label>
          </div>
          <label className="form-label" htmlFor="career-objective">Career summary<textarea id="career-objective" rows="4" value={form.objective} onChange={event => update('objective', event.target.value)} placeholder="A short introduction about your experience and career goals." /></label>
        </>;
    }
  };

  const sectionStatus = id => id === 'resume'
    ? resumeRecords.length ? `${resumeRecords.length} saved` : 'Add details'
    : sectionHasData(id) ? 'Added' : 'Add details';

  const completionChecklist = [
    { label: 'Full name', value: form.fullName, section: 'personal', action: 'Update personal details' },
    { label: 'Email', value: form.email, section: 'personal', action: 'Add email' },
    { label: 'Location', value: form.location, section: 'personal', action: 'Add location' },
    { label: 'Career summary', value: form.objective, section: 'personal', action: 'Add career summary' },
    { label: 'Skills', value: form.skills, section: 'skills', action: 'Add skills' },
    { label: 'Interests', value: form.interests, section: 'preferences', action: 'Add interests' },
    { label: 'Preferred roles', value: form.roles, section: 'preferences', action: 'Choose preferred roles' },
    { label: 'Learning goals', value: form.goals, section: 'preferences', action: 'Add learning goals' }
  ].map(item => ({ ...item, complete: Boolean(String(item.value || '').trim()) }));
  const completedProfileDetails = completionChecklist.filter(item => item.complete).length;
  const profileCompleteness = Math.round(completedProfileDetails / completionChecklist.length * 100);
  const strongestRole = roleFit[0];
  const timeline = [
    ...parseRecords(form.education).map(item => ({ ...item, type: 'Education', section: 'academics' })),
    ...parseRecords(form.experience).map(item => ({ ...item, type: 'Experience', section: 'experience' })),
    ...parseRecords(form.projects).map(item => ({ ...item, type: 'Project', section: 'projects' })),
    ...parseRecords(form.achievements).map(item => ({ ...item, type: 'Achievement', section: 'projects' }))
  ];
  const navigateToProfileSection = section => {
    setActiveSection(section);
    setSavedNotice('');
    profileCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const pathways = ['bridge', 'growth', 'stretch'].map(category => ({ category, jobs: jobs.filter(job => job.category === category) }));

  return <div className="career-dna-page animate-fade-in">
    <div className="page-header-row"><div><h1 className="page-title">Profile</h1><p className="page-subtitle">Build your profile one section at a time. Your saved details stay editable and can be updated whenever you need.</p></div><Badge kind="blue">{completeness}% complete</Badge></div>

    <section className="career-resume-import card" aria-labelledby="career-resume-import-title">
      <div className="career-resume-import-copy">
        <span className="section-eyebrow">START WITH YOUR RESUME</span>
        <h2 id="career-resume-import-title">Fill your profile from a resume</h2>
        <p>Upload a PDF or DOCX to extract profile details in your browser. With your consent, the text is sent for extraction; we’ll add the results to the editable sections below and preserve your existing information.</p>
      </div>
      <input ref={fileInput} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={selectResume} hidden />
      <div className="career-resume-import-actions">
        <div className="career-resume-import-row">
          <button className="btn btn-primary" type="button" disabled={resumeWorking || analysisWorking} onClick={() => fileInput.current?.click()}>{resumeWorking ? 'Reading resume...' : selectedResume ? 'Choose a different resume' : 'Upload resume'}</button>
          {resumeRecords.length > 0 && <button className="btn btn-secondary" type="button" onClick={() => setActiveSection('resume')}>{resumeRecords.length} saved {resumeRecords.length === 1 ? 'version' : 'versions'}</button>}
        </div>
        {selectedResume && <div className="career-resume-selected"><strong>{selectedResume.fileName}</strong><span>{Math.max(1, Math.ceil(resumeText.length / 1000))}k characters read · profile details will remain editable</span></div>}
        {selectedResume && <label className="career-resume-consent"><input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} /><span>I agree to send the extracted resume text to the configured AI provider to fill my profile. I can review and edit every detail before saving.</span></label>}
        {selectedResume && <button className="btn btn-secondary career-resume-extract" type="button" disabled={!analysisConsent || !resumeText.trim() || analysisWorking || resumeWorking} onClick={analyzeResume}>{analysisWorking ? 'Extracting profile details...' : 'Extract details and fill profile'}</button>}
        <p className="career-resume-status" role="status">{resumeStatus}</p>
        {resumeError && <div className="notice notice-error">{resumeError}</div>}
      </div>
    </section>

    <form ref={profileCardRef} className="career-profile-card card" onSubmit={submitProfile}>
      <aside className="career-profile-nav" aria-label="Profile sections">
        <div className="career-profile-nav-heading"><span className="section-eyebrow">YOUR PROFILE</span><strong>Profile sections</strong></div>
        {profileSections.map(section => <button key={section.id} type="button" title={section.description} className={`career-profile-nav-item ${activeSection === section.id ? 'active' : ''}`} aria-current={activeSection === section.id ? 'page' : undefined} onClick={() => { setActiveSection(section.id); setSavedNotice(''); }}>
          <span className="career-profile-nav-label">{section.label}</span>
          <span className={`career-profile-nav-status ${sectionStatus(section.id).includes('saved') || sectionStatus(section.id) === 'Added' ? 'has-data' : ''}`}>{sectionStatus(section.id)}</span>
        </button>)}
        <div className="career-profile-nav-progress"><div className="career-profile-progress-label"><span>Profile progress</span><strong>{profileCompleteness}%</strong></div><div className="capacity-track"><span style={{ width: `${profileCompleteness}%` }} /></div></div>
      </aside>

      <section className="career-profile-editor" aria-live="polite">
        {savedNotice && <div className="notice notice-success">{savedNotice}</div>}
        <div className="career-profile-editor-content">{renderSection()}</div>
        <div className="career-profile-editor-footer"><span className="muted sm">You can return to any section and update it later.</span><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
      </section>
    </form>

    <div className="analytics-grid">
      <section className="card analytics-card">
        <div className="section-heading"><div><h2>Skill inventory</h2><p className="muted sm">Candidate-maintained competency signals</p></div><Badge>{skills.length} skills</Badge></div>
        <div className="skill-inventory">{skills.map(skill => <span className={`skill-chip ${skill.confidence}`} key={`${skill.name}-${skill.confidence}`}>{skill.name}<small>{confidenceLabel(skill.confidence)}</small></span>)}{!skills.length && <p className="muted">Add skills in your profile to build your inventory.</p>}</div>
        {skillMix.length > 0 && <div className="skill-mix">
          <div className="skill-mix-heading"><strong>Technology mix</strong><span>Share of distinct listed skills</span></div>
          <div className="skill-mix-visual">
            <div className="skill-mix-donut" role="img" aria-label={`Skill mix by distinct listed skills: ${skillMix.map(item => `${item.name}, ${Math.round(item.count / skillMixTotal * 100)} percent`).join('; ')}`} style={{ background: `conic-gradient(${skillMixGradient})` }}>
              <div className="skill-mix-center"><strong>{skillMixTotal}</strong><span>skills</span></div>
            </div>
            <ul className="skill-mix-legend">
              {skillMix.map(item => <li key={item.name}><span className="skill-mix-swatch" style={{ backgroundColor: item.color }} /><span className="skill-mix-name">{item.name}</span><strong>{Math.round(item.count / skillMixTotal * 100)}%</strong></li>)}
            </ul>
          </div>
          <p className="skill-mix-note">Each distinct skill counts once. This shows profile composition, not usage frequency or proficiency.</p>
        </div>}
        {skillAreas.length > 0 && <div className="skill-areas">
          <div className="skill-areas-heading"><strong>Technology areas</strong><span>Grouped by common use</span></div>
          <div className="skill-areas-list">
            {skillAreas.map(area => <div className="skill-area-row" key={area.area}>
              <div className="skill-area-label"><span>{area.area}</span><strong>{area.skills.length}</strong></div>
              <div className="skill-area-track" aria-hidden="true"><span style={{ width: `${area.skills.length / largestSkillArea * 100}%`, backgroundColor: area.color }} /></div>
              <p>{area.skills.join(', ')}</p>
            </div>)}
          </div>
          <p className="skill-mix-note">Categories are inferred from skill names; check the listed skills for accuracy.</p>
        </div>}
      </section>
      <section className="card analytics-card role-fit-card">
        <div className="section-heading">
          <div><h2>Role fit analysis</h2><p className="muted sm">Skill overlap with job-listed skills</p></div>
          <Badge kind={strongestRole ? 'blue' : 'neutral'}>{roleFit.length ? usingSampleJobs ? 'Sample roles' : `${roleFit.length} roles` : 'Not assessed'}</Badge>
        </div>
        {strongestRole ? <>
          <div className="role-fit-best">
            <span className="role-fit-overline">{usingSampleJobs ? 'CURATED SAMPLE ROLE ALIGNMENT' : 'STRONGEST SKILL ALIGNMENT'}</span>
            <strong>{strongestRole.title}</strong>
            <span>{strongestRole.score}% skill overlap{strongestRole.preferred ? ' · matches a preferred role' : ''}</span>
          </div>
          <div className="role-fit-chart" role="img" aria-label={`Job-listed skill overlap by role: ${roleFit.map(role => `${role.title} ${role.score}%`).join(', ')}`}>
            {roleFit.map(role => <div className="role-fit-row" key={normalizeSkill(role.title)}>
              <div className="role-fit-row-header"><span title={role.title}>{role.title}</span><strong>{role.score}%</strong></div>
              <div className="role-fit-track"><span className={role.score >= 70 ? 'role-fit-high' : role.score >= 35 ? 'role-fit-mid' : 'role-fit-low'} style={{ width: `${role.score}%` }} /></div>
              <small>{role.matched} of {role.required} compared skills across {role.listings} {role.listings === 1 ? 'listing' : 'listings'}{role.taggedOnlyListings ? ` · ${role.taggedOnlyListings} listing${role.taggedOnlyListings === 1 ? '' : 's'} use skill tags` : ''}{role.preferred ? ' · preferred' : ''}</small>
            </div>)}
          </div>
          <div className="role-fit-review">
            <strong>Honest review</strong>
            <p>{strongestRole.score === 100
              ? `The profile lists every compared skill for ${strongestRole.title} in the reviewed listings. This is a skills comparison only, not a prediction of shortlisting.`
              : `The strongest detected skill overlap is for ${strongestRole.title}. ${strongestRole.missingSkills.length ? `Common skills not listed on the profile include ${strongestRole.missingSkills.join(', ')}.` : ''} Add evidence or experience where accurate. This score does not estimate shortlisting.`}</p>
          </div>
          <p className="role-fit-disclaimer">{usingSampleJobs
            ? 'No active job listings with comparable skills are available, so this chart uses curated sample roles as an example. It is not an assessment against current vacancies and does not predict hiring or shortlisting.'
            : 'Based on verified and self-declared profile skills compared with explicit requirements when available, or skill tags otherwise. Skill tags are not necessarily mandatory. This does not predict hiring or shortlisting.'}</p>
        </> : <div className="career-empty-state"><strong>Role fit is not assessed yet</strong><span>{profileSkillNames.size ? 'There are no current job listings with comparable skill requirements or tags.' : 'Add verified or self-declared skills and review jobs with listed skills to see a grounded comparison.'}</span></div>}
      </section>
    </div>

    <section className="card career-profile-completeness" aria-labelledby="career-completeness-title">
      <div className="section-heading">
        <div><h2 id="career-completeness-title">Profile completeness</h2><p className="muted sm">A live checklist of profile details you can add or update. This is not a hiring prediction.</p></div>
        <div className="career-completeness-score"><strong>{profileCompleteness}%</strong><Badge>{completedProfileDetails} of {completionChecklist.length} complete</Badge></div>
      </div>
      <div className="capacity-track" role="progressbar" aria-label="Profile completeness" aria-valuemin="0" aria-valuemax="100" aria-valuenow={profileCompleteness}><span style={{ width: `${profileCompleteness}%` }} /></div>
      {completedProfileDetails === completionChecklist.length
        ? <p className="career-completeness-done">Your core profile details are complete. Keep them current as your experience and goals change.</p>
        : <div className="career-completeness-next">
          <strong>Good next steps</strong>
          <div className="career-completeness-actions">
            {completionChecklist.filter(item => !item.complete).slice(0, 3).map(item => <button key={item.label} type="button" className="career-completeness-action" onClick={() => navigateToProfileSection(item.section)}><span>{item.action}</span><span aria-hidden="true">Edit</span></button>)}
          </div>
          {completionChecklist.filter(item => !item.complete).length > 3 && <span className="career-completeness-more">Plus {completionChecklist.filter(item => !item.complete).length - 3} more details to add</span>}
        </div>}
    </section>
    <section className="card career-evidence-timeline" aria-labelledby="career-evidence-title">
      <div className="section-heading">
        <div><h2 id="career-evidence-title">Evidence timeline</h2><p className="muted sm">Education, experience, projects, and achievements from your profile.</p></div>
        <Badge>{timeline.length} {timeline.length === 1 ? 'record' : 'records'}</Badge>
      </div>
      {timeline.length
        ? <><div className="activity-timeline">{timeline.map((item, index) => <div className="activity-item" key={`${item.type}-${item.title}-${index}`}><span className="activity-dot" /><div className="activity-item-content"><div className="activity-item-heading"><strong>{item.title}</strong><Badge>{item.type}</Badge></div><p className="muted sm">{item.details || 'Add details to highlight this experience.'}</p></div><button className="btn btn-subtle btn-xs activity-edit" type="button" onClick={() => navigateToProfileSection(item.section)}>Edit</button></div>)}</div><p className="career-timeline-hint">This preview updates as you edit your profile. Save changes above to keep your updates.</p></>
        : <div className="career-timeline-empty">
          <span className="career-timeline-empty-icon" aria-hidden="true">+</span>
          <strong>Your career story starts here</strong>
          <p>Add education, work experience, or projects to build a timeline you can review and update anytime.</p>
          <div className="career-timeline-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => navigateToProfileSection('academics')}>Add education</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => navigateToProfileSection('experience')}>Add experience</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => navigateToProfileSection('projects')}>Add a project</button>
          </div>
        </div>}
    </section>

    <section className="pathway-cards-grid">
      {pathways.map(({ category, jobs: categoryJobs }) => (
        <article className={`pathway-card pathway-${category} hover-lift`} key={category}>
          <div className="pathway-header">
            <Badge>{category === 'bridge' ? 'Bridge Roles' : category === 'growth' ? 'Growth Roles' : 'Stretch Roles'}</Badge>
            <span className="pathway-count">{categoryJobs.length} matches</span>
          </div>
          <h3>{category === 'bridge' ? 'Immediate transition' : category === 'growth' ? 'Skill expansion' : 'Long-term trajectory'}</h3>
          <p className="muted sm">Missing skills are growth signals, not automatic disqualifications.</p>
          {categoryJobs.slice(0, 2).map(job => (
            <div className="pathway-job-actions" key={job.id}>
              <button className="pathway-job-item" type="button" onClick={() => onSelectJob?.(job)}>
                {job.title}<span>{job.company}</span>
              </button>
              {onAskAI && (
                <button className="btn btn-secondary btn-xs" type="button" onClick={() => onAskAI(job)}>
                  Ask AI
                </button>
              )}
            </div>
          ))}
        </article>
      ))}
    </section>
  </div>;
}
