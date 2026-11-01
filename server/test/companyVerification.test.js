import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkOfficialSite,
  isPublicIpv4Address,
  normalizeCompanyName,
  parseOfficialSiteUrl,
  searchAdzunaCompany,
  searchTavilyCompany
} from '../src/services/companyVerification.js';

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve()
    .then(callback)
    .finally(() => { globalThis.fetch = originalFetch; });
}

test('company names normalize punctuation and common legal suffixes', () => {
  assert.equal(normalizeCompanyName('Acme Technologies, Inc.'), 'acme technologies');
  assert.equal(normalizeCompanyName('ACME TECHNOLOGIES Ltd'), 'acme technologies');
});

test('Adzuna company search only returns exact normalized company-name matches', async () => {
  await withEnvironment({
    ADZUNA_APP_ID: 'test-app',
    ADZUNA_APP_KEY: 'test-key',
    ADZUNA_COUNTRIES: 'in,gb'
  }, () => withMockFetch(async url => {
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.searchParams.get('company'), 'Acme Technologies, Inc.');
    return Response.json({
      results: parsedUrl.pathname.includes('/in/')
        ? [
            {
              id: 'matching-job',
              title: 'Engineer',
              company: { display_name: 'ACME TECHNOLOGIES Ltd' },
              location: { display_name: 'India' },
              redirect_url: 'https://adzuna.example/job/1'
            },
            {
              id: 'different-job',
              company: { display_name: 'Acme Technology Partners' }
            }
          ]
        : []
    });
  }, async () => {
    const result = await searchAdzunaCompany('Acme Technologies, Inc.');
    assert.equal(result.status, 'listed');
    assert.deepEqual(result.checkedCountries, ['IN', 'GB']);
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0].id, 'matching-job');
    assert.equal(result.listings[0].country, 'IN');
  }));
});

test('Adzuna company search reports no exact matches', async () => {
  await withEnvironment({
    ADZUNA_APP_ID: 'test-app',
    ADZUNA_APP_KEY: 'test-key',
    ADZUNA_COUNTRIES: 'in'
  }, () => withMockFetch(async () => Response.json({
    results: [{ company: { display_name: 'Acme Other' } }]
  }), async () => {
    const result = await searchAdzunaCompany('Acme Technologies');
    assert.equal(result.status, 'not-found');
    assert.equal(result.listings.length, 0);
  }));
});

test('Tavily company search returns only HTTPS sources and sends API key in request body', async () => {
  await withEnvironment({ TAVILY_API_KEY: 'tavily-test-key' }, () => withMockFetch(async (url, options) => {
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    const requestBody = JSON.parse(options.body);
    assert.match(requestBody.query, /Acme Technologies/);
    assert.equal(requestBody.api_key, 'tavily-test-key');
    assert.equal(requestBody.search_depth, 'basic');
    assert.equal(requestBody.max_results, 8);
    return Response.json({
      results: [
        {
          title: 'Acme official site',
          url: 'https://acme.example/about',
          content: 'About the company'
        },
        {
          title: 'Unsafe result',
          url: 'http://acme.example/login',
          content: 'Not HTTPS'
        },
        {
          title: 'Invalid result',
          url: 'javascript:alert(1)',
          content: 'Not a web source'
        }
      ]
    });
  }, async () => {
    const result = await searchTavilyCompany('Acme Technologies');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].url, 'https://acme.example/about');
    assert.equal(result.sources[0].description, 'About the company');
    assert.equal(result.sources[0].domain, 'acme.example');
  }));
});

test('Tavily search explains missing server-side credentials', async () => {
  await withEnvironment({ TAVILY_API_KEY: '' }, async () => {
    await assert.rejects(searchTavilyCompany('Acme'), /TAVILY_API_KEY/);
  });
});

test('company website checks require a public HTTPS hostname and strip query data', () => {
  const url = parseOfficialSiteUrl('https://careers.acme.com/jobs?access_token=secret#top');
  assert.equal(url.toString(), 'https://careers.acme.com/jobs');
  assert.throws(() => parseOfficialSiteUrl('http://acme.com'), /public HTTPS/);
  assert.throws(() => parseOfficialSiteUrl('https://127.0.0.1'), /public HTTPS/);
  assert.throws(() => parseOfficialSiteUrl('https://acme.local'), /public HTTPS/);
});

test('company website check pins requests to a public address and reports cautious evidence', async () => {
  let requestedUrl;
  const result = await checkOfficialSite('Acme, Inc.', 'https://careers.acme.com/', {
    resolveHost: async hostname => {
      assert.equal(hostname, 'careers.acme.com');
      return ['93.184.216.34'];
    },
    requestHead: async (url, address) => {
      requestedUrl = url.toString();
      assert.equal(address, '93.184.216.34');
      return { statusCode: 200 };
    }
  });

  assert.equal(result.status, 'reachable');
  assert.equal(result.domainNameSignal, 'name-match-candidate');
  assert.equal(result.siteUrl, requestedUrl);
  assert.match(result.message, /does not independently verify company ownership/);
});

test('company website check does not connect to private or special-purpose addresses', async () => {
  let requestAttempted = false;
  const result = await checkOfficialSite('Acme', 'https://careers.acme.com', {
    resolveHost: async () => ['192.168.1.10'],
    requestHead: async () => {
      requestAttempted = true;
      return { statusCode: 200 };
    }
  });

  assert.equal(result.status, 'not-checked');
  assert.equal(requestAttempted, false);
  assert.equal(isPublicIpv4Address('93.184.216.34'), true);
  assert.equal(isPublicIpv4Address('10.0.0.8'), false);
  assert.equal(isPublicIpv4Address('169.254.1.1'), false);
});
