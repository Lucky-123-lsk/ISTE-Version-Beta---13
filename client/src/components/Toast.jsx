import React, { useEffect } from 'react';
import { IconCheckCircle, IconAlertCircle, IconX } from './Icons';

export default function Toast({ message, type = 'info', onDismiss, duration = 3500 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className={`toast-container animate-fade-in ${type === 'error' ? 'toast-error' : ''}`} role="status">
      <div className="toast-icon">
        {type === 'error' ? (
          <IconAlertCircle size={18} className="text-red-500" />
        ) : (
          <IconCheckCircle size={18} className="text-emerald-500" />
        )}
      </div>
      <div className="toast-body">
        <p className="toast-text">{message}</p>
      </div>
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss notification">
        <IconX size={14} />
      </button>
    </div>
  );
}

