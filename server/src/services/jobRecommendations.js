import { matchJob } from './jobMatching.js';
import { prioritizeJob, sortJobsByPriority } from './jobPriority.js';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
const GENERIC_ROLE_WORDS = new Set(['engineer', 'developer', 'specialist', 'manager', 'analyst', 'designer']);

export function buildRecommendationProfile(profile = {}, resumeExtraction = null, resumeText = '') {
  const existingSkills = Array.isArray(profile.existingSkills) ? [...profile.existingSkills] : [];
  const knownSkills = new Set(existingSkills.map(skill => normalize(skill?.name)).filter(Boolean));
  const resumeSkills = [];
  let recommendationUsesResume = false;
  if (Array.isArray(resumeExtraction?.technicalSkills)) {
    for (const skill of resumeExtraction.technicalSkills) {
      if (typeof skill?.name !== 'string'
        || !skill.name.trim()
        || typeof skill.evidenceQuote !== 'string'
        || !skill.evidenceQuote.trim()
        || !resumeText.includes(skill.evidenceQuote.trim())) continue;
      recommendationUsesResume = true;
      const normalizedName = normalize(skill.name);
      if (knownSkills.has(normalizedName)) continue;
      knownSkills.add(normalizedName);
      resumeSkills.push({
        name: skill.name.trim(),
        confidence: 'self-declared',
        evidenceQuote: skill.evidenceQuote.trim(),
        source: 'analyzed-resume'
      });
    }
  }
  return {
    ...profile,
    existingSkills: [...existingSkills, ...resumeSkills],
    recommendationUsesResume
  };
}

function rolesAlign(title, preferredRoles) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return false;
  const titleWords = normalizedTitle.split(/\s+/).filter(word => word && !GENERIC_ROLE_WORDS.has(word));
  return preferredRoles.some(role => {
    const normalizedRole = normalize(role);
    if (!normalizedRole) return false;
    if (normalizedTitle.includes(normalizedRole) || normalizedRole.includes(normalizedTitle)) return true;
    const roleWords = normalizedRole.split(/\s+/).filter(word => word && !GENERIC_ROLE_WORDS.has(word));
    return roleWords.some(word => titleWords.includes(word));
  });
}

export function recommendJobs(jobs, profile) {
  const candidateSkills = (profile.existingSkills || [])
    .filter(skill => ['verified', 'self-declared'].includes(skill.confidence) && normalize(skill.name));
  if (!candidateSkills.length) {
    return {
      items: [],
      status: 'needs-profile',
      message: 'Analyze a resume in Career DNA or save reviewed skills to get personalized job recommendations.'
    };
  }

  const preferredRoles = (profile.preferredRoles || []).filter(role => typeof role === 'string' && role.trim());
  const recommendations = jobs.flatMap(job => {
    const match = matchJob(job, profile);
    if (match.eligibilityMatch === 'does-not-meet-known-authorization') return [];
    if (['closed', 'expired'].includes(job.status)) return [];

    const roleAligned = rolesAlign(job.title, preferredRoles);
    if (preferredRoles.length && !roleAligned) return [];
    if (!preferredRoles.length && (!Number.isFinite(match.skillMatch) || match.skillMatch < 35)) return [];
    const priority = prioritizeJob({ job, profile, match, status: job.status || 'unknown' });
    return [{
      ...job,
      skillMatch: match.skillMatch,
      skillMatchSource: match.skillMatchSource,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills,
      why: match.explanation,
      eligibilityMatch: match.eligibilityMatch,
      experienceMatch: match.experienceMatch,
      priority,
      recommendation: {
        profileMatch: match.skillMatch,
        roleAligned,
        explanation: `${match.explanation}${roleAligned ? ' The title also aligns with a preferred role.' : ''} This is profile fit, not a hiring or selection probability.`
      }
    }];
  });

  const rankedRecommendations = sortJobsByPriority(recommendations);
  return {
    items: rankedRecommendations,
    status: 'ready',
    message: `${profile.recommendationUsesResume ? 'Includes skills with evidence in your latest analyzed resume; ' : ''}${preferredRoles.length ? 'all eligible jobs aligned with your preferred roles are included and ranked by profile priority' : 'ranked by profile priority'}. Match percentages are not hiring probabilities.`
  };
}
