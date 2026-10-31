import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import {
  IconFileText,
  IconCheckCircle,
  IconAlertCircle,
  IconPlus,
  IconLock,
  IconShieldCheck
} from '../components/Icons';
import { api } from '../services/api';

export default function ProofPath({ evidence, onDraft, onApprove }) {
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('req-react');
  const [content, setContent] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    api('/resume/drafts')
      .then(setDrafts)
      .catch(loadError => setError(loadError.message));
  }, []);

  if (!evidence) {
    return <div className="card">Loading ProofPath evidence records...</div>;
  }

  const selected = evidence.requirements.find(item => item.id === selectedId) || evidence.requirements[0];

  const handleCreateDraft = async () => {
    if (!content.trim() || !confirmed) return;
    setWorking(true);
    setError('');
    try {
      const created = await onDraft({ evidenceId: selected.id, content: content.trim() });
      setDrafts(curr => [created, ...curr]);
      setContent('');
      setConfirmed(false);
      setSuccessNotice('Candidate-authored draft saved securely to your session.');
      setTimeout(() => setSuccessNotice(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleApproveDraft = async id => {
    setWorking(true);
    setError('');
    try {
      const approved = await onApprove(id);
      setDrafts(curr => curr.map(item => (item.id === id ? approved : item)));
      setSuccessNotice('Draft marked as candidate-approved for your review. No application was submitted.');
      setTimeout(() => setSuccessNotice(''), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="proofpath-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">ProofPath Studio — Evidence & Drafting</h1>
          <p className="page-subtitle">
            Ground every application claim in verifiable resume evidence. You author and approve every statement; AI never fabricates qualifications, and nothing is ever submitted automatically.
          </p>
        </div>
      </div>

      <div className="proofpath-grid">
        {/* Left Column: Requirements & Citations */}
        <div className="proofpath-left-col">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Job Requirements Audit
              </h2>
              <span className="text-xs text-slate-500">Select requirement</span>
            </div>

            <div className="space-y-2">
              {evidence.requirements.map(item => {
                const isSelected = selected.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`requirement-item-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedId(item.id);
                      setContent(item.suggestion || '');
                      setConfirmed(false);
                    }}
                  >
                    <div className="text-left">
                      <span className="requirement-name">{item.requirement}</span>
                    </div>
                    <Badge
                      kind={
                        item.status === 'supported'
                          ? 'ok'
                          : item.status === 'requires-confirmation'
                          ? 'warn'
                          : 'error'
                      }
                      size="sm"
                    >
                      {item.status.replaceAll('-', ' ')}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Evidence Citation Card */}
            <div className="citation-preview-card mt-6">
              <h3 className="citation-title">
                <IconShieldCheck size={16} className="text-blue-600 inline mr-1.5" />
                Resume Evidence Citation
              </h3>

              {selected.evidence ? (
                <div className="citation-quote-box">
                  <div className="citation-meta">
                    Page {selected.evidence.page}, lines {selected.evidence.lineStart}–{selected.evidence.lineEnd}:
                  </div>
                  <blockquote className="citation-text">
                    “{selected.evidence.text}”
                  </blockquote>
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-2">
                    <IconCheckCircle size={14} />
                    Verified by exact textual match
                  </span>
                </div>
              ) : (
                <div className="citation-warning-box">
                  <IconAlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-slate-600">
                    {selected.status === 'requires-confirmation'
                      ? 'Requires your confirmation. Only add statements that reflect real project work or production responsibilities.'
                      : 'Insufficient evidence found in candidate profile. Do not present this requirement as a verified resume claim.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Draft Authoring & Approvals */}
        <div className="proofpath-right-col">
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Candidate-Controlled Draft Editor
              </h2>
              <span className="text-xs text-slate-500">Candidate Authors & Edits</span>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Write an application statement supported by your genuine experience. Edit the wording to match your authentic voice.
            </p>

            {error && <div className="notice notice-error mb-3">{error}</div>}
            {successNotice && <div className="notice notice-ok mb-3">{successNotice}</div>}

            <textarea
              rows={5}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write a clear statement using evidence you can substantiate in an interview..."
              className="form-textarea w-full text-sm font-mono"
            />

            {/* Mandatory Confirmation Checkbox */}
            <label className="candidate-confirm-checkbox mt-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
              />
              <span className="text-xs text-slate-700 font-medium">
                I confirm this wording is accurate, factual, and reflects my genuine professional experience.
              </span>
            </label>

            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!content.trim() || !confirmed || working}
                onClick={handleCreateDraft}
              >
                {working ? 'Saving...' : 'Save Candidate Draft'}
              </button>
              <span className="text-xs text-slate-400">
                Approvals are recorded for candidate review only
              </span>
            </div>

            {/* Saved Drafts History */}
            <div className="saved-drafts-section mt-8">
              <h3 className="text-xs font-bold uppercase text-slate-600 tracking-wider mb-3">
                Authored Drafts ({drafts.length})
              </h3>

              <div className="space-y-3">
                {drafts.map(draft => (
                  <div key={draft.id} className="draft-record-card">
                    <p className="draft-text">{draft.content}</p>
                    <div className="draft-record-footer">
                      <Badge
                        kind={draft.status === 'candidate-approved-draft' ? 'ok' : 'neutral'}
                        size="sm"
                      >
                        {draft.status === 'candidate-approved-draft' ? 'Approved by Candidate' : 'Draft'}
                      </Badge>

                      {draft.status === 'draft' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          disabled={working}
                          onClick={() => handleApproveDraft(draft.id)}
                        >
                          Approve Statement
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          Approved {new Date(draft.approvedAt || Date.now()).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {!drafts.length && (
                  <p className="text-xs text-slate-400 italic">No drafted statements recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

