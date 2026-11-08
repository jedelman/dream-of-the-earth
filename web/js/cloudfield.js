// Where the clouds are: a pure function of place and the real clock, so every
// player sees the same sky. The air drifts with real-ish prevailing winds, and
// cloudiness follows the big circulation cells: wet near the equator, clear
// under the subtropical highs, cloudier again in the mid-latitudes.
import { hashString } from "./rng.js";
import { expand, turtle } from "./lsystem.js";
import { mulberry32, range } from "./rng.js";

export const CELL_DEG = 0.08; // cumulus cells, ~9 km at the equator
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

/**
 * The cumulus within `radiusDeg` of (lat, lon) at unix time t. Cells are fixed
 * in the drifting air; each holds a cloud or not, by hash and cloudiness.
 * Returns [{ key, lat, lon, base, seed }].
 */
export function cloudsNear(lat, lon, unixSeconds, radiusDeg = 0.7) {
  const drift = driftLon(lat, unixSeconds);
  const airLon = lon - drift;
  const out = [];
  const j0 = Math.floor((lat - radiusDeg) / CELL_DEG), j1 = Math.floor((lat + radiusDeg) / CELL_DEG);
  const lonRadius = radiusDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const i0 = Math.floor((airLon - lonRadius) / CELL_DEG), i1 = Math.floor((airLon + lonRadius) / CELL_DEG);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const wi = ((i % 4500) + 4500) % 4500; // 360° / 0.08° = 4500 cells around
      const h = hashString(`cumulus:${wi}:${j}`);
      const cLat = (j + 0.2 + 0.6 * ((h & 1023) / 1023)) * CELL_DEG;
      if ((h >>> 10) / 4194304 > cloudiness(cLat)) continue;
      const cAirLon = (i + 0.2 + 0.6 * (((h >>> 12) & 1023) / 1023)) * CELL_DEG;
      let cLon = cAirLon + drift;
      cLon = ((((cLon + 180) % 360) + 360) % 360) - 180;
      out.push({ key: `${wi}:${j}`, lat: cLat, lon: cLon, base: 1200 + (h % 700), seed: h });
    }
  }
  return out;
}

/** A cumulus's puffs, arranged by a small L-system: [{ p: [x,y,z] metres, r }]. */
export function cumulusPuffs(seed) {
  const r = mulberry32(seed);
  const str = expand("P", { P: [["O[+fP][-fP]", 2], ["O[&fP][^fP]f", 1], ["O[/+fP]fO", 1], ["O", 1]] }, 3 + (seed % 2), r, 400);
  const { bulbs } = turtle(str, { angle: range(r, 50, 80), length: 1, lengthDecay: 0.85, radius: 0.35, radiusDecay: 0.85, jitter: 25 }, r);
  const scale = range(r, 260, 520);
  const puffs = bulbs.slice(0, 24).map((b) => ({
    // Flatten: clouds spread sideways more than they tower.
    p: [b.p[0] * scale, Math.abs(b.p[1]) * scale * 0.45, b.p[2] * scale],
    r: Math.max(0.5, b.r) * scale * range(r, 0.7, 1.15),
  }));
  return puffs;
}
