import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconLifeBuoy,
  IconCheckCircle,
  IconAlertCircle,
  IconArrowRight,
  IconLock
} from '../components/Icons';
import { api } from '../services/api';

const stages = [
  ['unknown', 'Unknown / Not specified'],
  ['resume-screening', 'Resume screening stage'],
  ['online-assessment', 'Online coding / skills assessment'],
  ['technical-interview', 'Technical interview round'],
  ['hr-interview', 'HR / Recruiter discussion'],
  ['final-selection', 'Final leadership selection']
];

export default function RejectionCoach({ jobs = [] }) {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState('unknown');
  const [feedbackType, setFeedbackType] = useState('unknown');
  const [jobId, setJobId] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [consent, setConsent] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!jobId && jobs.length) setJobId(jobs[0].id);
  }, [jobs, jobId]);

  const loadQuestions = async nextStage => {
    if (!consent) {
      setError('Please accept consent before sending inputs to the configured AI provider.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await api('/rejection/questions', {
        method: 'POST',
        body: JSON.stringify({ stage: nextStage, feedbackType, jobId, consentAccepted: consent })
      });
      setQuestions([...(result.fixedQuestions || []), ...(result.plannedQuestions || [])]);
      setQuestionIndex(0);
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const saveAnswerAndContinue = answer => {
    const current = questions[questionIndex];
    if (current) {
      setAnswers(prev => {
        const next = { ...prev };
        if (answer.trim()) next[current.id] = { question: current.question, answer: answer.trim() };
        else delete next[current.id];
        return next;
      });
    }
    if (questionIndex + 1 < questions.length) {
      setQuestionIndex(i => i + 1);
    } else {
      setStep(3);
    }
  };

  const createReport = async () => {
    setWorking(true);
    setError('');
    try {
      const result = await api('/rejection/report', {
        method: 'POST',
        body: JSON.stringify({
          stage,
          feedbackType,
          jobId: jobId || undefined,
          resumeText,
          pastedText,
          answers: Object.values(answers),
          consentAccepted: consent
        })
      });
      setReport(result);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const progress = step === 4 ? 100 : Math.min(95, Math.round((step / 3) * 100));
  const currentQuestion = questions[questionIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id]?.answer || '' : '';

  return (
    <div className="rejection-coach-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Rejection Coach — Constructive Reflection</h1>
          <p className="page-subtitle">
            Extract grounded lessons from application outcomes. We separate explicit employer statements from unverifiable guesses, and protect your privacy throughout.
          </p>
        </div>
      </div>

      <div className="card rejection-wizard-card">
        {/* Progress Bar */}
        <div className="wizard-header-row mb-4">
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              {step === 4 ? 'REFLECTION COMPLETED' : `STEP ${step + 1} OF 4`}
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {step === 4 ? 'Grounded Reflection Report' : 'Outcome Diagnostic'}
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-semibold">{progress}% Complete</span>
        </div>

        <div className="wizard-progress-track mb-6">
          <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        {error && <div className="notice notice-error mb-4">{error}</div>}
        {working && <div className="notice notice-ok mb-4">Processing reflection securely...</div>}

        {/* Step 0: Stage & Context */}
        {step === 0 && (
          <div className="wizard-step-content space-y-4">
            <h3 className="text-base font-semibold text-slate-800">
              Select Context (Share Only What You Wish)
            </h3>

            <div>
              <label className="form-label">
                Related Opportunity (Optional)
                <select
                  value={jobId}
                  onChange={e => setJobId(e.target.value)}
                  className="form-select mt-1"
                >
                  <option value="">Continue without linking a specific role</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.company}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="form-label">
                Application Milestone Stage
                <select
                  value={stage}
                  onChange={e => setStage(e.target.value)}
                  className="form-select mt-1"
                >
                  {stages.map(([val, lbl]) => (
                    <option key={val} value={val}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="form-label">
                Resume Content Excerpt (Optional)
                <textarea
                  rows={4}
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste relevant resume experience, or skip this entirely..."
                  className="form-textarea mt-1 text-xs"
                />
              </label>
            </div>

            <div className="consent-gate-box">
              <label className="candidate-confirm-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                />
                <span className="text-xs text-slate-800 font-semibold">
                  I consent to sending these inputs to the configured AI provider. No inputs are permanently stored on server disk.
                </span>
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={working || !consent}
                onClick={() => loadQuestions(stage)}
              >
                Continue to Feedback
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={working || !consent}
                onClick={() => {
                  setStage('unknown');
                  loadQuestions('unknown');
                }}
              >
                Skip Stage
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Employer Feedback */}
        {step === 1 && (
          <div className="wizard-step-content space-y-4">
            <h3 className="text-base font-semibold text-slate-800">
              Was Specific Employer Feedback Provided?
            </h3>

            <div>
              <label className="form-label">
                Feedback Channel
                <select
                  value={feedbackType}
                  onChange={e => setFeedbackType(e.target.value)}
                  className="form-select mt-1"
                >
                  <option value="unknown">Prefer not to say / Unstated</option>
                  <option value="written">Written email / portal notes</option>
                  <option value="verbal">Verbal recruiter phone feedback</option>
                  <option value="none">Standard automated rejection / No feedback</option>
                </select>
              </label>
            </div>

            <div>
              <label className="form-label">
                Feedback Notes (Email addresses and phone numbers are automatically masked)
                <textarea
                  rows={4}
                  value={pastedText}
                  onChange={e => setPastedText(e.target.value)}
                  placeholder="Paste snippets from employer email or interview notes..."
                  className="form-textarea mt-1 text-xs"
                />
              </label>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(2)}
              >
                Continue to Diagnostic Questions
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setPastedText('');
                  setFeedbackType('none');
                  setStep(2);
                }}
              >
                Skip Feedback Step
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Diagnostic Questions */}
        {step === 2 && currentQuestion && (
          <div className="wizard-step-content space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-blue-600 tracking-wider">
                OPTIONAL REFLECTION {questionIndex + 1} OF {questions.length}
              </span>
            </div>

            <h3 className="text-base font-bold text-slate-900">{currentQuestion.question}</h3>
            {currentQuestion.why_it_helps && (
              <p className="text-xs text-slate-500 italic">{currentQuestion.why_it_helps}</p>
            )}

            <textarea
              rows={4}
              value={currentAnswer}
              onChange={e =>
                setAnswers(prev => ({
                  ...prev,
                  [currentQuestion.id]: {
                    question: currentQuestion.question,
                    answer: e.target.value
                  }
                }))
              }
              placeholder="Your answer is optional. Share what you feel is relevant..."
              className="form-textarea text-xs"
            />

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveAnswerAndContinue(currentAnswer)}
              >
                {questionIndex + 1 < questions.length ? 'Next Question' : 'Review & Generate Report'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => saveAnswerAndContinue('')}
              >
                Skip This Question
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="wizard-step-content space-y-4">
            <h3 className="text-base font-bold text-slate-900">Ready to Generate Reflection</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              The reflection report strictly differentiates stated employer facts from hypothesis. Any missing information remains marked as not determinable.
            </p>

            <div className="flex gap-3 mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={working || !consent}
                onClick={createReport}
              >
                {working ? 'Generating Report...' : 'Generate Reflection Report'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={working}
                onClick={() => setStep(4)}
              >
                Skip Report
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Final Reflection Report */}
        {step === 4 && report && (
          <div className="rejection-report-section space-y-4">
            <div className="notice notice-ok">
              <h4 className="font-bold text-slate-900 mb-1">Reflection Summary</h4>
              <p className="text-xs text-slate-700 leading-relaxed">{report.summary}</p>
            </div>

            <div className="card bg-slate-50 border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-slate-600 tracking-wider">
                  Confidence Assessment:
                </span>
                <Badge kind={report.confidence === 'high' ? 'ok' : 'warn'} size="sm">
                  {report.confidence} Confidence
                </Badge>
              </div>
              <p className="text-xs text-slate-600">{report.confidence_basis}</p>
            </div>

            {/* Possible Factors */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
                Evaluated Factors
              </h3>
              <div className="space-y-3">
                {(report.possible_factors || []).map((factor, idx) => (
                  <div key={idx} className="card border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900">{factor.factor}</h4>
                      <Badge
                        kind={factor.source === 'employer-stated' ? 'ok' : 'warn'}
                        size="sm"
                      >
                        {factor.source === 'employer-stated' ? 'Employer-Stated' : 'Possible Hypothesis'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-700">
                      <strong>Evidence:</strong> {factor.evidence}
                    </p>
                    {factor.next_step && (
                      <p className="text-xs text-emerald-800 font-semibold mt-1">
                        <strong>Grounded Next Step:</strong> {factor.next_step}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* What is not determinable */}
            <div className="card border-amber-200 bg-amber-50">
              <h4 className="text-xs font-bold uppercase text-amber-800 tracking-wider mb-2">
                Cannot Be Determined From Available Information
              </h4>
              <ul className="text-xs text-slate-700 space-y-1 pl-4 list-disc">
                {(report.not_determinable || []).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              className="btn btn-secondary mt-4"
              onClick={() => {
                setStep(0);
                setReport(null);
                setQuestions([]);
                setAnswers({});
              }}
            >
              Start Another Reflection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

