import React, { useState } from 'react';
import { api } from '../services/api';

export default function Onboarding({ user, onComplete }) {
  const [form, setForm] = useState({
    phone: '', location: '', linkedIn: '', github: '', portfolio: '',
    preferredRoles: '', preferredLocations: '', interests: '',
    workplacePreference: '', employmentPreference: '', availability: '',
    workAuthorizationCountries: '', education: '', experience: '', projects: '',
    weeklyBudgetHours: 5, maxEffortMinutes: 90
  });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const optionalLabel = <span className="optional-label">Optional</span>;
  const requiredMark = <span className="required-mark" aria-hidden="true">*</span>;
  const submit = async event => {
    event.preventDefault();
    if (!form.location.trim() || !form.preferredRoles.split(',').some(role => role.trim()) || !form.employmentPreference) {
      setError('Please complete all required fields before continuing.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const records = value => value.split('\n').map(line => {
        const [title, ...details] = line.split('|');
        return { title: title.trim(), details: details.join('|').trim() };
      }).filter(item => item.title).slice(0, 50);
      await api('/profile', { method: 'PUT', skipDemo: true, body: JSON.stringify({
        fullName: user.name, email: user.email, ...form,
        preferredRoles: form.preferredRoles.split(',').map(value => value.trim()).filter(Boolean),
        preferredLocations: form.preferredLocations.split(',').map(value => value.trim()).filter(Boolean),
        interests: form.interests.split(',').map(value => value.trim()).filter(Boolean),
        workAuthorizationCountries: form.workAuthorizationCountries.split(',').map(value => value.trim()).filter(Boolean),
        education: records(form.education),
        experience: records(form.experience),
        projects: records(form.projects),
        weeklyBudgetHours: Number(form.weeklyBudgetHours),
        maxEffortMinutes: Number(form.maxEffortMinutes)
      }) });
      onComplete();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setWorking(false);
    }
  };
  return <main className="auth-page"><section className="auth-card card">
    <div className="auth-brand">CareerPilot<span>AI</span></div><p className="eyebrow">Candidate profile setup</p><h1>Welcome, {user.name.split(' ')[0]}</h1><p className="muted">Set your recommendation context. You can edit these details later in your profile.</p>
    <form className="auth-form onboarding-form" onSubmit={submit}>
      <p className="onboarding-requirements"><span className="required-mark" aria-hidden="true">*</span> Required. Optional details can be added or updated later.</p>
      {['phone', 'location', 'linkedIn', 'github', 'portfolio'].map(name => {
        const label = name === 'linkedIn' ? 'LinkedIn URL' : name === 'github' ? 'GitHub URL' : name === 'portfolio' ? 'Portfolio URL' : name[0].toUpperCase() + name.slice(1);
        const required = name === 'location';
        return <label className="form-label" key={name}>{label} {required ? requiredMark : optionalLabel}<input name={name} value={form[name]} onChange={update} required={required} /></label>;
      })}
      <label className="form-label">Preferred roles {requiredMark}<input name="preferredRoles" value={form.preferredRoles} onChange={update} placeholder="Frontend Engineer, AI Engineer" required /></label>
      <label className="form-label">Preferred locations {optionalLabel}<input name="preferredLocations" value={form.preferredLocations} onChange={update} placeholder="Bhopal, Bengaluru, Remote" /></label>
      <label className="form-label">Interests {optionalLabel}<input name="interests" value={form.interests} onChange={update} placeholder="Web development, AI applications" /></label>
      <div className="form-grid-2">
        <label className="form-label">Workplace preference {optionalLabel}<select name="workplacePreference" value={form.workplacePreference} onChange={update}><option value="">Select</option><option>Remote</option><option>Hybrid</option><option>On-site</option><option>Flexible</option></select></label>
        <label className="form-label">Employment preference {requiredMark}<select name="employmentPreference" value={form.employmentPreference} onChange={update} required><option value="">Select</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></label>
      </div>
      <label className="form-label">Availability {optionalLabel}<input name="availability" value={form.availability} onChange={update} placeholder="Immediately, 30 days, weekends" /></label>
      <label className="form-label">Work authorization countries {optionalLabel}<input name="workAuthorizationCountries" value={form.workAuthorizationCountries} onChange={update} placeholder="India, United States" /></label>
      <label className="form-label">Education (one entry per line: Title|Details) {optionalLabel}<textarea name="education" rows="2" value={form.education} onChange={update} /></label>
      <label className="form-label">Experience (one entry per line: Title|Details) {optionalLabel}<textarea name="experience" rows="2" value={form.experience} onChange={update} /></label>
      <label className="form-label">Projects (one entry per line: Title|Details) {optionalLabel}<textarea name="projects" rows="2" value={form.projects} onChange={update} /></label>
      <label className="form-label">Weekly time budget (hours) {optionalLabel}<input name="weeklyBudgetHours" type="number" min="1" max="60" value={form.weeklyBudgetHours} onChange={update} /></label>
      <label className="form-label">Maximum effort per application (minutes) {optionalLabel}<input name="maxEffortMinutes" type="number" min="10" max="480" value={form.maxEffortMinutes} onChange={update} /></label>
      {error && <div className="notice notice-error">{error}</div>}
      <button className="btn btn-primary auth-submit" disabled={working} type="submit">{working ? 'Saving...' : 'Enter workspace'}</button>
    </form>
  </section></main>;
}
