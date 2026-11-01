import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeEvidence } from '../src/services/resumeEvidence.js';

test('resume evidence uses exact parsed text and real extracted line numbers', () => {
  const evidence = buildResumeEvidence(
    { _id: 'job-1', title: 'Developer', companyName: 'Example', requiredSkills: ['React', 'Java'] },
    { fileName: 'candidate.pdf', originalText: 'Education: BSc\nBuilt a React application\nUsed Java for coursework' }
  );

  assert.equal(evidence.evidenceAvailable, true);
  assert.deepEqual(evidence.requirements.map(item => item.evidence.lineStart), [2, 3]);
  assert.equal(evidence.requirements[0].evidence.text, 'Built a React application');
  assert.equal(evidence.requirements[1].evidence.text, 'Used Java for coursework');
  assert.equal(evidence.requirements[0].sourceDocument, 'candidate.pdf');
  assert.equal(Object.hasOwn(evidence.requirements[0].evidence, 'page'), false);
});

test('resume evidence does not mistake JavaScript for Java and labels absent evidence honestly', () => {
  const evidence = buildResumeEvidence(
    { _id: 'job-2', title: 'Developer', companyName: 'Example', requiredSkills: ['Java'] },
    { fileName: 'candidate.docx', originalText: 'Built an interface with JavaScript' }
  );

  assert.equal(evidence.evidenceAvailable, false);
  assert.equal(evidence.requirements[0].status, 'insufficient-evidence');
  assert.equal(evidence.requirements[0].evidence, null);
});

test('resume evidence recognizes common aliases and includes preferred requirements', () => {
  const evidence = buildResumeEvidence(
    {
      _id: 'job-3',
      title: 'Engineer',
      companyName: 'Example',
      requiredSkills: ['JavaScript', 'Node.js'],
      preferredSkills: ['AWS']
    },
    {
      fileName: 'candidate.pdf',
      originalText: 'Built a browser app with JS.\nDeployed services using Amazon Web Services.'
    }
  );

  assert.deepEqual(evidence.requirements.map(item => item.status), ['supported', 'insufficient-evidence', 'supported']);
  assert.equal(evidence.requirements[0].evidence.text, 'Built a browser app with JS.');
  assert.equal(evidence.requirements[2].importance, 'preferred');
});

test('resume evidence includes profile matches for candidate review without treating them as resume proof', () => {
  const evidence = buildResumeEvidence(
    { _id: 'job-4', title: 'Engineer', companyName: 'Example', requiredSkills: ['React'] },
    null,
    {
      existingSkills: [{ name: 'React.js', confidence: 'self-declared' }],
      projects: [{ title: 'Portfolio', description: 'Built a React application.' }]
    }
  );

  assert.equal(evidence.evidenceAvailable, true);
  assert.equal(evidence.resume, null);
  assert.equal(evidence.requirements[0].status, 'profile-match');
  assert.equal(evidence.requirements[0].evidence, null);
  assert.equal(evidence.requirements[0].evidenceCandidates.length, 2);
  assert.equal(evidence.requirements[0].evidenceCandidates[0].sourceLabel, 'Career DNA skills');
});
