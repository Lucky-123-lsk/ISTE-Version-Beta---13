const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();

export function matchJob(job, profile = {}) {
  const knownSkills = (profile.existingSkills || [])
    .filter(skill => ['verified', 'self-declared'].includes(skill.confidence))
    .map(skill => normalize(skill.name));
  const requiredSkills = job.requiredSkills || [];
  const matchedSkills = requiredSkills.filter(skill => knownSkills.some(known => known === normalize(skill)));
  const missingSkills = requiredSkills.filter(skill => !matchedSkills.includes(skill));
  const skillMatch = requiredSkills.length
    ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
    : null;

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
  return {
    skillMatch,
    matchedSkills,
    missingSkills,
    experienceMatch,
    eligibilityMatch,
    category,
    explanation: skillMatch === null
      ? 'The listing does not expose a clear required-skills list, so skill fit is not scored.'
      : `${matchedSkills.length} of ${requiredSkills.length} detected required skills match the profile. Eligibility is assessed separately and is not overridden by skill fit.`
  };
}
