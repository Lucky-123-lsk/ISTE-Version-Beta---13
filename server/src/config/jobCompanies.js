const providers = new Set(['greenhouse', 'lever', 'ashby']);

export function getCompanyRegistry() {
  const raw = process.env.JOB_COMPANIES_JSON || '[]';
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error('JOB_COMPANIES_JSON must be a valid JSON array.');
  }
  if (!Array.isArray(entries)) throw new Error('JOB_COMPANIES_JSON must be a JSON array.');

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`JOB_COMPANIES_JSON entry ${index + 1} must be an object.`);
    }
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const atsProvider = typeof entry.atsProvider === 'string' ? entry.atsProvider.toLowerCase() : '';
    const boardId = typeof entry.boardId === 'string' ? entry.boardId.trim() : '';
    const careerPage = typeof entry.careerPage === 'string' ? entry.careerPage.trim() : '';
    let domain = typeof entry.domain === 'string' ? entry.domain.trim().toLowerCase() : '';
    if (!name || !providers.has(atsProvider) || !boardId) {
      throw new Error(`JOB_COMPANIES_JSON entry ${index + 1} requires name, a supported atsProvider, and boardId.`);
    }
    if (careerPage) {
      let url;
      try {
        url = new URL(careerPage);
      } catch {
        throw new Error(`JOB_COMPANIES_JSON entry ${index + 1} has an invalid careerPage URL.`);
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`JOB_COMPANIES_JSON entry ${index + 1} careerPage must use HTTP or HTTPS.`);
      }
      if (!domain) domain = url.hostname.toLowerCase().replace(/^www\./, '');
    }
    if (domain && !/^[a-z0-9.-]+$/.test(domain)) {
      throw new Error(`JOB_COMPANIES_JSON entry ${index + 1} has an invalid domain.`);
    }
    return { name, atsProvider, boardId, careerPage, domain };
  });
}

export function getJobCategories() {
  return (process.env.JOB_SEARCH_TITLES || [
    'software engineer intern',
    'backend developer intern',
    'java developer',
    'full stack developer',
    'sde intern',
    'graduate engineer trainee',
    'entry-level software engineer',
    'frontend developer',
    'data engineer',
    'devops engineer',
    'machine learning engineer'
  ].join('|')).split('|').map(value => value.trim()).filter(Boolean);
}
