import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import WorkoutCard from './WorkoutCard';
import { getRecommendations, recordWorkout } from '../services/api';

const Dashboard = ({ profileId = 'default' }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecommendations(profileId, today);
      setRecommendations(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load recommendations');
      console.error('Error fetching recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (planName) => {
    setSelectedPlan(planName);
  };

  const handleConfirmWorkout = async () => {
    if (!selectedPlan || !recommendations) return;
    
    try {
      setSubmitting(true);
      const plan = recommendations.recommendation[selectedPlan];
      await recordWorkout(profileId, today, JSON.stringify(plan), false);
      alert('Workout plan saved! Good luck with your training! 💪');
    } catch (err) {
      alert('Failed to save workout: ' + (err.response?.data?.message || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl text-gray-600">Generating your personalized workouts...</p>
          <p className="text-sm text-gray-500 mt-2">Analyzing your Garmin data with AI</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Workouts</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchRecommendations}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!recommendations || !recommendations.recommendation) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-xl text-gray-600">No recommendations available</p>
        </div>
      </div>
    );
  }

  const rec = recommendations.recommendation;
  const plans = ['plan_a', 'plan_b', 'plan_c', 'plan_d'];

  return (
    <div>
      {/* Date and Refresh */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-lg text-gray-600">
            {format(new Date(recommendations.date), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <button
          onClick={fetchRecommendations}
          className="px-4 py-2 text-sm bg-white hover:bg-gray-50 text-gray-700 rounded-lg shadow border border-gray-200 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {/* AI Coaching Note */}
      {rec.coaching_note && (
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-lg">
          <div className="flex items-start">
            <div className="text-3xl mr-3">🤖</div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Coach's Note</h3>
              <p className="text-blue-800">{rec.coaching_note}</p>
            </div>
          </div>
        </div>
      )}

      {/* Workout Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {plans.map((planName) => {
          if (!rec[planName]) return null;
          return (
            <WorkoutCard
              key={planName}
              plan={rec[planName]}
              planName={planName}
              onSelect={handleSelectPlan}
              isSelected={selectedPlan === planName}
            />
          );
        })}
      </div>

      {/* Action Buttons */}
      {selectedPlan && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Selected: <span className="font-semibold">{selectedPlan.replace('plan_', 'Option ').toUpperCase()}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedPlan(null)}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWorkout}
                disabled={submitting}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Start This Workout 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Display (for debugging) */}
      {rec.context_summary && (
        <div className="mt-8 bg-gray-100 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Recovery Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {rec.context_summary.recent_hrv && (
              <div>
                <span className="text-gray-600">HRV (7d avg):</span>
                <div className="font-bold">{rec.context_summary.recent_hrv.toFixed(0)} ms</div>
              </div>
            )}
            {rec.context_summary.recent_rhr && (
              <div>
                <span className="text-gray-600">RHR (7d avg):</span>
                <div className="font-bold">{rec.context_summary.recent_rhr.toFixed(0)} bpm</div>
              </div>
            )}
            {rec.context_summary.sleep_quality && (
              <div>
                <span className="text-gray-600">Sleep:</span>
                <div className="font-bold">{rec.context_summary.sleep_quality}</div>
              </div>
            )}
            {rec.context_summary.training_load_trend && (
              <div>
                <span className="text-gray-600">Load Trend:</span>
                <div className="font-bold">{rec.context_summary.training_load_trend}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
