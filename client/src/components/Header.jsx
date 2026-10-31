import React from 'react';
import { IconSearch, IconShieldCheck, IconLock } from './Icons';

export default function Header({ currentTitle, profile, syncStatus, isFallback = false, onSearchClick }) {
  const candidateName = profile?.name || profile?.fullName || 'Demo Candidate';
  const candidateRole = profile?.preferredRoles?.[0] || 'Frontend & AI Candidate';
  const initials = candidateName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="top-header">
      <div className="header-left">
        <div className="breadcrumb-nav">
          <span className="breadcrumb-root">CareerPilot</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">{currentTitle}</span>
        </div>
      </div>

      <div className="header-right">
        {/* Subtle, refined data provenance indicator (replaces full-width yellow banner) */}
        <div className="provenance-pill" title={isFallback ? 'Running in curated demo session. Job models operate deterministically.' : 'Connected to MongoDB job database.'}>
          <span className={`status-dot ${isFallback ? 'status-dot-amber' : 'status-dot-emerald'}`} />
          <span className="provenance-label">
            {isFallback ? 'Curated Sample Feed' : 'Live Ingestion Active'}
          </span>
        </div>

        {/* Candidate Control / Privacy pill */}
        <div className="privacy-badge-pill" title="Candidate has 100% control over all applications and data">
          <IconLock size={13} className="text-slate-400" />
          <span className="privacy-label">Autonomous Candidate Control</span>
        </div>

        {/* Candidate Profile Avatar */}
        <a href="#career-dna" className="candidate-profile-button" title="View & Edit Career DNA">
          <div className="candidate-avatar">{initials}</div>
          <div className="candidate-info">
            <span className="candidate-name">{candidateName}</span>
            <span className="candidate-role-hint">{candidateRole}</span>
          </div>
        </a>
      </div>
    </header>
  );
}
