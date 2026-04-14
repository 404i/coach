import React from 'react';

const STATUS_CONFIG = {
  on_track: { icon: '✅', label: 'On track', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
  at_risk:  { icon: '⚠️', label: 'At risk',  bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' },
  off_track:{ icon: '❌', label: 'Off track', bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800'   },
};

/**
 * WeeklyGoalReview
 *
 * Per-goal weekly review panel showing:
 *  - on_track / at_risk / off_track status with icon
 *  - LLM plain-language coaching note
 *  - KPI snapshot (achieved / not achieved)
 *  - Minimum-effective-dose suggestion if off_track / at_risk
 */
export default function WeeklyGoalReview({ review = [], weekStart }) {
  if (review.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-8 text-center">
        <p className="text-gray-400 text-sm">No goals to review for this week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
        Week of {weekStart}
      </p>

      {review.map(({ goal, progress }) => {
        if (!goal) return null;
        const cfg = progress ? STATUS_CONFIG[progress.status] : null;

        return (
          <div
            key={goal.id}
            className={`rounded-xl border p-4 space-y-3 ${cfg ? `${cfg.bg} ${cfg.border}` : 'bg-white border-gray-200'}`}
          >
            {/* Title + status */}
            <div className="flex items-start gap-2">
              {cfg && <span className="text-lg flex-shrink-0">{cfg.icon}</span>}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-snug">{goal.title}</p>
                {cfg && (
                  <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{cfg.label}</p>
                )}
              </div>
            </div>

            {/* No progress yet */}
            {!progress && (
              <p className="text-sm text-gray-400 italic">No progress recorded yet for this week.</p>
            )}

            {/* Coaching narrative */}
            {progress?.narrative && (
              <p className="text-sm text-gray-700 leading-relaxed">{progress.narrative}</p>
            )}

            {/* KPI snapshot */}
            {progress?.kpis_snapshot?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">KPIs</p>
                <ul className="space-y-1">
                  {progress.kpis_snapshot.map((k, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className={k.achieved ? 'text-green-600' : 'text-red-400'}>
                        {k.achieved ? '✓' : '✗'}
                      </span>
                      <span className="text-gray-700">{k.kpi}</span>
                      {k.value && <span className="text-gray-400 text-xs">({k.value})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Min effective alt */}
            {progress?.min_effective_alt && progress.status !== 'on_track' && (
              <div className="bg-white rounded-lg border border-current/10 px-3 py-2 space-y-1">
                <p className="text-xs font-semibold text-gray-600">Suggested adjustment</p>
                <p className="text-sm font-medium text-gray-800">
                  {progress.min_effective_alt.title}
                </p>
                {progress.min_effective_alt.description && (
                  <p className="text-sm text-gray-600">{progress.min_effective_alt.description}</p>
                )}
                {progress.min_effective_alt.sessions?.map((s, i) => (
                  <p key={i} className="text-sm text-gray-700">• {s}</p>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
