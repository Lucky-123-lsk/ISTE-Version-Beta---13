import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeedback, generateReport, getFixedQuestions, planQuestions } from '../src/services/rejectionCoach.js';

function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  const previous = {
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
    liteModel: process.env.AI_LITE_MODEL,
    strongModel: process.env.AI_STRONG_MODEL
  };
  process.env.AI_PROVIDER = 'groq';
  process.env.AI_API_KEY = 'mock-ai-key-do-not-display';
  process.env.AI_MODEL = 'mock-base-model';
  process.env.AI_LITE_MODEL = 'mock-lite-model';
  process.env.AI_STRONG_MODEL = 'mock-strong-model';
  globalThis.fetch = handler;
  return Promise.resolve().then(callback).finally(() => {
    globalThis.fetch = originalFetch;
    restoreEnvironment('AI_PROVIDER', previous.provider);
    restoreEnvironment('AI_API_KEY', previous.apiKey);
    restoreEnvironment('AI_MODEL', previous.model);
    restoreEnvironment('AI_LITE_MODEL', previous.liteModel);
    restoreEnvironment('AI_STRONG_MODEL', previous.strongModel);
  });
}

function groqResponse(content) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

function validReport(overrides = {}) {
  return {
    summary: 'The available information is limited.',
    possible_factors: [],
    not_determinable: ['The employer’s decision criteria were not provided.'],
    ...overrides
  };
}

test('fixed questions are deterministic and skippable for each stage', () => {
  for (const stage of ['resume-screening', 'online-assessment', 'technical-interview', 'hr-interview', 'final-selection', 'unknown']) {
    const questions = getFixedQuestions(stage);
    assert.ok(questions.length > 0);
    assert.ok(questions.every(question => question.skippable && question.why_it_helps));
  }
  assert.deepEqual(getFixedQuestions('unsupported'), getFixedQuestions('unknown'));
});

test('question planner caps output and filters missing explanations and fixed duplicates', async () => {
  await withMockFetch(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'mock-lite-model');
    const prompt = body.messages[1].content;
    assert.match(prompt, /do not infer a cause from the stage alone/i);
    return groqResponse({
      questions: [
        { question: getFixedQuestions('unknown')[0].question, why_it_helps: 'duplicate' },
        { question: 'Question without an explanation?' },
        { question: 'What did you find most useful to review?', why_it_helps: 'It identifies a useful next step.' },
        { question: 'Which topic would you practise next?', why_it_helps: 'It can guide focused preparation.' },
        { question: 'What would you clarify in a future interview?', why_it_helps: 'It can improve preparation.' },
        { question: 'This fourth question is over the cap?', why_it_helps: 'It should be omitted.' }
      ]
    });
  }, async () => {
    const result = await planQuestions({ stage: 'unknown', gaps: {}, known: {} });
    assert.equal(result.fixedQuestions.length, 2);
    assert.equal(result.plannedQuestions.length, 3);
    assert.ok(result.plannedQuestions.every(question => question.why_it_helps && question.skippable));
  });
});

test('feedback extraction drops invented employer quotes and masks contact details', async () => {
  const feedback = 'We selected a candidate with more experience. Contact hr@example.com at +1 (555) 123-4567.';
  await withMockFetch(async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    assert.ok(!prompt.includes('hr@example.com'));
    assert.ok(!prompt.includes('+1 (555) 123-4567'));
    return groqResponse({
      reasons: [
        { reason: 'More relevant experience', exact_quote: 'We selected a candidate with more experience.' },
        { reason: 'Weak interview performance', exact_quote: 'The candidate failed the technical interview.' }
      ]
    });
  }, async () => {
    const reasons = await extractFeedback(feedback);
    assert.deepEqual(reasons.map(item => item.exact_quote), ['We selected a candidate with more experience.']);
    assert.equal(reasons[0].reason, reasons[0].exact_quote);
  });
});

test('report confidence stays low without feedback or answers, regardless of stage', async () => {
  await withMockFetch(async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'mock-strong-model');
    return groqResponse(validReport());
  }, async () => {
    const report = await generateReport({ stage: 'technical-interview', resumeText: '', pastedText: '', answers: [] });
    assert.equal(report.confidence, 'low');
    assert.equal(report.possible_factors.length, 0);
  });
});

test('report uses AI to interpret candidate answers and suggest a grounded next step', async () => {
  const answer = 'I struggled to explain how I would debug a slow database query.';
  await withMockFetch(async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    assert.ok(prompt.includes(answer));
    assert.match(prompt, /Analyze the actual resume, employer feedback, and each candidate answer/i);
    return groqResponse(validReport({
      possible_factors: [{
        factor: 'Practising a clear database-debugging walkthrough may be useful.',
        source: 'candidate-reported',
        evidence: answer,
        interpretation: 'Your answer identifies query debugging as a topic where a structured explanation could help you communicate your approach.',
        next_step: 'Practise explaining how you would inspect a query plan and narrow down a bottleneck.'
      }]
    }));
  }, async () => {
    const report = await generateReport({
      stage: 'technical-interview',
      answers: [{ question: 'Which question was hardest?', answer }]
    });
    assert.equal(report.possible_factors.length, 1);
    assert.equal(report.possible_factors[0].factor, 'Practising a clear database-debugging walkthrough may be useful.');
    assert.equal(report.possible_factors[0].evidence, answer);
    assert.match(report.possible_factors[0].interpretation, /structured explanation/);
    assert.match(report.possible_factors[0].next_step, /query plan/);
    assert.equal(report.possible_factors[0].source, 'candidate-reported');
    assert.equal(report.confidence, 'medium');
  });
});

test('report repairs invalid structured JSON once and validates resulting factor evidence', async () => {
  let attempts = 0;
  const resumeQuote = 'Built a Java service used by 200 customers.';
  await withMockFetch(async (_url, options) => {
    attempts++;
    const prompt = JSON.parse(options.body).messages[1].content;
    assert.equal(JSON.parse(options.body).model, 'mock-strong-model');
    if (attempts === 1) return groqResponse({ summary: 'missing arrays' });
    assert.match(prompt, /previous response failed validation/i);
    return groqResponse(validReport({
      possible_factors: [
        { factor: 'A possible resume gap', source: 'resume-gap', evidence: resumeQuote, interpretation: 'A possible gap to review.', next_step: 'Review relevant experience.' },
        { factor: 'An unsupported employer reason', source: 'employer-stated', evidence: 'The employer rejected this candidate for lack of Java.', interpretation: 'This may be relevant.', next_step: 'Ask for clarification if available.' },
        { factor: 'Interview-stage context', source: 'process-context', evidence: 'Technical interview caused rejection.', interpretation: 'The selected stage is context only.', next_step: 'Reflect on topics to practise.' }
      ]
    }));
  }, async () => {
    const report = await generateReport({
      stage: 'technical-interview',
      resumeText: `Experience: ${resumeQuote}`,
      gaps: { missingSkills: ['Kubernetes'] },
      answers: []
    });
    assert.equal(attempts, 2);
    assert.equal(report.possible_factors.length, 2);
    assert.equal(report.possible_factors[0].source, 'process-context');
    assert.equal(report.possible_factors[0].evidence, 'The candidate selected technical interview as the stage; this is context only and does not establish a cause.');
    assert.equal(report.possible_factors[1].source, 'resume-gap');
    assert.equal(report.possible_factors[1].evidence, 'not found in resume');
    assert.ok(report.possible_factors.every(factor => factor.source === 'employer-stated' || factor.note === 'Hypothesis, not confirmed by the employer.'));
  });
});

test('AI provider errors never echo the configured API key', async () => {
  const secretKey = 'mock-ai-key-do-not-display';
  await withMockFetch(async () => new Response('', { status: 403 }), async () => {
    await assert.rejects(planQuestions({ stage: 'unknown' }), error => {
      assert.equal(error.message.includes(secretKey), false);
      assert.match(error.message, /rejected the credentials/i);
      return true;
    });
  });
});

function restoreEnvironment(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
