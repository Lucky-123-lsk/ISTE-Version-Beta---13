import test from 'node:test';
import assert from 'node:assert/strict';
import { answerJobQuestion } from '../src/services/jobChat.js';

async function withMockAI(responseText, callback, inspectPrompt = () => {}) {
  const originalFetch = globalThis.fetch;
  const previous = {
    provider: process.env.AI_PROVIDER,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL
  };
  process.env.AI_PROVIDER = 'groq';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  globalThis.fetch = async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    inspectPrompt(prompt);
    const content = typeof responseText === 'function'
      ? responseText(prompt)
      : responseText;
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('job chat uses attached job details and recent conversation with grounded-answer rules', async () => {
  let promptText = '';
  await withMockAI(prompt => `Based on the listing, here is the answer. ${prompt.includes('React') ? 'React is listed as a requirement.' : ''}`, async () => {
    const result = await answerJobQuestion({
      job: {
        title: 'Frontend Engineer',
        company: 'Northwind',
        location: 'Remote',
        requirements: ['React'],
        description: 'Build user-facing web applications.'
      },
      messages: [
        { role: 'user', content: 'What skills does this role require?' }
      ]
    });

    assert.match(result.answer, /React is listed/);
    assert.equal(result.provider, 'groq');
    assert.equal(result.model, 'test-model');
  }, prompt => { promptText = prompt; });
  assert.match(promptText, /Frontend Engineer/);
  assert.match(promptText, /Build user-facing web applications/);
  assert.match(promptText, /What skills does this role require\?/);
  assert.match(promptText, /If a job fact is missing, say it is not specified/);
});

test('job chat uses explicitly attached resume text as candidate evidence', async () => {
  let promptText = '';
  await withMockAI('Your resume shows Java experience, but it does not mention Apache Flink.', async () => {
    const result = await answerJobQuestion({
      resumeText: 'Software engineer with 5 years of Java experience.',
      job: { title: 'Data Engineer', requirements: ['Apache Flink', 'Java'] },
      messages: [{ role: 'user', content: 'Does my resume mention Flink?' }]
    });
    assert.match(result.answer, /does not mention Apache Flink/);
  }, prompt => { promptText = prompt; });
  assert.match(promptText, /Software engineer with 5 years of Java experience/);
  assert.match(promptText, /Do not claim access to a resume unless its text appears below/);
});

test('job chat requires a candidate question', async () => {
  await assert.rejects(answerJobQuestion({ messages: [] }), {
    message: 'Enter a question before sending.',
    statusCode: 400
  });
});

test('job chat unwraps JSON response fields before returning text to the UI', async () => {
  await withMockAI('{"response":"React is required.\\nThe role is remote."}', async () => {
    const result = await answerJobQuestion({ messages: [{ role: 'user', content: 'Summarize this role.' }] });
    assert.equal(result.answer, 'React is required.\nThe role is remote.');
  });
});

test('job chat unwraps fenced JSON and malformed unquoted response keys', async () => {
  await withMockAI('```json\n{ response : "The job asks for React." }\n```', async () => {
    const result = await answerJobQuestion({ messages: [{ role: 'user', content: 'What skills?' }] });
    assert.equal(result.answer, 'The job asks for React.');
  });
});
