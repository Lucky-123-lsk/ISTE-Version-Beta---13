import React, { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import { IconShieldCheck, IconLock, IconCheckCircle } from '../components/Icons';
import { api } from '../services/api';

export default function Settings() {
  const [showUncertain, setShowUncertain] = useState(true);
  const [requireExactQuotes, setRequireExactQuotes] = useState(true);
  const [autoSaveNotes, setAutoSaveNotes] = useState(true);
  const [savedNotice, setSavedNotice] = useState(false);
  const [connections, setConnections] = useState([]);
  const [extensionToken, setExtensionToken] = useState('');
  const [extensionError, setExtensionError] = useState('');
  const [extensionBusy, setExtensionBusy] = useState(false);

  useEffect(() => {
    api('/extension/connections', { skipDemo: true })
      .then(setConnections)
      .catch(error => setExtensionError(error.message));
  }, []);

  const saveSettings = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const pairExtension = async () => {
    setExtensionBusy(true);
    setExtensionError('');
    setExtensionToken('');
    try {
      const result = await api('/extension/pair', {
        method: 'POST',
        skipDemo: true,
        body: JSON.stringify({ name: 'CareerPilot Chrome extension' })
      });
      setExtensionToken(result.token);
      setConnections(current => [{ id: result.connectionId, name: result.name || 'CareerPilot Chrome extension', scopes: result.scopes, expiresAt: result.expiresAt }, ...current]);
    } catch (error) {
      setExtensionError(error.message);
    } finally {
      setExtensionBusy(false);
    }
  };

  const revokeExtension = async id => {
    setExtensionError('');
    try {
      await api(`/extension/connections/${id}`, { method: 'DELETE', skipDemo: true });
      setConnections(current => current.filter(connection => connection.id !== id));
    } catch (error) {
      setExtensionError(error.message);
    }
  };

  return (
    <div className="settings-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Candidate Autonomy & Workspace Settings</h1>
          <p className="page-subtitle">
            Configure safety constraints, verification filters, and autonomy guarantees.
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
          Core Safety Guarantees (Enforced by Design)
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <IconCheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Zero Automatic Submissions</h4>
              <p className="text-xs text-slate-600">
                The platform will never apply to a role on your behalf. Candidate approval is required for every draft statement.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <IconCheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Visible Uncertainty Policy</h4>
              <p className="text-xs text-slate-600">
                Listings with unverified sources or outdated provider signals remain visibly labeled, never secretly suppressed.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <IconCheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">Exact Evidence Grounding</h4>
              <p className="text-xs text-slate-600">
                No factual resume claims are promoted without an exact, verified textual quote from your candidate materials.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Preferences */}
      <div className="card">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-4">
          Decision Preferences
        </h3>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-slate-900 block">
                Show Uncertain Listings with TrustLens Flags
              </span>
              <span className="text-xs text-slate-500">
                Display listings requiring verification instead of hiding them from discovery.
              </span>
            </div>
            <input
              type="checkbox"
              checked={showUncertain}
              onChange={e => {
                setShowUncertain(e.target.checked);
                saveSettings();
              }}
              className="form-checkbox"
            />
          </label>

          <label className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-slate-900 block">
                Require Exact Resume Quotes Before Draft Approval
              </span>
              <span className="text-xs text-slate-500">
                Prevent approving statements that lack verified textual citations.
              </span>
            </div>
            <input
              type="checkbox"
              checked={requireExactQuotes}
              onChange={e => {
                setRequireExactQuotes(e.target.checked);
                saveSettings();
              }}
              className="form-checkbox"
            />
          </label>

          <label className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-slate-900 block">
                Auto-Save Candidate Reflection Notes
              </span>
              <span className="text-xs text-slate-500">
                Persist interview preparation notes to active session memory.
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoSaveNotes}
              onChange={e => {
                setAutoSaveNotes(e.target.checked);
                saveSettings();
              }}
              className="form-checkbox"
            />
          </label>
        </div>

        {savedNotice && (
          <div className="notice notice-ok mt-4 py-2">
            Settings preference saved to current session.
          </div>
        )}
      </div>

      <div className="card mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
          Review-only Chrome extension
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Pair the Greenhouse helper with a separate, scoped token. It can read only the approved profile fields needed for supported form filling.
        </p>
        <button type="button" className="btn btn-primary" onClick={pairExtension} disabled={extensionBusy}>
          {extensionBusy ? 'Creating connection...' : 'Create extension connection'}
        </button>
        {extensionToken && (
          <div className="notice notice-ok mt-4">
            <strong>Copy this token now.</strong> It is shown only once and is not your CareerPilot login token.
            <code className="block mt-2 break-all">{extensionToken}</code>
          </div>
        )}
        {extensionError && <div className="notice notice-error mt-4">{extensionError}</div>}
        {connections.length > 0 && (
          <div className="mt-4 space-y-2">
            {connections.map(connection => (
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg" key={connection.id}>
                <div>
                  <strong className="text-sm text-slate-900">{connection.name}</strong>
                  <div className="text-xs text-slate-500">
                    Profile read · expires {new Date(connection.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => revokeExtension(connection.id)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
