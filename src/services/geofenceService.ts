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
 *
 * Strategy:
 *  1. Try high-accuracy with a 30 s timeout and allow a 60 s cached fix
 *     (avoids forcing a fresh GPS acquisition on every tap, which times out
 *     on laptops / devices that rely on Wi-Fi positioning).
 *  2. If that times out (error code 3), automatically retry with
 *     enableHighAccuracy: false — this uses the fast Wi-Fi / IP fallback and
 *     almost never times out, at the cost of slightly lower accuracy (~100 m),
 *     which is still well within the 150 m acceptance threshold.
 */
export function getCurrentPosition(): Promise<GpsResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: -1, message: 'Geolocation is not supported by this browser.' } as GpsError);
      return;
    }

    const toResult = (pos: GeolocationPosition): GpsResult => ({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    });

    // First attempt: high accuracy, allow a 60-second cached fix
    navigator.geolocation.getCurrentPosition(
      pos => resolve(toResult(pos)),
      err => {
        // On timeout only → retry with low-accuracy (Wi-Fi / IP geolocation)
        // which is instantaneous and reliable indoors / on desktops.
        if (err.code === 3) {
          navigator.geolocation.getCurrentPosition(
            pos => resolve(toResult(pos)),
            err2 => reject({ code: err2.code, message: geolocationErrorMessage(err2.code) } as GpsError),
            { enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 },
          );
        } else {
          reject({ code: err.code, message: geolocationErrorMessage(err.code) } as GpsError);
        }
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );
  });
}

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1: return 'Location permission denied. Please enable location access in your browser settings.';
    case 2: return 'Your device could not determine its location. Try again in an open area.';
    case 3: return 'Location timed out. Please check that location access is enabled and try again.';
    default: return 'An unknown location error occurred.';
  }
}
