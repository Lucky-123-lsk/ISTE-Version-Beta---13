import { fetchJSON } from '../http.js';

export async function fetchAshbyJobs(company) {
  const url = new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.boardId)}`);
  url.searchParams.set('includeCompensation', 'true');
  const payload = await fetchJSON(url);
  if (!Array.isArray(payload.jobs)) throw new Error(`Ashby board ${company.boardId} returned an invalid response.`);
  return { jobs: payload.jobs.filter(job => job?.isListed !== false), pages: 1, truncated: false };
}
