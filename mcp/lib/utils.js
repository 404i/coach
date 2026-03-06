/**
 * Miscellaneous utilities — profile lookup, geo parsing.
 */
import { callAPI } from './api.js';

/** Resolve email → profile_id via the backend. */
export async function getProfileId(email) {
  const data = await callAPI(`/api/profile?email=${encodeURIComponent(email)}`);
  if (!data.profile || !data.profile.profile_id) {
    throw new Error(`Profile not found for email: ${email}`);
  }
  return data.profile.profile_id;
}

/** Parse a location string to {lat, lon} coordinates. */
export function parseLocationToCoords(location) {
  if (location.includes(',')) {
    const [lat, lon] = location.split(',').map(s => parseFloat(s.trim()));
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }
  const locations = {
    sofia:      { lat: 42.6977, lon: 23.3219 },
    london:     { lat: 51.5074, lon: -0.1278 },
    'new york': { lat: 40.7128, lon: -74.0060 },
    paris:      { lat: 48.8566, lon: 2.3522 },
    berlin:     { lat: 52.5200, lon: 13.4050 },
    tokyo:      { lat: 35.6762, lon: 139.6503 },
    sydney:     { lat: -33.8688, lon: 151.2093 },
    default:    { lat: 42.6977, lon: 23.3219 },
  };
  return locations[location.toLowerCase().trim()] || locations.default;
}
