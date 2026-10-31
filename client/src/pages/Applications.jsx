import React, { useState } from 'react';
import Badge from '../components/Badge';
import {
  IconKanban,
  IconTable,
  IconCalendar,
  IconClock,
  IconBriefcase,
  IconPlus,
  IconX,
  IconCheckCircle,
  IconAlertCircle,
  IconExternalLink
} from '../components/Icons';

const applicationStatuses = [
  'Planned',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn'
];

export default function Applications({
  items = [],
  jobs = [],
  onChangeStatus,
  onUpdateApp,
  onSelectJob
}) {
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedApp, setSelectedApp] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editInterviewDate, setEditInterviewDate] = useState('');

  const openAppDrawer = app => {
    setSelectedApp(app);
    setEditNotes(app.notes || '');
    setEditInterviewDate(app.interviewDate || '');
  };

  const closeAppDrawer = () => {
    setSelectedApp(null);
  };

  const saveDrawerDetails = () => {
    if (!selectedApp) return;
    onUpdateApp(selectedApp.id, {
      notes: editNotes,
      interviewDate: editInterviewDate
    });
    setSelectedApp(current => ({
      ...current,
      notes: editNotes,
      interviewDate: editInterviewDate
    }));
  };

  const filteredItems = items.filter(item => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return ['Planned', 'Applied', 'Assessment', 'Interview'].includes(item.status);
    return item.status === filterStatus;
  });

  const getStatusBadgeKind = status => {
    switch (status) {
      case 'Offer':
        return 'ok';
      case 'Interview':
        return 'ok';
      case 'Assessment':
      case 'Applied':
        return 'blue';
      case 'Planned':
        return 'neutral';
      case 'Rejected':
        return 'error';
      case 'Withdrawn':
      default:
        return 'subtle';
    }
  };

  return (
    <div className="applications-page animate-fade-in">
      {/* Header and View Controls */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">My Applications Pipeline</h1>
          <p className="page-subtitle">
            Track status progression, upcoming interview dates, and candidate notes. Status updates record milestones only; applications are never submitted automatically.
          </p>
        </div>

        <div className="filter-controls-right">
          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="form-select-sm"
          >
            <option value="all">All Applications ({items.length})</option>
            <option value="active">Active Pipeline</option>
            <option value="Interview">Interviews ({items.filter(a => a.status === 'Interview').length})</option>
            <option value="Planned">Planned ({items.filter(a => a.status === 'Planned').length})</option>
            <option value="Applied">Applied ({items.filter(a => a.status === 'Applied').length})</option>
            <option value="Rejected">Rejected</option>
          </select>

          {/* View Toggle */}
          <div className="view-mode-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Board View"
            >
              <IconKanban size={16} />
              <span className="ml-1 text-xs">Board</span>
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <IconTable size={16} />
              <span className="ml-1 text-xs">Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View: Kanban or Table */}
      {viewMode === 'kanban' ? (
        <div className="kanban-board">
          {['Planned', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected'].map(colStatus => {
            const colItems = items.filter(a => a.status === colStatus);

            return (
              <div key={colStatus} className="kanban-column">
                <div className="kanban-column-header">
                  <div className="flex items-center gap-2">
                    <span className="kanban-status-name">{colStatus}</span>
                    <span className="kanban-count-pill">{colItems.length}</span>
                  </div>
                </div>

                <div className="kanban-cards-stack">
                  {colItems.map(app => {
                    const job = jobs.find(j => j.id === app.jobId) || {};
                    const title = app.jobTitle || job.title || 'Target Role';
                    const company = app.companyName || job.company || 'Company';

                    return (
                      <div
                        key={app.id}
                        className="kanban-card hover-lift"
                        onClick={() => openAppDrawer(app)}
                      >
                        <div className="kanban-card-top">
                          <h4 className="kanban-card-title">{title}</h4>
                          <span className="kanban-card-company">{company}</span>
                        </div>

                        {app.interviewDate && (
                          <div className="kanban-interview-badge">
                            <IconCalendar size={12} className="mr-1" />
                            <span>{app.interviewDate}</span>
                          </div>
                        )}

                        {app.notes && (
                          <p className="kanban-card-note">{app.notes}</p>
                        )}
                        {app.tailoredResumeName && (
                          <Badge kind="blue">Resume: {app.tailoredResumeName}</Badge>
                        )}

                        <div className="kanban-card-footer">
                          {/* Quick status dropdown */}
                          <select
                            value={app.status}
                            aria-label={`Change status for ${title}`}
                            onClick={e => e.stopPropagation()}
                            onChange={e => onChangeStatus(app.id, e.target.value)}
                            className="kanban-status-select"
                          >
                            {applicationStatuses.map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>

                          <span className="kanban-date">
                            {new Date(app.updatedAt || app.createdAt || Date.now()).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {!colItems.length && (
                    <div className="kanban-empty-column">
                      <span>No items in {colStatus}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <div className="table-container-card">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Role & Company</th>
                <th>Current Status</th>
                <th>Interview / Follow-up</th>
                <th>Status History</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(app => {
                const job = jobs.find(j => j.id === app.jobId) || {};
                const title = app.jobTitle || job.title || 'Target Role';
                const company = app.companyName || job.company || 'Company';

                return (
                  <tr key={app.id} className="table-row hover:bg-slate-50">
                    <td>
                      <div className="font-semibold text-slate-900">{title}</div>
                      <div className="text-xs text-slate-500">{company}</div>
                    </td>
                    <td>
                      <select
                        value={app.status}
                        aria-label={`Status for ${title}`}
                        onChange={e => onChangeStatus(app.id, e.target.value)}
                        className="form-select-sm"
                      >
                        {applicationStatuses.map(status => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {app.interviewDate ? (
                        <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                          <IconCalendar size={13} />
                          {app.interviewDate}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">None scheduled</span>
                      )}
                    </td>
                    <td>
                      <div className="history-pill-stack">
                        {(app.history || []).slice(-3).map((h, idx) => (
                          <span key={idx} className="history-tag">
                            {h.status} ({new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => openAppDrawer(app)}
                      >
                        Details & Notes
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredItems.length && (
            <div className="empty-state-panel py-8">
              <p className="text-slate-500">No applications match the selected filter.</p>
            </div>
          )}
        </div>
      )}

      {/* Application Detail Drawer */}
      {selectedApp && (
        <div className="drawer-scrim" onClick={closeAppDrawer} role="dialog" aria-modal="true">
          <div className="drawer-panel animate-slide-left" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="drawer-eyebrow">APPLICATION MILESTONE</span>
                <h2 className="drawer-title">{selectedApp.jobTitle}</h2>
                <span className="text-sm font-semibold text-slate-700">{selectedApp.companyName}</span>
              </div>
              <button className="drawer-close-btn" onClick={closeAppDrawer} aria-label="Close drawer">
                <IconX size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Status Switcher Box */}
              <div className="drawer-section">
                <label className="text-xs font-semibold text-slate-700 block mb-1">Application Stage</label>
                <div className="status-selector-grid">
                  {applicationStatuses.map(st => (
                    <button
                      key={st}
                      type="button"
                      className={`status-btn-pill ${selectedApp.status === st ? 'active' : ''}`}
                      onClick={() => {
                        onChangeStatus(selectedApp.id, st);
                        setSelectedApp(curr => ({ ...curr, status: st }));
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interview / Follow-up Date Field */}
              <div className="drawer-section">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Upcoming Interview or Follow-up Date
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nov 4, 2026 at 3:00 PM IST or Follow-up on Thursday"
                  value={editInterviewDate}
                  onChange={e => setEditInterviewDate(e.target.value)}
                  className="search-input-field w-full"
                />
              </div>

              {/* Candidate Notes Field */}
              <div className="drawer-section">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Candidate Notes & Recruiter Contacts
                </label>
                <textarea
                  rows={4}
                  placeholder="Record discussion topics, interviewer names, portfolio feedback, or questions to ask."
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="form-textarea w-full"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mt-2"
                  onClick={saveDrawerDetails}
                >
                  Save Notes & Date
                </button>
              </div>

              {/* Full Milestone History */}
              <div className="drawer-section">
                <h4 className="section-subtitle">Milestone History</h4>
                <div className="activity-timeline">
                  {(selectedApp.history || []).map((h, idx) => (
                    <div key={idx} className="activity-item">
                      <div className="activity-marker">
                        <span className="marker-dot" />
                      </div>
                      <div className="activity-details">
                        <div className="activity-header">
                          <span className="font-semibold text-slate-800">{h.status}</span>
                          <span className="text-xs text-slate-400">
                            {new Date(h.at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <button type="button" className="btn btn-secondary" onClick={closeAppDrawer}>
                Close
              </button>
              <a href="#interview-prep" className="btn btn-primary">
                Open Interview Preparation
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
