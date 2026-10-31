const providers = new Set(['gemini', 'groq', 'ollama']);

export function getAIProviderStatus() {
  const provider = String(process.env.AI_PROVIDER || 'none').toLowerCase();
  if (!providers.has(provider)) {
    return {
      provider: 'none',
      model: null,
      configured: false,
      message: 'Set AI_PROVIDER to gemini, groq, or ollama in the server environment.'
    };
  }

  const model = process.env.AI_MODEL || defaultModel(provider);
  const ollamaBaseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const placeholderModel = /your[-_ ]|placeholder|replace[-_ ]|model[-_ ]name/i.test(model);
  const placeholderKey = /your[-_ ]?(api[-_ ]?)?key|placeholder|replace[-_ ]/i.test(process.env.AI_API_KEY || '');
  const configured = provider === 'ollama'
    ? isValidOllamaConfiguration(ollamaBaseURL, model)
    : Boolean(process.env.AI_API_KEY) && !placeholderKey && !placeholderModel;
  const ollamaURLIsPlaceholder = /your[-_ ]|placeholder|replace[-_ ]|example/i.test(ollamaBaseURL);
  return {
    provider,
    model,
    configured,
    message: configured
      ? provider === 'ollama'
        ? process.env.OLLAMA_API_KEY
          ? 'Ollama endpoint and server-side API key are configured. Model availability is checked when analysis runs.'
          : 'Ollama endpoint is configured without an API key. This is appropriate for a local Ollama server; hosted endpoints may require OLLAMA_API_KEY.'
        : 'Provider configuration is present. Provider usage and retention policies still apply.'
      : provider === 'ollama'
        ? ollamaURLIsPlaceholder
          ? 'OLLAMA_BASE_URL is still a template value. Replace it with your reachable Ollama server URL, and set AI_MODEL to a model available on that server.'
          : 'Check OLLAMA_BASE_URL and AI_MODEL. Use a reachable Ollama endpoint and a model available on it.'
        : 'Set AI_API_KEY in the server environment. Never put provider keys in frontend code.'
  };
}

function isValidOllamaConfiguration(baseURL, model) {
  if (!model || /your[-_ ]|placeholder|replace[-_ ]|model[-_ ]name/i.test(model)) return false;
  if (/your[-_ ]|placeholder|replace[-_ ]|example/i.test(baseURL)) return false;
  try {
    const url = new URL(baseURL);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function defaultModel(provider) {
  if (provider === 'gemini') return 'gemini-2.5-flash';
  if (provider === 'groq') return 'llama-3.3-70b-versatile';
  return 'llama3.1';
}

function parseJSON(text) {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI provider returned a response without a JSON object.');
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new Error('AI provider returned invalid structured JSON. Please retry or change the model.');
  }
}

function extractText(provider, payload) {
  if (provider === 'gemini') {
    const parts = payload.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map(part => part.text || '').join('\n') : '';
  }
  if (provider === 'groq') return payload.choices?.[0]?.message?.content || '';
  return payload.message?.content || '';
}

async function postJSON(url, body, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    throw new Error('Could not reach the AI provider. Check its URL, network access, and whether the selected model server is running.');
  }
  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('The AI provider requires an active plan or available credits (HTTP 402). Check the configured provider account billing and usage, or switch to a provider with available quota.');
    }
    if (response.status === 429) throw new Error('AI provider rate limit reached. Wait and try again.');
    if (response.status === 401 || response.status === 403) throw new Error('AI provider rejected the credentials. Check the server-side API key.');
    if (response.status >= 500) throw new Error('AI provider is temporarily unavailable. Try again later.');
    throw new Error(`AI provider request failed with status ${response.status}.`);
  }
  return response.json();
}

async function generate(provider, model, prompt) {
  if (provider === 'gemini') {
    const key = process.env.AI_API_KEY;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const payload = await postJSON(endpoint, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    });
    return extractText(provider, payload);
  }

  if (provider === 'groq') {
    const payload = await postJSON('https://api.groq.com/openai/v1/chat/completions', {
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return only valid JSON. Follow the evidence rules in the user prompt.' },
        { role: 'user', content: prompt }
      ]
    }, { Authorization: `Bearer ${process.env.AI_API_KEY}` });
    return extractText(provider, payload);
  }

  const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  if (!baseURL) throw new Error('OLLAMA_BASE_URL is required for Ollama.');
  const endpoint = new URL('/api/chat', baseURL).toString();
  const headers = process.env.OLLAMA_API_KEY
    ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
    : {};
  const payload = await postJSON(endpoint, {
    model,
    stream: false,
    format: 'json',
    options: { temperature: 0.1 },
    messages: [
      { role: 'system', content: 'Return only valid JSON. Follow the evidence rules in the user prompt.' },
      { role: 'user', content: prompt }
    ]
  }, headers);
  return extractText(provider, payload);
}

export async function generateAIText(prompt, { model } = {}) {
  const status = getAIProviderStatus();
  if (!status.configured) {
    const error = new Error(status.message);
    error.statusCode = 503;
    throw error;
  }
  try {
    const text = await generate(status.provider, model || status.model, prompt);
    if (!text) throw new Error('AI provider returned no analysis text.');
    return { text, provider: status.provider, model: model || status.model };
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      const timeoutError = new Error('AI provider request timed out. Try again with shorter input or a local model.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  }
}

export function parseAIJSON(text) {
  return parseJSON(text);
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function validateExactQuote(quote, sourceText, minimumLength = 12) {
  if (typeof quote !== 'string' || typeof sourceText !== 'string') return false;
  const trimmedQuote = quote.trim();
  return trimmedQuote.length >= minimumLength && normalizeText(sourceText).includes(normalizeText(trimmedQuote));
}

function validateAnalysis(result, resumeText) {
  if (!result || !Array.isArray(result.requirements)) {
    throw new Error('AI provider response did not contain a requirements array.');
  }
  return result.requirements.slice(0, 30).map((item, index) => {
    const requirement = typeof item.requirement === 'string' ? item.requirement.trim().slice(0, 300) : `Requirement ${index + 1}`;
    const evidenceQuote = typeof item.evidenceQuote === 'string' ? item.evidenceQuote.trim().slice(0, 1000) : '';
    const hasExactEvidence = validateExactQuote(evidenceQuote, resumeText);
    const recommendation = typeof item.recommendation === 'string'
      ? item.recommendation.trim().slice(0, 500)
      : '';
    const claim = typeof item.claim === 'string' ? item.claim.trim().slice(0, 500) : '';
    return {
      requirement,
      claim: hasExactEvidence ? claim : null,
      evidenceQuote: hasExactEvidence ? evidenceQuote : null,
      status: hasExactEvidence ? 'supported-by-exact-quote' : 'insufficient-evidence',
      recommendation,
      confidence: typeof item.confidence === 'string' ? item.confidence.slice(0, 40) : 'not-assessed'
    };
  });
}

export async function analyzeResume({ resumeText, jobDescription }) {
  const status = getAIProviderStatus();
  if (!status.configured) {
    const error = new Error(status.message);
    error.statusCode = 503;
    throw error;
  }

  const prompt = [
    'Analyze the supplied resume text against the job description.',
    'Return exactly one JSON object with a "requirements" array. Each array item must have requirement, claim, evidenceQuote, recommendation, confidence.',
    'Only provide evidenceQuote as an exact contiguous quote copied from the resume. Never infer that a skill, credential, achievement, or experience exists.',
    'If no exact quote supports the requirement, set evidenceQuote to an empty string and explain the gap in recommendation.',
    'Do not write a cover letter or invent candidate facts.',
    '',
    'JOB DESCRIPTION:',
    jobDescription,
    '',
    'RESUME TEXT:',
    resumeText
  ].join('\n');

  let raw;
  try {
    raw = await generate(status.provider, status.model, prompt);
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      const timeoutError = new Error('AI provider request timed out. Try again with shorter input or a local model.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  }
  if (!raw) throw new Error('AI provider returned no analysis text.');
  return {
    provider: status.provider,
    model: status.model,
    evidencePolicy: 'Only exact resume quotes validated by the server can be marked supported.',
    requirements: validateAnalysis(parseJSON(raw), resumeText)
  };
}

export async function extractResumeProfile({ resumeText }) {
  const status = getAIProviderStatus();
  if (!status.configured) {
    const error = new Error(status.message);
    error.statusCode = 503;
    throw error;
  }
  const prompt = [
    'Extract only information explicitly present in the supplied resume text.',
    'Return one JSON object with personalInfo, education, technicalSkills, softSkills, projects, experience, achievements, certifications, and careerPreferences arrays or objects.',
    'Each technicalSkills item must have name, category, confidence set to self-declared, and evidenceQuote.',
    'Do not infer proficiency, years, outcomes, employers, education, or contact details. Use empty arrays or empty strings when absent.',
    'Every evidenceQuote must be an exact contiguous quote from the resume text or an empty string.',
    'This is an AI extraction draft. It must not be presented as candidate-confirmed information.',
    '',
    'RESUME TEXT:',
    resumeText
  ].join('\n');
  let raw;
  try {
    raw = await generate(status.provider, status.model, prompt);
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      const timeoutError = new Error('AI provider request timed out. Try again with shorter input or a local model.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  }
  if (!raw) throw new Error('AI provider returned no extraction text.');
  const result = parseJSON(raw);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('AI provider returned an invalid resume extraction object.');
  const skills = Array.isArray(result.technicalSkills) ? result.technicalSkills.slice(0, 100).flatMap(skill => {
    const name = typeof skill?.name === 'string' ? skill.name.trim().slice(0, 120) : '';
    const evidenceQuote = typeof skill?.evidenceQuote === 'string' && validateExactQuote(skill.evidenceQuote, resumeText)
      ? skill.evidenceQuote.trim().slice(0, 1000) : '';
    return name ? [{ name, category: typeof skill.category === 'string' ? skill.category.trim().slice(0, 80) : 'Other', confidence: 'self-declared', evidenceQuote }] : [];
  }) : [];
  return {
    provider: status.provider,
    model: status.model,
    personalInfo: result.personalInfo && typeof result.personalInfo === 'object' ? result.personalInfo : {},
    education: Array.isArray(result.education) ? result.education.slice(0, 20) : [],
    technicalSkills: skills,
    softSkills: Array.isArray(result.softSkills) ? result.softSkills.slice(0, 30) : [],
    projects: Array.isArray(result.projects) ? result.projects.slice(0, 30) : [],
    experience: Array.isArray(result.experience) ? result.experience.slice(0, 20) : [],
    achievements: Array.isArray(result.achievements) ? result.achievements.slice(0, 30) : [],
    certifications: Array.isArray(result.certifications) ? result.certifications.slice(0, 30) : [],
    careerPreferences: result.careerPreferences && typeof result.careerPreferences === 'object' ? result.careerPreferences : {},
    extractionPolicy: 'AI extraction is a draft. Candidate confirmation is required before profile updates.'
  };
}

export async function generateResumeSuggestions({ profile, job, sections }) {
  const status = getAIProviderStatus();
  if (!status.configured) {
    const error = new Error(status.message);
    error.statusCode = 503;
    throw error;
  }
  const prompt = [
    'Generate review-only resume tailoring suggestions using only the confirmed candidate profile below.',
    'Never invent skills, employers, dates, metrics, education, certifications, or outcomes.',
    'Return JSON with a suggestions array of at most 10 items.',
    'Each item must contain section, proposedText, sourceText, and rationale.',
    'sourceText must be copied exactly from the confirmed profile and proposedText must preserve the same factual claims.',
    'Do not suggest adding information that is absent from the confirmed profile.',
    'These are suggestions only. The candidate must review and explicitly accept each one.',
    '',
    'CONFIRMED PROFILE:',
    JSON.stringify(profile),
    '',
    'TARGET JOB:',
    JSON.stringify({ title: job.title, company: job.companyName, description: job.description, requiredSkills: job.requiredSkills }),
    '',
    'CURRENT DRAFT SECTIONS:',
    JSON.stringify(sections)
  ].join('\n');
  const { text, provider, model } = await generateAIText(prompt);
  const parsed = parseAIJSON(text);
  if (!parsed || !Array.isArray(parsed.suggestions)) throw new Error('AI provider returned an invalid resume suggestions object.');
  const profileText = JSON.stringify(profile);
  const suggestions = parsed.suggestions.slice(0, 10).flatMap((item, index) => {
    const section = typeof item?.section === 'string' ? item.section.trim().slice(0, 80) : '';
    const proposedText = typeof item?.proposedText === 'string' ? item.proposedText.trim().slice(0, 4000) : '';
    const sourceText = typeof item?.sourceText === 'string' ? item.sourceText.trim().slice(0, 2000) : '';
    const rationale = typeof item?.rationale === 'string' ? item.rationale.trim().slice(0, 500) : '';
    if (!section || !proposedText || !sourceText || !rationale || !profileText.includes(sourceText)) return [];
    return [{ id: `${Date.now()}-${index}`, section, proposedText, sourceText, rationale, provider, model, reviewRequired: true }];
  });
  return { suggestions };
}
