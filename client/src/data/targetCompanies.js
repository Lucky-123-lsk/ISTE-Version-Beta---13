const targetCompanies = [
  {
    name: 'Google',
    careersUrl: 'https://www.google.com/about/careers/applications/',
    roles: ['software', 'frontend', 'backend', 'data', 'ai', 'cloud', 'mobile']
  },
  {
    name: 'Microsoft',
    careersUrl: 'https://careers.microsoft.com/v2/global/en/home.html',
    roles: ['software', 'frontend', 'backend', 'data', 'ai', 'cloud', 'mobile']
  },
  {
    name: 'Amazon',
    careersUrl: 'https://www.amazon.jobs/en/',
    roles: ['software', 'backend', 'data', 'ai', 'cloud', 'mobile']
  },
  {
    name: 'Meta',
    careersUrl: 'https://www.metacareers.com/',
    roles: ['software', 'frontend', 'backend', 'data', 'ai', 'mobile']
  },
  {
    name: 'Apple',
    careersUrl: 'https://jobs.apple.com/',
    roles: ['software', 'frontend', 'data', 'ai', 'mobile']
  },
  {
    name: 'NVIDIA',
    careersUrl: 'https://www.nvidia.com/en-us/about-nvidia/careers/',
    roles: ['software', 'backend', 'data', 'ai', 'cloud']
  },
  {
    name: 'Adobe',
    careersUrl: 'https://careers.adobe.com/',
    roles: ['software', 'frontend', 'backend', 'data', 'ai']
  },
  {
    name: 'IBM',
    careersUrl: 'https://www.ibm.com/careers',
    roles: ['software', 'backend', 'data', 'ai', 'cloud']
  },
  {
    name: 'Salesforce',
    careersUrl: 'https://careers.salesforce.com/',
    roles: ['software', 'frontend', 'backend', 'data', 'ai', 'cloud']
  },
  {
    name: 'Atlassian',
    careersUrl: 'https://www.atlassian.com/company/careers',
    roles: ['software', 'frontend', 'backend', 'cloud']
  },
  {
    name: 'Uber',
    careersUrl: 'https://www.uber.com/us/en/careers/',
    roles: ['software', 'backend', 'data', 'ai', 'mobile']
  },
  {
    name: 'Netflix',
    careersUrl: 'https://jobs.netflix.com/',
    roles: ['software', 'frontend', 'backend', 'data', 'ai']
  }
];

const roleCategories = [
  { category: 'ai', terms: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'data scientist'] },
  { category: 'data', terms: ['data', 'analytics', 'business intelligence', 'bi engineer'] },
  { category: 'cloud', terms: ['cloud', 'devops', 'platform', 'site reliability', 'sre', 'infrastructure', 'kubernetes'] },
  { category: 'mobile', terms: ['mobile', 'android', 'ios', 'flutter', 'react native'] },
  { category: 'frontend', terms: ['frontend', 'front end', 'ui engineer', 'web developer'] },
  { category: 'backend', terms: ['backend', 'back end', 'api developer'] },
  { category: 'software', terms: ['software', 'full stack', 'fullstack', 'application developer', 'computer science'] }
];

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function getTargetCompanies(role) {
  const normalizedRole = normalize(role);
  const categories = roleCategories
    .filter(({ terms }) => terms.some(term => normalizedRole.includes(normalize(term))))
    .map(({ category }) => category);
  const relevant = categories.length
    ? targetCompanies.filter(company => categories.some(category => company.roles.includes(category)))
    : targetCompanies;
  return relevant.slice(0, 8);
}
