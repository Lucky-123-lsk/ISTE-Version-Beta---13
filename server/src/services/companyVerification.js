import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { fetchJSON } from './jobIngestion/http.js';

const adzunaEndpoint = 'https://api.adzuna.com/v1/api/jobs';
const tavilySearchEndpoint = 'https://api.tavily.com/search';
const officialSiteTimeout = 5000;

export function normalizeCompanyName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+(?:(?:limited|ltd|incorporated|inc|corporation|corp|company|co|llc|plc|gmbh|private|pvt)\s*)+$/, '')
    .replace(/\s+/g, ' ');
}

export function getAdzunaCountries() {
  const countries = [...new Set((process.env.ADZUNA_COUNTRIES || 'in')
    .split(',')
    .map(country => country.trim().toLowerCase())
    .filter(Boolean))];
  if (!countries.length || countries.length > 10 || countries.some(country => !/^[a-z]{2}$/.test(country))) {
    throw new Error('ADZUNA_COUNTRIES must contain one to ten comma-separated two-letter country codes.');
  }
  return countries;
}

export async function searchAdzunaCompany(companyName) {
  if (!process.env.ADZUNA_APP_ID?.trim() || !process.env.ADZUNA_APP_KEY?.trim()) {
    throw new Error('Adzuna company search is unavailable because API credentials are not configured.');
  }

  const normalizedName = normalizeCompanyName(companyName);
  const countries = getAdzunaCountries();
  const listings = [];

  for (const country of countries) {
    const url = new URL(`${adzunaEndpoint}/${country}/search/1`);
    url.searchParams.set('app_id', process.env.ADZUNA_APP_ID.trim());
    url.searchParams.set('app_key', process.env.ADZUNA_APP_KEY.trim());
    url.searchParams.set('results_per_page', '20');
    url.searchParams.set('company', companyName);
    url.searchParams.set('sort_by', 'date');
    url.searchParams.set('content-type', 'application/json');

    let payload;
    try {
      payload = await fetchJSON(url);
    } catch (error) {
      const status = String(error?.message || '').match(/\bHTTP (\d{3})\b/)?.[1];
      throw new Error(status
        ? `Adzuna company search failed with HTTP ${status}.`
        : 'Adzuna company search failed.');
    }

    if (!Array.isArray(payload?.results)) {
      throw new Error('Adzuna returned an invalid company search response.');
    }

    for (const listing of payload.results) {
      const displayName = typeof listing?.company?.display_name === 'string'
        ? listing.company.display_name.trim()
        : '';
      if (!displayName || normalizeCompanyName(displayName) !== normalizedName) continue;

      listings.push({
        id: String(listing.id || ''),
        title: String(listing.title || 'Untitled listing').slice(0, 200),
        company: displayName.slice(0, 200),
        location: String(listing.location?.display_name || 'Location not provided').slice(0, 200),
        country: country.toUpperCase(),
        url: isHttpsUrl(listing.redirect_url) ? listing.redirect_url : '',
        createdAt: typeof listing.created === 'string' ? listing.created : null
      });
    }
  }

  return {
    status: listings.length ? 'listed' : 'not-found',
    checkedCountries: countries.map(country => country.toUpperCase()),
    checkedAt: new Date().toISOString(),
    listings: listings.slice(0, 20)
  };
}

export async function searchTavilyCompany(companyName) {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new Error('Public web search is unavailable because TAVILY_API_KEY is not configured.');

  const query = `"${companyName}" company official website business`;
  let payload;
  try {
    payload = await fetchJSON(tavilySearchEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: 8,
        include_answer: false,
        include_raw_content: false
      })
    }, 2);
  } catch (error) {
    const status = String(error?.message || '').match(/\bHTTP (\d{3})\b/)?.[1];
    throw new Error(status
      ? `Tavily web search failed with HTTP ${status}. Check its API key, account limits, and service status.`
      : 'Tavily web search failed. Check network access and try again.');
  }

  if (!Array.isArray(payload?.results)) {
    throw new Error('Tavily returned an invalid web search response.');
  }

  const sources = payload.results.flatMap((result, index) => {
    if (typeof result?.url !== 'string' || typeof result?.title !== 'string') return [];
    try {
      const sourceUrl = new URL(result.url);
      if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname) return [];
      return [{
        id: index + 1,
        title: result.title.trim().slice(0, 200) || sourceUrl.hostname,
        url: sourceUrl.toString(),
        description: String(result.content || result.description || '').trim().slice(0, 1200),
        domain: sourceUrl.hostname
      }];
    } catch {
      return [];
    }
  });

  return {
    query,
    checkedAt: new Date().toISOString(),
    sources
  };
}

export async function checkOfficialSite(companyName, submittedUrl, {
  resolveHost = resolvePublicAddresses,
  requestHead = requestHttpsHead
} = {}) {
  if (!submittedUrl) return { status: 'not-provided', message: 'No company website was supplied.' };

  const url = parseOfficialSiteUrl(submittedUrl);
  const addresses = await resolveHost(url.hostname);
  if (!addresses.length || addresses.some(address => !isPublicIpv4Address(address))) {
    return {
      status: 'not-checked',
      message: 'The site host did not resolve exclusively to public IPv4 addresses.'
    };
  }

  const response = await requestHead(url, addresses[0]);
  return {
    status: response.statusCode >= 200 && response.statusCode < 400 ? 'reachable' : 'responded',
    httpStatus: response.statusCode,
    checkedAt: new Date().toISOString(),
    domain: url.hostname,
    siteUrl: url.toString(),
    domainNameSignal: domainNameSignal(companyName, url.hostname),
    message: response.statusCode >= 200 && response.statusCode < 400
      ? 'The submitted HTTPS site responded. This does not independently verify company ownership.'
      : 'The submitted HTTPS host responded, but the site URL may be unavailable or restricted.'
  };
}

export function parseOfficialSiteUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Enter a valid company website URL beginning with https://.');
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || !url.hostname.includes('.')
    || isIPLiteral(url.hostname)
    || url.hostname.toLowerCase() === 'localhost'
    || url.hostname.toLowerCase().endsWith('.local')
  ) {
    throw new TypeError('Use a public HTTPS company website URL without credentials or a custom port.');
  }

  url.search = '';
  url.hash = '';
  return url;
}

export function isPublicIpv4Address(address) {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4
    || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) return false;

  const [first, second] = parts;
  return !(
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && parts[2] === 0)
    || (first === 192 && second === 2 && parts[2] === 0)
    || (first === 192 && second === 88 && parts[2] === 99)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19 || (second === 51 && parts[2] === 100)))
    || (first === 203 && second === 0 && parts[2] === 113)
    || first >= 224
  );
}

async function resolvePublicAddresses(hostname) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.filter(record => record.family === 4).map(record => record.address);
}

function requestHttpsHead(url, address) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'HEAD',
      agent: false,
      servername: url.hostname,
      timeout: officialSiteTimeout,
      lookup(_hostname, options, callback) {
        if (options?.all) callback(null, [{ address, family: 4 }]);
        else callback(null, address, 4);
      }
    }, response => {
      response.destroy();
      resolve({ statusCode: response.statusCode || 0 });
    });

    request.on('timeout', () => request.destroy(new Error('Company website check timed out.')));
    request.on('error', reject);
    request.end();
  });
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isIPLiteral(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function domainNameSignal(companyName, hostname) {
  const labels = hostname.toLowerCase().split('.').filter(label => label !== 'www');
  const suffixes = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
  const candidate = labels.length > 2 && suffixes.has(labels.at(-2))
    ? labels.at(-3)
    : labels.at(-2);
  const normalizedDomain = normalizeCompanyName(candidate);
  const normalizedCompany = normalizeCompanyName(companyName);
  const matches = Boolean(
    normalizedDomain
    && normalizedCompany
    && (normalizedDomain === normalizedCompany
      || normalizedDomain.includes(normalizedCompany)
      || normalizedCompany.includes(normalizedDomain))
  );

  return matches ? 'name-match-candidate' : 'no-clear-name-match';
}
