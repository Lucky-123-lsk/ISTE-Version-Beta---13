import React from 'react';
import {
  IconOverview,
  IconSearch,
  IconBookmark,
  IconShieldCheck,
  IconBriefcase,
  IconFileText,
  IconCpu,
  IconLifeBuoy,
  IconLock,
  IconSettings,
  IconTarget,
  IconSparkles
} from './Icons';

export const navigationSections = [
  {
    group: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', icon: IconOverview },
      { id: 'discover', label: 'Discover Jobs', icon: IconSearch },
      { id: 'saved', label: 'Saved Jobs', icon: IconBookmark, badgeKey: 'savedCount' },
      { id: 'career-dna', label: 'Profile', icon: IconFileText },
      { id: 'trustlens', label: 'TrustLens', icon: IconShieldCheck }
    ]
  },
  {
    group: 'Applications',
    items: [
      { id: 'applications', label: 'My Applications', icon: IconBriefcase, badgeKey: 'appsCount' }
    ]
  },
  {
    group: 'Career Intelligence',
    items: [
      { id: 'proofpath', label: 'ProofPath Studio', icon: IconFileText },
      { id: 'skill-gaps', label: 'Skill Gap Analysis', icon: IconTarget },
      { id: 'interview-prep', label: 'Interview Prep', icon: IconSparkles },
      { id: 'ai-studio', label: 'AI Studio', icon: IconCpu },
      { id: 'tailoring', label: 'Resume Tailoring Studio', icon: IconFileText },
      { id: 'rejection-coach', label: 'Rejection Coach', icon: IconLifeBuoy }
    ]
  },
  {
    group: 'Account & Safety',
    items: [
      { id: 'privacy', label: 'PrivacyVault', icon: IconLock },
      { id: 'settings', label: 'Settings', icon: IconSettings }
    ]
  }
];

export default function Sidebar({ currentRoute, counts = {}, isMobileOpen, onCloseMobile }) {
  return (
    <aside className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <a href="#overview" className="brand-logo" onClick={onCloseMobile}>
          <div className="brand-icon">
            <span className="brand-gem" />
          </div>
          <div className="brand-meta">
            <span className="brand-name">CareerPilot <span className="brand-badge">AI</span></span>
            <span className="brand-tagline">Decision Platform</span>
          </div>
        </a>
      </div>

      <nav className="sidebar-nav">
        {navigationSections.map(section => (
          <div className="nav-group" key={section.group}>
            <span className="nav-group-title">{section.group}</span>
            <ul className="nav-list">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = currentRoute === item.id;
                const badgeValue = item.badgeKey ? counts[item.badgeKey] : null;

                return (
                  <li key={item.id} className="nav-item">
                    <a
                      href={`#${item.id}`}
                      className={`nav-link ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={onCloseMobile}
                    >
                      <Icon size={17} className="nav-icon" />
                      <span className="nav-label">{item.label}</span>
                      {badgeValue > 0 && (
                        <span className="nav-badge-pill">{badgeValue}</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="principle-card">
          <div className="principle-title">Core Safety Guarantee</div>
          <p className="principle-text">AI recommends. The candidate decides. Zero automatic application submissions.</p>
        </div>
      </div>
    </aside>
  );
}
