import React from 'react';

export default function Badge({ children, kind = '', size = 'md', className = '', dot = false }) {
  let kindClass = '';
  switch (kind) {
    case 'ok':
    case 'verified':
    case 'active':
      kindClass = 'badge-ok';
      break;
    case 'warn':
    case 'needs-review':
    case 'unverified':
    case 'possibly-outdated':
    case 'caution':
      kindClass = 'badge-warn';
      break;
    case 'error':
    case 'closed':
    case 'rejected':
      kindClass = 'badge-error';
      break;
    case 'blue':
    case 'primary':
    case 'bridge':
      kindClass = 'badge-blue';
      break;
    case 'purple':
    case 'growth':
      kindClass = 'badge-purple';
      break;
    case 'stretch':
      kindClass = 'badge-stretch';
      break;
    case 'subtle':
      kindClass = 'badge-subtle';
      break;
    default:
      kindClass = 'badge-neutral';
  }

  return (
    <span className={`badge ${kindClass} ${size === 'sm' ? 'badge-sm' : ''} ${className}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

