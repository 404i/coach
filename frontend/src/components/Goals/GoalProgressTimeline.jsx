import React from 'react';

const STATUS_DOT = {
  on_track: 'bg-green-500',
  at_risk: 'bg-amber-400',
  off_track: 'bg-red-500',
};

/**
 * GoalProgressTimeline
 *
 * Sparkline-style timeline of a goal's weekly progress.
 * Each week is a dot colored by status, with the metric value shown on hover.
 */
export default function GoalProgressTimeline({ history = [], targetMetric }) {
  if (history.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic px-1">No progress data yet for this goal.</div>
    );
  }

  const hasValues = history.some(h => h.metric_value != null);

  return (
    <div className="space-y-2">
      {/* Status dot timeline */}
      <div className="flex items-end gap-1.5 flex-wrap">
        {history.map((h) => (
          <div key={h.id} className="group relative flex flex-col items-center gap-1">
            {/* Tooltip */}
            <div className="invisible group-hover:visible absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10">
              {h.week_start}
              {h.metric_value != null && (
                <span className="ml-1 text-gray-300">
                  {h.metric_value}{targetMetric?.unit ? ` ${targetMetric.unit}` : ''}
                </span>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full ${STATUS_DOT[h.status] || 'bg-gray-300'}`} />
            <span className="text-xs text-gray-400">{h.week_start?.slice(5)}</span>
          </div>
        ))}
      </div>

      {/* Simple value line chart (if metric values exist) */}
      {hasValues && (
        <div className="mt-1">
          <svg
            viewBox={`0 0 ${Math.max(history.length * 20, 80)} 40`}
            className="w-full h-10"
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              strokeWidth="1.5"
              stroke="#6366F1"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={buildPoints(history, targetMetric?.value)}
            />
            {targetMetric?.value != null && (
              <line
                x1="0" y1="5"
                x2={history.length * 20} y2="5"
                stroke="#E5E7EB"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}
          </svg>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-3 h-0.5 bg-indigo-500 inline-block" />
            <span className="text-xs text-gray-500">{targetMetric?.name || 'metric'}</span>
            {targetMetric?.value != null && (
              <>
                <span className="w-4 h-0 border-t border-dashed border-gray-300 inline-block" />
                <span className="text-xs text-gray-400">target: {targetMetric.value} {targetMetric.unit}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1" />On track</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 mr-1" />At risk</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 mr-1" />Off track</span>
      </div>
    </div>
  );
}

function buildPoints(history, targetValue) {
  const values = history.map(h => h.metric_value);
  const maxVal = Math.max(targetValue || 0, ...values.filter(v => v != null), 1);
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const W = 20;
  const H = 40;

  return history
    .map((h, i) => {
      if (h.metric_value == null) return null;
      const x = i * W + W / 2;
      const y = H - ((h.metric_value - minVal) / range) * (H - 8) - 4;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');
}
