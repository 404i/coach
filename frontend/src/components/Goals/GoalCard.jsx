import React from 'react';

const STATUS_CONFIG = {
  on_track: {
    icon: '✅',
    label: 'On track',
    badge: 'bg-green-100 text-green-700 border-green-200',
    bar: 'bg-green-500',
  },
  at_risk: {
    icon: '⚠️',
    label: 'At risk',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-400',
  },
  off_track: {
    icon: '❌',
    label: 'Off track',
    badge: 'bg-red-100 text-red-700 border-red-200',
    bar: 'bg-red-500',
  },
};

const GOAL_TYPE_COLORS = {
  performance: 'text-blue-600 bg-blue-50',
  consistency: 'text-green-600 bg-green-50',
  health: 'text-teal-600 bg-teal-50',
  skill: 'text-purple-600 bg-purple-50',
  event: 'text-orange-600 bg-orange-50',
};

/**
 * GoalCard
 *
 * Displays a single smart goal with:
 *  - Status badge (on_track / at_risk / off_track)
 *  - Progress bar toward target_metric
 *  - Weekly KPIs
 *  - Active block sub-goal
 *  - Draft blocks pending review
 *  - Coaching narrative from latest progress
 */
export default function GoalCard({ goal, onDelete }) {
  if (!goal) return null;

  const progress = goal.latest_progress;
  const statusCfg = progress ? STATUS_CONFIG[progress.status] : null;
  const typeColor = GOAL_TYPE_COLORS[goal.goal_type] || 'text-gray-600 bg-gray-50';

  // Progress toward target_metric (0-100%)
  let progressPct = null;
  if (goal.target_metric && goal.current_value != null) {
    progressPct = Math.min(100, Math.round((goal.current_value / goal.target_metric.value) * 100));
  }

  const activeBlock = goal.sub_goals?.find(b => b.status === 'active');
  const draftBlocks = goal.sub_goals?.filter(b => b.status === 'draft') || [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor}`}>
              {goal.goal_type}
            </span>
            {statusCfg && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.badge}`}>
                {statusCfg.icon} {statusCfg.label}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-gray-900 leading-snug">{goal.title}</h3>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(goal.id)}
            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 text-lg leading-none"
            title="Remove goal"
          >
            ×
          </button>
        )}
      </div>

      {/* Dates & metric */}
      {(goal.target_date || goal.target_metric) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {goal.target_date && (
            <span>
              🗓 <span className="font-medium">{goal.target_date}</span>
              {goal.weeks_remaining != null && (
                <span className="text-gray-400 ml-1">({goal.weeks_remaining} weeks left)</span>
              )}
            </span>
          )}
          {goal.target_metric && (
            <span>
              🎯 <span className="font-medium">{goal.target_metric.value} {goal.target_metric.unit}</span>
              {goal.current_value != null && (
                <span className="text-gray-400 ml-1">(now: {goal.current_value})</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {progressPct != null && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Progress toward target</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${statusCfg ? statusCfg.bar : 'bg-indigo-500'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Latest coaching narrative */}
      {progress?.narrative && (
        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 italic">
          {progress.narrative}
        </p>
      )}

      {/* Weekly KPIs */}
      {goal.weekly_kpis?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Weekly KPIs</p>
          <ul className="space-y-1">
            {goal.weekly_kpis.map((k, i) => {
              const kpiSnapshot = progress?.kpis_snapshot?.find(s => s.kpi === k.kpi);
              return (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                  {kpiSnapshot ? (
                    <span className={kpiSnapshot.achieved ? 'text-green-500' : 'text-red-400'}>
                      {kpiSnapshot.achieved ? '✓' : '✗'}
                    </span>
                  ) : (
                    <span className="text-gray-300">○</span>
                  )}
                  {k.kpi}
                  {kpiSnapshot?.value && (
                    <span className="text-xs text-gray-400">({kpiSnapshot.value})</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Active block */}
      {activeBlock && (
        <div className="bg-indigo-50 rounded-lg px-3 py-2 text-sm">
          <span className="font-medium text-indigo-700">Current block:</span>{' '}
          <span className="text-indigo-600">{activeBlock.title}</span>
          {activeBlock.target_date && (
            <span className="text-indigo-400 ml-1">until {activeBlock.target_date}</span>
          )}
        </div>
      )}

      {/* Draft blocks notice */}
      {draftBlocks.length > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
          {draftBlocks.length} training block{draftBlocks.length > 1 ? 's' : ''} pending your review
        </p>
      )}

      {/* Min effective alt if off-track */}
      {progress?.min_effective_alt && progress.status !== 'on_track' && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-amber-700">Suggested adjustment</p>
          <p className="text-sm font-medium text-amber-800">{progress.min_effective_alt.title}</p>
          {progress.min_effective_alt.sessions?.map((s, i) => (
            <p key={i} className="text-sm text-amber-700">• {s}</p>
          ))}
        </div>
      )}
    </div>
  );
}
