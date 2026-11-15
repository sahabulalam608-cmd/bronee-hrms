/**
 * Geolocation helper for office verification.
 * Returns the best available fix, or null when permission is refused or the
 * device has no position — the caller then falls back to the network check.
 */

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function getPosition(timeoutMs = 8000): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

/**
 * The last known position, refreshed at most once per `maxAgeMs`.
 *
 * The automatic attendance tick runs every few seconds, so the browser must
 * not be asked for a new fix every time — the cached position is used instead.
 */
let cachedFix: GeoFix | null = null;
let cachedAt = 0;

export async function getCachedPosition(maxAgeMs = 60_000): Promise<GeoFix | null> {
  if (cachedFix && Date.now() - cachedAt < maxAgeMs) return cachedFix;
  const fix = await getPosition(6000);
  if (fix) {
    cachedFix = fix;
    cachedAt = Date.now();
  }
  return fix;
}
