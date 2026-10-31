// High-quality, realistic sample jobs for demonstration and graceful fallback.
// Every record strictly adheres to the schema returned by /api/jobs and toJobResponse().

export const SAMPLE_JOBS = [
  {
    id: 'demo-job-1',
    title: 'Frontend Engineer',
    company: 'Northwind Labs',
    companyDomain: 'northwindlabs.com',
    location: 'Bengaluru, India',
    country: 'India',
    countryCode: 'IN',
    type: 'Full-time',
    employmentType: 'full-time',
    workplaceType: 'hybrid',
    experienceRequirements: '1-3 years experience in web application development',
    skills: ['React', 'JavaScript', 'Tailwind', 'REST APIs', 'Git'],
    requiredSkills: ['React', 'JavaScript', 'REST APIs'],
    preferredSkills: ['Tailwind', 'Git'],
    skillMatch: 86,
    matchedSkills: ['React', 'JavaScript'],
    missingSkills: ['REST APIs'],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'bridge',
    match: 86,
    why: 'Strong overlap in React and JavaScript. Missing REST APIs can be bridged with practical integration projects.',
    salary: { text: '₹14–20 LPA', min: 1400000, max: 2000000, currency: 'INR' },
    postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    applicationUrl: 'https://careers.northwindlabs.com/jobs/frontend-eng-blr',
    sourceUrl: 'https://careers.northwindlabs.com/jobs/frontend-eng-blr',
    sources: [
      {
        provider: 'greenhouse',
        externalJobId: 'nw-fe-409',
        status: 'active',
        lastVerifiedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
        verificationEvidence: 'Listed on greenhouse.io/northwindlabs board; HTTP 200 OK with matching title and domain'
      }
    ],
    status: 'active',
    lastVerifiedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    estimatedMinutes: 25,
    description: 'Join our core platform team building accessible, performant analytics dashboards for enterprise operations teams. You will collaborate closely with product designers, write maintainable React components, connect backend microservices via REST, and uphold high accessibility and unit-testing standards.',
    trust: {
      status: 'active',
      source: 'Greenhouse public company job board',
      deadline: '20 Nov 2026 (estimated rolling review)',
      duplicate: 'No cross-source duplicate detected',
      application: 'Verified active on Northwind Labs public board',
      flags: ['Verified employer career domain matches canonical application URL', 'Source response confirmed within the last 24 hours']
    },
    isSample: true
  },
  {
    id: 'demo-job-2',
    title: 'Software Development Intern',
    company: 'Contoso Systems',
    companyDomain: 'contososystems.com',
    location: 'Remote (India)',
    country: 'India',
    countryCode: 'IN',
    type: 'Internship',
    employmentType: 'internship',
    workplaceType: 'remote',
    experienceRequirements: '0-1 years / Fresher or Final-year graduate',
    skills: ['Python', 'REST APIs', 'Git', 'JavaScript', 'Node.js'],
    requiredSkills: ['JavaScript', 'Git'],
    preferredSkills: ['Python', 'Node.js', 'REST APIs'],
    skillMatch: 75,
    matchedSkills: ['JavaScript', 'Node.js'],
    missingSkills: ['Git', 'Python'],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'growth',
    match: 75,
    why: 'Good growth opportunity for beginners. JavaScript and Node.js overlap well, with mentorship provided for Python tooling.',
    salary: { text: '₹30,000 / month stipend', min: 30000, max: 30000, currency: 'INR' },
    postedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    applicationUrl: 'https://contososystems.com/careers/intern-sde',
    sourceUrl: 'https://contososystems.com/careers/intern-sde',
    sources: [
      {
        provider: 'lever',
        externalJobId: 'cs-intern-2026',
        status: 'active',
        lastVerifiedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
        verificationEvidence: 'Published on lever.co/contoso; canonical URL verified'
      }
    ],
    status: 'active',
    lastVerifiedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    estimatedMinutes: 15,
    description: 'Our engineering developer tooling team is seeking a software development intern for a 6-month hands-on program. You will build internal automation scripts, assist in creating developer documentation, write unit tests, and contribute to production internal APIs.',
    trust: {
      status: 'active',
      source: 'Lever ATS official company postings',
      deadline: '15 Nov 2026 (fixed cohort intake)',
      duplicate: 'No cross-source duplicate detected',
      application: 'Direct Lever posting with verified SSL domain',
      flags: ['Direct ATS source with verified company domain']
    },
    isSample: true
  },
  {
    id: 'demo-job-3',
    title: 'Mobile App Developer',
    company: 'Fabrikam Health',
    companyDomain: 'fabrikamhealth.in',
    location: 'Indore, Madhya Pradesh',
    country: 'India',
    countryCode: 'IN',
    type: 'Full-time',
    employmentType: 'full-time',
    workplaceType: 'hybrid',
    experienceRequirements: '1-2 years mobile experience',
    skills: ['Flutter', 'Dart', 'Firebase', 'REST APIs'],
    requiredSkills: ['Flutter', 'REST APIs'],
    preferredSkills: ['Dart', 'Firebase'],
    skillMatch: 45,
    matchedSkills: [],
    missingSkills: ['Flutter', 'REST APIs'],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'stretch',
    match: 45,
    why: 'Transferable web skills apply to cross-platform concepts, but core Flutter and Dart expertise must be acquired.',
    salary: { text: '₹8–12 LPA (estimated)', min: 800000, max: 1200000, currency: 'INR' },
    postedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    applicationUrl: 'https://fabrikamhealth.in/jobs/mobile-dev',
    sourceUrl: 'https://in.adzuna.com/land/ad/4892184920',
    sources: [
      {
        provider: 'adzuna',
        externalJobId: 'adz-fab-391',
        status: 'unknown',
        lastVerifiedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
        verificationEvidence: 'Ingested via Adzuna job aggregator. Stale verification (>7 days since last provider confirmation).'
      }
    ],
    status: 'needs-review',
    lastVerifiedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    estimatedMinutes: 35,
    description: 'Fabrikam Health develops digital diagnostic monitoring systems. We need a mobile engineer to build and polish our patient-facing application. Work with reactive state management, offline-first caching, and HIPAA-compliant REST synchronization.',
    trust: {
      status: 'needs-review',
      source: 'Adzuna aggregator feed',
      deadline: 'Not stated by employer',
      duplicate: 'Aggregator re-post without direct employer board link',
      application: 'Redirects through Adzuna affiliate tracking link',
      flags: ['Listing verified >7 days ago; recheck original posting before applying', 'Aggregator snippet — verify actual requirements on company website']
    },
    isSample: true
  },
  {
    id: 'demo-job-4',
    title: 'Full Stack AI Engineer',
    company: 'Solaria Cloud Tech',
    companyDomain: 'solariacloud.io',
    location: 'Hyderabad / Remote',
    country: 'India',
    countryCode: 'IN',
    type: 'Full-time',
    employmentType: 'full-time',
    workplaceType: 'remote',
    experienceRequirements: '2+ years full stack engineering',
    skills: ['React', 'Node.js', 'Python', 'FastAPI', 'Vector Databases', 'TypeScript'],
    requiredSkills: ['React', 'Node.js', 'Python'],
    preferredSkills: ['FastAPI', 'Vector Databases', 'TypeScript'],
    skillMatch: 70,
    matchedSkills: ['React', 'Node.js'],
    missingSkills: ['Python'],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'growth',
    match: 70,
    why: 'Strong foundation in React and Node.js directly matches frontend & API requirements. Excellent role to expand Python and AI pipelines.',
    salary: { text: '₹18–26 LPA', min: 1800000, max: 2600000, currency: 'INR' },
    postedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    applicationUrl: 'https://ashbyhq.com/solaria/job/ai-fullstack',
    sourceUrl: 'https://ashbyhq.com/solaria/job/ai-fullstack',
    sources: [
      {
        provider: 'ashby',
        externalJobId: 'ash-sol-892',
        status: 'active',
        lastVerifiedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        verificationEvidence: 'Direct Ashby board query verified active today'
      }
    ],
    status: 'active',
    lastVerifiedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    estimatedMinutes: 30,
    description: 'Solaria builds autonomous workflow copilots for cloud DevOps. We are hiring a Full Stack AI Engineer to bridge our LLM inference microservices with responsive, interactive web interfaces. You will build streaming completions, prompt orchestration endpoints, and resilient WebSocket pipelines.',
    trust: {
      status: 'active',
      source: 'Ashby public job board API',
      deadline: 'Rolling review until position filled',
      duplicate: 'No cross-source duplicate detected',
      application: 'Direct verified Ashby ATS application',
      flags: ['Verified ATS board endpoint', 'Fresh listing confirmed within 2 hours']
    },
    isSample: true
  },
  {
    id: 'demo-job-5',
    title: 'Junior Data & Security Analyst',
    company: 'Adatum Cyber',
    companyDomain: 'adatumcyber.com',
    location: 'Hyderabad, India',
    country: 'India',
    countryCode: 'IN',
    type: 'Full-time',
    employmentType: 'full-time',
    workplaceType: 'onsite',
    experienceRequirements: '0-2 years relevant experience',
    skills: ['Python', 'SQL', 'Networking', 'Linux', 'Security Fundamentals'],
    requiredSkills: ['Networking', 'Linux'],
    preferredSkills: ['Python', 'SQL'],
    skillMatch: 40,
    matchedSkills: [],
    missingSkills: ['Networking', 'Linux'],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'stretch',
    match: 40,
    why: 'Role focuses heavily on network infrastructure and SOC operations; requires upskilling in Linux systems and TCP/IP protocol analysis.',
    salary: { text: '₹6–9 LPA', min: 600000, max: 900000, currency: 'INR' },
    postedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    applicationUrl: 'https://adatumcyber.com/careers/analyst-trainee',
    sourceUrl: 'https://adatumcyber.com/careers/analyst-trainee',
    sources: [
      {
        provider: 'greenhouse',
        externalJobId: 'gh-adatum-108',
        status: 'active',
        lastVerifiedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
        verificationEvidence: 'Direct Greenhouse board record'
      }
    ],
    status: 'active',
    lastVerifiedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
    estimatedMinutes: 30,
    description: 'Monitor threat detection logs, write security triage runbooks, and investigate vulnerability tickets alongside senior security analysts. Comprehensive training provided on SIEM tools and incident reporting.',
    trust: {
      status: 'active',
      source: 'Greenhouse public company board',
      deadline: '25 Nov 2026',
      duplicate: 'Single source canonical record',
      application: 'Official Adatum Cyber career portal',
      flags: ['Verified employer career domain']
    },
    isSample: true
  },
  {
    id: 'demo-job-6',
    title: 'Associate Product Operations Specialist',
    company: 'Tailspin Retail',
    companyDomain: 'tailspinretail.com',
    location: 'Pune, Maharashtra',
    country: 'India',
    countryCode: 'IN',
    type: 'Full-time',
    employmentType: 'full-time',
    workplaceType: 'hybrid',
    experienceRequirements: '1-3 years in product ops, QA, or technical project support',
    skills: ['SQL', 'Spreadsheets', 'Documentation', 'Project Delivery', 'Agile'],
    requiredSkills: ['Documentation', 'Project Delivery'],
    preferredSkills: ['SQL', 'Spreadsheets'],
    skillMatch: 80,
    matchedSkills: ['Documentation', 'Project Delivery'],
    missingSkills: [],
    eligibilityMatch: 'matches-known-authorization',
    experienceMatch: 'meets-known-years',
    category: 'bridge',
    match: 80,
    why: 'Transferable skills in project delivery and technical documentation strongly qualify you for this operational bridge role.',
    salary: { text: '₹8–12 LPA', min: 800000, max: 1200000, currency: 'INR' },
    postedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    applicationUrl: 'https://tailspinretail.com/jobs/prod-ops',
    sourceUrl: 'https://tailspinretail.com/jobs/prod-ops',
    sources: [
      {
        provider: 'theirstack',
        externalJobId: 'ts-tailspin-44',
        status: 'unknown',
        lastVerifiedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        verificationEvidence: 'Indexed via TheirStack search API. Last verified 10 days ago.'
      }
    ],
    status: 'possibly-outdated',
    lastVerifiedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    estimatedMinutes: 40,
    description: 'Bridge engineering and merchant operations teams by triaging workflow tickets, preparing release documentation, and tracking KPI dashboards for our retail catalog system.',
    trust: {
      status: 'possibly-outdated',
      source: 'TheirStack search index',
      deadline: 'Not specified',
      duplicate: 'Re-indexed record from public job listing',
      application: 'Tailspin careers portal link (check if opening remains unfulfilled)',
      flags: ['Stale verification status (>7 days old)', 'Confirm listing is still accepting applicants on company page']
    },
    isSample: true
  }
];

export const INITIAL_APPLICATIONS = [
  {
    id: 'app-init-1',
    jobId: 'demo-job-1',
    jobTitle: 'Frontend Engineer',
    companyName: 'Northwind Labs',
    status: 'Interview',
    history: [
      { status: 'Planned', at: new Date(Date.now() - 10 * 86400000).toISOString() },
      { status: 'Applied', at: new Date(Date.now() - 8 * 86400000).toISOString() },
      { status: 'Assessment', at: new Date(Date.now() - 5 * 86400000).toISOString() },
      { status: 'Interview', at: new Date(Date.now() - 1 * 86400000).toISOString() }
    ],
    notes: 'Technical discussion on React 18 concurrent features & state management scheduled.',
    interviewDate: 'Upcoming: Nov 4, 2026 at 3:00 PM IST',
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString()
  },
  {
    id: 'app-init-2',
    jobId: 'demo-job-2',
    jobTitle: 'Software Development Intern',
    companyName: 'Contoso Systems',
    status: 'Applied',
    history: [
      { status: 'Planned', at: new Date(Date.now() - 6 * 86400000).toISOString() },
      { status: 'Applied', at: new Date(Date.now() - 3 * 86400000).toISOString() }
    ],
    notes: 'Submitted customized resume statement highlighting JavaScript API projects.',
    interviewDate: null,
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: 'app-init-3',
    jobId: 'demo-job-4',
    jobTitle: 'Full Stack AI Engineer',
    companyName: 'Solaria Cloud Tech',
    status: 'Planned',
    history: [
      { status: 'Planned', at: new Date(Date.now() - 2 * 86400000).toISOString() }
    ],
    notes: 'High priority growth opportunity. Budgeted 30 mins to tailor ProofPath evidence draft.',
    interviewDate: null,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString()
  },
  {
    id: 'app-init-4',
    jobId: 'demo-job-5',
    jobTitle: 'Junior Data & Security Analyst',
    companyName: 'Adatum Cyber',
    status: 'Rejected',
    history: [
      { status: 'Applied', at: new Date(Date.now() - 20 * 86400000).toISOString() },
      { status: 'Rejected', at: new Date(Date.now() - 12 * 86400000).toISOString() }
    ],
    notes: 'Resume screening stage. Employer feedback cited need for deep Linux sysadmin coursework.',
    interviewDate: null,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 86400000).toISOString()
  }
];

