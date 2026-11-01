import React, { useEffect, useMemo, useState } from 'react';
import Badge from '../components/Badge';

const NOTES_STORAGE_KEY = 'careerpilot_interview_prep_notes';
const DESCRIPTION_SKILL_TERMS = [
  'JavaScript', 'TypeScript', 'React', 'React Native', 'Angular', 'Vue', 'Node.js', 'Express',
  'Python', 'Java', 'C#', '.NET', 'Go', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'Dart',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'PySpark', 'Apache Spark', 'ETL', 'ADLS',
  'Azure Databricks', 'Unity Catalog', 'Azure', 'AWS', 'Amazon Web Services',
  'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'REST APIs',
  'GraphQL', 'Playwright', 'Selenium', 'Cypress', 'Jest', 'Machine Learning',
  'Deep Learning', 'TensorFlow', 'PyTorch', 'Power BI', 'Tableau', 'Linux', 'Git'
];

const cleanLabel = value => String(value || '')
  .replace(/\u00e2\u20ac\u201d/g, '—')
  .replace(/\u00e2\u20ac\u2013/g, '–')
  .replace(/\u00e2\u20ac\u2122/g, '’')
  .replace(/\u00e2\u20ac\u02dc/g, '‘')
  .replace(/\u00e2\u20ac\u0153/g, '“')
  .replace(/\u00e2\u20ac\u009d/g, '”')
  .replace(/\u00e2\u0080\u0094/g, '—')
  .replace(/\u00e2\u0080\u0093/g, '–')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeSkill = value => cleanLabel(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
const formatStatus = value => cleanLabel(value)
  .replace(/[_-]+/g, ' ')
  .toLowerCase()
  .replace(/(^|\s)\S/g, letter => letter.toUpperCase());

const asList = value => Array.isArray(value) ? value : [];
const cleanDescription = value => cleanLabel(String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' '));

const skillsMentionedInDescription = description => {
  const normalizedDescription = ` ${normalizeSkill(cleanDescription(description))} `;
  const mentioned = DESCRIPTION_SKILL_TERMS.filter(skill => {
    const term = normalizeSkill(skill);
    return term && normalizedDescription.includes(` ${term} `);
  });
  return mentioned.filter(skill => !mentioned.some(other => other !== skill
    && normalizeSkill(other).includes(` ${normalizeSkill(skill)} `)));
};

const profileRecords = (records, type) => asList(records).map(record => {
  if (typeof record === 'string') {
    const [title, ...details] = record.split('|');
    return { type, title: cleanLabel(title), details: cleanLabel(details.join('|')) };
  }
  if (!record || typeof record !== 'object') return null;
  const title = cleanLabel(record.title || record.degree || record.role || record.position || record.name || record.company || record.institution);
  const details = cleanLabel([
    record.company,
    record.institution,
    record.dates || record.period,
    record.details || record.description || record.summary
  ].filter(Boolean).join(' · '));
  return title ? { type, title, details } : null;
}).filter(Boolean);

function buildQuestionSets(job, profileSkills, profileExamples) {
  const requiredSkills = [...new Map(asList(job.requiredSkills)
    .map(skill => cleanLabel(skill))
    .filter(Boolean)
    .map(skill => [normalizeSkill(skill), skill])).values()];
  const listedSkills = [...new Map(asList(job.skills)
    .map(skill => cleanLabel(skill))
    .filter(Boolean)
    .map(skill => [normalizeSkill(skill), skill])).values()];
  const descriptionSkills = [...new Map(skillsMentionedInDescription(job.description)
    .map(skill => [normalizeSkill(skill), skill])).values()];
  const hasExplicitRequirements = requiredSkills.length > 0;
  const hasListedSkillTags = listedSkills.length > 0;
  const comparedSkills = hasExplicitRequirements ? requiredSkills : hasListedSkillTags ? listedSkills : descriptionSkills;
  const skillSource = hasExplicitRequirements ? 'explicit requirement' : hasListedSkillTags ? 'job listing skill' : 'description mention';
  const sourceLabel = hasExplicitRequirements
    ? 'Explicit requirements'
    : hasListedSkillTags
      ? 'Listing tags'
      : descriptionSkills.length
        ? 'Description mentions'
        : 'Role context';

  const technical = comparedSkills.slice(0, 8).map((skill, index) => {
    const profileSkill = profileSkills.find(item => normalizeSkill(item.name) === normalizeSkill(skill));
    const grounding = hasExplicitRequirements
      ? `The job lists ${skill} as an explicit requirement.`
      : hasListedSkillTags
        ? `The job lists ${skill} as a skill tag, though it may not be mandatory.`
        : `The job description mentions ${skill}; it does not explicitly say whether it is required.`;
    return {
      id: `technical-${normalizeSkill(skill)}`,
      topic: skill,
      source: skillSource,
      profileSignal: profileSkill?.confidence || '',
      prompt: `${grounding} How would you apply it to a problem this role is likely to handle? If you have hands-on experience, walk through a specific example; otherwise, explain how you would learn and validate your approach.`,
      guidance: 'Be clear about your role, the decisions you made, how you tested the result, and what you would improve.'
    };
  });

  const roleTitle = cleanLabel(job.title) || 'this role';
  const descriptionExcerpt = cleanDescription(job.description).slice(0, 260);
  if (!technical.length) {
    technical.push({
      id: 'technical-role-context',
      topic: descriptionExcerpt ? 'Role description prompt' : 'Role context prompt',
      source: descriptionExcerpt ? 'role description' : 'role title',
      prompt: descriptionExcerpt
        ? `The listing describes the role this way: “${descriptionExcerpt}${descriptionExcerpt.length >= 260 ? '…' : ''}” Which responsibility would you be best prepared to take on, and how would you plan, deliver, and check that work?`
        : `For a role titled ${roleTitle}, choose one responsibility you expect to encounter. How would you clarify what is needed, plan your work, and check the outcome?`,
      guidance: 'This prompt is based on the job description or title only. Confirm responsibilities against the full listing and use a truthful example from your own background.'
    });
  }

  const evidenceLabel = profileExamples.length
    ? `Choose a real example from your profile, such as ${profileExamples[0].title}.`
    : 'Choose a real example from your work, studies, volunteering, or a personal project. Add it to your profile if you want it available here.';
  const behavioral = [
    {
      id: 'behavioral-challenge',
      topic: 'Handling a challenge',
      prompt: 'Tell me about a difficult problem you had to solve. What made it challenging, what did you do, and what changed as a result?',
      guidance: `Use STAR: Situation, Task, Action, Result. ${evidenceLabel}`
    },
    {
      id: 'behavioral-collaboration',
      topic: 'Working with others',
      prompt: 'Describe a time you had to coordinate with someone who had a different priority or approach. How did you reach a useful outcome?',
      guidance: `Focus on what you communicated and how you handled the difference. ${evidenceLabel}`
    },
    {
      id: 'behavioral-learning',
      topic: 'Learning and feedback',
      prompt: 'Tell me about a time you received feedback or had to learn something unfamiliar. What did you change or practice, and what was the result?',
      guidance: 'Keep the example specific. Explain what you learned and how you know your approach improved.'
    }
  ];

  const system = [
    {
      id: 'system-approach',
      topic: 'Breaking down a role problem',
      prompt: `Imagine you are asked to deliver an important piece of work as a ${roleTitle}. How would you clarify the goal, break the work into parts, identify risks, and decide whether the result is successful?`,
      guidance: 'Talk through your assumptions before proposing a solution. Mention stakeholders, constraints, and how you would validate the outcome.'
    },
    {
      id: 'system-quality',
      topic: 'Quality and trade-offs',
      prompt: comparedSkills.length
        ? `Choose one listed skill — ${comparedSkills.slice(0, 3).join(', ')} — and explain how you would check that work using it is correct, reliable, and maintainable.`
        : `What checks would you use to make sure work in a ${roleTitle} is accurate, reliable, and maintainable?`,
      guidance: 'Consider review or testing, failure cases, monitoring or feedback, and one trade-off you would communicate.'
    }
  ];

  return {
    technical,
    behavioral,
    system,
    comparedSkills,
    hasExplicitRequirements,
    hasListedSkillTags,
    sourceLabel,
    skippedTechnicalCount: Math.max(0, comparedSkills.length - technical.length)
  };
}

export default function InterviewPrep({ jobs = [], applications = [], profile }) {
  const availableJobs = useMemo(() => {
    const jobsById = new Map(asList(jobs).filter(job => job?.id).map(job => [job.id, job]));
    asList(applications).forEach(application => {
      const jobId = application.jobId || application.id;
      if (!jobId || jobsById.has(jobId)) return;
      jobsById.set(jobId, {
        id: jobId,
        title: application.jobTitle || 'Saved application',
        company: application.companyName || '',
        skills: [],
        requiredSkills: [],
        isApplicationOnly: true
      });
    });
    return [...jobsById.values()];
  }, [jobs, applications]);

  const [selectedId, setSelectedId] = useState('');
  const [activeTab, setActiveTab] = useState('technical');
  const [jobSearch, setJobSearch] = useState('');
  const [notes, setNotes] = useState({});
  const [notesReady, setNotesReady] = useState(false);
  const [notesWarning, setNotesWarning] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setNotes(Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')));
        }
      }
    } catch {
      setNotesWarning('Saved preparation notes could not be loaded from this browser.');
    } finally {
      setNotesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!notesReady) return;
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      setNotesWarning('Notes are available for this visit but could not be saved in this browser.');
    }
  }, [notes, notesReady]);

  const applicationByJobId = useMemo(() => new Map(asList(applications)
    .map(application => [application.jobId || application.id, application])
    .filter(([jobId]) => jobId)), [applications]);

  const applicationJobs = availableJobs.filter(job => applicationByJobId.has(job.id));
  const otherJobs = availableJobs.filter(job => !applicationByJobId.has(job.id));
  const targetJob = availableJobs.find(job => job.id === selectedId) || applicationJobs[0] || otherJobs[0] || null;
  const targetApplication = targetJob ? applicationByJobId.get(targetJob.id) : null;
  const normalizedJobSearch = normalizeSkill(jobSearch);
  const matchesSearch = job => !normalizedJobSearch
    || normalizeSkill(`${job.title || ''} ${job.company || ''}`).includes(normalizedJobSearch);
  const visibleApplicationJobs = applicationJobs.filter(matchesSearch);
  const visibleOtherJobs = otherJobs.filter(matchesSearch);
  const selectedOutsideFilter = targetJob && !matchesSearch(targetJob);

  useEffect(() => {
    if (targetJob && selectedId !== targetJob.id) setSelectedId(targetJob.id);
  }, [selectedId, targetJob]);

  const profileSkills = asList(profile?.existingSkills);
  const profileExamples = [
    ...profileRecords(profile?.experience, 'Experience'),
    ...profileRecords(profile?.projects, 'Project'),
    ...profileRecords(profile?.education, 'Education'),
    ...profileRecords(profile?.achievements, 'Achievement')
  ];
  const questionSets = targetJob ? buildQuestionSets(targetJob, profileSkills, profileExamples) : null;
  const categories = questionSets ? [
    { id: 'technical', label: questionSets.comparedSkills.length ? 'Technical questions' : 'Role-specific prompts', questions: questionSets.technical, description: questionSets.comparedSkills.length ? 'Practice topics found in the listing.' : 'Practice a prompt based on the role description or title, without assuming unstated requirements.' },
    { id: 'behavioral', label: 'Behavioral questions', questions: questionSets.behavioral, description: 'Prepare specific examples using STAR.' },
    { id: 'system', label: 'Problem-solving questions', questions: questionSets.system, description: 'Practice explaining your approach and trade-offs.' }
  ] : [];
  const currentCategory = categories.find(category => category.id === activeTab) || categories[0];
  const questionKey = (jobId, questionId) => `${jobId}:${questionId}`;
  const allQuestions = categories.flatMap(category => category.questions);
  const preparedCount = targetJob
    ? allQuestions.filter(question => (notes[questionKey(targetJob.id, question.id)] || '').trim()).length
    : 0;
  const matchScore = targetJob?.skillMatch === null ? undefined : targetJob?.skillMatch ?? targetJob?.match;
  const hasMatchScore = matchScore !== null && matchScore !== undefined && String(matchScore).trim() !== '' && Number.isFinite(Number(matchScore));
  const missingSkills = asList(targetJob?.missingSkills).map(cleanLabel).filter(Boolean);
  const matchedSkills = asList(targetJob?.matchedSkills).map(cleanLabel).filter(Boolean);
  const statusLabel = targetApplication?.status ? formatStatus(targetApplication.status) : '';

  const updateNote = (questionId, value) => {
    if (!targetJob) return;
    const key = questionKey(targetJob.id, questionId);
    setNotes(current => ({ ...current, [key]: value }));
  };

  if (!targetJob) {
    return <div className="interview-prep-page animate-fade-in">
      <div className="page-header-row"><div><h1 className="page-title">Interview preparation</h1><p className="page-subtitle">Practice role-relevant questions and organize your own examples.</p></div></div>
      <section className="card interview-empty">
        <span className="interview-empty-icon" aria-hidden="true">?</span>
        <h2>Choose a role to get started</h2>
        <p>There are no opportunities or applications available yet. Explore jobs or save an opportunity, then come back to build a focused practice plan.</p>
        <a className="btn btn-primary" href="#discover">Explore jobs</a>
      </section>
    </div>;
  }

  return (
    <div className="interview-prep-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Interview preparation</h1>
          <p className="page-subtitle">Practice questions based on the selected job listing, and prepare answers using examples you can stand behind.</p>
        </div>
        <Badge kind={preparedCount ? 'blue' : 'neutral'}>{preparedCount} of {allQuestions.length} answers drafted</Badge>
      </div>

      <section className="card interview-role-card" aria-labelledby="interview-role-title">
        <div className="interview-role-picker">
          <label className="form-label" htmlFor="interview-role-search">Find a role</label>
          <input id="interview-role-search" className="form-input" type="search" value={jobSearch} onChange={event => setJobSearch(event.target.value)} placeholder="Search by job title or company" />
          <label className="form-label" htmlFor="interview-role-select">Choose an opportunity</label>
          <select id="interview-role-select" className="form-select" value={targetJob.id} onChange={event => setSelectedId(event.target.value)}>
            {selectedOutsideFilter && <optgroup label="Current selection"><option value={targetJob.id}>{cleanLabel(targetJob.title)} — {cleanLabel(targetJob.company || 'Company not listed')}</option></optgroup>}
            {visibleApplicationJobs.length > 0 && <optgroup label="Your applications">
              {visibleApplicationJobs.map(job => {
                const application = applicationByJobId.get(job.id);
                return <option key={job.id} value={job.id}>{cleanLabel(job.title)} — {cleanLabel(job.company || application?.companyName)}{application?.status ? ` · ${formatStatus(application.status)}` : ''}</option>;
              })}
            </optgroup>}
            {visibleOtherJobs.length > 0 && <optgroup label="Other available opportunities">
              {visibleOtherJobs.map(job => <option key={job.id} value={job.id}>{cleanLabel(job.title)} — {cleanLabel(job.company || 'Company not listed')}</option>)}
            </optgroup>}
            {!visibleApplicationJobs.length && !visibleOtherJobs.length && !selectedOutsideFilter && <option value={targetJob.id}>{cleanLabel(targetJob.title)} — {cleanLabel(targetJob.company || 'Company not listed')}</option>}
          </select>
          {normalizedJobSearch && !visibleApplicationJobs.length && !visibleOtherJobs.length && <span className="interview-context-note">No other opportunities match this search.</span>}
        </div>

        <div className="interview-role-summary">
          <div className="interview-role-title">
            <span className="section-eyebrow">{targetApplication ? 'APPLICATION PREPARATION' : 'ROLE PREPARATION'}</span>
            <h2 id="interview-role-title">{cleanLabel(targetJob.title) || 'Selected opportunity'}</h2>
            <p>{cleanLabel(targetJob.company || 'Company not listed')}{statusLabel ? ` · ${statusLabel}` : ''}</p>
          </div>
          <div className="interview-role-metrics">
            {hasMatchScore ? <div><strong>{Math.round(Number(matchScore))}%</strong><span>listed match score</span></div> : <div><strong>—</strong><span>match score unavailable</span></div>}
            <div><strong>{questionSets.comparedSkills.length}</strong><span>{questionSets.sourceLabel.toLowerCase()}</span></div>
            <div><strong>{profileExamples.length}</strong><span>profile examples available</span></div>
          </div>
        </div>

        {questionSets.comparedSkills.length > 0
          ? <div className="interview-skill-context">
            <div className="interview-skill-context-heading">
              <strong>{questionSets.hasExplicitRequirements ? 'Requirements listed for this role' : questionSets.hasListedSkillTags ? 'Skills tagged in this listing' : 'Technology names found in the description'}</strong>
              <Badge>{questionSets.sourceLabel}</Badge>
            </div>
            <div className="interview-skill-chips">{questionSets.comparedSkills.map(skill => {
              const profileSkill = profileSkills.find(item => normalizeSkill(item.name) === normalizeSkill(skill));
              const matched = matchedSkills.some(item => normalizeSkill(item) === normalizeSkill(skill)) || Boolean(profileSkill && ['verified', 'self-declared'].includes(profileSkill.confidence));
              const missing = missingSkills.some(item => normalizeSkill(item) === normalizeSkill(skill));
              return <span key={skill} className={`interview-skill-chip ${matched ? 'matched' : missing ? 'gap' : ''}`} title={matched ? 'Also listed in your profile' : missing ? 'Marked as a gap by the job match' : 'Compare this with your experience'}>
                <span aria-hidden="true">{matched ? '✓' : missing ? '＋' : '•'}</span>{skill}
              </span>;
            })}</div>
            {!questionSets.hasExplicitRequirements && <p className="interview-context-note">{questionSets.hasListedSkillTags ? 'The listing provides skill tags but does not identify them as mandatory requirements.' : 'These technology names appear in the description and may not be formal requirements.'}</p>}
            {questionSets.skippedTechnicalCount > 0 && <p className="interview-context-note">Showing the first 8 technical topics to keep practice focused.</p>}
          </div>
          : <div className="interview-context-note interview-no-skills">This listing does not provide specific skill requirements or technology tags. Technical practice uses a role-description prompt instead of inventing requirements.</div>}

        {targetJob.isApplicationOnly && <p className="interview-context-note">The original job listing is not currently available, so practice is limited to role-based and general problem-solving prompts.</p>}
      </section>

      {profileExamples.length > 0 && <section className="card interview-evidence-card">
        <div className="interview-section-heading"><div><h2>Your profile examples</h2><p>Use your actual experience to support your answers.</p></div><Badge>{profileExamples.length} examples</Badge></div>
        <div className="interview-evidence-list">{profileExamples.slice(0, 4).map((example, index) => <div className="interview-evidence-item" key={`${example.type}-${example.title}-${index}`}><Badge>{example.type}</Badge><div><strong>{example.title}</strong>{example.details && <p>{example.details}</p>}</div></div>)}</div>
        {profileExamples.length > 4 && <p className="interview-context-note">And {profileExamples.length - 4} more examples in your profile.</p>}
      </section>}

      <section className="interview-practice" aria-labelledby="practice-questions-title">
        <div className="interview-section-heading"><div><h2 id="practice-questions-title">Practice questions</h2><p>Draft notes are saved in this browser and stay attached to each role and question.</p></div></div>
        {notesWarning && <p className="notice notice-warn" role="status">{notesWarning}</p>}
        <div className="interview-category-tabs" role="tablist" aria-label="Interview question types">
          {categories.map(category => <button key={category.id} type="button" role="tab" aria-selected={activeTab === category.id} className={`interview-category-tab ${activeTab === category.id ? 'active' : ''}`} onClick={() => setActiveTab(category.id)}>
            <span>{category.label}</span><Badge>{category.questions.length}</Badge>
          </button>)}
        </div>
        <p className="interview-category-description">{currentCategory.description}</p>

        <div className="interview-question-list">
          {currentCategory.questions.length > 0 ? currentCategory.questions.map((question, index) => {
            const note = notes[questionKey(targetJob.id, question.id)] || '';
            return <article className="card interview-question-card" key={question.id}>
              <div className="interview-question-meta"><span>QUESTION {index + 1}</span><Badge>{question.topic}</Badge>{question.source && <Badge kind="neutral">{question.source}</Badge>}</div>
              <h3>{question.prompt}</h3>
              <div className="interview-guidance"><strong>How to approach it</strong><p>{question.guidance}</p></div>
              {question.profileSignal && <p className="interview-context-note">Your profile lists {question.topic} as {cleanLabel(question.profileSignal)}. Only describe experience you can support with a real example.</p>}
              <label className="interview-answer-label" htmlFor={`answer-${targetJob.id}-${question.id}`}>Your answer notes</label>
              <textarea id={`answer-${targetJob.id}-${question.id}`} rows={4} value={note} onChange={event => updateNote(question.id, event.target.value)} placeholder="Write a few truthful talking points, evidence, and results. You can refine this later." />
              <div className="interview-answer-footer"><span>{note.trim() ? `${note.trim().length} characters drafted` : 'No notes yet'}</span><span>{notesReady && !notesWarning ? 'Saved in this browser' : 'Draft for this visit'}</span></div>
            </article>;
          }) : <div className="card interview-no-questions"><strong>No technical topics listed</strong><p>This job listing does not provide technical skill requirements or tags, so no technical questions are generated for it.</p><button className="btn btn-secondary btn-xs" type="button" onClick={() => setActiveTab('system')}>Practice problem-solving instead</button></div>}
        </div>
      </section>
    </div>
  );
}
