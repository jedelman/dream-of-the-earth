// The weather, as a pure function of place and the real clock, so every player
// sees the same sky. A tileable noise field rides on the prevailing winds; the
// latitude's circulation cell sets how much of it is cloud (wet doldrums, clear
// subtropical highs, cloudy storm tracks), and the strongest cells in the
// tropics tower into storms that rain. The sky shader computes exactly this;
// this copy is for tests and for anything in the game that wants to know.
import { makeWeather, sampleWrap2 } from "./skynoise.js";
import { windSign, cloudiness, WIND } from "./cloudfield.js";

export const WEATHER_SIZE = 256;
export const WEATHER_KM = [700, 130]; // the field repeats every 700 km, with detail every 130 km
export const CLOUD_BASE = 1500; // metres
export const KM_PER_DEG = 111.32;

let field = null;
/** The weather field (made once). */
export const weatherField = () => (field ??= makeWeather(WEATHER_SIZE));

/** Kilometres the air has moved with the wind by unix time (wrapped every 40,000 km). */
export const windKm = (unixSeconds) => ((WIND * unixSeconds) / 1000) % 40000;

/** Where a place sits in the drifting air, in km. */
export function airKm(lat, lon, unixSeconds) {
  return [lon * KM_PER_DEG * Math.cos((lat * Math.PI) / 180) - windSign(lat) * windKm(unixSeconds), lat * KM_PER_DEG];
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The weather over a place: { n, cover (0..1), storm (0..1), top (m) }. */
export function weatherAt(lat, lon, unixSeconds) {
  const [qx, qz] = airKm(lat, lon, unixSeconds);
  const f = weatherField();
  const n = 0.65 * sampleWrap2(f, WEATHER_SIZE, qx / WEATHER_KM[0], qz / WEATHER_KM[0]) + 0.35 * sampleWrap2(f, WEATHER_SIZE, qx / WEATHER_KM[1] + 0.37, qz / WEATHER_KM[1] + 0.37);
  const c = cloudiness(lat);
  const cover = smoothstep(1 - c - 0.1, 1 - c + 0.3, n);
  const tropic = 1 - smoothstep(12, 25, Math.abs(lat));
  // Storms come in cells ~10 km across within the stormy patches.
  const cell = smoothstep(0.45, 0.75, sampleWrap2(f, WEATHER_SIZE, qx / 37 + 0.71, qz / 37 + 0.71));
  const storm = (smoothstep(0.7, 0.88, n) * tropic * 0.9 + smoothstep(0.8, 0.95, n) * (1 - tropic) * 0.5) * cell;
  return { n, cover, storm, top: CLOUD_BASE + 1200 + 2800 * cover + 6000 * storm };
}
