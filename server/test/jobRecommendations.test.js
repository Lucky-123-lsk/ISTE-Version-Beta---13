import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendationProfile, recommendJobs } from '../src/services/jobRecommendations.js';

const profile = {
  existingSkills: [
    { name: 'React', confidence: 'self-declared' },
    { name: 'JavaScript', confidence: 'verified' }
  ],
  preferredRoles: ['Frontend Engineer']
};

test('recommends role-aligned jobs and ranks them by profile priority', () => {
  const result = recommendJobs([
    { id: 'weak', title: 'Frontend Engineer', requiredSkills: ['React', 'JavaScript', 'Node', 'AWS', 'GraphQL', 'Docker', 'AWS Lambda', 'Redis'] },
    { id: 'strong', title: 'React Frontend Developer', requiredSkills: ['React', 'JavaScript'] },
    { id: 'unrelated', title: 'Data Engineer', requiredSkills: ['React', 'JavaScript'] }
  ], profile);

  assert.deepEqual(result.items.map(job => job.id), ['strong', 'weak']);
  assert.equal(result.items[0].recommendation.profileMatch, 100);
  assert.ok(result.items.every(job => Number.isFinite(job.priority.score)));
  assert.equal(result.status, 'ready');
  assert.match(result.message, /not hiring probabilities/);
});

test('includes every eligible job aligned with a preferred role, even with a low or unavailable skill score', () => {
  const result = recommendJobs([
    { id: 'strong-fit', title: 'Data Engineer', requiredSkills: ['Python'] },
    { id: 'no-structured-skills', title: 'Data Scientist', description: '' },
    { id: 'unrelated', title: 'Frontend Engineer', requiredSkills: ['React'] }
  ], {
    existingSkills: [{ name: 'React', confidence: 'verified' }],
    preferredRoles: ['Data Engineer']
  });

  assert.deepEqual(result.items.map(job => job.id), ['no-structured-skills', 'strong-fit']);
  assert.equal(result.items[1].skillMatch, 0);
  assert.equal(result.items[1].recommendation.roleAligned, true);
  assert.match(result.message, /all eligible jobs aligned/);
});

test('returns a profile setup message when no saved skills are available', () => {
  const result = recommendJobs([{ id: 'job', requiredSkills: ['React'] }], { existingSkills: [] });
  assert.deepEqual(result.items, []);
  assert.equal(result.status, 'needs-profile');
  assert.match(result.message, /save reviewed skills/);
});

test('uses only resume-extracted skills with direct evidence when building recommendations', () => {
  const candidate = buildRecommendationProfile({ preferredRoles: [] }, {
    technicalSkills: [
      { name: 'Apache Flink', evidenceQuote: 'Built pipelines with Apache Flink.' },
      { name: 'Kubernetes', evidenceQuote: '' },
      { name: 'Spark', evidenceQuote: 'Used Spark in a project.' }
    ]
  }, 'Built pipelines with Apache Flink.');
  const result = recommendJobs([
    { id: 'flink-role', title: 'Data Engineer', requiredSkills: ['Apache Flink', 'Java'] },
    { id: 'unsupported-role', title: 'Data Engineer', requiredSkills: ['Kubernetes'] }
  ], candidate);

  assert.deepEqual(result.items.map(job => job.id), ['flink-role']);
  assert.equal(candidate.recommendationUsesResume, true);
  assert.match(result.message, /latest analyzed resume/);
});

test('recommends a job from directly mentioned profile skills when structured job skills are absent', () => {
  const result = recommendJobs([{
    id: 'description-only',
    title: 'Frontend Engineer',
    description: 'Build accessible web applications using React and JavaScript.',
    status: 'active'
  }], profile);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].skillMatch, 100);
  assert.equal(result.items[0].skillMatchSource, 'profile-skills-in-description');
  assert.match(result.items[0].why, /2 of 2 assessed profile skills/);
});

test('does not recommend jobs that are known ineligible or closed', () => {
  const result = recommendJobs([
    { id: 'ineligible', title: 'Frontend Engineer', requiredSkills: ['React'], eligibilityRequirements: ['work authorization United States'] },
    { id: 'closed', title: 'Frontend Engineer', requiredSkills: ['React'], status: 'closed' }
  ], {
    ...profile,
    workAuthorizationCountries: ['India']
  });
  assert.deepEqual(result.items, []);
});
