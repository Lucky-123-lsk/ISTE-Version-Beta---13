import React, { useState } from 'react';
import { api } from '../services/api';

export default function AuthPage({ onAuthenticated, onDemo }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', termsAccepted: false, privacyAccepted: false });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const update = event => {
    const { name, type, value, checked } = event.target;
    setForm(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };
  const submit = async event => {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const payload = mode === 'register' ? form : { email: form.email, password: form.password };
      const result = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(payload), skipDemo: true });
      if (!result?.user) throw new Error('The authentication response was incomplete.');
      onAuthenticated(result.user, mode === 'register');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  };
  return <main className="auth-page"><section className="auth-card card">
    <div className="auth-brand">CareerPilot<span>AI</span></div>
    <p className="eyebrow">AI recommends. You decide.</p>
    <h1>{mode === 'register' ? 'Create your workspace' : 'Welcome back'}</h1>
    <p className="muted">{mode === 'register' ? 'Keep your profile, applications, and evidence in your own account.' : 'Sign in to your candidate-controlled workspace.'}</p>
    <form className="auth-form" onSubmit={submit}>
      {mode === 'register' && <label className="form-label">Full name<input name="name" value={form.name} onChange={update} required minLength="2" maxLength="120" /></label>}
      <label className="form-label">Email<input name="email" type="email" value={form.email} onChange={update} required /></label>
      <label className="form-label">Password<input name="password" type="password" value={form.password} onChange={update} required minLength="10" /></label>
      {mode === 'register' && <><label className="form-label">Confirm password<input name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} required /></label><label className="auth-check"><input name="termsAccepted" type="checkbox" checked={form.termsAccepted} onChange={update} required /> I accept the Terms of Use.</label><label className="auth-check"><input name="privacyAccepted" type="checkbox" checked={form.privacyAccepted} onChange={update} required /> I accept the Privacy Policy.</label></>}
      {error && <div className="notice notice-error">{error}</div>}
      <button className="btn btn-primary auth-submit" disabled={working} type="submit">{working ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
    </form>
    <button className="auth-link" type="button" onClick={() => { setError(''); setMode(current => current === 'login' ? 'register' : 'login'); }}>{mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
    <button className="btn btn-secondary auth-demo" type="button" onClick={onDemo}>Continue with curated demo</button>
  </section></main>;
}
