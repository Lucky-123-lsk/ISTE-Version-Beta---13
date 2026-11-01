import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTailoredSections } from '../src/services/tailoredResume.js';

test('builds a tailored draft from extracted resume data when profile details are absent', () => {
  const sections = buildTailoredSections({}, {
    personalInfo: { summary: 'Frontend engineer focused on accessible web apps.' },
    technicalSkills: [{ name: 'React' }, { name: 'JavaScript' }],
    softSkills: ['Communication'],
    education: [{ degree: 'BSc Computer Science', institution: 'State University', graduationYear: '2024' }],
    experience: [{ role: 'Developer', company: 'Acme', dates: '2022 - 2024', highlights: ['Built web applications'] }],
    projects: ['Career dashboard'],
    achievements: ['Deans list'],
    certifications: [{ name: 'Cloud Fundamentals' }]
  });

  assert.deepEqual(sections, {
    summary: 'Frontend engineer focused on accessible web apps.',
    skills: 'React, JavaScript, Communication',
    education: 'BSc Computer Science - State University - 2024',
    experience: 'Developer - Acme - 2022 - 2024 - Built web applications',
    projects: 'Career dashboard',
    achievements: 'Deans list\nCloud Fundamentals'
  });
});

test('prefers candidate-edited profile sections over extracted resume values', () => {
  const sections = buildTailoredSections({
    objective: 'Candidate-edited summary',
    existingSkills: [{ name: 'Verified React', confidence: 'verified' }],
    projects: [{ title: 'Edited project', details: 'Candidate-authored details' }]
  }, {
    personalInfo: { summary: 'Resume summary' },
    technicalSkills: [{ name: 'Resume React' }],
    projects: [{ title: 'Resume project' }]
  });

  assert.equal(sections.summary, 'Candidate-edited summary');
  assert.equal(sections.skills, 'Verified React');
  assert.equal(sections.projects, 'Edited project - Candidate-authored details');
});

test('returns empty sections when neither profile nor analyzed resume has content', () => {
  assert.deepEqual(buildTailoredSections(), {
    summary: '',
    skills: '',
    education: '',
    experience: '',
    projects: '',
    achievements: ''
  });
});
