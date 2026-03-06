import React, { useState } from 'react';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import Dashboard from './components/Dashboard';
import WeeklyPlan from './components/WeeklyPlan';
import Statistics from './components/Statistics';
import Onboarding from './components/Onboarding';
import ErrorBoundary from './components/ErrorBoundary';

function AppContent() {
  const [currentView, setCurrentView] = useState('daily');
  const { profile, loading, saveProfile, logout } = useProfile();

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Show onboarding if no profile
  if (!profile) {
    return (
      <Onboarding 
        onComplete={(newProfile) => {
          saveProfile(newProfile);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Garmin AI Coach</h1>
              <p className="text-sm text-gray-600">
                Welcome back, {profile.name || 'Athlete'}!
              </p>
            </div>
            
            {/* View Switcher */}
            <div className="flex items-center gap-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setCurrentView('daily')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'daily'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentView('weekly')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'weekly'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Weekly Plan
                </button>
                <button
                  onClick={() => setCurrentView('stats')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === 'stats'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Statistics
                </button>
              </div>

              {/* Profile Menu */}
              <button
                onClick={logout}
                className="text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <ErrorBoundary>
          {currentView === 'daily' && <Dashboard profileId={profile.profile_id} />}
          {currentView === 'weekly' && <WeeklyPlan profileId={profile.profile_id} />}
          {currentView === 'stats' && <Statistics profileId={profile.profile_id} email={profile.email} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

function App() {
  return (
    <ProfileProvider>
      <AppContent />
    </ProfileProvider>
  );
}

export default App;
