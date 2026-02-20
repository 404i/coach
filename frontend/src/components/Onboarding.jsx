import React, { useState } from 'react';
import { createProfile } from '../services/api';

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    goals: [],
    motivations: [],
    constraints: [],
    favorite_sports: [],
    access: {
      equipment: [],
      facilities: [],
      days_per_week: 3,
      minutes_per_session: 45
    },
    injuries_conditions: [],
    baselines: {
      resting_hr_bpm_14d: null,
      hrv_ms_7d: null,
      lthr_bpm: null,
      max_hr_bpm: null,
      ftp_watts: null
    },
    preferences: {
      max_hard_days_per_week: 2,
      preferred_training_time: 'either',
      likes_variety: true
    },
    location: {
      label: '',
      latitude: null,
      longitude: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    garmin_email: '',
    garmin_password: ''
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  const toggleArrayItem = (field, item) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const addInjury = () => {
    setFormData(prev => ({
      ...prev,
      injuries_conditions: [
        ...prev.injuries_conditions,
        { name: '', status: 'active', severity_0_10: 5, contraindications: [] }
      ]
    }));
  };

  const updateInjury = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      injuries_conditions: prev.injuries_conditions.map((inj, i) =>
        i === index ? { ...inj, [field]: value } : inj
      )
    }));
  };

  const removeInjury = (index) => {
    setFormData(prev => ({
      ...prev,
      injuries_conditions: prev.injuries_conditions.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await createProfile(formData);
      // Pass the profile object from the API response
      onComplete(result.profile);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create profile');
      setLoading(false);
    }
  };

  const nextStep = () => setStep(s => Math.min(5, s + 1));
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  const canProceed = () => {
    if (step === 1) return formData.name && formData.email;
    if (step === 2) return formData.favorite_sports.length > 0;
    if (step === 3) return true;
    if (step === 4) return true;
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Step {step} of 5</span>
            <span className="text-sm text-gray-500">{step === 5 ? 'Almost there!' : 'Getting to know you'}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div 
              className="h-2 bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Welcome & Basic Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Garmin AI Coach! 🏃‍♀️</h1>
              <p className="text-gray-600">Let's create your personalized training plan. First, tell us about yourself.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">What's your name?</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="your.email@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">We'll use this to sync with your Garmin account</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location (optional)</label>
              <input
                type="text"
                value={formData.location.label}
                onChange={(e) => handleNestedChange('location', 'label', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="City, State"
              />
              <p className="text-xs text-gray-500 mt-1">For weather-based recommendations</p>
            </div>
          </div>
        )}

        {/* Step 2: Goals & Sports */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Training Goals & Interests</h2>
              <p className="text-gray-600">What sports do you love? What are you training for?</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Favorite Sports (select at least one)</label>
              <div className="grid grid-cols-2 gap-3">
                {['run', 'bike', 'swim', 'strength', 'yoga', 'hiit', 'walk'].map(sport => (
                  <button
                    key={sport}
                    onClick={() => toggleArrayItem('favorite_sports', sport)}
                    className={`px-4 py-3 rounded-lg font-medium transition-all ${
                      formData.favorite_sports.includes(sport)
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Training Goals (optional)</label>
              <textarea
                value={formData.goals.join('\n')}
                onChange={(e) => handleInputChange('goals', e.target.value.split('\n').filter(g => g.trim()))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-24"
                placeholder="e.g., Complete a half marathon&#10;Improve overall fitness&#10;Lose 10 pounds"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">What motivates you? (optional)</label>
              <textarea
                value={formData.motivations.join('\n')}
                onChange={(e) => handleInputChange('motivations', e.target.value.split('\n').filter(m => m.trim()))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-20"
                placeholder="e.g., Stress relief&#10;Health improvement&#10;Competition"
              />
            </div>
          </div>
        )}

        {/* Step 3: Schedule & Access */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Training Schedule</h2>
              <p className="text-gray-600">Help us plan realistic workouts that fit your life.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Days per week</label>
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={formData.access.days_per_week}
                  onChange={(e) => handleNestedChange('access', 'days_per_week', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Minutes per session</label>
                <input
                  type="number"
                  min="10"
                  max="240"
                  step="5"
                  value={formData.access.minutes_per_session}
                  onChange={(e) => handleNestedChange('access', 'minutes_per_session', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Preferred training time</label>
              <div className="grid grid-cols-3 gap-3">
                {['am', 'pm', 'either'].map(time => (
                  <button
                    key={time}
                    onClick={() => handleNestedChange('preferences', 'preferred_training_time', time)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.preferences.preferred_training_time === time
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {time.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Available Equipment</label>
              <textarea
                value={formData.access.equipment.join('\n')}
                onChange={(e) => handleNestedChange('access', 'equipment', e.target.value.split('\n').filter(eq => eq.trim()))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-20"
                placeholder="e.g., Bike trainer&#10;Treadmill&#10;Gym membership&#10;Running shoes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Any Constraints? (optional)</label>
              <textarea
                value={formData.constraints.join('\n')}
                onChange={(e) => handleInputChange('constraints', e.target.value.split('\n').filter(c => c.trim()))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-20"
                placeholder="e.g., No swimming pools nearby&#10;Can't train after 8pm&#10;Travel frequently"
              />
            </div>
          </div>
        )}

        {/* Step 4: Injuries & Baselines */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Health & Fitness Baselines</h2>
              <p className="text-gray-600">Help us train you safely and effectively.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Any injuries or conditions?</label>
              {formData.injuries_conditions.map((injury, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg mb-3">
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <input
                      type="text"
                      value={injury.name}
                      onChange={(e) => updateInjury(index, 'name', e.target.value)}
                      placeholder="Injury name (e.g., knee pain)"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={injury.status}
                      onChange={(e) => updateInjury(index, 'status', e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="managed">Managed</option>
                      <option value="historical">Historical</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Severity (0-10):</label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={injury.severity_0_10}
                      onChange={(e) => updateInjury(index, 'severity_0_10', parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-8">{injury.severity_0_10}</span>
                    <button
                      onClick={() => removeInjury(index)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={addInjury}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                + Add Injury/Condition
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Resting HR (bpm)</label>
                <input
                  type="number"
                  value={formData.baselines.resting_hr_bpm_14d || ''}
                  onChange={(e) => handleNestedChange('baselines', 'resting_hr_bpm_14d', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 55"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">HRV (ms)</label>
                <input
                  type="number"
                  value={formData.baselines.hrv_ms_7d || ''}
                  onChange={(e) => handleNestedChange('baselines', 'hrv_ms_7d', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 65"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max HR (bpm)</label>
                <input
                  type="number"
                  value={formData.baselines.max_hr_bpm || ''}
                  onChange={(e) => handleNestedChange('baselines', 'max_hr_bpm', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 185"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">FTP (watts)</label>
                <input
                  type="number"
                  value={formData.baselines.ftp_watts || ''}
                  onChange={(e) => handleNestedChange('baselines', 'ftp_watts', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., 250"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">Don't worry if you don't know these - we can calculate them from your Garmin data!</p>
          </div>
        )}

        {/* Step 5: Garmin Connection */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Garmin Account</h2>
              <p className="text-gray-600">We'll sync your activity history and daily metrics automatically.</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔒</span>
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Your data is secure</h3>
                  <p className="text-sm text-blue-700">
                    We use your Garmin credentials only to fetch your training data. 
                    We never store your password and use secure authentication.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Garmin Email</label>
              <input
                type="email"
                value={formData.garmin_email}
                onChange={(e) => handleInputChange('garmin_email', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="your-garmin-email@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Garmin Password</label>
              <input
                type="password"
                value={formData.garmin_password}
                onChange={(e) => handleInputChange('garmin_password', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Your Garmin Connect password"
              />
              <p className="text-xs text-gray-500 mt-1">This will be used once to authenticate, then securely stored</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">What we'll sync:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>✓ Daily heart rate variability (HRV)</li>
                <li>✓ Resting heart rate</li>
                <li>✓ Sleep quality and duration</li>
                <li>✓ Activity history (runs, rides, workouts)</li>
                <li>✓ Training load and stress scores</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={prevStep}
            disabled={step === 1}
            className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Back
          </button>

          {step < 5 ? (
            <button
              onClick={nextStep}
              disabled={!canProceed()}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !canProceed()}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? 'Creating Your Profile...' : 'Start Training! 🚀'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
