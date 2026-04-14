import React, { useState, useEffect } from 'react';
import { getWeeklyPlan } from '../services/api';
import { format, addDays, startOfWeek } from 'date-fns';

const WeeklyPlan = ({ email }) => {
  const [weeklyData, setWeeklyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );

  useEffect(() => {
    fetchWeeklyPlan();
  }, [currentWeekStart]);

  const fetchWeeklyPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
      const data = await getWeeklyPlan(email, weekStartStr);
      setWeeklyData(data);
    } catch (err) {
      setError(err.message || 'Failed to load weekly plan');
      console.error('Error fetching weekly plan:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (direction) => {
    setCurrentWeekStart((prev) => addDays(prev, direction * 7));
  };

  const getIntensityColor = (intensity) => {
    const colors = {
      rest: 'bg-gray-100 text-gray-700',
      recovery: 'bg-gray-200 text-gray-700',
      easy: 'bg-green-100 text-green-700',
      moderate: 'bg-blue-100 text-blue-700',
      hard: 'bg-red-100 text-red-700',
    };
    return colors[intensity] || 'bg-gray-100 text-gray-700';
  };

  const getIntensityEmoji = (intensity) => {
    const emojis = {
      rest: '😴',
      recovery: '🧘',
      easy: '🚶',
      moderate: '🏃',
      hard: '🔥',
    };
    return emojis[intensity] || '🏃';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your weekly plan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium mb-2">Failed to load weekly plan</p>
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button
          onClick={fetchWeeklyPlan}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!weeklyData?.daily_workouts) {
    return (
      <div className="text-center py-8 text-gray-500">
        No weekly plan available
      </div>
    );
  }

  const { current_state, weekly_targets, daily_workouts, data_warnings, coaching_notes } = weeklyData;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigateWeek(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">
            Week of {format(currentWeekStart, 'MMM d, yyyy')}
          </h2>
          {weekly_targets && (
            <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-600">
              <span>Plan: <strong className="capitalize">{weeklyData.plan_type?.replace('_', ' ')}</strong></span>
              <span>•</span>
              <span>Hard: <strong>{weekly_targets.hard_days}d</strong></span>
              <span>Mod: <strong>{weekly_targets.moderate_days}d</strong></span>
              <span>Easy: <strong>{weekly_targets.easy_days}d</strong></span>
              <span>Rest: <strong>{weekly_targets.rest_days}d</strong></span>
            </div>
          )}
          {current_state && (
            <div className="flex items-center justify-center gap-3 mt-1 text-xs text-gray-500">
              <span>Readiness: <strong>{current_state.readiness_score}</strong></span>
              <span>•</span>
              <span>Capacity: <strong className="capitalize">{current_state.capacity?.replace('_', ' ')}</strong></span>
              <span>•</span>
              <span>Form: <strong className="capitalize">{current_state.fatigue_level}</strong></span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigateWeek(1)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Data Warnings */}
      {data_warnings && data_warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-amber-900 mb-1">⚠️ Data Warning</h3>
          {data_warnings.map((warning, i) => (
            <p key={i} className="text-amber-800 text-sm">{warning}</p>
          ))}
        </div>
      )}

      {/* Days Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {daily_workouts.map((workout) => {
          const workoutDate = new Date(workout.date + 'T00:00:00');
          const isToday = format(workoutDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

          return (
            <div
              key={workout.date}
              className={`bg-white rounded-lg border-2 p-5 transition-all ${
                isToday ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-800">
                    {workout.day_of_week}
                    {isToday && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">Today</span>}
                  </h3>
                  <p className="text-sm text-gray-500">{format(workoutDate, 'MMM d')}</p>
                </div>
                <span className="text-3xl">{getIntensityEmoji(workout.intensity)}</span>
              </div>

              {/* Intensity Badge */}
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 ${getIntensityColor(workout.intensity)}`}>
                {workout.description || workout.intensity.toUpperCase()}
              </div>

              {/* Duration & Load */}
              <div className="space-y-2 text-sm text-gray-600">
                {workout.duration_minutes > 0 && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{workout.duration_minutes} minutes</span>
                  </div>
                )}

                {workout.training_load > 0 && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span>Load: {workout.training_load}</span>
                  </div>
                )}
              </div>

              {/* Activity Options */}
              {workout.activities && workout.activities.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-1">Options:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {workout.activities.slice(0, 3).map((activity, i) => (
                      <li key={i}>• {activity}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Focus */}
              {workout.focus && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-600 italic">{workout.focus}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coach Notes */}
      {coaching_notes && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Coach's Notes
          </h3>
          <p className="text-yellow-800 text-sm whitespace-pre-line">{coaching_notes}</p>
        </div>
      )}
    </div>
  );
};

export default WeeklyPlan;
