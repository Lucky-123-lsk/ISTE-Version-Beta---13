import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeJob, sortJobsByPriority } from '../src/services/jobPriority.js';

const unknownMatch = {
  skillMatch: null,
  experienceMatch: 'unknown',
  eligibilityMatch: 'unknown'
};

test('job priority leaves unavailable signals and application effort unknown', () => {
  const result = prioritizeJob({
    job: { title: 'Engineer', description: '' },
    profile: {},
    match: unknownMatch,
    status: 'active'
  });

  assert.equal(result.score, null);
  assert.equal(result.recommendation, 'Review');
  assert.equal(result.estimatedMinutes, null);
  assert.equal(result.confidence, '0 of 6 signals available');
  assert.match(result.explanation, /not guessed/);
});

test('job priority recognizes role-token alignment even when the exact preferred-role phrase differs', () => {
  const result = prioritizeJob({
    job: { title: 'Data Scientist' },
    profile: { preferredRoles: ['Data Engineer'] },
    match: { skillMatch: 60, experienceMatch: 'unknown', eligibilityMatch: 'unknown' },
    status: 'active'
  });

  assert.equal(result.factors.roleAlignment, 100);
  assert.equal(result.score, 80);
});

test('job priority averages known signals and skips closed or ineligible jobs', () => {
  const active = prioritizeJob({
    job: { title: 'React Engineer', lastVerifiedAt: new Date(1000) },
    profile: { preferredRoles: ['React'] },
    match: { skillMatch: 80, experienceMatch: 'meets-known-years', eligibilityMatch: 'unknown' },
    status: 'active',
    now: 1000
  });
  const closed = prioritizeJob({
    job: { title: 'React Engineer' },
    profile: {},
    match: { ...unknownMatch, eligibilityMatch: 'does-not-meet-known-authorization' },
    status: 'closed',
    now: 1000
  });

  assert.equal(active.score, 95);
  assert.equal(active.recommendation, 'Apply First');
  assert.equal(closed.score, 0);
  assert.equal(closed.recommendation, 'Skip');
});

test('sorts all jobs by priority score, then skill match, leaving unknown scores last', () => {
  const ranked = sortJobsByPriority([
    { id: 'medium', priority: { score: 60 }, skillMatch: 90 },
    { id: 'high', priority: { score: 90 }, skillMatch: 40 },
    { id: 'tie-lower-match', priority: { score: 60 }, skillMatch: 50 },
    { id: 'unknown', priority: { score: null }, skillMatch: 100 }
  ]);
  assert.deepEqual(ranked.map(job => job.id), ['high', 'medium', 'tie-lower-match', 'unknown']);
});
