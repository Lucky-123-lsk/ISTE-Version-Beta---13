import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSkillGaps, extractResumeProfile, generateResumeSuggestions, researchCompanyWithGroq } from '../src/services/aiProvider.js';

async function withMockAIResponse(content, callback) {
  const originalFetch = globalThis.fetch;
  const previous = {
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL
  };
  process.env.AI_PROVIDER = 'groq';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }]
    });
  };
  try {
    return await callback(() => requestBody);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('resume extraction rejects invented personal details and portfolio URLs', async () => {
  const resumeText = 'Alice Johnson\nalice@example.com\n+1 555 123 4567\nlinkedin.com/in/alice-johnson\nFrontend Engineer';
  await withMockAIResponse({
    personalInfo: {
      fullName: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+1 555 123 4567',
      location: 'San Francisco',
      linkedIn: 'https://linkedin.com/in/alice-johnson',
      github: 'https://github.com/alice-johnson',
      portfolio: 'https://random-portfolio.example',
      summary: 'Invented professional summary'
    }
  }, async () => {
    const result = await extractResumeProfile({ resumeText });
    assert.equal(result.personalInfo.fullName, 'Alice Johnson');
    assert.equal(result.personalInfo.email, 'alice@example.com');
    assert.equal(result.personalInfo.phone, '+1 555 123 4567');
    assert.equal(result.personalInfo.location, '');
    assert.equal(result.personalInfo.linkedIn, 'https://linkedin.com/in/alice-johnson');
    assert.equal(result.personalInfo.github, '');
    assert.equal(result.personalInfo.portfolio, '');
    assert.equal(result.personalInfo.summary, '');
  });
});

test('resume extraction accepts a portfolio URL only when it appears in the resume', async () => {
  const resumeText = 'Alice Johnson\nPortfolio: https://alice.dev/work';
  await withMockAIResponse({
    personalInfo: { portfolioUrl: 'https://alice.dev/work' }
  }, async () => {
    const result = await extractResumeProfile({ resumeText });
    assert.equal(result.personalInfo.portfolio, 'https://alice.dev/work');
  });
});

test('resume extraction fills clear personal details from source text when AI omits them', async () => {
  const resumeText = [
    'Morgan Patel',
    'morgan.patel@example.com',
    '+91 98765 43210',
    'linkedin.com/in/morgan-patel',
    'https://morganpatel.dev'
  ].join('\n');
  await withMockAIResponse({ personalInfo: {} }, async () => {
    const result = await extractResumeProfile({ resumeText });
    assert.deepEqual(result.personalInfo, {
      fullName: 'Morgan Patel',
      email: 'morgan.patel@example.com',
      phone: '+91 98765 43210',
      location: '',
      linkedIn: 'https://linkedin.com/in/morgan-patel',
      github: '',
      portfolio: 'https://morganpatel.dev/',
      summary: ''
    });
  });
});

test('skill gap AI recommendations stay restricted to supplied learning or unconfirmed skills', async () => {
  await withMockAIResponse({
    recommendations: [
      {
        skill: 'Python',
        nextStep: 'Build a small data pipeline that reads a public dataset and validates its output.',
        proof: 'Keep the repository, tests, and a short architecture note.'
      },
      {
        skill: 'Kubernetes',
        nextStep: 'Invent a senior Kubernetes credential and claim it on the resume.',
        proof: 'A credential'
      },
      {
        skill: 'Made-up skill',
        nextStep: 'Build a demonstration project for this invented skill.',
        proof: 'A project repository'
      }
    ]
  }, async getRequestBody => {
    const result = await analyzeSkillGaps({
      role: 'Data Engineer AI',
      jobCount: 6,
      skills: [
        { name: 'Python', status: 'learning', listingCount: 4, requiredCount: 3, preferredCount: 1, descriptionMentionCount: 2 },
        { name: 'Kubernetes', status: 'verified', listingCount: 2, requiredCount: 1, preferredCount: 0 }
      ]
    });
    const prompt = getRequestBody().messages[1].content;
    assert.deepEqual(result.recommendations.map(item => item.skill), ['Python']);
    assert.match(prompt, /Data Engineer AI/);
    assert.match(prompt, /descriptionMentionCount/);
    assert.match(prompt, /not necessarily requirements/);
    assert.doesNotMatch(prompt, /resume|@example\.com/i);
  });
});

  test('company research sends Tavily sources to Groq and validates cited source IDs', async () => {
    const originalFetch = globalThis.fetch;
    const previous = {
      provider: process.env.AI_PROVIDER,
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL,
      groqApiKey: process.env.GROQ_API_KEY,
      groqCompanyModel: process.env.GROQ_COMPANY_MODEL
    };
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_API_KEY = 'gemini-key';
    process.env.GROQ_API_KEY = 'groq-key';
    delete process.env.GROQ_COMPANY_MODEL;
    delete process.env.AI_MODEL;
    let requestUrl;
    let requestOptions;
    globalThis.fetch = async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Public sources describe Acme as a software company.',
              assessment: 'some_public_evidence',
              findings: [{
                topic: 'official_presence',
                detail: 'The company website describes its products.',
                confidence: 'medium',
                sourceIds: [1, 999]
              }]
            })
          }
        }]
      });
    };
    try {
      const result = await researchCompanyWithGroq({
        companyName: 'Acme',
        officialSiteUrl: 'https://acme.example',
        searchQuery: '"Acme" company official website business',
        searchResults: [{
          id: 1,
          title: 'About Acme',
          url: 'https://acme.example/about',
          description: 'Acme builds software products.',
          domain: 'acme.example'
        }]
      });
      const body = JSON.parse(requestOptions.body);
      assert.equal(requestUrl, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(requestOptions.headers.Authorization, 'Bearer groq-key');
      assert.equal(body.model, 'openai/gpt-oss-120b');
      assert.match(body.messages[1].content, /Acme/);
      assert.equal(result.status, 'grounded');
      assert.equal(result.assessment, 'some_public_evidence');
      assert.equal(result.sources.length, 1);
      assert.equal(result.sources[0].url, 'https://acme.example/about');
      assert.equal(result.findings[0].topic, 'official_presence');
      assert.deepEqual(result.findings[0].sourceIds, [1]);
    } finally {
      globalThis.fetch = originalFetch;
      const keys = {
        provider: 'AI_PROVIDER',
        apiKey: 'AI_API_KEY',
        model: 'AI_MODEL',
        groqApiKey: 'GROQ_API_KEY',
        groqCompanyModel: 'GROQ_COMPANY_MODEL'
      };
      for (const [key, value] of Object.entries(previous)) {
        const envKey = keys[key];
        if (value === undefined) delete process.env[envKey];
        else process.env[envKey] = value;
      }
    }
  });

  test('company research remains inconclusive when Tavily returns no sources', async () => {
    const result = await researchCompanyWithGroq({ companyName: 'Unknown Company', searchResults: [] });
    assert.equal(result.status, 'insufficient-evidence');
    assert.equal(result.assessment, 'insufficient_public_evidence');
    assert.deepEqual(result.findings, []);
    assert.match(result.summary, /no usable public sources/i);
  });

  test('resume tailoring suggestions explain job-specific edits and validate exact source quotes', async () => {
    const resumeText = 'Built accessible React dashboards for internal teams.\nUsed JavaScript to ship UI features.';
    const response = {
      suggestions: [
        {
          section: 'experience',
          requirement: 'React',
          priority: 'high',
          action: 'emphasize',
          recommendation: 'Lead with the dashboard work because React is required for this role.',
          proposedText: 'Built accessible React dashboards for internal teams.',
          sourceText: 'Built accessible React dashboards for internal teams.',
          sourceType: 'resume',
          rationale: 'This experience directly supports a required skill.'
        },
        {
          section: 'skills',
          requirement: 'TypeScript',
          priority: 'medium',
          action: 'gap',
          recommendation: 'Do not add TypeScript as a skill unless you have genuine experience; consider building a project first.',
          proposedText: '',
          sourceText: '',
          sourceType: 'none',
          rationale: 'No supplied source demonstrates TypeScript.'
        },
        {
          section: 'projects',
          requirement: 'React',
          priority: 'medium',
          action: 'emphasize',
          recommendation: 'Move the dashboard project above less relevant projects.',
          proposedText: 'Built React dashboards.',
          sourceText: 'Built React dashboards.',
          sourceType: 'profile',
          rationale: 'This confirmed project describes work with a required skill.'
        },
        {
          section: 'experience',
          requirement: 'Leadership',
          priority: 'low',
          action: 'emphasize',
          recommendation: 'Add a leadership claim.',
          proposedText: 'Led a team of 10 engineers.',
          sourceText: 'Managed 10 engineers',
          sourceType: 'resume',
          rationale: 'This quote is fabricated and must be rejected.'
        }
      ]
    };

    await withMockAIResponse(response, async getRequestBody => {
      const result = await generateResumeSuggestions({
        profile: {
          email: 'private@example.com',
          existingSkills: [{ name: 'React', confidence: 'verified' }],
          projects: [{ title: 'Dashboard project', description: 'Built React dashboards.' }]
        },
        resumeText,
        job: {
          title: 'Frontend Engineer',
          companyName: 'Example',
          description: 'React and TypeScript required.',
          requiredSkills: ['React', 'TypeScript']
        },
        sections: { experience: 'Frontend developer' }
      });

      assert.equal(result.suggestions.length, 3);
      assert.equal(result.suggestions[0].applyAllowed, true);
      assert.equal(result.suggestions[0].requirement, 'React');
      assert.equal(result.suggestions[1].action, 'gap');
      assert.equal(result.suggestions[1].applyAllowed, false);
      assert.equal(result.suggestions[2].sourceType, 'profile');
      assert.equal(result.suggestions[2].applyAllowed, true);
      const prompt = getRequestBody().messages[1].content;
      assert.match(prompt, /React and TypeScript required/);
      assert.match(prompt, /Built accessible React dashboards/);
      assert.doesNotMatch(prompt, /private@example\.com/);
    });
  });

  test('resume tailoring gap suggestions cannot contain unsupported proposed resume text', async () => {
    await withMockAIResponse({
      suggestions: [{
        section: 'skills',
        requirement: 'Kubernetes',
        priority: 'high',
        action: 'gap',
        recommendation: 'Build practical Kubernetes experience before claiming this skill.',
        proposedText: 'Kubernetes expert',
        sourceText: '',
        sourceType: 'none',
        rationale: 'No candidate evidence was supplied.'
      }]
    }, async () => {
      const result = await generateResumeSuggestions({
        profile: { existingSkills: [{ name: 'React' }] },
        job: { title: 'Engineer', requiredSkills: ['Kubernetes'] },
        sections: {}
      });
      assert.equal(result.suggestions.length, 0);
      assert.match(result.message, /no recommendations/);
    });
  });
