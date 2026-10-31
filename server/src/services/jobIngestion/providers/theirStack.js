import { getJobCategories } from '../../../config/jobCompanies.js';
import { fetchJSON } from '../http.js';

const endpoint = 'https://api.theirstack.com/v1/jobs/search';

export function isTheirStackConfigured() {
  return Boolean(process.env.THEIRSTACK_API_KEY);
}

export async function fetchTheirStackJobs({ onPage = async () => {}, startOffset = 0, discoveredAtGte = null } = {}) {
  if (!isTheirStackConfigured()) throw new Error('THEIRSTACK_API_KEY is not configured.');
  const pageSize = boundedInteger(process.env.THEIRSTACK_PAGE_SIZE, 50, 1, 500);
  const maxPages = boundedInteger(process.env.THEIRSTACK_MAX_PAGES, 2, 1, 100);
  const lookbackDays = boundedInteger(process.env.THEIRSTACK_INITIAL_LOOKBACK_DAYS, 90, 1, 3650);
  const jobs = new Map();
  let offset = startOffset;
  let pages = 0;
  let total = null;
  let fetched = 0;
  let maxDiscoveredAt = null;
  let lastPageSize = 0;
  let nextOffset = startOffset;
  while (pages < maxPages) {
    const payload = await fetchJSON(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.THEIRSTACK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        job_title_or: getJobCategories(),
        posted_at_max_age_days: lookbackDays,
        ...(discoveredAtGte ? { discovered_at_gte: discoveredAtGte.toISOString() } : {}),
        ...(process.env.JOB_SEARCH_COUNTRIES ? {
          job_country_code_or: process.env.JOB_SEARCH_COUNTRIES
            .split(',').map(country => country.trim().toUpperCase()).filter(Boolean)
        } : {}),
        limit: pageSize,
        offset
      })
    });
    if (!Array.isArray(payload?.data)) throw new Error('TheirStack response did not contain the documented data array.');
    const data = payload.data;
    pages++;
    fetched += data.length;
    lastPageSize = data.length;
    total = Number.isFinite(payload.metadata?.total_results) ? payload.metadata.total_results : total;
    for (const item of data) {
      if (item?.id !== undefined && item?.id !== null) jobs.set(String(item.id), item);
      const discoveredAt = item?.discovered_at ? new Date(item.discovered_at) : null;
      if (discoveredAt && !Number.isNaN(discoveredAt.getTime()) && (!maxDiscoveredAt || discoveredAt > maxDiscoveredAt)) {
        maxDiscoveredAt = discoveredAt;
      }
    }
    nextOffset = offset + data.length;
    await onPage({ page: pages, count: data.length, nextOffset, maxDiscoveredAt });
    if (data.length < pageSize || !data.length || (total !== null && nextOffset >= total)) break;
    offset += data.length;
  }
  const truncated = pages >= maxPages && lastPageSize === pageSize && (total === null || nextOffset < total);
  return {
    jobs: [...jobs.values()],
    pages,
    fetched,
    nextOffset,
    maxDiscoveredAt,
    truncated,
    creditsEstimated: fetched
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) return fallback;
  return Math.min(parsed, maximum);
}
