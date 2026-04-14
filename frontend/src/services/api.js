import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Health check
export const checkHealth = async () => {
  const response = await api.get('/health');
  return response.data;
};

// Get workout recommendations
export const getRecommendations = async (profileId, date) => {
  const response = await api.post('/api/recommend', {
    profile_id: profileId,
    date: date,
  });
  return response.data;
};

// Get weekly plan (stats-aware)
export const getWeeklyPlan = async (email, startDate) => {
  const response = await api.get('/api/workout/weekly-plan', {
    params: { email, start_date: startDate },
  });
  return response.data;
};

// Get metrics for date range
export const getMetrics = async (email, startDate, endDate) => {
  const response = await api.get('/api/garmin/metrics', {
    params: { email, start_date: startDate, end_date: endDate },
  });
  return response.data;
};

// Sync Garmin data
export const syncGarmin = async (email, startDate, endDate) => {
  const response = await api.post('/api/garmin/sync', {
    email,
    start_date: startDate,
    end_date: endDate,
  });
  return response.data;
};

// Record workout completion
export const recordWorkout = async (profileId, date, selectedPlan, completed) => {
  const response = await api.post('/api/workouts', {
    profile_id: profileId,
    date,
    selected_plan: selectedPlan,
    completed,
  });
  return response.data;
};

// Profile Management
export const createProfile = async (profileData) => {
  const response = await api.post('/api/profile', profileData);
  return response.data;
};

export const getProfile = async (email) => {
  const response = await api.get('/api/profile', {
    params: { email }
  });
  return response.data;
};

export const updateProfile = async (profileId, updates) => {
  const response = await api.put('/api/profile', {
    profile_id: profileId,
    ...updates
  });
  return response.data;
};

// ── Smart Goals ───────────────────────────────────────────────────────────

export const getGoals = async (email, includeDraft = false) => {
  const response = await api.get('/api/goals', {
    params: { email, include_draft: includeDraft }
  });
  return response.data;
};

export const createGoal = async (email, text, confirm = true) => {
  const response = await api.post('/api/goals', { email, text, confirm });
  return response.data;
};

export const updateGoal = async (goalId, email, updates) => {
  const response = await api.put(`/api/goals/${goalId}`, { email, ...updates });
  return response.data;
};

export const deleteGoal = async (goalId, email) => {
  const response = await api.delete(`/api/goals/${goalId}`, { params: { email } });
  return response.data;
};

export const getGoalProgress = async (goalId, email) => {
  const response = await api.get(`/api/goals/${goalId}/progress`, { params: { email } });
  return response.data;
};

export const adaptGoal = async (goalId, email, disruptions, remainingDays = [], recoverySignals = {}) => {
  const response = await api.post(`/api/goals/${goalId}/adapt`, {
    email,
    disruptions,
    remaining_days: remainingDays,
    recovery_signals: recoverySignals
  });
  return response.data;
};

export const getWeeklyGoalReview = async (email, weekStart) => {
  const response = await api.get('/api/goals/weekly-review', {
    params: { email, week_start: weekStart }
  });
  return response.data;
};

export default api;
