import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeApplications } from '../src/services/applicationInsights.js';

test('application analytics normalize persisted status names and include the observation period', () => {
  const summary = summarizeApplications([
    { status: 'INTERVIEW', createdAt: '2025-01-03T00:00:00.000Z' },
    { status: 'NOT_SELECTED', createdAt: '2025-01-01T00:00:00.000Z' },
    { status: 'Assessment', createdAt: '2025-01-02T00:00:00.000Z' },
    { status: 'Planned', createdAt: '2025-01-04T00:00:00.000Z' },
    { status: 'OFFER', createdAt: '2025-01-05T00:00:00.000Z' },
    { status: 'Withdrawn', createdAt: '2025-01-06T00:00:00.000Z' }
  ]);

  assert.equal(summary.applications, 6);
  assert.equal(summary.interviews, 1);
  assert.equal(summary.rejections, 1);
  assert.equal(summary.assessments, 1);
  assert.equal(summary.offers, 1);
  assert.equal(summary.withdrawn, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.outcomeSampleSize, 4);
  assert.equal(summary.dataSufficiency, 'Insufficient evidence');
  assert.equal(summary.reliableConclusion, false);
  assert.deepEqual(summary.observationPeriod, {
    from: '2025-01-01T00:00:00.000Z',
    to: '2025-01-06T00:00:00.000Z'
  });
});

test('empty application analytics report no reliable conclusion', () => {
  const summary = summarizeApplications([]);

  assert.equal(summary.applications, 0);
  assert.equal(summary.observationPeriod, null);
  assert.equal(summary.reliableConclusion, false);
  assert.match(summary.knownFacts[0], /No application outcomes/);
});
