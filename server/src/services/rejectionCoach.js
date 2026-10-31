import { createHash } from 'crypto';
import { generateAIText, getAIProviderStatus, parseAIJSON, validateExactQuote } from './aiProvider.js';
import { matchJob } from './jobMatching.js';

const stages = new Set([
  'resume-screening',
  'online-assessment',
  'technical-interview',
  'hr-interview',
  'final-selection',
  'unknown'
]);
const factorSources = new Set(['employer-stated', 'resume-gap', 'process-context', 'candidate-reported']);
const reportNote = 'Hypothesis, not confirmed by the employer.';
const reportCache = new Map();
const cacheDurationMs = 20 * 60 * 1000;
const cacheLimit = 100;

const questionBank = {
  'resume-screening': [
    { id: 'resume-role-fit', question: 'Which role requirement did you feel least clearly represented in your resume?', why_it_helps: 'It can help compare the listing with the evidence you chose to include.' },
    { id: 'resume-feedback', question: 'Did the employer mention any specific qualification or experience?', why_it_helps: 'Specific employer feedback is more informative than the stage alone.' }
  ],
  'online-assessment': [
    { id: 'assessment-difficulty', question: 'Which part of the assessment felt most difficult, if any?', why_it_helps: 'Your own account can identify topics to review without assuming the employer’s decision reason.' },
    { id: 'assessment-constraints', question: 'Were there time, format, or environment constraints that affected your attempt?', why_it_helps: 'Process conditions may be useful context for a future attempt.' }
  ],
  'technical-interview': [
    { id: 'technical-interview-topic', question: 'Which technical question or topic was hardest to answer?', why_it_helps: 'A specific recalled question can guide focused practice.' },
    { id: 'technical-interview-feedback', question: 'Did the interviewer give specific feedback about an answer or skill?', why_it_helps: 'Concrete feedback is more useful than inferring a cause from the interview stage.' }
  ],
  'hr-interview': [
    { id: 'hr-interview-concern', question: 'Did the conversation raise a specific concern about role expectations, location, or availability?', why_it_helps: 'Candidate-reported context may help identify questions to clarify next time.' },
    { id: 'hr-interview-feedback', question: 'Did the recruiter share any specific feedback?', why_it_helps: 'A direct statement can be distinguished from an unconfirmed possibility.' }
  ],
  'final-selection': [
    { id: 'final-selection-feedback', question: 'Did the employer mention a specific factor in the final decision?', why_it_helps: 'Directly stated feedback is the clearest evidence available.' },
    { id: 'final-selection-context', question: 'Was anything specific discussed about timing, availability, or role fit?', why_it_helps: 'This can capture context without treating it as the confirmed cause.' }
  ],
  unknown: [
    { id: 'unknown-feedback', question: 'What did the employer say, if anything, about the outcome?', why_it_helps: 'Any direct feedback can be separated from factors that remain unknown.' },
    { id: 'unknown-candidate-view', question: 'Is there a part of your application or interview you would like to reflect on?', why_it_helps: 'Your own reflection can guide next steps without being attributed to the employer.' }
  ]
};

export function getFixedQuestions(stage) {
  const selectedStage = stages.has(stage) ? stage : 'unknown';
  return questionBank[selectedStage].map(question => ({ ...question, skippable: true }));
}

export function computeGaps(profile = {}, job = {}) {
  return matchJob({
    requiredSkills: Array.isArray(job.requiredSkills) ? job.requiredSkills : [],
    experienceRequirements: job.experienceRequirements || '',
    eligibilityRequirements: Array.isArray(job.eligibilityRequirements) ? job.eligibilityRequirements : []
  }, profile);
}

export async function planQuestions({ stage, feedbackType = 'unknown', gaps = {}, known = {} } = {}) {
  const selectedStage = stages.has(stage) ? stage : 'unknown';
  const fixedQuestions = getFixedQuestions(selectedStage);
  const model = liteModel();
  const prompt = [
    'Suggest optional follow-up questions for a candidate reflecting on a job application rejection.',
    'Stage and feedback type are context only. Do not infer a cause from the stage alone.',
    'Do not state or imply that a skill gap caused the employer decision.',
    'Return JSON with a questions array. Each item must have question and why_it_helps.',
    'Return no more than 3 concise, non-duplicative, optional questions.',
    `Stage context: ${selectedStage}`,
    `Feedback type context: ${maskSensitiveInfo(safeString(feedbackType, 80)) || 'unknown'}`,
    `Known comparison data: ${JSON.stringify(limitObject(known))}`,
    `Deterministic skill comparison: ${JSON.stringify(limitObject(gaps))}`
  ].join('\n');
  const generated = await generateAIText(prompt, { model });
  let parsed;
  try {
    parsed = parseAIJSON(generated.text);
  } catch (error) {
    throw new Error(safeProviderMessage(error));
  }
  if (!Array.isArray(parsed.questions)) return { fixedQuestions, plannedQuestions: [] };
  const fixedText = new Set(fixedQuestions.map(item => normalizeQuestion(item.question)));
  const plannedQuestions = [];
  for (const item of parsed.questions) {
    const question = safeString(item?.question, 400);
    const why = safeString(item?.why_it_helps, 500);
    const key = normalizeQuestion(question);
    if (!question || !why || !key || fixedText.has(key) || plannedQuestions.some(existing => normalizeQuestion(existing.question) === key)) continue;
    plannedQuestions.push({ id: `planned-${plannedQuestions.length + 1}`, question, why_it_helps: why, skippable: true });
    if (plannedQuestions.length === 3) break;
  }
  return { fixedQuestions, plannedQuestions };
}

export async function extractFeedback(pastedText) {
  const source = typeof pastedText === 'string' ? pastedText.trim() : '';
  if (!source) return [];
  const masked = maskSensitiveInfo(source);
  const generated = await generateAIText([
    'Extract only reasons the employer explicitly stated in the supplied feedback.',
    'Do not infer reasons, add context, or treat candidate interpretation as employer statements.',
    'Return JSON with a reasons array. Each item must have reason and exact_quote.',
    'Every exact_quote must be copied verbatim from the supplied text. The text may contain [redacted email] or [redacted phone] markers.',
    'If there are no explicit employer-stated reasons, return an empty array.',
    'FEEDBACK TEXT:',
    masked
  ].join('\n'), { model: liteModel() });
  let parsed;
  try {
    parsed = parseAIJSON(generated.text);
  } catch (error) {
    throw new Error(safeProviderMessage(error));
  }
  if (!Array.isArray(parsed.reasons)) return [];
  return parsed.reasons.slice(0, 20).flatMap(item => {
    const exactQuote = safeString(item?.exact_quote, 1000);
    if (!validateExactQuote(exactQuote, masked)) return [];
    return [{ reason: exactQuote, exact_quote: exactQuote, source: 'employer-stated' }];
  });
}

export async function generateReport(input = {}) {
  const resumeText = typeof input.resumeText === 'string' ? input.resumeText.trim() : '';
  const feedbackText = typeof input.pastedText === 'string' ? input.pastedText.trim() : '';
  const answers = normalizeAnswers(input.answers);
  const selectedStage = stages.has(input.stage) ? input.stage : 'unknown';
  const suppliedExtractedFeedback = Array.isArray(input.extractedFeedback)
    ? input.extractedFeedback.filter(item => item && validateExactQuote(item.exact_quote, maskSensitiveInfo(feedbackText)))
    : null;
  const model = strongModel();
  const cacheKey = createHash('sha256').update(JSON.stringify({
    resumeText,
    jobId: safeString(input.jobId, 120),
    stage: selectedStage,
    feedbackType: safeString(input.feedbackType, 80),
    pastedText: feedbackText,
    answers,
    gaps: limitObject(input.gaps || {}),
    known: limitObject(input.known || {}),
    model,
    provider: getAIProviderStatus().provider
  })).digest('hex');
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.report);
  if (cached) reportCache.delete(cacheKey);
  const extractedFeedback = suppliedExtractedFeedback || await extractFeedback(feedbackText);

  const modelInput = {
    stage: selectedStage,
    feedbackType: maskSensitiveInfo(safeString(input.feedbackType, 80)) || 'unknown',
    resumeText: maskSensitiveInfo(resumeText),
    feedbackText: maskSensitiveInfo(feedbackText),
    extractedFeedback,
    answers: answers.map(answer => ({ question: maskSensitiveInfo(answer.question), answer: maskSensitiveInfo(answer.answer) })),
    gaps: limitObject(input.gaps || {}),
    known: limitObject(input.known || {})
  };
  const basePrompt = [
    'Create a cautious rejection reflection report for the candidate.',
    'Stage and feedback type are context only. You must not infer a cause from the stage alone.',
    'Do not present any possible factor as the confirmed reason for the employer decision.',
    'Return one JSON object with summary (string), possible_factors (array), and not_determinable (array of strings).',
    'Analyze the actual resume, employer feedback, and each candidate answer. Do not return generic boilerplate when a specific input supports a useful reflection.',
    'Each possible_factors item must have factor, source, evidence, interpretation, and next_step. Source must be employer-stated, resume-gap, process-context, or candidate-reported.',
    'For candidate-reported factors, explain what the candidate answer may suggest for their preparation, and give a practical next step. Do not imply it caused the rejection.',
    'For every interpretation and next_step, use only the associated evidence and other supplied inputs. If no useful, grounded reflection can be made, omit the factor.',
    'Evidence must be non-empty. For resume-gap evidence, use an exact quote from the supplied resume or exactly "not found in resume".',
    'For employer-stated evidence, use an exact quote from supplied employer feedback. For candidate-reported evidence, use an exact quote from supplied candidate answers.',
    'A process-context factor must describe context only and must not claim causation.',
    'Do not include confidence; the server computes confidence from evidence supplied.',
    `Required note for every non-employer-stated factor: "${reportNote}"`,
    `INPUTS: ${JSON.stringify(modelInput)}`
  ].join('\n');

  let parsed;
  let raw = '';
  let validationError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}\nYour previous response failed validation: ${validationError.message}. Return a corrected JSON object that satisfies every required field and evidence rule.`;
    const generated = await generateAIText(prompt, { model });
    raw = generated.text;
    try {
      parsed = parseAIJSON(raw);
      validateReportShape(parsed);
      validationError = null;
      break;
    } catch (error) {
      validationError = error;
    }
  }
  if (validationError) throw new Error(`Could not validate the AI report after one repair attempt: ${safeProviderMessage(validationError)}`);

  const report = sanitizeReport(parsed, {
    resumeText: modelInput.resumeText,
    feedbackText: modelInput.feedbackText,
    extractedFeedback,
    answers: modelInput.answers,
    gaps: input.gaps || {},
    stage: selectedStage,
    hasFeedback: Boolean(feedbackText),
    hasAnswers: answers.length > 0
  });
  reportCache.set(cacheKey, { report, expiresAt: Date.now() + cacheDurationMs });
  if (reportCache.size > cacheLimit) {
    const oldestKey = reportCache.keys().next().value;
    reportCache.delete(oldestKey);
  }
  return structuredClone(report);
}

function validateReportShape(result) {
  if (!result || typeof result.summary !== 'string'
    || !Array.isArray(result.possible_factors)
    || !Array.isArray(result.not_determinable)) {
    throw new Error('AI report must include summary, possible_factors, and not_determinable fields.');
  }
  if (result.possible_factors.some(item =>
    !item || typeof item !== 'object'
    || typeof item.factor !== 'string'
    || !factorSources.has(item.source)
    || typeof item.evidence !== 'string'
    || typeof item.interpretation !== 'string'
    || typeof item.next_step !== 'string'
  )) {
    throw new Error('Every AI report factor must include factor, an allowed source, evidence, interpretation, and next_step.');
  }
  if (result.not_determinable.some(item => typeof item !== 'string')) {
    throw new Error('AI report not_determinable items must be strings.');
  }
}

function sanitizeReport(result, evidence) {
  const factors = [];
  for (const item of result.possible_factors.slice(0, 20)) {
    const source = factorSources.has(item?.source) ? item.source : '';
    let factor = safeString(item?.factor, 400);
    let evidenceText = safeString(item?.evidence, 1000);
    const interpretation = safeString(item?.interpretation, 1000);
    const nextStep = safeString(item?.next_step, 800);
    if (!source || !factor || !evidenceText || !interpretation || !nextStep) continue;
    if (containsUnsupportedCausality(factor) || containsUnsupportedCausality(interpretation)) continue;

    if (source === 'employer-stated') {
      const verified = evidence.extractedFeedback.find(feedback => validateExactQuote(feedback.exact_quote, evidence.feedbackText)
        && (validateExactQuote(evidenceText, evidence.feedbackText) || normalizeQuestion(evidenceText) === normalizeQuestion(feedback.exact_quote)));
      if (!verified) continue;
      evidenceText = verified.exact_quote;
      factor = verified.reason;
    } else if (source === 'resume-gap') {
      continue;
    } else if (source === 'candidate-reported') {
      const verified = evidence.answers.find(answer => validateExactQuote(evidenceText, answer.answer));
      if (!verified) continue;
    } else {
      evidenceText = stageContext(evidence.stage);
      factor = 'Application-stage context (not a cause)';
    }

    factors.push({
      factor,
      source,
      evidence: evidenceText,
      interpretation,
      next_step: nextStep,
      note: source === 'employer-stated' ? null : reportNote
    });
  }

  const resumeText = evidence.resumeText;
  const missingSkills = Array.isArray(evidence.gaps?.missingSkills) ? evidence.gaps.missingSkills : [];
  if (resumeText) {
    for (const skill of missingSkills.slice(0, 10)) {
      if (typeof skill !== 'string' || resumeContainsSkill(resumeText, skill)) continue;
      factors.push({
        factor: `The provided resume text does not mention the required skill ${skill}.`,
        source: 'resume-gap',
        evidence: 'not found in resume',
        interpretation: 'This is a difference between the available profile/job comparison and the provided resume text; it does not establish why the employer made its decision.',
        next_step: `If you have experience with ${skill}, consider adding accurate, specific evidence of it to your resume.`,
        note: reportNote
      });
    }
  }

  const confidence = computeConfidence({
    stage: evidence.stage,
    hasFeedback: evidence.hasFeedback && evidence.extractedFeedback.length > 0,
    hasAnswers: evidence.hasAnswers
  });
  const notDeterminable = ['The employer’s decision criteria and comparisons with other candidates were not provided.'];
  if (!evidence.hasFeedback) notDeterminable.push('Employer feedback was not provided.');
  else if (!evidence.extractedFeedback.length) notDeterminable.push('No employer-stated reason could be matched to an exact feedback quote.');
  if (!evidence.resumeText) notDeterminable.push('Resume text was not provided for this reflection.');
  if (!evidence.hasAnswers) notDeterminable.push('No reflection answers were provided.');
  if (missingSkills.length && !resumeText) notDeterminable.push('Resume-to-role skill gaps were not compared because resume text was not provided.');
  const employerFactors = factors.filter(factor => factor.source === 'employer-stated');
  const summary = employerFactors.length
    ? 'The employer-stated factor below is grounded in the exact feedback quote provided.'
    : factors.length
      ? 'The information shared supports only possible reflection points; no employer-stated cause is established.'
      : 'There is not enough direct evidence to determine the reason for the outcome.';
  return {
    summary,
    possible_factors: factors,
    not_determinable: notDeterminable,
    confidence,
    confidence_basis: confidenceBasis(confidence),
    note: reportNote
  };
}

function computeConfidence({ stage, hasFeedback, hasAnswers }) {
  if (!hasFeedback && !hasAnswers) return 'low';
  let score = Number(stage !== 'unknown') + Number(hasFeedback) * 2 + Number(hasAnswers);
  if (!hasFeedback && !hasAnswers) score = Math.min(score, 1);
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function confidenceBasis(confidence) {
  if (confidence === 'high') return 'Multiple candidate inputs and employer feedback were available; this still does not confirm the employer’s decision reason.';
  if (confidence === 'medium') return 'Some candidate-provided context was available, but the employer’s decision reason is not confirmed.';
  return 'Limited direct evidence was available; no cause should be assumed.';
}

function stageContext(stage) {
  const labels = {
    'resume-screening': 'The candidate selected resume screening as the stage; this is context only and does not establish a cause.',
    'online-assessment': 'The candidate selected online assessment as the stage; this is context only and does not establish a cause.',
    'technical-interview': 'The candidate selected technical interview as the stage; this is context only and does not establish a cause.',
    'hr-interview': 'The candidate selected HR interview as the stage; this is context only and does not establish a cause.',
    'final-selection': 'The candidate selected final selection as the stage; this is context only and does not establish a cause.',
    unknown: 'The application stage was not known; no cause can be inferred.'
  };
  return labels[stage] || labels.unknown;
}

function normalizeAnswers(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap(item => {
    const question = safeString(item?.question, 400);
    const answer = safeString(item?.answer, 1500);
    return question && answer ? [{ question, answer }] : [];
  });
}

function containsUnsupportedCausality(value) {
  return /\b(caused|was the reason|reason for (?:the )?rejection|why you were rejected|rejected because|led to (?:the )?rejection)\b/i.test(value);
}

function resumeContainsSkill(resumeText, skill) {
  const normalizedResume = normalizeQuestion(resumeText);
  const normalizedSkill = normalizeQuestion(skill);
  return Boolean(normalizedSkill && normalizedResume.includes(normalizedSkill));
}

function maskSensitiveInfo(value) {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, match => (match.match(/\d/g) || []).length >= 8 ? '[redacted phone]' : match);
}

function liteModel() {
  return process.env.AI_LITE_MODEL || process.env.AI_MODEL || getAIProviderStatus().model;
}

function strongModel() {
  return process.env.AI_STRONG_MODEL || process.env.AI_MODEL || getAIProviderStatus().model;
}

function limitObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [
    maskSensitiveInfo(safeString(key, 80)),
    Array.isArray(item) ? item.slice(0, 20).map(value => typeof value === 'string' ? maskSensitiveInfo(value.slice(0, 1000)) : value)
      : typeof item === 'string' ? maskSensitiveInfo(item.slice(0, 1000)) : item
  ]));
}

function safeString(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function normalizeQuestion(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function safeProviderMessage(error) {
  const message = String(error?.message || 'AI report validation failed.');
  return message
    .replaceAll(process.env.AI_API_KEY || '\u0000', '[redacted]')
    .replaceAll(process.env.OLLAMA_API_KEY || '\u0000', '[redacted]')
    .slice(0, 500);
}
