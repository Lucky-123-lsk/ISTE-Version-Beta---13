function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function itemText(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';

  const heading = [
    item.title,
    item.role,
    item.position,
    item.jobTitle,
    item.degree,
    item.name,
  ].map(text).find(Boolean) || '';
  const organization = [item.company, item.institution, item.school, item.organization]
    .map(text).find(Boolean) || '';
  const dates = [item.dates, item.period, item.date, item.graduationYear, [item.startDate, item.endDate].filter(Boolean).join(' - ')]
    .map(text).find(Boolean) || '';
  const details = [
    item.details,
    item.description,
    item.summary,
    item.field,
    item.major,
    ...list(item.responsibilities),
    ...list(item.highlights),
    ...list(item.technologies)
  ].map(text).filter(Boolean);

  return [heading, organization, dates, ...details].filter(Boolean).join(' - ');
}

function sectionText(profileValue, resumeValue) {
  const profileItems = list(profileValue).map(itemText).filter(Boolean);
  if (profileItems.length) return profileItems.join('\n');
  return list(resumeValue).map(itemText).filter(Boolean).join('\n');
}

export function buildTailoredSections(profile = {}, extractedData = {}) {
  const personalInfo = extractedData.personalInfo || {};
  const profileSkills = list(profile.existingSkills).map(skill =>
    typeof skill === 'string' ? skill.trim() : text(skill?.name)
  ).filter(Boolean);
  const resumeSkills = [...list(extractedData.technicalSkills), ...list(extractedData.softSkills)]
    .map(skill => typeof skill === 'string' ? skill.trim() : text(skill?.name))
    .filter(Boolean);
  const profileAchievements = sectionText(profile.achievements);
  const resumeAchievements = [...list(extractedData.achievements), ...list(extractedData.certifications)]
    .map(itemText).filter(Boolean).join('\n');

  return {
    summary: text(profile.objective) || text(personalInfo.summary),
    skills: [...new Set(profileSkills.length ? profileSkills : resumeSkills)].join(', '),
    education: sectionText(profile.education, extractedData.education),
    experience: sectionText(profile.experience, extractedData.experience),
    projects: sectionText(profile.projects, extractedData.projects),
    achievements: profileAchievements || resumeAchievements
  };
}
