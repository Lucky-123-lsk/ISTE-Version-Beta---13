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

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function validateAnalysis(result, resumeText) {
  if (!result || !Array.isArray(result.requirements)) {
    throw new Error('AI provider response did not contain a requirements array.');
  }
  const resume = normalizeText(resumeText);
  return result.requirements.slice(0, 30).map((item, index) => {
    const requirement = typeof item.requirement === 'string' ? item.requirement.trim().slice(0, 300) : `Requirement ${index + 1}`;
    const evidenceQuote = typeof item.evidenceQuote === 'string' ? item.evidenceQuote.trim().slice(0, 1000) : '';
    const hasExactEvidence = evidenceQuote.length >= 12 && resume.includes(normalizeText(evidenceQuote));
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
