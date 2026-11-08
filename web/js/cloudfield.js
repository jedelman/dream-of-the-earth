// The winds and the cloud belts: pure functions of latitude and the real clock,
// so every player sees the same sky. The air drifts with real-ish prevailing winds, and
// cloudiness follows the big circulation cells: wet near the equator, clear
// under the subtropical highs, cloudier again in the mid-latitudes.
export const WIND = 8; // m/s

/** Wind direction by latitude band: +1 blows toward the east, -1 toward the west. */
export function windSign(lat) {
  const a = Math.abs(lat);
  if (a < 30) return -1; // trade winds: from the east
  if (a < 60) return 1; // westerlies
  return -1; // polar easterlies
}

/** How much of the air holds a cumulus, 0..1, by latitude. */
export function cloudiness(lat) {
  const a = Math.abs(lat);
  if (a < 12) return 0.55; // the doldrums
  if (a < 35) return 0.18; // subtropical highs, the desert belts
  if (a < 65) return 0.45; // mid-latitude storm tracks
  return 0.3;
}

/** How far the air has drifted in longitude by unix time t at a latitude (degrees, wrapped). */
export function driftLon(lat, unixSeconds) {
  const metresPerDeg = 111320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  return ((((windSign(lat) * WIND * unixSeconds) / metresPerDeg) % 360) + 360) % 360;
}
