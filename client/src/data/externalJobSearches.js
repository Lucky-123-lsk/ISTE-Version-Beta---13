function clean(value) {
  return String(value || '').trim();
}

function getIndeedHost(country) {
  const normalized = clean(country).toLowerCase();
  if (/\b(india|in)\b/.test(normalized)) return 'https://in.indeed.com/jobs';
  if (/\b(canada|ca)\b/.test(normalized)) return 'https://ca.indeed.com/jobs';
  if (/\b(united kingdom|uk|gb)\b/.test(normalized)) return 'https://uk.indeed.com/jobs';
  if (/\b(australia|au)\b/.test(normalized)) return 'https://au.indeed.com/jobs';
  return 'https://www.indeed.com/jobs';
}

export function buildExternalJobSearches({ role, skills = [], location, country } = {}) {
  const targetRole = clean(role);
  const targetSkills = [...new Set(skills.map(clean).filter(Boolean))].slice(0, 3);
  const targetLocation = clean(location);
  const keywords = [targetRole, ...targetSkills].filter(Boolean).join(' ');
  const searches = [
    {
      id: 'linkedin',
      name: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs/search/',
      params: { keywords, location: targetLocation }
    },
    {
      id: 'naukri',
      name: 'Naukri',
      url: 'https://www.naukri.com/jobs-in-india',
      params: { k: keywords, l: targetLocation }
    },
    {
      id: 'indeed',
      name: 'Indeed',
      url: getIndeedHost(country),
      params: { q: keywords, l: targetLocation }
    }
  ];

  return searches.map(search => {
    const url = new URL(search.url);
    for (const [key, value] of Object.entries(search.params)) {
      if (value) url.searchParams.set(key, value);
    }
    return { id: search.id, name: search.name, url: url.toString() };
  });
}
