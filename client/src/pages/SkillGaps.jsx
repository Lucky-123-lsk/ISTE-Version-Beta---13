import React from 'react';
import Badge from '../components/Badge';
import {
  IconTarget,
  IconSparkles,
  IconCheckCircle,
  IconArrowRight,
  IconBookOpen,
  IconBriefcase
} from '../components/Icons';

export default function SkillGaps({ profile, jobs = [], saved = [], onSelectJob }) {
  const verifiedSkills = (profile?.existingSkills || [])
    .filter(s => s.confidence === 'verified')
    .map(s => s.name.toLowerCase());

  const selfDeclaredSkills = (profile?.existingSkills || [])
    .filter(s => s.confidence === 'self-declared')
    .map(s => s.name.toLowerCase());

  const learningGoals = (profile?.learningGoals || []).map(g => g.toLowerCase());

  // Aggregate missing skills across all jobs or saved jobs
  const skillFrequency = {};
  const relevantJobs = saved.length > 0 ? jobs.filter(j => saved.includes(j.id)) : jobs;

  relevantJobs.forEach(job => {
    (job.skills || []).forEach(skill => {
      const lower = skill.toLowerCase();
      if (!verifiedSkills.includes(lower) && !selfDeclaredSkills.includes(lower)) {
        if (!skillFrequency[skill]) {
          skillFrequency[skill] = { name: skill, count: 0, jobs: [] };
        }
        skillFrequency[skill].count += 1;
        skillFrequency[skill].jobs.push(job);
      }
    });
  });

  const prioritizedGaps = Object.values(skillFrequency)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Suggested roadmap generator for top gaps
  const getLearningAction = skillName => {
    const s = skillName.toLowerCase();
    if (s.includes('python')) {
      return 'Build an async FastAPI service integrating external REST APIs and SQLite persistence.';
    }
    if (s.includes('docker') || s.includes('linux')) {
      return 'Containerize a local fullstack app with a Dockerfile and test multi-stage builds.';
    }
    if (s.includes('typescript')) {
      return 'Migrate 3 React components to strict TypeScript interfaces with discriminated unions.';
    }
    if (s.includes('rest') || s.includes('api')) {
      return 'Implement an authenticated JWT client with request retries and exponential backoff.';
    }
    if (s.includes('flutter') || s.includes('dart')) {
      return 'Construct an offline-first mobile view with Riverpod state management and SQLite.';
    }
    return `Complete a demonstrable mini-project applying ${skillName} in an end-to-end repository.`;
  };

  return (
    <div className="skillgaps-page animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Skill Gap Analysis & Roadmap</h1>
          <p className="page-subtitle">
            Strategic breakdown of high-impact skills demanded by your target and bookmarked opportunities. Close gaps through demonstrable projects rather than generic resumes.
          </p>
        </div>
      </div>

      {/* Top Gap Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {prioritizedGaps.slice(0, 3).map((gap, idx) => {
          const isGoal = learningGoals.includes(gap.name.toLowerCase());
          return (
            <div key={gap.name} className="card hover-lift border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Priority #{idx + 1}
                </span>
                <Badge kind={isGoal ? 'ok' : 'warn'} size="sm">
                  {isGoal ? 'In Learning Goals' : 'Unscheduled Gap'}
                </Badge>
              </div>

              <h3 className="text-lg font-bold text-slate-900">{gap.name}</h3>
              <p className="text-xs text-slate-600 mt-1">
                Requested in <strong>{gap.count}</strong> of your current target roles (
                {Math.round((gap.count / (relevantJobs.length || 1)) * 100)}% coverage).
              </p>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700 block mb-1">
                  Suggested Action:
                </span>
                <p className="text-xs text-slate-600 italic leading-relaxed">
                  "{getLearningAction(gap.name)}"
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Skill Demand Table */}
      <div className="card">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Market Gap Demand in Your Target Opportunities
        </h3>
        <table className="modern-table">
          <thead>
            <tr>
              <th>Skill / Technology</th>
              <th>Status in Profile</th>
              <th>Demand in Targets</th>
              <th>Target Roles Requiring It</th>
              <th>Recommended Learning Project</th>
            </tr>
          </thead>
          <tbody>
            {prioritizedGaps.map(gap => {
              const isGoal = learningGoals.includes(gap.name.toLowerCase());
              return (
                <tr key={gap.name} className="hover:bg-slate-50">
                  <td className="font-semibold text-slate-900">{gap.name}</td>
                  <td>
                    <Badge kind={isGoal ? 'ok' : 'neutral'} size="sm">
                      {isGoal ? 'Active Goal' : 'Not Registered'}
                    </Badge>
                  </td>
                  <td>
                    <span className="font-bold text-slate-800">{gap.count} roles</span>
                  </td>
                  <td>
                    <div className="text-xs text-slate-600">
                      {gap.jobs.slice(0, 2).map(j => j.title).join(', ')}
                      {gap.jobs.length > 2 && ` +${gap.jobs.length - 2} more`}
                    </div>
                  </td>
                  <td className="text-xs text-slate-700 max-w-xs">
                    {getLearningAction(gap.name)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!prioritizedGaps.length && (
          <div className="empty-state-panel py-8">
            <p className="text-slate-500">All key skills in your target roles are verified in your profile!</p>
          </div>
        )}
      </div>
    </div>
  );
}

