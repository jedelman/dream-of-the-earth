// Noise for the sky shader, made once on each phone from fixed seeds, so every
// phone has the same sky: a tileable 3D texture of billowy noise for cloud
// detail (inverted Worley, the cauliflower lumps of a cumulus, plus a little
// value noise) and a tileable 2D field for the weather. Pure, so Node can test it.
import { hash2 } from "./plantforms.js";

const h3 = (i, j, k, s) => hash2(hash2(i, j, s), k, s + 7);
const u01 = (h) => (h & 0xffffff) / 16777216;
const wrap = (i, n) => ((i % n) + n) % n;
const smooth = (t) => t * t * (3 - 2 * t);

/** Feature points for a tileable Worley field: one per cell, `cells` per side. */
function features(cells, seed) {
  const f = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++)
    for (let y = 0; y < cells; y++)
      for (let x = 0; x < cells; x++) {
        const k = ((z * cells + y) * cells + x) * 3;
        f[k] = u01(h3(x, y, z, seed)); f[k + 1] = u01(h3(x, y, z, seed + 1)); f[k + 2] = u01(h3(x, y, z, seed + 2));
      }
  return f;
}

/** Distance to the nearest feature point (0..~1, in cell units), tileable. */
function worley3(x, y, z, cells, f) {
  const px = x * cells, py = y * cells, pz = z * cells;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let d = 9;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const k = ((wrap(cz, cells) * cells + wrap(cy, cells)) * cells + wrap(cx, cells)) * 3;
        d = Math.min(d, (cx + f[k] - px) ** 2 + (cy + f[k + 1] - py) ** 2 + (cz + f[k + 2] - pz) ** 2);
      }
  return Math.min(1, Math.sqrt(d));
}

/** Smooth value noise, 0..1, tileable with `cells` per side. */
function value3(x, y, z, cells, seed) {
  const px = x * cells, py = y * cells, pz = z * cells;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = smooth(px - ix), fy = smooth(py - iy), fz = smooth(pz - iz);
  const v = (a, b, c) => u01(h3(wrap(a, cells), wrap(b, cells), wrap(c, cells), seed));
  const lerp = (a, b, t) => a + (b - a) * t;
  const x00 = lerp(v(ix, iy, iz), v(ix + 1, iy, iz), fx), x10 = lerp(v(ix, iy + 1, iz), v(ix + 1, iy + 1, iz), fx);
  const x01 = lerp(v(ix, iy, iz + 1), v(ix + 1, iy, iz + 1), fx), x11 = lerp(v(ix, iy + 1, iz + 1), v(ix + 1, iy + 1, iz + 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function value2(x, y, cells, seed) {
  const px = x * cells, py = y * cells, ix = Math.floor(px), iy = Math.floor(py);
  const fx = smooth(px - ix), fy = smooth(py - iy);
  const v = (a, b) => u01(hash2(wrap(a, cells), wrap(b, cells), seed));
  const top = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * fx, bot = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * fx;
  return top + (bot - top) * fy;
}

/** The cloud-detail texture: size³ bytes, billowy, tileable. */
export function makeNoise3(size = 32, seed = 11) {
  const f4 = features(4, seed), f8 = features(8, seed + 10);
  const raw = new Float32Array(size * size * size);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const px = (x + 0.5) / size, py = (y + 0.5) / size, pz = (z + 0.5) / size;
        raw[(z * size + y) * size + x] = 0.55 * (1 - worley3(px, py, pz, 4, f4)) + 0.3 * (1 - worley3(px, py, pz, 8, f8)) + 0.15 * value3(px, py, pz, 8, seed + 20);
      }
  return stretch(raw);
}

/** Map the 2nd to 98th percentiles onto 0..255, so thresholds in the shader mean what they say. */
function stretch(raw) {
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
  const out = new Uint8Array(raw.length);
  for (let k = 0; k < raw.length; k++) out[k] = Math.max(0, Math.min(255, Math.round(((raw[k] - lo) / (hi - lo)) * 255)));
  return out;
}

/** The weather field: size² bytes of tileable fbm, stretched to fill 0..255. */
export function makeWeather(size = 256, seed = 23) {
  const raw = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let s = 0, a = 0.5;
      for (const c of [4, 8, 16, 32, 64]) { s += a * value2(u, v, c, seed + c); a *= 0.5; }
      raw[y * size + x] = s / 0.96875;
    }
  return stretch(raw);
}

/** Bilinear sample of a wrapped size² byte field at (u, v) in texture units, as the GPU does: 0..1. */
export function sampleWrap2(field, size, u, v) {
  const x = u * size - 0.5, y = v * size - 0.5, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (a, b) => field[wrap(b, size) * size + wrap(a, size)] / 255;
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx, bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
  return top + (bot - top) * fy;
}
