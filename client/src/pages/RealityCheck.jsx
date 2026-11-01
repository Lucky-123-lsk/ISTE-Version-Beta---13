import React from 'react';
import MetricCard from '../components/MetricCard';
import Badge from '../components/Badge';
import {
  IconBarChart,
  IconBriefcase,
  IconCalendar,
  IconAlertCircle,
  IconCheckCircle,
  IconClock,
  IconShieldCheck
} from '../components/Icons';

export default function RealityCheck({ insights, applications = [] }) {
  if (!insights) {
    return <div className="card">Loading RealityCheck outcome insights...</div>;
  }

  const sampleSize = insights.sampleSize || applications.length || 0;
  const isSmallSample = !insights.reliableConclusion;

  // Outcome distribution percentages
  const apps = Math.max(1, insights.applications || 0);
  const interviewsPct = Math.round(((insights.interviews || 0) / apps) * 100);
  const rejectionsPct = Math.round(((insights.rejections || 0) / apps) * 100);
  const assessmentsPct = Math.round(((insights.assessments || 0) / apps) * 100);
  const offersPct = Math.round(((insights.offers || 0) / apps) * 100);
  const pendingPct = Math.round(((insights.pending || 0) / apps) * 100);

  return (
    <div className="realitycheck-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">RealityCheck — Objective Outcome Analytics</h1>
          <p className="page-subtitle">
            Honest reporting on application milestones. We explicitly label limited samples and prohibit unfounded AI conclusions from small datasets.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid mb-6">
        <MetricCard
          title="Tracked Applications"
          value={insights.applications}
          subtext="Total records in workspace"
          icon={IconBriefcase}
          colorScheme="blue"
        />
        <MetricCard
          title="Interviews Reached"
          value={insights.interviews}
          subtext="Technical & behavioral rounds"
          icon={IconCalendar}
          colorScheme="emerald"
        />
        <MetricCard
          title="Assessments"
          value={insights.assessments || 0}
          subtext="Assessment stage records"
          icon={IconCheckCircle}
          colorScheme="indigo"
        />
        <MetricCard
          title="Known Rejections"
          value={insights.rejections}
          subtext="Formal rejection notices"
          icon={IconAlertCircle}
          colorScheme="purple"
        />
        <MetricCard
          title="Offers"
          value={insights.offers || 0}
          subtext="Recorded offer outcomes"
          icon={IconCheckCircle}
          colorScheme="emerald"
        />
        <MetricCard
          title="Pending / In Progress"
          value={insights.pending}
          subtext="Awaiting employer response"
          icon={IconClock}
          colorScheme="amber"
        />
      </div>

      {/* Data Sufficiency Alert Banner */}
      <div className={`card sufficiency-banner ${isSmallSample ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'} mb-6`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {isSmallSample ? (
              <IconAlertCircle size={20} className="text-amber-600" />
            ) : (
              <IconCheckCircle size={20} className="text-emerald-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900">
                Data Sufficiency Status: {insights.dataSufficiency || 'Very Limited Sample'}
              </h3>
              <Badge kind={isSmallSample ? 'warn' : 'ok'} size="sm">
                Tracked: {sampleSize} · Final outcomes: {insights.outcomeSampleSize ?? insights.terminalOutcomeCount ?? 0}
              </Badge>
            </div>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              {isSmallSample
                ? 'There is not enough data for a reliable pattern. Counts describe tracked records only; they do not establish why an employer made a decision.'
                : 'This is still an observational sample. It can show cautious pipeline patterns, but not prove what caused an employer outcome.'}
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Observation period: {insights.observationPeriod
                ? `${new Date(insights.observationPeriod.from).toLocaleDateString()} – ${new Date(insights.observationPeriod.to).toLocaleDateString()}`
                : 'No dated application records'}
              {insights.persistence ? ` · Source: ${insights.persistence === 'mongodb' ? 'Saved account records' : 'Temporary demo records'}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Outcome Distribution Bar */}
      <div className="card mb-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Pipeline Status Distribution
        </h3>
        <div className="distribution-bar-stacked">
          {interviewsPct > 0 && (
            <div
              className="dist-segment bg-emerald-500"
              style={{ width: `${interviewsPct}%` }}
              title={`Interviews: ${interviewsPct}%`}
            />
          )}
          {pendingPct > 0 && (
            <div
              className="dist-segment bg-blue-500"
              style={{ width: `${pendingPct}%` }}
              title={`Pending: ${pendingPct}%`}
            />
          )}
          {assessmentsPct > 0 && (
            <div className="dist-segment bg-indigo-500" style={{ width: `${assessmentsPct}%` }} title={`Assessments: ${assessmentsPct}%`} />
          )}
          {rejectionsPct > 0 && (
            <div
              className="dist-segment bg-slate-400"
              style={{ width: `${rejectionsPct}%` }}
              title={`Rejections: ${rejectionsPct}%`}
            />
          )}
          {offersPct > 0 && (
            <div className="dist-segment bg-emerald-700" style={{ width: `${offersPct}%` }} title={`Offers: ${offersPct}%`} />
          )}
        </div>
        <div className="flex items-center gap-6 mt-3 text-xs text-slate-600 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Interviews: {insights.interviews} ({interviewsPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Pending: {insights.pending} ({pendingPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
            Assessments: {insights.assessments || 0} ({assessmentsPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
            Rejections: {insights.rejections} ({rejectionsPct}%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 inline-block" />
            Offers: {insights.offers || 0} ({offersPct}%)
          </span>
        </div>
      </div>

      {/* Ground Truth vs Unsupported Conclusions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* What the data knows */}
        <div className="card border-emerald-200">
          <div className="flex items-center gap-2 mb-3">
            <IconCheckCircle size={18} className="text-emerald-600" />
            <h3 className="font-bold text-slate-900">What The Data Substantiates</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-700">
            {insights.knownFacts?.map((fact, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1 font-bold">•</span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* What cannot be concluded */}
        <div className="card border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <IconShieldCheck size={18} className="text-amber-600" />
            <h3 className="font-bold text-slate-900">Prohibited AI Assumptions</h3>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            The platform will never claim the following without validated statistical proof:
          </p>
          <ul className="space-y-2 text-sm text-slate-700">
            {insights.unsupportedConclusions?.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-600">
                <span className="text-red-500 mt-0.5 font-bold">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Suggested next step */}
      <div className="card mt-6 bg-slate-50 border-slate-200">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Grounded Next Step
        </h4>
        <p className="text-sm font-semibold text-slate-900 mt-1">
          {insights.recommendedNextStep || 'Continue tracking applications and collect feedback.'}
        </p>
      </div>
    </div>
  );
}
