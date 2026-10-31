import mongoose from 'mongoose';
import JobSyncRun from '../../models/jobSyncRun.js';
import { getCompanyRegistry } from '../../config/jobCompanies.js';
import { normalizeAdzuna, normalizeAshby, normalizeGreenhouse, normalizeLever, normalizeTheirStack } from './normalize.js';
import { persistListing } from './store.js';
import { fetchAshbyJobs } from './providers/ashby.js';
import { fetchGreenhouseJobs } from './providers/greenhouse.js';
import { fetchLeverJobs } from './providers/lever.js';
import { fetchAdzunaJobs, isAdzunaConfigured } from './providers/adzuna.js';
import { fetchTheirStackJobs, isTheirStackConfigured } from './providers/theirStack.js';

const adapterByProvider = {
  greenhouse: { fetch: fetchGreenhouseJobs, normalize: normalizeGreenhouse },
  lever: { fetch: fetchLeverJobs, normalize: normalizeLever },
  ashby: { fetch: fetchAshbyJobs, normalize: normalizeAshby }
};
let currentRun = null;

export function isSyncRunning() {
  return Boolean(currentRun);
}

export async function synchronizeJobs({ providers } = {}) {
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB is not connected; job synchronization cannot run.');
  if (currentRun) return currentRun;
  currentRun = runSynchronization(providers).finally(() => { currentRun = null; });
  return currentRun;
}

async function runSynchronization(requestedProviders) {
  const registry = getCompanyRegistry();
  const outcomes = [];
  const selected = requestedProviders ? new Set(requestedProviders) : null;
  const theirStackRequested = !selected || selected.has('theirstack');
  if (theirStackRequested && !isTheirStackConfigured()) {
    outcomes.push(await recordSkipped('theirstack', 'THEIRSTACK_API_KEY is not configured.'));
  } else if (theirStackRequested) {
    outcomes.push(await syncTheirStack());
  }

  const adzunaRequested = !selected || selected.has('adzuna');
  if (adzunaRequested && !isAdzunaConfigured()) {
    outcomes.push(await recordSkipped('adzuna', 'ADZUNA_APP_ID and ADZUNA_APP_KEY are not configured.'));
  } else if (adzunaRequested) {
    outcomes.push(await syncAdzuna());
  }

  for (const [provider, adapter] of Object.entries(adapterByProvider)) {
    if (selected && !selected.has(provider)) continue;
    const companies = registry.filter(company => company.atsProvider === provider);
    if (!companies.length) {
      outcomes.push(await recordSkipped(provider, `No ${provider} boards are configured in JOB_COMPANIES_JSON.`));
      continue;
    }
    for (const company of companies) {
      outcomes.push(await syncCompany(provider, company, adapter));
    }
  }
  return { outcomes, completedAt: new Date().toISOString() };
}

async function syncAdzuna() {
  const run = await startRun('adzuna', 'global-search');
  try {
    const { jobs, pages, fetched, truncated } = await fetchAdzunaJobs({
      onPage: async page => {
        run.pages = page.callCount;
        run.fetched += page.count;
        await run.save();
      }
    });
    const persisted = await saveListings(jobs, normalizeAdzuna);
    return await finishRun(run, {
      status: truncated ? 'partial' : 'succeeded',
      fetched, normalized: persisted.normalized, inserted: persisted.inserted,
      updated: persisted.normalized - persisted.inserted, rejected: persisted.rejected, pages,
      error: truncated ? 'Adzuna pagination reached ADZUNA_MAX_PAGES; additional results may remain.' : ''
    });
  } catch (error) {
    if (Number.isInteger(error.requestCount)) run.pages = error.requestCount;
    return await finishRun(run, { status: 'failed', error: safeMessage(error) });
  }
}

async function syncTheirStack() {
  const lastSuccess = await JobSyncRun.findOne({ provider: 'theirstack', status: 'succeeded' }).sort({ completedAt: -1 });
  const latestPending = await JobSyncRun.findOne({
    provider: 'theirstack',
    status: { $in: ['partial', 'failed'] },
    ...(lastSuccess ? { startedAt: { $gt: lastSuccess.startedAt } } : {})
  }).sort({ startedAt: -1 });
  const queryCursor = latestPending ? latestPending.queryCursor : lastSuccess?.cursorAt || null;
  const startOffset = latestPending?.nextOffset || 0;
  const run = await startRun('theirstack', 'global-search', {
    queryCursor,
    cursorAt: lastSuccess?.cursorAt || null,
    nextOffset: startOffset
  });
  try {
    const { jobs, pages, fetched, truncated, nextOffset, maxDiscoveredAt, creditsEstimated } = await fetchTheirStackJobs({
      startOffset,
      discoveredAtGte: queryCursor,
      onPage: async page => {
        run.nextOffset = page.nextOffset;
        if (page.maxDiscoveredAt) run.cursorAt = page.maxDiscoveredAt;
        await run.save();
      }
    });
    const persisted = await saveListings(jobs, normalizeTheirStack);
    return await finishRun(run, {
      status: truncated ? 'partial' : 'succeeded',
      fetched, normalized: persisted.normalized, inserted: persisted.inserted,
      updated: persisted.normalized - persisted.inserted, rejected: persisted.rejected, pages,
      nextOffset: truncated ? nextOffset : 0,
      cursorAt: truncated ? lastSuccess?.cursorAt || null : maxDiscoveredAt || queryCursor,
      queryCursor,
      creditsEstimated,
      error: [truncated ? 'Pagination stopped at THEIRSTACK_MAX_PAGES; the next sync will resume this query offset.' : '', persisted.rejected ? `${persisted.rejected} records lacked required fields and were skipped.` : ''].filter(Boolean).join(' ')
    });
  } catch (error) {
    return await finishRun(run, { status: 'failed', error: safeMessage(error) });
  }
}

async function syncCompany(provider, company, adapter) {
  const run = await startRun(provider, company.boardId);
  try {
    const { jobs: rawJobs, pages, truncated = false } = await adapter.fetch(company);
    const persisted = await saveListings(rawJobs, job => adapter.normalize(job, company));
    return await finishRun(run, {
      status: truncated || persisted.rejected ? 'partial' : 'succeeded',
      fetched: rawJobs.length, normalized: persisted.normalized, inserted: persisted.inserted,
      updated: persisted.normalized - persisted.inserted, rejected: persisted.rejected, pages,
      error: truncated ? 'Pagination stopped at JOB_SYNC_MAX_PAGES; additional results remain.' : ''
    });
  } catch (error) {
    return await finishRun(run, { status: 'failed', error: safeMessage(error) });
  }
}

async function saveListings(rawListings, normalize) {
  let inserted = 0;
  let normalized = 0;
  let rejected = 0;
  const discoveredAt = new Date();
  for (const raw of rawListings) {
    const listing = normalize(raw);
    if (!listing) {
      rejected++;
      continue;
    }
    normalized++;
    const result = await persistListing(listing, discoveredAt);
    if (result.inserted) inserted++;
  }
  return { inserted, normalized, rejected };
}

async function startRun(provider, sourceId = '', state = {}) {
  return JobSyncRun.create({ provider, sourceId, ...state, status: 'running', startedAt: new Date() });
}

async function finishRun(run, result) {
  Object.assign(run, result, { completedAt: new Date() });
  await run.save();
  if (result.status === 'failed') console.error(`Job sync failed for ${run.provider}: ${result.error}`);
  return {
    provider: run.provider, sourceId: run.sourceId, status: run.status, fetched: run.fetched,
    normalized: run.normalized, inserted: run.inserted, updated: run.updated,
    rejected: run.rejected, pages: run.pages, creditsEstimated: run.creditsEstimated,
    nextOffset: run.nextOffset, calls: run.provider === 'adzuna' ? run.pages : undefined, error: run.error
  };
}

async function recordSkipped(provider, error) {
  const now = new Date();
  const run = await JobSyncRun.create({
    provider, status: 'skipped', startedAt: now, completedAt: now, error
  });
  return { provider, sourceId: '', status: run.status, fetched: 0, normalized: 0, inserted: 0, updated: 0, rejected: 0, pages: 0, error };
}

function safeMessage(error) {
  return String(error?.message || 'Unknown provider error').slice(0, 1000);
}
