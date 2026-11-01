const skillAliases = {
  'aws': ['amazon web services'],
  'javascript': ['js', 'ecmascript'],
  'typescript': ['ts'],
  'node.js': ['nodejs'],
  'react': ['react.js', 'reactjs'],
  'next.js': ['nextjs'],
  'vue.js': ['vue', 'vuejs'],
  'rest apis': ['rest api', 'restful api', 'restful apis'],
  'postgresql': ['postgres'],
  'mongodb': ['mongo db'],
  'kubernetes': ['k8s'],
  'ci/cd': ['continuous integration', 'continuous delivery', 'continuous deployment']
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesRequirement(text, requirement) {
  const normalizedRequirement = requirement.toLowerCase().trim();
  const aliases = skillAliases[normalizedRequirement] || [];
  return [normalizedRequirement, ...aliases].some(alias => {
    const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}(?=$|[^a-z0-9])`, 'i');
    return matcher.test(text);
  });
}

function itemText(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  return [
    item.title,
    item.role,
    item.position,
    item.jobTitle,
    item.name,
    item.company,
    item.organization,
    item.institution,
    item.school,
    item.dates,
    item.period,
    item.description,
    item.details,
    item.summary,
    item.field,
    item.major,
    ...(Array.isArray(item.responsibilities) ? item.responsibilities : []),
    ...(Array.isArray(item.highlights) ? item.highlights : []),
    ...(Array.isArray(item.technologies) ? item.technologies : [])
  ].filter(value => typeof value === 'string' && value.trim()).join(' — ');
}

function buildResumeEvidenceCandidates(requirement, resume) {
  if (!resume?.originalText) return [];
  return resume.originalText.split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line && matchesRequirement(line, requirement))
    .slice(0, 5)
    .map(({ line, index }, candidateIndex) => ({
      id: `${requirementId(requirement)}-resume-${index}-${candidateIndex}`,
      sourceType: 'resume',
      sourceLabel: resume.fileName || 'Parsed resume',
      text: line.slice(0, 1000),
      lineStart: index + 1,
      lineEnd: index + 1
    }));
}

function buildProfileEvidenceCandidates(requirement, profile) {
  if (!profile || typeof profile !== 'object') return [];
  const candidates = [];
  const skills = Array.isArray(profile.existingSkills) ? profile.existingSkills : [];
  for (const skill of skills) {
    const name = typeof skill === 'string' ? skill.trim() : String(skill?.name || '').trim();
    if (
      !name
      || (typeof skill === 'object' && skill?.confidence === 'learning')
      || !matchesRequirement(name, requirement)
    ) continue;
    candidates.push({
      sourceType: 'profile',
      sourceLabel: 'Career DNA skills',
      text: `Skill listed in your profile: ${name}`,
      confidence: typeof skill === 'object' ? skill.confidence || 'candidate-declared' : 'candidate-declared'
    });
  }

  for (const [field, label] of [
    ['experience', 'Career DNA experience'],
    ['projects', 'Career DNA project'],
    ['achievements', 'Career DNA achievement'],
    ['education', 'Career DNA education']
  ]) {
    const entries = Array.isArray(profile[field]) ? profile[field] : [];
    entries.forEach((entry, index) => {
      const text = itemText(entry);
      if (text && matchesRequirement(text, requirement)) {
        candidates.push({ sourceType: 'profile', sourceLabel: `${label} ${index + 1}`, text: text.slice(0, 1000) });
      }
    });
  }

  return candidates.slice(0, 5).map((candidate, index) => ({
    id: `${requirementId(requirement)}-profile-${index}`,
    ...candidate
  }));
}

function requirementId(requirement) {
  return String(requirement).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'requirement';
}

export function buildResumeEvidence(job, resume, profile = {}) {
  const requiredSkills = (Array.isArray(job.requiredSkills) ? job.requiredSkills : [])
    .filter(skill => typeof skill === 'string' && skill.trim())
    .map(requirement => ({ requirement: requirement.trim(), importance: 'required' }));
  const preferredSkills = (Array.isArray(job.preferredSkills) ? job.preferredSkills : [])
    .filter(skill => typeof skill === 'string' && skill.trim())
    .filter(skill => !requiredSkills.some(item => item.requirement.toLowerCase() === skill.trim().toLowerCase()))
    .map(requirement => ({ requirement: requirement.trim(), importance: 'preferred' }));

  const requirements = [...requiredSkills, ...preferredSkills].map(({ requirement, importance }, index) => {
    const evidenceCandidates = [
      ...buildResumeEvidenceCandidates(requirement, resume),
      ...buildProfileEvidenceCandidates(requirement, profile)
    ];
    const resumeEvidence = evidenceCandidates.find(item => item.sourceType === 'resume') || null;
    return {
      id: `requirement-${index + 1}`,
      requirement,
      importance,
      status: resumeEvidence
        ? 'supported'
        : evidenceCandidates.length
          ? 'profile-match'
          : 'insufficient-evidence',
      evidence: resumeEvidence ? {
        lineStart: resumeEvidence.lineStart,
        lineEnd: resumeEvidence.lineEnd,
        text: resumeEvidence.text
      } : null,
      evidenceCandidates,
      suggestion: evidenceCandidates.length
        ? 'Review the source and wording, then select only evidence that accurately reflects your experience.'
        : 'No direct evidence was found in the parsed resume or confirmed profile. Do not claim this skill without genuine supporting evidence.',
      sourceDocument: resume?.fileName || ''
    };
  });

  return {
    isDemo: false,
    evidenceAvailable: requirements.some(requirement => requirement.evidenceCandidates.length > 0),
    notice: requirements.length
      ? 'Evidence is matched using exact skill names and common aliases in your parsed resume and confirmed Career DNA. Profile matches need your review; no AI claims are generated.'
      : 'This listing has no structured required or preferred skills to compare with your resume and confirmed profile.',
    job: { id: String(job._id), title: job.title, company: job.companyName },
    resume: resume ? { fileName: resume.fileName } : null,
    requirements
  };
}
