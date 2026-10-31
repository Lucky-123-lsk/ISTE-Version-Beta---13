import { fetchJSON } from '../http.js';

export async function fetchGreenhouseJobs(company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.boardId)}/jobs?content=true`;
  const payload = await fetchJSON(url);
  if (!Array.isArray(payload.jobs)) throw new Error(`Greenhouse board ${company.boardId} returned an invalid response.`);
  return { jobs: payload.jobs, pages: 1, truncated: false };
}
