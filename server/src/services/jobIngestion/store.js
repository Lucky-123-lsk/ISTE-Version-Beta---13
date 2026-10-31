import Job from '../../models/job.js';
import JobSource from '../../models/jobSource.js';

const searchableFields = [
  'companyName', 'companyDomain', 'description', 'location', 'country', 'countryCode',
  'workplaceType', 'employmentType', 'experienceRequirements', 'requiredSkills',
  'preferredSkills', 'applicationUrl', 'canonicalUrl', 'normalizedTitle', 'normalizedLocation',
  'descriptionHash', 'postedAt', 'salary'
];

export async function persistListing(listing, discoveredAt = new Date()) {
  const identity = {
    provider: listing.provider,
    boardId: listing.boardId || '',
    externalJobId: String(listing.externalJobId)
  };
  let source = await JobSource.findOne(identity);
  let job = source ? await Job.findById(source.jobId) : null;

  if (!job && listing.canonicalKey.startsWith('url:')) {
    job = await Job.findOne({ canonicalKey: listing.canonicalKey });
  }
  if (!job && listing.descriptionHash && listing.companyDomain && listing.normalizedLocation) {
    const candidates = await Job.find({
      companyDomain: listing.companyDomain,
      normalizedTitle: listing.normalizedTitle,
      normalizedLocation: listing.normalizedLocation,
      descriptionHash: listing.descriptionHash
    }).limit(10);
    for (const candidate of candidates) {
      const providers = candidate.sourceRecords.map(record => record.provider);
      if (!providers.includes(listing.provider)) {
        job = candidate;
        break;
      }
    }
  }

  const isNew = !job;
  if (!job) {
    job = new Job({
      ...pickJobFields(listing),
      canonicalKey: listing.canonicalKey,
      firstDiscoveredAt: discoveredAt,
      lastDiscoveredAt: discoveredAt,
      lastVerifiedAt: listing.status === 'active' || listing.status === 'closed' ? discoveredAt : null,
      status: listing.status
    });
  } else {
    mergeUsefulFields(job, listing);
    job.lastDiscoveredAt = discoveredAt;
    if (listing.status === 'active' || listing.status === 'closed') job.lastVerifiedAt = discoveredAt;
    job.status = aggregateStatus([...job.sourceRecords.map(item => item.status), listing.status]);
  }

  if (!source) {
    source = new JobSource({
      ...identity,
      jobId: job._id,
      sourceUrl: listing.sourceUrl,
      applicationUrl: listing.applicationUrl,
      firstDiscoveredAt: discoveredAt,
      lastDiscoveredAt: discoveredAt
    });
  }
  source.jobId = job._id;
  source.sourceUrl = listing.sourceUrl || source.sourceUrl;
  source.applicationUrl = listing.applicationUrl || source.applicationUrl;
  source.lastDiscoveredAt = discoveredAt;
  source.status = listing.status;
  source.verificationEvidence = listing.verificationEvidence;
  source.lastVerifiedAt = listing.status === 'active' || listing.status === 'closed' ? discoveredAt : source.lastVerifiedAt;

  await source.save();
  const sourceRecord = {
    provider: source.provider,
    externalJobId: source.externalJobId,
    boardId: source.boardId,
    sourceUrl: source.sourceUrl,
    applicationUrl: source.applicationUrl,
    firstDiscoveredAt: source.firstDiscoveredAt,
    lastDiscoveredAt: source.lastDiscoveredAt,
    lastVerifiedAt: source.lastVerifiedAt,
    status: source.status,
    verificationEvidence: source.verificationEvidence
  };
  const existingIndex = job.sourceRecords.findIndex(item =>
    item.provider === source.provider
    && item.boardId === source.boardId
    && item.externalJobId === source.externalJobId
  );
  if (existingIndex < 0) job.sourceRecords.push(sourceRecord);
  else job.sourceRecords[existingIndex] = sourceRecord;
  job.status = aggregateStatus(job.sourceRecords.map(item => item.status));
  job.applicationUrl ||= listing.applicationUrl;
  job.canonicalUrl ||= listing.canonicalUrl;
  await job.save();
  return { job, inserted: isNew };
}

export async function updateSourceStatus(source, status, evidence, checkedAt = new Date()) {
  const sourceRecord = await JobSource.findOne({
    provider: source.provider,
    boardId: source.boardId || '',
    externalJobId: String(source.externalJobId)
  });
  if (!sourceRecord) return false;
  sourceRecord.status = status;
  sourceRecord.lastVerifiedAt = checkedAt;
  sourceRecord.verificationEvidence = evidence;
  await sourceRecord.save();
  await Job.updateOne(
    { _id: sourceRecord.jobId, 'sourceRecords.provider': source.provider, 'sourceRecords.boardId': sourceRecord.boardId, 'sourceRecords.externalJobId': sourceRecord.externalJobId },
    { $set: { 'sourceRecords.$.status': status, 'sourceRecords.$.lastVerifiedAt': checkedAt, 'sourceRecords.$.verificationEvidence': evidence } }
  );
  const job = await Job.findById(sourceRecord.jobId);
  if (job) {
    job.status = aggregateStatus(job.sourceRecords.map(item => item.status));
    await job.save();
  }
  return true;
}

export function aggregateStatus(statuses) {
  if (statuses.includes('active')) return 'active';
  if (statuses.length && statuses.every(status => status === 'closed')) return 'closed';
  if (statuses.includes('expired')) return 'expired';
  if (statuses.includes('unverified')) return 'unverified';
  return 'unknown';
}

function pickJobFields(listing) {
  return Object.fromEntries(searchableFields.map(field => [field, listing[field]]));
}

function mergeUsefulFields(job, listing) {
  for (const field of searchableFields) {
    const value = listing[field];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && !value.length) continue;
    if (field === 'salary') {
      job.salary = {
        text: value.text || job.salary?.text || '',
        minimum: value.minimum ?? job.salary?.minimum ?? null,
        maximum: value.maximum ?? job.salary?.maximum ?? null,
        currency: value.currency || job.salary?.currency || '',
        period: value.period || job.salary?.period || ''
      };
    } else {
      job[field] = value;
    }
  }
}
