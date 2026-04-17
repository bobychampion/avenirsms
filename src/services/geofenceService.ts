/**
 * Geo-fence service — Haversine distance, boundary checks, anti-spoof heuristics.
 * All calculations are done in the browser; no external API required.
 */

import { GeoFence } from '../types';

const EARTH_RADIUS_M = 6_371_000; // metres

/** Convert degrees to radians */
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Haversine great-circle distance between two lat/lng coordinates.
 * Returns distance in metres.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Returns true if (lat, lng) is within the stored geo-fence. */
export function isWithinFence(lat: number, lng: number, fence: GeoFence): boolean {
  const dist = haversineDistance(lat, lng, fence.lat, fence.lng);
  return dist <= fence.radius;
}

// ── GPS Accuracy Thresholds ───────────────────────────────────────────────────

/** Maximum acceptable GPS accuracy (metres). Readings worse than this are rejected. */
export const MAX_ACCEPTABLE_ACCURACY_M = 150;

/** Above this radius the GPS reading is too imprecise to be trusted for check-in. */
export function isAccuracyAcceptable(accuracy: number): boolean {
  return accuracy <= MAX_ACCEPTABLE_ACCURACY_M;
}

// ── Velocity / Spoof Check ────────────────────────────────────────────────────

/**
 * Maximum plausible speed for a person on foot or in a car (m/s).
 * ~200 km/h = 55 m/s. If calculated speed between two check-ins exceeds this,
 * flag as a potential spoofed / VPN-hopped location.
 */
const MAX_PLAUSIBLE_SPEED_MS = 55;

export interface PreviousCheckIn {
  lat: number;
  lng: number;
  timestamp: number; // Unix ms
}

/**
 * Returns true if the movement between two GPS readings is physically impossible
 * (speed > MAX_PLAUSIBLE_SPEED_MS).  Pass null for `previous` on first check-in.
 */
export function isSpoofedVelocity(
  current: { lat: number; lng: number; timestamp: number },
  previous: PreviousCheckIn | null,
): boolean {
  if (!previous) return false;
  const dtMs = current.timestamp - previous.timestamp;
  if (dtMs <= 0) return true; // clock went backwards — suspicious
  const distM = haversineDistance(current.lat, current.lng, previous.lat, previous.lng);
  const speedMs = distM / (dtMs / 1000);
  return speedMs > MAX_PLAUSIBLE_SPEED_MS;
}

// ── Geolocation Promise Wrapper ───────────────────────────────────────────────

export interface GpsResult {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface GpsError {
  code: number;
  message: string;
}

/**
 * Wraps `navigator.geolocation.getCurrentPosition` in a promise.
 * Throws `GpsError` on failure.
 */
export function getCurrentPosition(timeoutMs = 15_000): Promise<GpsResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: -1, message: 'Geolocation is not supported by this browser.' } as GpsError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }),
      err => reject({ code: err.code, message: geolocationErrorMessage(err.code) } as GpsError),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: return 'Location permission denied. Please enable location access in your browser settings.';
    case 2: return 'Your device could not determine its location. Try again in an open area.';
    case 3: return 'Location request timed out. Move to an area with better GPS signal and retry.';
    default: return 'An unknown location error occurred.';
  }
}
