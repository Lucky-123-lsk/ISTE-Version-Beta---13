import React, { useState } from 'react';
import Badge from '../components/Badge';
import {
  IconLock,
  IconShieldCheck,
  IconAlertCircle,
  IconFileText
} from '../components/Icons';

export default function PrivacyVault({ privacy, onExport, onDelete }) {
  const [exportText, setExportText] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!privacy) {
    return <div className="card">Loading PrivacyVault controls...</div>;
  }

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      const data = await onExport();
      setExportText(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const copyExport = () => {
    navigator.clipboard.writeText(exportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="privacy-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">PrivacyVault — Transparency & Data Sovereignty</h1>
          <p className="page-subtitle">
            You own your application decisions and profile data. We enforce strict minimization: zero covert AI processing, zero persistent storage without consent, and instant one-click data export and deletion.
          </p>
        </div>
      </div>

      {/* Persistence Architecture Status */}
      <div className="card mb-6 bg-slate-50 border-slate-200">
        <div className="flex items-start gap-3">
          <IconShieldCheck size={20} className="text-emerald-600 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-900">Current Session Data Handling</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {privacy.persistence}
            </p>
            <p className="text-xs text-blue-700 font-semibold mt-1">
              {privacy.externalAiUse}
            </p>
          </div>
        </div>
      </div>

      {/* Policy Table */}
      <div className="card mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Data Categories, Purpose & Retention Periods
        </h3>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Data Category</th>
              <th>Legitimate Purpose</th>
              <th>Retention Boundary</th>
            </tr>
          </thead>
          <tbody>
            {(privacy.policies || []).map((policy, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="font-semibold text-slate-900">{policy.category}</td>
                <td className="text-xs text-slate-600">{policy.purpose}</td>
                <td className="text-xs text-slate-600 font-mono">{policy.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Candidate Data Controls: Export & Deletion */}
      <div className="card">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">
          Your Data Sovereign Actions
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Export your entire profile, applications, saved opportunities, and reports in open JSON format, or wipe all demo memory instantly.
        </p>

        {error && <div className="notice notice-error mb-3">{error}</div>}

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? 'Preparing JSON Export...' : 'Download / View My Data'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
          >
            Delete All Demo Account Data
          </button>
        </div>

        {/* Export JSON Preview */}
        {exportText && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase">
                Exported Session Payload (JSON)
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={copyExport}
              >
                {copied ? 'Copied to Clipboard!' : 'Copy JSON'}
              </button>
            </div>
            <pre className="export-json-viewer">{exportText}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

