import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { IconSparkles, IconX } from './Icons';

function assistantGreeting(job) {
  return {
    role: 'assistant',
    content: job
      ? `I’ve attached the ${job.title || 'selected role'} posting${job.company ? ` at ${job.company}` : ''}. Ask me about its responsibilities, requirements, or how to prepare.`
      : 'Ask me about job postings, applications, or general career preparation. Select “Ask AI” on a job to attach its details.'
  };
}

function descriptionOverview(description) {
  const clean = String(description || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'No job description was provided for this listing.';
  const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean];
  const overview = sentences.slice(0, 3).join(' ').trim();
  return overview.length > 520 ? `${overview.slice(0, 517).trimEnd()}...` : overview;
}

export default function JobChatAssistant({ isOpen, onToggle, job, status }) {
  const [messages, setMessages] = useState(() => [assistantGreeting(job)]);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [includeResume, setIncludeResume] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setMessages([assistantGreeting(job)]);
    setError('');
  }, [job?.id, job?.title, job?.company]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, messages, working]);

  const sendMessage = async event => {
    event.preventDefault();
    const content = question.trim();
    if (!content || working) return;

    const userMessage = { role: 'user', content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion('');
    setError('');
    setWorking(true);
    try {
      const result = await api('/ai/job-chat', {
        method: 'POST',
        body: JSON.stringify({
          includeResume,
          job: job ? {
            title: job.title,
            company: job.company,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
            experienceRequirements: job.experienceRequirements,
            salary: job.salary?.text || job.salary,
            description: job.description,
            requirements: job.requiredSkills?.length ? job.requiredSkills : job.skills || []
          } : {},
          messages: nextMessages.slice(-10)
        })
      });
      if (!result.answer) throw new Error('The chat service is unavailable. Check your connection and configured AI provider.');
      setMessages(current => [...current, {
        role: 'assistant',
        content: result.answer,
        provider: result.provider,
        model: result.model
      }]);
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setWorking(false);
    }
  };

  const clearJobContext = () => {
    onToggle(null);
  };

  return (
    <>
      {!isOpen && (
        <button type="button" className="job-chat-launcher" onClick={() => onToggle()} aria-label="Open CareerPilot AI chat">
          <IconSparkles size={19} />
          <span>AI Chat</span>
        </button>
      )}
      {isOpen && (
        <section className={`job-chat-panel ${isExpanded ? 'expanded' : ''}`} aria-label="CareerPilot AI chat" aria-live="polite">
          <header className="job-chat-header">
            <div className="job-chat-title">
              <span className="job-chat-icon"><IconSparkles size={17} /></span>
              <div><strong>CareerPilot AI</strong><span>Ask about a role or your job search</span></div>
            </div>
            <div className="job-chat-header-actions">
              <button
                type="button"
                className="job-chat-expand"
                onClick={() => setIsExpanded(current => !current)}
                aria-label={isExpanded ? 'Restore chat size' : 'Expand chat to full screen'}
              >
                {isExpanded ? 'Restore' : 'Expand'}
              </button>
              <button type="button" className="job-chat-close" onClick={() => onToggle()} aria-label="Close AI chat">
                <IconX size={18} />
              </button>
            </div>
          </header>

          {job && (
            <details className="job-chat-context">
              <summary>
                <span className="job-chat-attachment-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49" />
                  </svg>
                </span>
                <span className="job-chat-attached-label">Job attached</span>
                <strong>{job.title || 'Selected job'}{job.company ? ` · ${job.company}` : ''}</strong>
                <span className="job-chat-context-toggle">Details</span>
              </summary>
              <div className="job-chat-context-details">
                <p>{descriptionOverview(job.description)}</p>
                <button type="button" onClick={clearJobContext}>Remove job context</button>
              </div>
            </details>
          )}

          {!status?.configured && (
            <div className="job-chat-provider-notice" role="status">
              AI chat needs a configured server provider. {status?.message || 'Check AI settings.'}
            </div>
          )}

          <div className="job-chat-messages" role="log" aria-label="Chat messages">
            {messages.map((message, index) => (
              <article className={`job-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                <p>{message.content}</p>
                {message.provider && <span>{message.provider} · {message.model}</span>}
              </article>
            ))}
            {working && <div className="job-chat-thinking" role="status">Thinking…</div>}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="job-chat-error" role="alert">{error}</div>}
          <form className="job-chat-compose" onSubmit={sendMessage}>
            <textarea
              ref={inputRef}
              rows={2}
              value={question}
              maxLength={1800}
              onChange={event => setQuestion(event.target.value)}
              placeholder={status?.configured ? 'Ask a question about this job…' : 'Configure AI to start a chat'}
              aria-label="Message CareerPilot AI"
              disabled={!status?.configured || working}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!status?.configured || working || !question.trim()}>
              {working ? 'Sending…' : 'Send'}
            </button>
          </form>
          <label className="job-chat-resume-option">
            <input
              type="checkbox"
              checked={includeResume}
              onChange={event => setIncludeResume(event.target.checked)}
            />
            <span>Include my latest analyzed resume in this chat</span>
          </label>
          <p className="job-chat-footnote">
            {includeResume
              ? 'Your message, job description, and analyzed resume are sent to the configured AI provider for each request. Resume sharing is optional; verify important details with the employer.'
              : 'Your message and attached job description are sent to the configured AI provider. Your resume is not shared unless you enable the option above.'}
          </p>
        </section>
      )}
    </>
  );
}
