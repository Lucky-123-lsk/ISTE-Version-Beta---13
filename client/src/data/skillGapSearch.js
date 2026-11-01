function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

const DESCRIPTION_SKILL_TERMS = [
  'JavaScript', 'TypeScript', 'React Native', 'React', 'Angular', 'Vue.js', 'Vue',
  'Node.js', 'Express', 'Python', 'Django', 'Flask', 'Java', 'Spring Boot', 'C++', 'C#',
  '.NET', 'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'Dart', 'SQL', 'PostgreSQL',
  'MySQL', 'MongoDB', 'PySpark', 'Apache Spark', 'ETL', 'Azure Databricks', 'Unity Catalog',
  'Azure', 'AWS', 'Amazon Web Services', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes',
  'Terraform', 'CI/CD', 'REST APIs', 'GraphQL', 'Playwright', 'Selenium', 'Cypress',
  'Jest', 'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Power BI',
  'Tableau', 'Linux', 'Git', 'HTML', 'CSS', 'Redis', 'Kafka', 'Figma'
];

function matchesTerms(text, query) {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  if (normalizedText.includes(normalizedQuery)) return true;
  return normalizedQuery.split(/\s+/).filter(Boolean).every(term => normalizedText.includes(term));
}

function normalizeSkillText(value) {
  return String(value || '').toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/([a-z0-9+#])\.(?=\s|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMentionedSkills(job) {
  const rawDescription = String(job.description || '').replace(/<[^>]*>/g, ' ');
  const description = normalizeSkillText(rawDescription);
  if (!description) return [];
  const paddedDescription = ` ${description} `;
  return DESCRIPTION_SKILL_TERMS.filter(skill => {
    if (skill === 'Go' && !/\b(?:golang|go language|go programming|written in go)\b/i.test(rawDescription)) return false;
    const term = normalizeSkillText(skill);
    return paddedDescription.includes(` ${term} `);
  }).filter((skill, _, skills) => !skills.some(other => other !== skill
    && normalizeSkillText(other).includes(` ${normalizeSkillText(skill)} `)));
}

export function filterSavedJobsForSkillGap(jobs, { role = '', location = '', skill = '' } = {}) {
  return jobs.filter(job => {
    const descriptionSkills = extractMentionedSkills(job);
    const searchableText = [
      job.title,
      job.company,
      job.description,
      ...(Array.isArray(job.requiredSkills) ? job.requiredSkills : []),
      ...(Array.isArray(job.preferredSkills) ? job.preferredSkills : []),
      ...(Array.isArray(job.skills) ? job.skills : []),
      ...descriptionSkills
    ].join(' ');
    const listedSkills = [
      ...(Array.isArray(job.requiredSkills) ? job.requiredSkills : []),
      ...(Array.isArray(job.preferredSkills) ? job.preferredSkills : []),
      ...(Array.isArray(job.skills) ? job.skills : []),
      ...descriptionSkills
    ].join(' ');

    return matchesTerms(searchableText, role)
      && matchesTerms(job.location, location)
      && matchesTerms(listedSkills, skill);
  });
}
