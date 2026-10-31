import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAshby, normalizeGreenhouse, normalizeLever, normalizeTheirStack, canonicalizeUrl } from '../src/services/jobIngestion/normalize.js';
import { aggregateStatus } from '../src/services/jobIngestion/store.js';
import { fetchTheirStackJobs } from '../src/services/jobIngestion/providers/theirStack.js';
import { fetchGreenhouseJobs } from '../src/services/jobIngestion/providers/greenhouse.js';
import { fetchLeverJobs } from '../src/services/jobIngestion/providers/lever.js';
import { fetchAshbyJobs } from '../src/services/jobIngestion/providers/ashby.js';
import { fetchJSON } from '../src/services/jobIngestion/http.js';
import { matchJob } from '../src/services/jobMatching.js';
import { getCompanyRegistry } from '../src/config/jobCompanies.js';

function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve().then(callback).finally(() => { globalThis.fetch = originalFetch; });
}

test('canonical URLs remove tracking parameters but preserve job identity', () => {
  assert.equal(
    canonicalizeUrl('https://jobs.example/jobs/123?utm_source=feed&gh_src=tracking'),
    'https://jobs.example/jobs/123'
  );
  const first = normalizeTheirStack({ id: 21, company: 'Example Co', job_title: 'Java Developer', final_url: 'https://jobs.example/jobs/123?utm_source=feed' });
  const duplicate = normalizeGreenhouse({ id: 88, title: 'Java Developer', absolute_url: 'https://jobs.example/jobs/123' }, {
    boardId: 'example',
    name: 'Example Co'
  });
  assert.equal(first.canonicalKey, duplicate.canonicalKey);
});

test('separate positions with same title and company but different source URLs stay distinct', () => {
  const first = normalizeTheirStack({ id: 21, company: 'Example Co', company_domain: 'example.com', job_title: 'Java Developer', location: 'Bhopal', description: 'Build Java services for product one.' });
  const second = normalizeTheirStack({ id: 22, company: 'Example Co', company_domain: 'example.com', job_title: 'Java Developer', location: 'Bhopal', description: 'Maintain Java systems for product two.' });
  assert.notEqual(first.canonicalKey, second.canonicalKey);
});

test('Greenhouse normalization handles optional metadata and extracts required skills', () => {
  const listing = normalizeGreenhouse({
    id: 41,
    title: 'Software Engineer Intern',
    content: '<h3>Requirements</h3><p>React and JavaScript experience.</p><h3>Preferred Skills</h3><p>Python</p>',
    location: { name: 'Bhopal, India' },
    metadata: null,
    absolute_url: 'https://boards.greenhouse.io/example/jobs/41',
    first_published: '2026-10-01T10:00:00Z'
  }, { boardId: 'example', name: 'Example Co', domain: 'example.com' });
  assert.equal(listing.employmentType, 'internship');
  assert.deepEqual(listing.requiredSkills, ['JavaScript', 'React']);
  assert.equal(listing.applicationUrl, 'https://boards.greenhouse.io/example/jobs/41');
});

test('Lever normalization maps its public posting response', () => {
  const listing = normalizeLever({
    id: 'lever-1',
    text: 'Backend Developer Intern',
    descriptionPlain: 'Requirements: Java and REST APIs.',
    categories: { commitment: 'Internship', location: 'Remote India' },
    createdAt: 1790851200000,
    hostedUrl: 'https://jobs.lever.co/example/lever-1'
  }, { boardId: 'example', name: 'Example Co', domain: 'example.com' });
  assert.equal(listing.employmentType, 'internship');
  assert.equal(listing.workplaceType, 'remote');
  assert.equal(listing.externalJobId, 'lever-1');
});

test('Ashby normalization retains board URL and listed status evidence', () => {
  const listing = normalizeAshby({
    id: 'ashby-1',
    title: 'Full Stack Developer',
    employmentType: 'FullTime',
    location: 'Bengaluru, India',
    descriptionPlain: 'Requirements: TypeScript, React, and Node.js.',
    publishedAt: '2026-10-20T00:00:00Z',
    isListed: true,
    workplaceType: 'Hybrid',
    compensation: { scrapeableCompensationSalarySummary: '$80,000 - $100,000', summaryComponents: [{ compensationType: 'Salary', minValue: 80000, maxValue: 100000, currencyCode: 'USD', interval: '1 YEAR' }] },
    jobUrl: 'https://jobs.ashbyhq.com/example/ashby-1',
    applyUrl: 'https://jobs.ashbyhq.com/example/ashby-1/application'
  }, { boardId: 'example', name: 'Example Co', domain: 'example.com' });
  assert.deepEqual(listing.requiredSkills, ['TypeScript', 'React', 'Node.js']);
  assert.equal(listing.status, 'active');
  assert.equal(listing.workplaceType, 'hybrid');
  assert.equal(listing.salary.minimum, 80000);
  assert.equal(listing.salary.currency, 'USD');
});

test('temporary source absence does not itself produce an expired status', () => {
  assert.equal(aggregateStatus(['active']), 'active');
  assert.equal(aggregateStatus(['active', 'unknown']), 'active');
  assert.equal(aggregateStatus(['closed']), 'closed');
  assert.equal(aggregateStatus(['unknown']), 'unknown');
});

test('high skill match does not override separately reported eligibility restrictions', () => {
  const result = matchJob({
    requiredSkills: ['React'],
    eligibilityRequirements: ['Candidates must be authorized to work in the United States.'],
    experienceRequirements: '3 years of experience'
  }, {
    existingSkills: [{ name: 'React', confidence: 'verified' }],
    workAuthorizationCountries: ['Canada'],
    yearsExperience: 1
  });

  test('company registry validates board providers and derives a company domain', () => {
    const previous = process.env.JOB_COMPANIES_JSON;
    process.env.JOB_COMPANIES_JSON = JSON.stringify([{
      name: 'Example Co',
      careerPage: 'https://www.example.com/careers',
      atsProvider: 'greenhouse',
      boardId: 'example'
    }]);
    try {
      assert.deepEqual(getCompanyRegistry(), [{
        name: 'Example Co',
        atsProvider: 'greenhouse',
        boardId: 'example',
        careerPage: 'https://www.example.com/careers',
        domain: 'example.com'
      }]);
    } finally {
      if (previous === undefined) delete process.env.JOB_COMPANIES_JSON;
      else process.env.JOB_COMPANIES_JSON = previous;
    }
  });
  assert.equal(result.skillMatch, 100);
  assert.equal(result.eligibilityMatch, 'does-not-meet-known-authorization');
  assert.equal(result.experienceMatch, 'below-known-years');
});

test('TheirStack uses documented POST search and offset pagination', async () => {
  const previousKey = process.env.THEIRSTACK_API_KEY;
  const previousCountries = process.env.JOB_SEARCH_COUNTRIES;
  const previousPageSize = process.env.THEIRSTACK_PAGE_SIZE;
  const previousMaxPages = process.env.THEIRSTACK_MAX_PAGES;
  const previousLookbackDays = process.env.THEIRSTACK_INITIAL_LOOKBACK_DAYS;
  process.env.THEIRSTACK_API_KEY = 'test-key';
  delete process.env.JOB_SEARCH_COUNTRIES;
  process.env.THEIRSTACK_PAGE_SIZE = '100';
  process.env.THEIRSTACK_MAX_PAGES = '3';
  process.env.THEIRSTACK_INITIAL_LOOKBACK_DAYS = '90';
  const calls = [];
  try {
    const result = await withMockFetch(async (url, options) => {
      calls.push({ url: String(url), options, body: JSON.parse(options.body) });
      const offset = JSON.parse(options.body).offset;
      const data = offset === 0
        ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
        : [{ id: 101 }];
      return Response.json({ data, metadata: { total_results: 101 } });
    }, () => fetchTheirStackJobs());
    assert.equal(result.jobs.length, 101);
    assert.equal(result.pages, 2);
    assert.equal(calls[0].url, 'https://api.theirstack.com/v1/jobs/search');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
    assert.equal(calls[0].body.offset, 0);
    assert.equal(calls[0].body.limit, 100);
    assert.equal(calls[0].body.posted_at_max_age_days, 90);
    assert.equal(calls[1].body.offset, 100);
    assert.ok(calls[0].body.job_title_or.includes('java developer'));
    assert.equal('job_country_code_or' in calls[0].body, false);
  } finally {
    if (previousKey === undefined) delete process.env.THEIRSTACK_API_KEY;
    else process.env.THEIRSTACK_API_KEY = previousKey;
    if (previousCountries === undefined) delete process.env.JOB_SEARCH_COUNTRIES;
    else process.env.JOB_SEARCH_COUNTRIES = previousCountries;
    restoreEnvironment('THEIRSTACK_PAGE_SIZE', previousPageSize);
    restoreEnvironment('THEIRSTACK_MAX_PAGES', previousMaxPages);
    restoreEnvironment('THEIRSTACK_INITIAL_LOOKBACK_DAYS', previousLookbackDays);
  }
});

test('TheirStack resumes pagination with the discovery cursor and offset', async () => {
  const previousKey = process.env.THEIRSTACK_API_KEY;
  const previousPageSize = process.env.THEIRSTACK_PAGE_SIZE;
  const previousMaxPages = process.env.THEIRSTACK_MAX_PAGES;
  process.env.THEIRSTACK_API_KEY = 'test-key';
  process.env.THEIRSTACK_PAGE_SIZE = '2';
  process.env.THEIRSTACK_MAX_PAGES = '2';
  const cursor = new Date('2026-10-25T12:00:00Z');
  try {
    const result = await withMockFetch(async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.offset, 4);
      assert.equal(body.discovered_at_gte, cursor.toISOString());
      return Response.json({ data: [{ id: 'continued' }], metadata: { total_results: 5 } });
    }, () => fetchTheirStackJobs({ startOffset: 4, discoveredAtGte: cursor }));
    assert.equal(result.jobs[0].id, 'continued');
    assert.equal(result.nextOffset, 5);
    assert.equal(result.truncated, false);
  } finally {
    if (previousKey === undefined) delete process.env.THEIRSTACK_API_KEY;
    else process.env.THEIRSTACK_API_KEY = previousKey;
    restoreEnvironment('THEIRSTACK_PAGE_SIZE', previousPageSize);
    restoreEnvironment('THEIRSTACK_MAX_PAGES', previousMaxPages);
  }
});

test('TheirStack reports a credit-aware message for HTTP 402', async () => {
  await withMockFetch(async () => new Response('', { status: 402 }), async () => {
    await assert.rejects(
      fetchJSON('https://api.theirstack.com/v1/jobs/search'),
      /reduce THEIRSTACK_PAGE_SIZE/
    );
  });
});

test('Greenhouse adapter reads the public board jobs endpoint', async () => {
  await withMockFetch(async (url, options) => {
    assert.match(String(url), /boards-api\.greenhouse\.io\/v1\/boards\/sample\/jobs\?content=true/);
    assert.equal(options.method, undefined);
    return Response.json({ jobs: [{ id: 1 }] });
  }, async () => {
    const result = await fetchGreenhouseJobs({ boardId: 'sample' });
    assert.equal(result.jobs.length, 1);
    assert.equal(result.pages, 1);
  });
});

test('Lever adapter paginates with documented skip and limit parameters', async () => {
  const offsets = [];
  await withMockFetch(async url => {
    const parsed = new URL(url);
    offsets.push(parsed.searchParams.get('skip'));
    const skip = Number(parsed.searchParams.get('skip'));
    return Response.json(skip === 0
      ? Array.from({ length: 100 }, (_, id) => ({ id: String(id) }))
      : [{ id: '100' }]);
  }, async () => {
    const result = await fetchLeverJobs({ boardId: 'sample' });
    assert.equal(result.jobs.length, 101);
    assert.equal(result.pages, 2);
  });
  assert.deepEqual(offsets, ['0', '100']);
});

test('Ashby adapter requests compensation from its public job board API', async () => {
  await withMockFetch(async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'api.ashbyhq.com');
    assert.equal(parsed.pathname, '/posting-api/job-board/sample');
    assert.equal(parsed.searchParams.get('includeCompensation'), 'true');
    return Response.json({ jobs: [{ id: 'a', isListed: true }, { id: 'b', isListed: false }] });
  }, async () => {
    const result = await fetchAshbyJobs({ boardId: 'sample' });
    assert.deepEqual(result.jobs.map(job => job.id), ['a']);
    assert.equal(result.pages, 1);
  });
});

test('provider retry honors transient rate limits', async () => {
  let attempts = 0;
  await withMockFetch(async () => {
    attempts++;
    return attempts === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
      : Response.json({ ok: true });
  }, async () => {
    const result = await fetchJSON('https://provider.example/jobs');
    assert.deepEqual(result, { ok: true });
  });
  assert.equal(attempts, 2);
});

function restoreEnvironment(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
