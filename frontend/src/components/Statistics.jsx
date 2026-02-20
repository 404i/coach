import React, { useState, useEffect } from 'react';
import { getMetrics } from '../services/api';
import { format, subDays } from 'date-fns';
import GarminSync from './GarminSync';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

const Statistics = ({ profileId = 'default', email }) => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30); // days

  useEffect(() => {
    if (email || profileId) {
      fetchMetrics();
    }
  }, [timeRange, email, profileId]);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), timeRange), 'yyyy-MM-dd');
      const data = await getMetrics(email || profileId, startDate, endDate);
      setMetrics(data);
    } catch (err) {
      setError(err.message || 'Failed to load metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your training data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium mb-2">Failed to load statistics</p>
        <p className="text-red-500 text-sm mb-4">{error}</p>
        <button
          onClick={fetchMetrics}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!metrics?.data || metrics.data.length === 0) {
    return (
      <div className="space-y-6">
        <GarminSync profileId={profileId} onSyncComplete={fetchMetrics} />
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Training Data Yet</h3>
          <p className="text-gray-600">Use the sync button above to import your Garmin data.</p>
        </div>
      </div>
    );
  }

  // Process data for charts
  const chartData = metrics.data.map((day) => ({
    date: format(new Date(day.date || day.day), 'MMM d'),
    steps: day.steps || 0,
    hr: day.resting_hr || 0,
    hrv: day.hrv || 0,
    sleep: day.total_sleep ? Math.round(day.total_sleep / 60) : 0, // minutes to hours
    active: day.moderate_activity_time + day.vigorous_activity_time || 0,
  }));

  // Calculate summary stats
  const avgSteps = Math.round(chartData.reduce((sum, d) => sum + d.steps, 0) / chartData.length);
  const avgHR = Math.round(chartData.filter(d => d.hr > 0).reduce((sum, d) => sum + d.hr, 0) / chartData.filter(d => d.hr > 0).length);
  const avgHRV = Math.round(chartData.filter(d => d.hrv > 0).reduce((sum, d) => sum + d.hrv, 0) / chartData.filter(d => d.hrv > 0).length);
  const avgSleep = (chartData.reduce((sum, d) => sum + d.sleep, 0) / chartData.length).toFixed(1);
  const totalActive = chartData.reduce((sum, d) => sum + d.active, 0);

  return (
    <div className="space-y-6">
      {/* Garmin Sync Component */}
      <GarminSync profileId={profileId} onSyncComplete={fetchMetrics} />

      {/* Header with Time Range Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Training Statistics</h2>
          <p className="text-gray-600">Last {timeRange} days of activity</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                timeRange === days
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
          <div className="text-3xl mb-1">👟</div>
          <div className="text-2xl font-bold">{avgSteps.toLocaleString()}</div>
          <div className="text-xs opacity-90">Avg Daily Steps</div>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg p-4">
          <div className="text-3xl mb-1">❤️</div>
          <div className="text-2xl font-bold">{avgHR}</div>
          <div className="text-xs opacity-90">Avg Resting HR</div>
        </div>
        
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
          <div className="text-3xl mb-1">💓</div>
          <div className="text-2xl font-bold">{avgHRV}</div>
          <div className="text-xs opacity-90">Avg HRV (ms)</div>
        </div>
        
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4">
          <div className="text-3xl mb-1">😴</div>
          <div className="text-2xl font-bold">{avgSleep}</div>
          <div className="text-xs opacity-90">Avg Sleep (hrs)</div>
        </div>
        
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4">
          <div className="text-3xl mb-1">🔥</div>
          <div className="text-2xl font-bold">{Math.round(totalActive / 60)}</div>
          <div className="text-xs opacity-90">Total Active (hrs)</div>
        </div>
      </div>

      {/* Daily Steps Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Daily Steps</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="steps" stroke="#3b82f6" fill="#93c5fd" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Heart Rate & HRV */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Resting Heart Rate</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={['dataMin - 5', 'dataMax + 5']} />
              <Tooltip />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Heart Rate Variability</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="hrv" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sleep & Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Sleep Duration (hours)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="sleep" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Active Minutes</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="active" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recovery Insights */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span>🎯</span> Recovery Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-600 mb-1">HRV Trend</p>
            <p className="font-semibold text-gray-800">
              {chartData[chartData.length - 1].hrv > chartData[0].hrv ? '📈 Improving' : '📉 Declining'}
            </p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Resting HR Trend</p>
            <p className="font-semibold text-gray-800">
              {chartData[chartData.length - 1].hr < chartData[0].hr ? '📉 Improving' : '📈 Rising'}
            </p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">Sleep Consistency</p>
            <p className="font-semibold text-gray-800">
              {Math.abs(chartData[chartData.length - 1].sleep - avgSleep) < 1 ? '✅ Consistent' : '⚠️ Variable'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
