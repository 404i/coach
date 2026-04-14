import React, { useState, useEffect, useCallback } from 'react';
import { format, startOfWeek } from 'date-fns';
import GoalForm from './GoalForm';
import GoalCard from './GoalCard';
import WeeklyGoalReview from './WeeklyGoalReview';
import GoalProgressTimeline from './GoalProgressTimeline';
import { getGoals, deleteGoal, getGoalProgress, getWeeklyGoalReview } from '../../services/api';

/**
 * Goals
 *
 * Main Goals page — composes GoalForm, GoalCard, WeeklyGoalReview, GoalProgressTimeline.
 * Provides tabbed navigation: Active Goals / Weekly Review / Timeline.
 */
export default function Goals({ email }) {
  const [goals, setGoals] = useState([]);
  const [review, setReview] = useState([]);
  const [progressMap, setProgressMap] = useState({}); // goalId → history[]
  const [tab, setTab] = useState('goals');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const fetchGoals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getGoals(email, true);
      setGoals(data.goals || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  const fetchReview = useCallback(async () => {
    try {
      const data = await getWeeklyGoalReview(email, weekStart);
      setReview(data.review || []);
    } catch (err) {
      console.warn('Could not load goal review:', err.message);
    }
  }, [email, weekStart]);

  useEffect(() => {
    fetchGoals();
    fetchReview();
  }, [fetchGoals, fetchReview]);

  const handleGoalCreated = (newGoal) => {
    setShowForm(false);
    fetchGoals();
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm('Remove this goal?')) return;
    try {
      await deleteGoal(goalId, email);
      setGoals(prev => prev.filter(g => g.id !== goalId));
    } catch (err) {
      alert('Failed to remove goal: ' + err.message);
    }
  };

  const handleShowTimeline = async (goalId) => {
    if (progressMap[goalId]) {
      setTab(`timeline-${goalId}`);
      return;
    }
    try {
      const data = await getGoalProgress(goalId, email);
      setProgressMap(prev => ({ ...prev, [goalId]: data.progress_history || [] }));
      setTab(`timeline-${goalId}`);
    } catch (err) {
      console.warn('Could not load progress history:', err.message);
    }
  };

  const activeGoalCount = goals.filter(g => g.status === 'active').length;
  const atRiskCount = goals.filter(g =>
    g.latest_progress?.status === 'at_risk' || g.latest_progress?.status === 'off_track'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Training Goals</h2>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {activeGoalCount} active goal{activeGoalCount !== 1 ? 's' : ''}
              {atRiskCount > 0 && (
                <span className="ml-2 text-amber-600 font-medium">· {atRiskCount} need attention</span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? '✕ Cancel' : '+ Add Goal'}
        </button>
      </div>

      {/* Goal form */}
      {showForm && (
        <GoalForm email={email} onCreated={handleGoalCreated} />
      )}

      {/* Tab navigation */}
      <div className="flex bg-gray-100 rounded-lg p-1 w-fit gap-1">
        <button
          onClick={() => setTab('goals')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'goals' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Active Goals
        </button>
        <button
          onClick={() => { setTab('review'); fetchReview(); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'review' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Weekly Review
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Active Goals tab */}
      {tab === 'goals' && !loading && (
        <>
          {goals.length === 0 && !showForm ? (
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-10 text-center">
              <p className="text-gray-400 text-sm mb-3">No training goals yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="text-indigo-600 text-sm font-medium hover:underline"
              >
                Add your first goal →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {goals.map(goal => (
                <div key={goal.id} className="space-y-1">
                  <GoalCard
                    goal={goal}
                    onDelete={handleDeleteGoal}
                  />
                  <button
                    onClick={() => handleShowTimeline(goal.id)}
                    className="text-xs text-indigo-500 hover:text-indigo-700 pl-1 transition-colors"
                  >
                    View progress timeline →
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Weekly Review tab */}
      {tab === 'review' && !loading && (
        <WeeklyGoalReview review={review} weekStart={weekStart} />
      )}

      {/* Timeline tab (per-goal) */}
      {tab.startsWith('timeline-') && (() => {
        const goalId = parseInt(tab.replace('timeline-', ''));
        const goal = goals.find(g => g.id === goalId);
        const history = progressMap[goalId] || [];
        return (
          <div className="space-y-3">
            <button
              onClick={() => setTab('goals')}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Back to goals
            </button>
            {goal && (
              <div>
                <p className="text-base font-semibold text-gray-900 mb-1">{goal.title}</p>
                <p className="text-xs text-gray-400 mb-3">Progress over time</p>
                <GoalProgressTimeline
                  history={history}
                  targetMetric={goal.target_metric}
                />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
