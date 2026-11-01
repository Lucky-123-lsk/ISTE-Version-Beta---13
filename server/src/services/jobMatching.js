const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();

function containsSkill(text, skill) {
  const normalizedText = normalize(text);
  const normalizedSkill = normalize(skill);
  if (!normalizedText || !normalizedSkill) return false;
  const escapedSkill = normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapedSkill}($|[^a-z0-9])`, 'i').test(normalizedText);
}

export function matchJob(job, profile = {}) {
  const profileSkills = (profile.existingSkills || [])
    .filter(skill => ['verified', 'self-declared'].includes(skill.confidence) && normalize(skill.name))
    .filter((skill, index, list) => list.findIndex(item => normalize(item.name) === normalize(skill.name)) === index);
  const knownSkills = profileSkills.map(skill => normalize(skill.name));
  const requiredSkills = [...new Set((job.requiredSkills || []).filter(skill => typeof skill === 'string' && normalize(skill)))];
  const listedSkills = [...new Set((job.skills || []).filter(skill => typeof skill === 'string' && normalize(skill)))];
  const preferredSkills = [...new Set((job.preferredSkills || []).filter(skill => typeof skill === 'string' && normalize(skill)))];
  const assessmentSkills = requiredSkills.length ? requiredSkills : [...new Set([...listedSkills, ...preferredSkills])];
  let matchedSkills;
  let missingSkills;
  let skillMatch;
  let skillMatchSource;

  if (assessmentSkills.length && knownSkills.length) {
    matchedSkills = assessmentSkills.filter(skill => knownSkills.includes(normalize(skill)));
    missingSkills = assessmentSkills.filter(skill => !matchedSkills.includes(skill));
    skillMatch = Math.round((matchedSkills.length / assessmentSkills.length) * 100);
    skillMatchSource = requiredSkills.length ? 'required-skills' : 'listed-skills';
  } else if (profileSkills.length && (job.title || job.description)) {
    const listingText = `${job.title || ''} ${job.description || ''}`;
    matchedSkills = profileSkills.filter(skill => containsSkill(listingText, skill.name)).map(skill => skill.name);
    if (String(job.description || '').trim() || matchedSkills.length) {
      missingSkills = profileSkills.filter(skill => !matchedSkills.includes(skill.name)).map(skill => skill.name);
      skillMatch = Math.round((matchedSkills.length / profileSkills.length) * 100);
      skillMatchSource = 'profile-skills-in-description';
    } else {
      missingSkills = [];
      skillMatch = null;
      skillMatchSource = 'unassessed';
    }
  } else {
    matchedSkills = [];
    missingSkills = assessmentSkills;
    skillMatch = null;
    skillMatchSource = 'unassessed';
  }

  const experienceRequirement = job.experienceRequirements || '';
  const yearsMatch = experienceRequirement.match(/(\d+(?:\.\d+)?)/);
  const requiredYears = yearsMatch ? Number(yearsMatch[1]) : null;
  const candidateYears = Number.isFinite(profile.yearsExperience) ? profile.yearsExperience : null;
  const experienceMatch = requiredYears === null || candidateYears === null
    ? 'unknown'
    : candidateYears >= requiredYears ? 'meets-known-years' : 'below-known-years';
  const eligibility = job.eligibilityRequirements || [];
  const allowedCountries = (profile.workAuthorizationCountries || []).map(normalize);
  let eligibilityMatch = eligibility.length ? 'unknown' : 'no-restriction-found';
  const authorizationRequirement = eligibility.find(item => /work authorization|authorized to work|visa sponsorship|citizenship|work permit/i.test(item));
  if (authorizationRequirement && allowedCountries.length) {
    const countries = ['united states', 'usa', 'us', 'india', 'canada', 'united kingdom', 'uk', 'australia'];
    const requiredCountry = countries.find(country => normalize(authorizationRequirement).includes(country));
    if (requiredCountry) {
      eligibilityMatch = allowedCountries.some(country => country === requiredCountry)
        ? 'matches-known-authorization'
        : 'does-not-meet-known-authorization';
    }
  }

  const category = skillMatch === null ? 'unassessed'
    : skillMatch >= 70 ? 'bridge'
      : skillMatch >= 35 ? 'growth' : 'stretch';
  const explanation = skillMatch === null
    ? !profileSkills.length
      ? 'No confirmed or self-declared profile skills are available to compare. Skill fit is unassessed, not evidence that the candidate is unqualified.'
      : 'The listing has no structured skills or readable description to compare, so skill fit is unassessed.'
    : skillMatchSource === 'profile-skills-in-description'
      ? `${matchedSkills.length} of ${profileSkills.length} assessed profile skills are explicitly mentioned in the job title or description. This is profile overlap, not a selection probability.`
      : `${matchedSkills.length} of ${assessmentSkills.length} ${skillMatchSource === 'required-skills' ? 'detected required' : 'listed'} skills match the profile. Eligibility is assessed separately and is not overridden by skill fit.`;
  return {
    skillMatch,
    skillMatchSource,
    matchedSkills,
    missingSkills,
    experienceMatch,
    eligibilityMatch,
    category,
    explanation
  };
}
