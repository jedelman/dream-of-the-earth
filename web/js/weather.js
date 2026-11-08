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

// Orography: air pushed up a windward slope cools into cloud and, on big slopes, rain;
// air sinking down the lee side clears; and downwind of a high barrier the air has
// already rained out, so a rain shadow stretches far beyond it. Along the prevailing
// wind: "lift" is how much the broad land rises into the wind (over 12 km, or the
// broad slope over 40 km, unless it's going downhill right here); "barrier" is how much
// higher the highest land 12-100 km upwind was.
export const UPWIND_M = [12000, 40000, 70000, 100000];
export const OROGRAPHY_M = 7650; // the terrain texture's range: 30 m steps in a byte
export function orographic(cover, storm, lift, barrier = 0) {
  let c = Math.min(1, cover + 0.5 * smoothstep(100, 1200, lift));
  c *= 1 - 0.85 * smoothstep(100, 1200, -lift);
  c *= 1 - 0.6 * smoothstep(600, 2000, barrier);
  const s = Math.min(1, storm + 0.7 * smoothstep(500, 1800, lift) * c) * (1 - smoothstep(600, 2000, barrier));
  return { cover: c, storm: s };
}

/**
 * The weather over a place: { n, cover (0..1), storm (0..1), base (m), top (m) }.
 * broad(lat, lon), if given, is the broad (~15 km smoothed) land height there in metres.
 */
export function weatherAt(lat, lon, unixSeconds, broad = null) {
  const [qx, qz] = airKm(lat, lon, unixSeconds);
  const f = weatherField();
  const n = 0.65 * sampleWrap2(f, WEATHER_SIZE, qx / WEATHER_KM[0], qz / WEATHER_KM[0]) + 0.35 * sampleWrap2(f, WEATHER_SIZE, qx / WEATHER_KM[1] + 0.37, qz / WEATHER_KM[1] + 0.37);
  const c = cloudiness(lat);
  const cover = smoothstep(1 - c - 0.1, 1 - c + 0.3, n);
  const tropic = 1 - smoothstep(12, 25, Math.abs(lat));
  // Storms come in cells ~10 km across within the stormy patches.
  const cell = smoothstep(0.45, 0.75, sampleWrap2(f, WEATHER_SIZE, qx / 37 + 0.71, qz / 37 + 0.71));
  const storm = (smoothstep(0.7, 0.88, n) * tropic * 0.9 + smoothstep(0.8, 0.95, n) * (1 - tropic) * 0.5) * cell;
  if (!broad) return { n, cover, storm, base: CLOUD_BASE, top: CLOUD_BASE + 1200 + 2800 * cover + 6000 * storm };
  const here = Math.max(0, broad(lat, lon));
  const up = UPWIND_M.map((m) => Math.max(0, broad(lat, lon - (windSign(lat) * m) / (KM_PER_DEG * 1000 * Math.cos((lat * Math.PI) / 180)))));
  const local = here - up[0];
  const o = orographic(cover, storm, local < 0 ? local : Math.max(local, 0.6 * (here - up[1])), Math.max(...up) - here);
  const base = CLOUD_BASE + here; // the base rides the broad land; peaks poke up into it
  return { n, cover: o.cover, storm: o.storm, base, top: base + 1200 + 2800 * o.cover + 6000 * o.storm };
}

/**
 * The terrain the sky shader reads: size² texels over a square `span` metres wide
 * from (x0, z0) in a world frame, two bytes each: height and broad (blurred ~15 km)
 * height, in 30 m steps. Returns { data, min, max } (broad heights, metres).
 */
export function makeOrography(heightAt, x0, z0, span, size = 128) {
  const h = new Float32Array(size * size), cell = span / (size - 1);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) h[j * size + i] = Math.max(0, heightAt(x0 + i * cell, z0 + j * cell));
  const R = Math.max(1, Math.round(7500 / cell)); // blur radius: ±7.5 km
  const tmp = new Float32Array(size * size), broadH = new Float32Array(size * size);
  const blur = (src, dst, dx, dy) => {
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        let sum = 0, n = 0;
        for (let k = -R; k <= R; k++) {
          const ii = i + k * dx, jj = j + k * dy;
          if (ii >= 0 && jj >= 0 && ii < size && jj < size) { sum += src[jj * size + ii]; n++; }
        }
        dst[j * size + i] = sum / n;
      }
  };
  blur(h, tmp, 1, 0);
  blur(tmp, broadH, 0, 1);
  const data = new Uint8Array(size * size * 2);
  let min = Infinity, max = 0;
  for (let k = 0; k < size * size; k++) {
    data[k * 2] = Math.min(255, Math.round(h[k] / 30));
    data[k * 2 + 1] = Math.min(255, Math.round(broadH[k] / 30));
    min = Math.min(min, broadH[k]); max = Math.max(max, broadH[k]);
  }
  return { data, min, max };
}
