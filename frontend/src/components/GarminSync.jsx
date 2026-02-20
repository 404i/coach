import React, { useState } from 'react';
import { syncGarmin } from '../services/api';
import { format, subDays } from 'date-fns';

const GarminSync = ({ profileId = 'default', onSyncComplete }) => {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setResult(null);
    
    try {
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      
      const data = await syncGarmin(profileId, startDate, endDate);
      setResult(data);
      
      if (onSyncComplete) {
        onSyncComplete(data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Sync failed');
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Garmin Data Sync</h3>
          <p className="text-sm text-gray-600">Sync your latest Garmin data (last 7 days)</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
            syncing
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-medium text-red-800">Sync Failed</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <div className="flex-1">
              <p className="font-medium text-green-800 mb-2">Sync Complete!</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {result.activities_imported && (
                  <div>
                    <span className="text-green-600">Activities:</span>
                    <span className="font-semibold text-green-800 ml-2">{result.activities_imported}</span>
                  </div>
                )}
                {result.metrics_imported && (
                  <div>
                    <span className="text-green-600">Metrics:</span>
                    <span className="font-semibold text-green-800 ml-2">{result.metrics_imported}</span>
                  </div>
                )}
                {result.message && (
                  <div className="col-span-2 text-green-700 mt-2">
                    {result.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Auto-sync runs daily at 6:00 AM</span>
        </div>
      </div>
    </div>
  );
};

export default GarminSync;
