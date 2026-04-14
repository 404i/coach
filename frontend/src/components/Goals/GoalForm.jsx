import React, { useState } from 'react';
import { createGoal } from '../../services/api';

/**
 * GoalForm
 * 
 * Two-step flow:
 *  1. User types free text → submits → backend parses and returns preview
 *  2. User reviews interpreted goal (title, type, KPIs, assumptions, draft blocks) → confirms
 */
export default function GoalForm({ email, onCreated }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePreview = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      setLoading(true);
      setError(null);
      const data = await createGoal(email, text.trim(), false);
      setPreview(data.parsed);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await createGoal(email, text.trim(), true);
      setPreview(null);
      setText('');
      onCreated?.(data.goal);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setPreview(null);
    setError(null);
  };

  const goalTypeColors = {
    performance: 'bg-blue-100 text-blue-700',
    consistency: 'bg-green-100 text-green-700',
    health: 'bg-teal-100 text-teal-700',
    skill: 'bg-purple-100 text-purple-700',
    event: 'bg-orange-100 text-orange-700',
  };

  if (preview) {
    const confidence = Math.round((preview.confidence || 0) * 100);
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-base font-semibold text-gray-800">Review interpreted goal</h3>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${goalTypeColors[preview.goal_type] || 'bg-gray-100 text-gray-600'}`}>
              {preview.goal_type}
            </span>
            <p className="font-medium text-gray-900">{preview.title}</p>
          </div>

          {preview.interpreted_intent && (
            <p className="text-sm text-gray-600 italic">{preview.interpreted_intent}</p>
          )}

          {preview.target_date && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Target date:</span> {preview.target_date}
            </p>
          )}
          {preview.target_metric && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Target:</span>{' '}
              {preview.target_metric.value} {preview.target_metric.unit}
              <span className="text-gray-400 ml-1">({preview.target_metric.name})</span>
            </p>
          )}
        </div>

        {preview.weekly_kpis?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Weekly KPIs</p>
            <ul className="space-y-1">
              {preview.weekly_kpis.map((k, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-center gap-1.5">
                  <span className="text-green-500">✓</span> {k.kpi}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.assumptions?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assumptions</p>
            <ul className="space-y-1">
              {preview.assumptions.map((a, i) => (
                <li key={i} className="text-sm text-gray-500 flex items-center gap-1.5">
                  <span className="text-amber-400">•</span> {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview.sub_goals?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Planned training blocks ({preview.sub_goals.length})
            </p>
            <div className="flex gap-2 flex-wrap">
              {preview.sub_goals.map((b, i) => (
                <span key={i} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  Block {i + 1}: {b.title} ({b.duration_weeks}w)
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100">
            <div
              className={`h-1.5 rounded-full ${confidence >= 80 ? 'bg-green-500' : confidence >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{confidence}% confidence</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? 'Saving…' : 'Confirm & Save Goal'}
          </button>
          <button
            onClick={handleEdit}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handlePreview} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="text-base font-semibold text-gray-800">Add a training goal</h3>
      <p className="text-sm text-gray-500">
        Describe your goal in plain language — the system will interpret it and create measurable weekly targets.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "Build MTB endurance for summer while keeping training fun, avoid overreaching, and add 2 short core sessions/week."'
        rows={3}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? 'Parsing…' : 'Preview Goal →'}
      </button>
    </form>
  );
}
