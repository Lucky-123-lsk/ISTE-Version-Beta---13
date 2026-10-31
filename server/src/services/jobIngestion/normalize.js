import { createHash } from 'crypto';

const skillNames = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'SQL',
  'Java', 'Spring Boot', 'Python', 'Django', 'Flask', 'C++', 'C#', '.NET', 'Go', 'Rust',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Git', 'REST APIs', 'GraphQL', 'HTML',
  'CSS', 'Machine Learning', 'PyTorch', 'TensorFlow', 'Data Structures', 'Algorithms',
  'Linux', 'CI/CD', 'Redis', 'Kafka', 'Selenium', 'Figma'
];

export function cleanText(value = '') {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value = '') {
  return cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function canonicalizeUrl(value = '') {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|source|gh_src|lever-source)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return '';
  }
}

function extractSkills(description) {
  const text = cleanText(description);
  return skillNames.filter(skill => new RegExp(`(^|[^a-z0-9])${escapeRegExp(skill)}(?=$|[^a-z0-9])`, 'i').test(text));
}

function extractSection(text, headers) {
  const header = headers.join('|');
  const match = text.match(new RegExp(`\\b(?:${header})\\b\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\b(?:preferred qualifications|preferred skills|nice to have|bonus points|what we offer|benefits|about us|responsibilities|requirements|qualifications)\\b|$)`, 'i'));
  return match?.[1] || '';
}

function parseEmploymentType(value, description) {
  const text = `${value} ${description}`.toLowerCase();
  if (/intern|internship|co-?op/.test(text)) return 'internship';
  if (/contract|freelance|temporary/.test(text)) return 'contract';
  if (/part.?time/.test(text)) return 'part-time';
  if (/full.?time|regular/.test(text)) return 'full-time';
  return cleanText(value);
}

function parseWorkplaceType(text) {
  if (/\bremote\b/i.test(text)) return 'remote';
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bon.?site|in.?person\b/i.test(text)) return 'onsite';
  return 'unknown';
}

function parseExperience(description) {
  const match = cleanText(description).match(/(?:minimum of |at least |minimum |required )?(\d{1,2}(?:\.\d)?)\+?\s*(?:-\s*\d{1,2}\s*)?years?(?:\s+of)?\s+(?:relevant )?experience/i);
  return match ? match[0].trim() : '';
}

function parseEligibility(description) {
  const text = cleanText(description);
  return text.split(/(?<=[.!?])\s+/).filter(sentence => /work authorization|authorized to work|visa sponsorship|citizenship|security clearance|must be located|must reside|work permit/i.test(sentence)).slice(0, 8);
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeJob({
  provider,
  externalJobId,
  boardId = '',
  companyName,
  companyDomain = '',
  title,
  description = '',
  location = '',
  country = '',
  countryCode = '',
  employmentType = '',
  workplaceType,
  salaryText = '',
  salaryMinimum = null,
  salaryMaximum = null,
  salaryCurrency = '',
  salaryPeriod = '',
  postedAt = null,
  applicationUrl = '',
  sourceUrl = '',
  status = 'unknown',
  verificationEvidence = ''
}) {
  const cleanDescription = cleanText(description);
  const cleanTitle = cleanText(title);
  const cleanCompany = cleanText(companyName);
  const cleanLocation = cleanText(location);
  if (!externalJobId || !cleanTitle || !cleanCompany) return null;
  const requiredText = extractSection(cleanDescription, ['required qualifications', 'minimum qualifications', 'basic qualifications', 'required skills', 'requirements', 'what you will bring', 'what you will need', "what you'll need", "what we're looking for"]);
  const preferredText = extractSection(cleanDescription, ['preferred qualifications', 'preferred skills', 'nice to have', 'bonus points', 'desirable skills']);
  const requiredSkills = extractSkills(requiredText);
  const preferredSkills = extractSkills(preferredText).filter(skill => !requiredSkills.includes(skill));
  const normalizedTitle = normalizeKey(cleanTitle);
  const normalizedLocation = normalizeKey(cleanLocation);
  const canonicalUrl = canonicalizeUrl(applicationUrl);
  const safeSourceUrl = canonicalizeUrl(sourceUrl);
  const descriptionHash = cleanDescription.length > 80
    ? createHash('sha256').update(normalizeKey(cleanDescription)).digest('hex')
    : '';
  const canonicalKey = canonicalUrl
    ? `url:${createHash('sha256').update(canonicalUrl).digest('hex')}`
    : `${provider}:${boardId}:${externalJobId}`;
  const searchableText = `${cleanTitle} ${cleanDescription} ${cleanLocation}`;

  return {
    provider, externalJobId: String(externalJobId), boardId, companyName: cleanCompany,
    companyDomain: String(companyDomain || '').toLowerCase().replace(/^www\./, ''),
    title: cleanTitle, description: cleanDescription, location: cleanLocation,
    country: cleanText(country), countryCode: String(countryCode || '').toUpperCase(),
    employmentType: parseEmploymentType(`${employmentType} ${cleanTitle}`, cleanDescription),
    workplaceType: workplaceType || parseWorkplaceType(`${cleanLocation} ${searchableText}`),
    experienceRequirements: parseExperience(cleanDescription),
    requiredSkills, preferredSkills,
    eligibilityRequirements: parseEligibility(cleanDescription),
    salary: { text: cleanText(salaryText), minimum: numericOrNull(salaryMinimum), maximum: numericOrNull(salaryMaximum), currency: salaryCurrency, period: salaryPeriod },
    postedAt: dateOrNull(postedAt), applicationUrl: canonicalUrl,
    canonicalUrl, canonicalKey, normalizedTitle, normalizedLocation, descriptionHash,
    status, verificationEvidence, sourceUrl: safeSourceUrl
  };
}

export function normalizeTheirStack(job) {
  const url = job.final_url || job.url || '';
  return normalizeJob({
    provider: 'theirstack', externalJobId: job.id, companyName: job.company,
    companyDomain: job.company_domain, title: job.job_title, description: job.description,
    location: job.long_location || job.location || job.short_location,
    country: job.country, countryCode: job.country_code, employmentType: (job.employment_statuses || []).join(', '),
    workplaceType: job.remote ? 'remote' : job.hybrid ? 'hybrid' : undefined,
    salaryText: job.salary_string, salaryMinimum: job.min_annual_salary, salaryMaximum: job.max_annual_salary,
    salaryCurrency: job.salary_currency, salaryPeriod: job.salary_period, postedAt: job.date_posted,
    applicationUrl: url, sourceUrl: job.source_url || url,
    status: job.closed_at ? 'closed' : 'active',
    verificationEvidence: job.closed_at ? `TheirStack returned closed_at=${job.closed_at}.` : 'Observed in TheirStack job search response.'
  });
}

export function normalizeGreenhouse(job, company) {
  return normalizeJob({
    provider: 'greenhouse', externalJobId: job.id, boardId: company.boardId,
    companyName: company.name || job.company_name, companyDomain: company.domain,
    title: job.title, description: job.content, location: job.location?.name,
    employmentType: Array.isArray(job.metadata)
      ? job.metadata.find(item => /employment|job type/i.test(item.name || ''))?.value
      : '',
    postedAt: job.first_published || job.updated_at, applicationUrl: job.absolute_url,
    sourceUrl: company.careerPage, status: 'active',
    verificationEvidence: `Returned in Greenhouse public Job Board API response (${job.updated_at || 'current listing'}).`
  });
}

export function normalizeLever(job, company) {
  return normalizeJob({
    provider: 'lever', externalJobId: job.id, boardId: company.boardId,
    companyName: company.name, companyDomain: company.domain,
    title: job.text, description: job.descriptionPlain || job.description || job.additionalPlain || '',
    location: job.categories?.location || (job.categories?.allLocations || []).join(', '),
    employmentType: job.categories?.commitment,
    postedAt: job.createdAt ? new Date(job.createdAt) : null,
    applicationUrl: job.applyUrl || job.hostedUrl, sourceUrl: company.careerPage,
    status: 'active', verificationEvidence: 'Returned in Lever public Postings API response.'
  });
}

export function normalizeAshby(job, company) {
  const postalAddress = job.address?.postalAddress || {};
  const primaryLocation = job.location || [postalAddress.addressLocality, postalAddress.addressRegion, postalAddress.addressCountry].filter(Boolean).join(', ');
  const location = [primaryLocation, ...(job.secondaryLocations || []).map(item => item.location)].filter(Boolean).join(', ');
  const locationDetails = job.address?.postalAddress || {};
  const salary = job.compensation?.summaryComponents?.find(component => component.compensationType === 'Salary')
    || job.compensation?.compensationTiers?.[0]?.components?.find(component => component.compensationType === 'Salary');
  const workplace = String(job.workplaceType || '').toLowerCase();
  return normalizeJob({
    provider: 'ashby', externalJobId: job.id, boardId: company.boardId,
    companyName: company.name, companyDomain: company.domain,
    title: job.title, description: job.descriptionPlain || job.descriptionHtml || '',
    location, country: locationDetails.addressCountry,
    workplaceType: workplace === 'remote' ? 'remote' : workplace === 'hybrid' ? 'hybrid' : workplace === 'onsite' ? 'onsite' : undefined,
    employmentType: job.employmentType,
    salaryText: job.compensation?.scrapeableCompensationSalarySummary || job.compensation?.compensationTierSummary,
    salaryMinimum: salary?.minValue,
    salaryMaximum: salary?.maxValue,
    salaryCurrency: salary?.currencyCode,
    salaryPeriod: salary?.interval,
    postedAt: job.publishedAt, applicationUrl: job.applyUrl || job.jobUrl,
    sourceUrl: company.careerPage, status: job.isListed === false ? 'unverified' : 'active',
    verificationEvidence: job.isListed === false
      ? 'Ashby marks this posting as not listed on the public board.'
      : 'Returned in Ashby public Job Postings API response.'
  });
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
