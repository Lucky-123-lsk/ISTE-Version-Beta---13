import { getJobCategories } from '../../../config/jobCompanies.js';
import { fetchJSON } from '../http.js';

const endpoint = 'https://api.adzuna.com/v1/api/jobs';

export function isAdzunaConfigured() {
  return Boolean(process.env.ADZUNA_APP_ID?.trim() && process.env.ADZUNA_APP_KEY?.trim());
}

export async function fetchAdzunaJobs({ onPage = async () => {} } = {}) {
  if (!isAdzunaConfigured()) throw new Error('ADZUNA_APP_ID and ADZUNA_APP_KEY are not configured.');

  const countries = getCountries();
  const titles = getJobCategories();
  const pageSize = boundedInteger(process.env.ADZUNA_PAGE_SIZE, 20, 1, 50);
  const maxPages = boundedInteger(process.env.ADZUNA_MAX_PAGES, 2, 1, 100);
  const maxDaysOld = boundedInteger(process.env.ADZUNA_MAX_DAYS_OLD, 30, 1, 3650);
  const jobs = new Map();
  let pages = 0;
  let fetched = 0;
  let truncated = false;

  for (const country of countries) {
    for (const title of titles) {
      for (let page = 1; page <= maxPages; page++) {
        pages++;
        const url = new URL(`${endpoint}/${country}/search/${page}`);
        url.searchParams.set('app_id', process.env.ADZUNA_APP_ID.trim());
        url.searchParams.set('app_key', process.env.ADZUNA_APP_KEY.trim());
        url.searchParams.set('results_per_page', String(pageSize));
        url.searchParams.set('what', title);
        url.searchParams.set('max_days_old', String(maxDaysOld));
        url.searchParams.set('sort_by', 'date');
        url.searchParams.set('content-type', 'application/json');

        let payload;
        try {
          payload = await fetchJSON(url);
        } catch (error) {
          const status = String(error?.message || '').match(/\bHTTP (\d{3})\b/)?.[1];
          const safeError = new Error(status
            ? `Adzuna request failed with HTTP ${status}.`
            : 'Adzuna request failed.');
          safeError.requestCount = pages;
          throw safeError;
        }

        if (!Array.isArray(payload?.results)) {
          const error = new Error('Adzuna returned an invalid search response.');
          error.requestCount = pages;
          throw error;
        }

        const results = payload.results;
        fetched += results.length;
        for (const job of results) {
          if (job?.id === undefined || job?.id === null) continue;
          const countryJob = { ...job, countryCode: country.toUpperCase() };
          jobs.set(`${country}:${job.id}`, countryJob);
        }
        await onPage({ country, title, page, count: results.length, callCount: pages });

        const total = payload.count === undefined || payload.count === null || payload.count === ''
          ? null
          : Number(payload.count);
        if (results.length < pageSize || (Number.isFinite(total) && page * pageSize >= total)) break;
        if (page === maxPages) truncated = true;
      }
    }
  }

  return { jobs: [...jobs.values()], pages, fetched, truncated };
}

function getCountries() {
  const countries = (process.env.ADZUNA_COUNTRIES || 'in')
    .split(',')
    .map(country => country.trim().toLowerCase())
    .filter(Boolean);
  if (!countries.length || countries.some(country => !/^[a-z]{2}$/.test(country))) {
    throw new Error('ADZUNA_COUNTRIES must contain comma-separated two-letter country codes.');
  }
  return [...new Set(countries)];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}
