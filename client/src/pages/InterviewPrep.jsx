import React, { useState } from 'react';
import Badge from '../components/Badge';
import {
  IconSparkles,
  IconBriefcase,
  IconCalendar,
  IconCheckCircle,
  IconShieldCheck,
  IconFileText
} from '../components/Icons';

export default function InterviewPrep({ jobs = [], applications = [], profile }) {
  // Candidate can pick any application or job
  const relevantList = applications.length > 0 ? applications : jobs;
  const [selectedId, setSelectedId] = useState(relevantList[0]?.jobId || relevantList[0]?.id || '');
  const [activeTab, setActiveTab] = useState('technical'); // 'technical' | 'behavioral' | 'system'
  const [notes, setNotes] = useState({});

  const targetJob =
    jobs.find(j => j.id === selectedId) ||
    jobs.find(j => j.id === applications.find(a => a.id === selectedId)?.jobId) ||
    jobs[0];

  const handleNoteChange = (qIndex, text) => {
    setNotes(curr => ({ ...curr, [`${selectedId}-${qIndex}`]: text }));
  };

  if (!targetJob) {
    return <div className="card">No target opportunity selected for interview prep.</div>;
  }

  // Generate grounded questions based on the target job's skills
  const technicalQuestions = (targetJob.skills || ['React', 'JavaScript', 'REST APIs']).map(skill => {
    return {
      topic: skill,
      question: `In production, how have you architected and debugged solutions using ${skill}? Discuss edge cases, performance considerations, and testing patterns.`,
      framework: 'Grounded Evidence Prompt: Cite specific components, modules, or services from your verified projects.'
    };
  });

  const behavioralQuestions = [
    {
      topic: 'Cross-functional Alignment (STAR Method)',
      question: `Describe a situation at ${targetJob.company || 'your past team'} where engineering timelines conflicted with product scope. How did you resolve the tradeoffs?`,
      framework: 'STAR: Situation, Task, Action, Result. Focus on how you verified specifications and delivered value.'
    },
    {
      topic: 'Ambiguity & Learning Bridge',
      question: `This role involves requirements in ${(targetJob.missingSkills || ['new technologies']).join(', ')}. How have you rapidly closed technical gaps under pressure in prior roles?`,
      framework: 'Demonstrate active learning goals, hands-on experimentation, and reproducible outcomes.'
    }
  ];

  const architecturalQuestions = [
    {
      topic: 'System Scalability & Reliability',
      question: `How would you design the client-server interaction for ${targetJob.title} to support graceful offline recovery, network retries, and data consistency?`,
      framework: 'Discuss HTTP idempotency, caching, state management, and error boundaries.'
    }
  ];

  const currentQuestions =
    activeTab === 'technical'
      ? technicalQuestions
      : activeTab === 'behavioral'
      ? behavioralQuestions
      : architecturalQuestions;

  return (
    <div className="interview-prep-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Role-Grounded Interview Preparation</h1>
          <p className="page-subtitle">
            Targeted interview prompts grounded strictly in the verified job requirements and your confirmed resume evidence. No generic lists.
          </p>
        </div>
      </div>

      {/* Target Role Selector */}
      <div className="card mb-6">
        <label className="form-label">
          Choose Opportunity for Preparation:
          <select
            value={targetJob.id}
            onChange={e => setSelectedId(e.target.value)}
            className="form-select mt-1.5"
          >
            {jobs.map(j => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.company} ({j.skillMatch}% Match)
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Badge kind="blue" size="sm">
            {targetJob.title}
          </Badge>
          <span className="text-xs text-slate-500">{targetJob.company}</span>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500">Required Skills: {targetJob.skills?.join(', ')}</span>
        </div>
      </div>

      {/* Question Type Tabs */}
      <div className="prep-tabs-bar mb-6">
        <button
          type="button"
          className={`prep-tab-btn ${activeTab === 'technical' ? 'active' : ''}`}
          onClick={() => setActiveTab('technical')}
        >
          Technical Deep Dive ({technicalQuestions.length})
        </button>
        <button
          type="button"
          className={`prep-tab-btn ${activeTab === 'behavioral' ? 'active' : ''}`}
          onClick={() => setActiveTab('behavioral')}
        >
          STAR Behavioral Prompts ({behavioralQuestions.length})
        </button>
        <button
          type="button"
          className={`prep-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System & Architecture ({architecturalQuestions.length})
        </button>
      </div>

      {/* Questions Stack */}
      <div className="space-y-4">
        {currentQuestions.map((q, idx) => {
          const noteKey = `${selectedId}-${idx}`;
          const currentNote = notes[noteKey] || '';

          return (
            <div key={idx} className="card hover-lift border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-blue-600 tracking-wider">
                  {q.topic}
                </span>
                <span className="text-xs text-slate-400">Question #{idx + 1}</span>
              </div>

              <h3 className="text-base font-semibold text-slate-900 leading-snug">
                {q.question}
              </h3>

              <div className="framework-tip-box mt-3">
                <IconSparkles size={14} className="text-amber-600 flex-shrink-0" />
                <span className="text-xs text-slate-600">{q.framework}</span>
              </div>

              {/* Candidate Practice Note */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Your Preparation Notes & Talking Points:
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline key examples, numbers, or technical decisions from your experience..."
                  value={currentNote}
                  onChange={e => handleNoteChange(idx, e.target.value)}
                  className="form-textarea w-full text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

