const statusKey = status => String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

export function summarizeApplications(applications) {
  const records = Array.isArray(applications) ? applications : [];
  const count = (...statuses) => records.filter(application => statuses.includes(statusKey(application.status))).length;
  const interviews = count('INTERVIEW');
  const rejections = count('REJECTED', 'NOT_SELECTED');
  const assessments = count('ASSESSMENT');
  const offers = count('OFFER');
  const withdrawn = count('WITHDRAWN');
  const pending = count('SAVED', 'PLANNED', 'APPLICATION_STARTED', 'APPLIED', 'SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD', 'UNKNOWN');
  const dates = records
    .map(application => new Date(application.createdAt || application.updatedAt))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((left, right) => left - right);
  const sampleSize = records.length;
  const terminalOutcomeCount = interviews + rejections + offers + withdrawn;

  return {
    applications: sampleSize,
    interviews,
    rejections,
    assessments,
    offers,
    withdrawn,
    pending,
    dataSufficiency: terminalOutcomeCount < 5 ? 'Insufficient evidence' : terminalOutcomeCount < 20 ? 'Preliminary observations' : 'Cautious observations',
    knownFacts: sampleSize
      ? [`${sampleSize} application records are available.`, `${interviews} interview, ${rejections} rejection, ${assessments} assessment, and ${offers} offer outcome(s) are recorded.`]
      : ['No application outcomes have been recorded yet.'],
    unsupportedConclusions: [
      'Resume quality caused a rejection.',
      'A specific skill caused an application outcome.',
      'A career path is unsuitable based on limited samples.'
    ],
    recommendedNextStep: 'Continue tracking outcomes and record confirmed recruiter feedback. These counts do not establish why an employer made a decision.',
    sampleSize,
    outcomeSampleSize: terminalOutcomeCount,
    terminalOutcomeCount,
    observationPeriod: dates.length
      ? { from: dates[0].toISOString(), to: dates[dates.length - 1].toISOString() }
      : null,
    reliableConclusion: terminalOutcomeCount >= 20
  };
}
