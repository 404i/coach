/**
 * Backend API client — thin wrapper around node-fetch.
 */
import fetch from 'node-fetch';

export const API_BASE_URL = process.env.COACH_API_URL || 'http://localhost:8088';

export async function callAPI(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return await response.json();
}
