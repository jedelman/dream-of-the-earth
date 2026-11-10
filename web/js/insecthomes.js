// Where insects live: homes on the global cell grid, by biome. Pure, so Node
// can test it; insects.js draws them.
import { cellsAround, unit } from "./plantforms.js";

export const BUTTERFLY_TRIANGLES = 4;
export const BUTTERFLY = { cell: 45, radius: 300, salt: 303, max: 256, chance: 0.5 };
export const FIREFLY = { cell: 25, radius: 260, salt: 404, max: 600, chance: 0.5 };
const WING_HUES = [0.95, 0.08, 0.15, 0.55, 0.75, 0.85];

// Dream-sized: wingspans of 3 to 5 m, so they read from the camera.
/** Butterflies near a point: [{ x, y, z, seed, hue, size }], pure given heights and biomes. */
export function butterflyHomes(lat, lon, at) {
  const out = [];
  for (const c of cellsAround(lat, lon, BUTTERFLY.radius, BUTTERFLY.cell, BUTTERFLY.salt)) {
    const s = at(c);
    if (!s || unit(c.h) >= BUTTERFLY.chance * s.biome.butterflies) continue;
    out.push({ ...s.p, y: s.h + 3 + 6 * unit(c.h, 4), seed: unit(c.h, 12), hue: WING_HUES[c.h % WING_HUES.length], size: 1.6 + 0.8 * unit(c.h, 20) });
    if (out.length >= BUTTERFLY.max) break;
  }
  return out;
}

/** Where a firefly is at clock t: its home plus the slow drift the vertex shader flies (the same sums, so a touch finds it). */
export function fireflyAt(f, t) {
  const s = f.seed * 40;
  return { x: f.x + Math.sin(t * 0.4 + s) * 3, y: f.y + Math.sin(t * 0.7 + s * 0.3) * 0.8, z: f.z + Math.cos(t * 0.33 + s * 0.4) * 3 };
}

/** Fireflies near a point, where the biome has them: [{ x, y, z, seed }]. */
export function fireflyHomes(lat, lon, at) {
  const out = [];
  for (const c of cellsAround(lat, lon, FIREFLY.radius, FIREFLY.cell, FIREFLY.salt)) {
    const s = at(c);
    if (!s || !s.biome.fireflies || unit(c.h) >= FIREFLY.chance) continue;
    out.push({ ...s.p, y: s.h + 0.6 + 3.5 * unit(c.h, 4), seed: unit(c.h, 12) });
    if (out.length >= FIREFLY.max) break;
  }
  return out;
}
