import { fetchJSON } from '../http.js';

const pageSize = Math.min(100, Math.max(1, Number(process.env.LEVER_PAGE_SIZE) || 100));
const maxPages = Math.max(1, Number(process.env.JOB_SYNC_MAX_PAGES) || 20);

export async function fetchLeverJobs(company) {
  const jobs = new Map();
  let pages = 0;
  let truncated = false;
  for (let skip = 0, page = 0; page < maxPages; page++) {
    const url = new URL(`https://api.lever.co/v0/postings/${encodeURIComponent(company.boardId)}`);
    url.searchParams.set('mode', 'json');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('skip', String(skip));
    const payload = await fetchJSON(url);
    if (!Array.isArray(payload)) throw new Error(`Lever board ${company.boardId} returned an invalid response.`);
    pages++;
    for (const job of payload) if (job?.id) jobs.set(String(job.id), job);
    if (payload.length < pageSize) break;
    if (page === maxPages - 1) {
      truncated = true;
      break;
    }
    skip += payload.length;
  }
  return { jobs: [...jobs.values()], pages, truncated };
}
