import React, { useState, useEffect } from 'react';
import { getWeeklyPlan } from '../services/api';
import { format, addDays, startOfWeek } from 'date-fns';

const WeeklyPlan = ({ profileId = 'default' }) => {
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
      const data = await getWeeklyPlan(profileId, weekStartStr);
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
      easy_aerobic: 'bg-green-100 text-green-700',
      moderate_aerobic: 'bg-blue-100 text-blue-700',
      tempo: 'bg-orange-100 text-orange-700',
      threshold: 'bg-red-100 text-red-700',
      hiit: 'bg-purple-100 text-purple-700',
    };
    return colors[intensity] || 'bg-gray-100 text-gray-700';
  };

  const getSportEmoji = (sport) => {
    const emojis = {
      run: '🏃',
      bike: '🚴',
      swim: '🏊',
      walk: '🚶',
      yoga: '🧘',
      strength: '💪',
      rest: '😴',
    };
    return emojis[sport] || '🏃';
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

  if (!weeklyData?.plan) {
    return (
      <div className="text-center py-8 text-gray-500">
        No weekly plan available
      </div>
    );
  }

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
          {weeklyData.training_load_summary && (
            <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-600">
              <span>Weekly Load: <strong>{weeklyData.training_load_summary.total_volume_min}min</strong></span>
              <span>•</span>
              <span>Intensity Score: <strong>{weeklyData.training_load_summary.intensity_score}</strong></span>
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

      {/* Weekly Overview */}
      {weeklyData.week_pattern && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Weekly Strategy</h3>
          <p className="text-blue-800 text-sm">{weeklyData.week_pattern}</p>
        </div>
      )}

      {/* Days Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(weeklyData.plan).map(([day, workout]) => {
          const dayDate = addDays(currentWeekStart, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(day));
          const isToday = format(dayDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

          return (
            <div
              key={day}
              className={`bg-white rounded-lg border-2 p-5 transition-all ${
                isToday ? 'border-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-800 capitalize">
                    {day}
                    {isToday && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">Today</span>}
                  </h3>
                  <p className="text-sm text-gray-500">{format(dayDate, 'MMM d')}</p>
                </div>
                <span className="text-3xl">{getSportEmoji(workout.sport)}</span>
              </div>

              {/* Workout Details */}
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-3 ${getIntensityColor(workout.intensity)}`}>
                {workout.intensity.replace(/_/g, ' ').toUpperCase()}
              </div>

              <h4 className="font-semibold text-gray-800 mb-2">{workout.title}</h4>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{workout.duration_min} minutes</span>
                </div>

                {workout.target_zones && workout.target_zones.length > 0 && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span>{workout.target_zones.join(', ')}</span>
                  </div>
                )}

                {workout.location && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="capitalize">{workout.location}</span>
                  </div>
                )}
              </div>

              {/* Key Focus */}
              {workout.key_focus && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-600 italic">{workout.key_focus}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coach Notes */}
      {weeklyData.coach_notes && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Coach's Notes
          </h3>
          <p className="text-yellow-800 text-sm">{weeklyData.coach_notes}</p>
        </div>
      )}
    </div>
  );
};

export default WeeklyPlan;
