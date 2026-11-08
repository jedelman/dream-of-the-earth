// Plant forms: each species grows from a small L-system (or, for conifers and
// grasses, a simple procedure) into a low-poly shape of unit height. Where they
// stand is a pure function of the place too, so every phone grows the same
// forest. Pure, so Node can test the budgets and the placement.
import { expand, turtle } from "./lsystem.js";
import { mulberry32, hashString, range } from "./rng.js";

export const PLANT_TRIANGLES = 64; // per plant, at most
export const VARIANTS = 3; // shapes per species, chosen per plant by hash
const COST = { prism: 6, bulb: 8, leaf: 2, cone: 10, blade: 2 }; // a blade has a front and a back

/**
 * Species. L-system ones: a grammar and turtle opts, the branch depth from
 * which segments are leaves rather than wood (leafDepth), how bulbs are sized
 * and squashed, and whether segments are wood at all. Every species has a
 * height range in metres and a draw distance from the creature (far).
 */
export const SPECIES = {
  broadleaf: { ls: { axiom: "FFA", rules: { A: [["F[+A][-A][&A]O", 3], ["F[/+A][\\-A]O", 2]] }, iterations: 2, opts: { angle: 42, lengthDecay: 0.8, radius: 0.17, radiusDecay: 0.7, jitter: 12 } }, bulb: 5, bulbY: 0.8, wood: true, height: [12, 24], far: 2500 },
  emergent: { ls: { axiom: "FFFFFB", rules: { B: "[&&FO]////[&&FO]////[&&FO]O" }, iterations: 1, opts: { angle: 30, lengthDecay: 0.85, radius: 0.15, radiusDecay: 0.6, jitter: 8 } }, bulb: 6, bulbY: 0.5, wood: true, height: [35, 50], far: 3000 },
  palm: { ls: { axiom: "F^F^FC", rules: { C: "[&&&&F&F]///[&&&&F&F]///[&&&&F&F]///[&&&&F&F]///[&&&&F&F]///[&&&&F&F]///[&&&&F&F]O" }, iterations: 1, opts: { angle: 14, lengthDecay: 1.25, radius: 0.1, radiusDecay: 0.5, jitter: 6 } }, leafDepth: 1, leafWidth: 0.32, bulb: 1.2, bulbY: 1, wood: true, height: [12, 20], far: 2000 },
  acacia: { ls: { axiom: "FF[&FF^O]///[&FF^O]///[&FF^O]///[&FF^O]", rules: {}, iterations: 0, opts: { angle: 30, lengthDecay: 0.85, radius: 0.13, radiusDecay: 0.7, jitter: 12 } }, bulb: 4.2, bulbY: 0.32, wood: true, height: [7, 11], far: 2500 },
  shrub: { ls: { axiom: "[&FO]////[&FO]////[&FO]O", rules: {}, iterations: 0, opts: { angle: 35, lengthDecay: 0.9, radius: 0.08, radiusDecay: 0.8, jitter: 15 } }, bulb: 2.6, bulbY: 0.8, wood: true, height: [1.5, 3], far: 700 },
  cactus: { ls: { axiom: "FF[+F-FF]F[-F+FF]FO", rules: {}, iterations: 0, opts: { angle: 90, lengthDecay: 0.75, radius: 0.38, radiusDecay: 0.85, jitter: 6 } }, bulb: 0.9, bulbY: 0.6, wood: false, height: [5, 9], far: 1200 },
  conifer: { cones: [5, 0.42], height: [14, 30], far: 2500 },
  cypress: { cones: [2, 0.2], height: [10, 18], far: 1800 },
  grass: { blades: 5, height: [1.4, 2.6], far: 220 },
  moss: { mounds: 3, height: [0.5, 0.9], far: 220 },
};
export const SPECIES_NAMES = Object.keys(SPECIES);

/** Merge straight runs of F (the same branch, no turn between) into one segment. */
function mergeRuns(segments) {
  const out = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.b === s.a && prev.depth === s.depth && prev.branch === s.branch) {
      const d1 = prev.b.map((x, i) => x - prev.a[i]), d2 = s.b.map((x, i) => x - s.a[i]);
      const cos = (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (Math.hypot(...d1) * Math.hypot(...d2) || 1);
      if (cos > 0.9999) { out[out.length - 1] = { ...prev, b: s.b, r1: s.r1 }; continue; }
    }
    out.push(s);
  }
  return out;
}

/**
 * A plant shape of unit height: { segments: [{a, b, r0, r1, wood}], leaves:
 * [{a, b, w}], bulbs: [{p, r, sy}], cones: [{y0, y1, r}], blades: [{base, tip,
 * w}], triangles }. Within the budget, trunks come first, then foliage, then
 * the finer branches (which the foliage hides anyway).
 */
export function plantForm(species, variant) {
  const sp = SPECIES[species];
  const r = mulberry32(hashString(`${species}:${variant}`));
  const out = { segments: [], leaves: [], bulbs: [], cones: [], blades: [], triangles: 0 };
  const budget = (n) => { if (out.triangles + n > PLANT_TRIANGLES) return false; out.triangles += n; return true; };

  if (sp.ls) {
    const str = expand(sp.ls.axiom, sp.ls.rules, sp.ls.iterations, r, 600);
    const t = turtle(str, { length: 1, ...sp.ls.opts }, r);
    const segs = mergeRuns(t.segments);
    const bulbs = t.bulbs.map((b) => ({ p: b.p, r: b.r * sp.bulb }));
    let top = 0.001;
    for (const s of segs) top = Math.max(top, s.b[1], s.a[1]);
    for (const b of bulbs) top = Math.max(top, b.p[1] + b.r * sp.bulbY);
    const k = 1 / top;
    const isLeaf = (s) => sp.leafDepth !== undefined && s.depth >= sp.leafDepth;
    const trunk = segs.filter((s) => s.depth === 0 && !isLeaf(s));
    const leaves = segs.filter(isLeaf);
    const twigs = segs.filter((s) => s.depth > 0 && !isLeaf(s));
    const addSeg = (s) => { if (budget(COST.prism)) out.segments.push({ a: s.a.map((x) => x * k), b: s.b.map((x) => x * k), r0: s.r0 * k, r1: s.r1 * k, wood: sp.wood }); };
    trunk.forEach(addSeg);
    for (const b of bulbs) if (budget(COST.bulb)) out.bulbs.push({ p: b.p.map((x) => x * k), r: b.r * k * range(r, 0.9, 1.15), sy: sp.bulbY });
    for (const s of leaves) if (budget(COST.leaf)) out.leaves.push({ a: s.a.map((x) => x * k), b: s.b.map((x) => x * k), w: sp.leafWidth * range(r, 0.85, 1.15) });
    twigs.forEach(addSeg);
  } else if (sp.cones) {
    // A trunk and stacked cones, narrowing upward.
    const [layers, width] = sp.cones;
    budget(COST.prism);
    out.segments.push({ a: [0, 0, 0], b: [0, 0.35, 0], r0: 0.035, r1: 0.03, wood: true });
    for (let i = 0; i < layers; i++) {
      if (!budget(COST.cone)) break;
      const y0 = 0.12 + (i / layers) * 0.6;
      out.cones.push({ y0, y1: Math.min(1, y0 + 0.4), r: width * (1 - i / (layers + 1.2)) * range(r, 0.9, 1.1) });
    }
  } else if (sp.blades) {
    for (let i = 0; i < sp.blades; i++) {
      if (!budget(COST.blade)) break;
      const a = (i / sp.blades) * Math.PI * 2 + range(r, -0.3, 0.3), lean = range(r, 0.15, 0.45);
      out.blades.push({ base: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], tip: [Math.cos(a) * lean, range(r, 0.7, 1), Math.sin(a) * lean], w: range(r, 0.08, 0.13) });
    }
  } else if (sp.mounds) {
    for (let i = 0; i < sp.mounds; i++) {
      if (!budget(COST.bulb)) break;
      const a = range(r, 0, Math.PI * 2), d = i === 0 ? 0 : range(r, 0.3, 0.7);
      out.bulbs.push({ p: [Math.cos(a) * d, 0.35, Math.sin(a) * d], r: range(r, 0.45, 0.7), sy: 0.6 });
    }
  }
  return out;
}

// Distance tiers. Within NEAR_M of the camera a plant is its full shape; beyond
// it, trees and shrubs become one six-triangle spindle grown from the same
// shape (crown above, tapering to the trunk's foot), out to their `far`.
// Grass and moss have no far shape: they just stop.
export const NEAR_M = 250;
export const GROUND_COVER_M = 400; // grass and moss, from the camera
export const MID_TRIANGLES = 6;

/**
 * Which tier a plant draws at: "near", "mid", or null (not at all). scale
 * (0..1, from the detail governor) shortens how far trees and shrubs reach.
 */
export function lodFor(species, fromCreature, fromCamera, scale = 1) {
  const sp = SPECIES[species];
  if (sp.blades || sp.mounds) return fromCreature <= sp.far && fromCamera <= GROUND_COVER_M ? "near" : null;
  if (fromCreature > Math.max(NEAR_M, sp.far * scale)) return null;
  return fromCamera <= NEAR_M ? "near" : "mid";
}

/**
 * The far shape of a plant form: a three-sided spindle, its widest ring at the
 * crown's middle, its top at the crown's top, its foot on the ground. Returns
 * { ringY, r, top, cx, cz }.
 */
export function midShape(form) {
  const pts = []; // [x, y, z, horizontal radius]
  for (const b of form.bulbs) pts.push([b.p[0], b.p[1] - b.r * b.sy, b.p[2], b.r], [b.p[0], b.p[1] + b.r * b.sy, b.p[2], b.r]);
  for (const l of form.leaves) pts.push([...l.a, 0], [...l.b, 0]);
  for (const c of form.cones) pts.push([0, c.y0, 0, c.r], [0, c.y1, 0, 0]);
  // Green stems (a cactus) are the body itself, not wood hidden under a crown.
  const body = form.segments.length > 0 && form.segments.every((s) => !s.wood);
  if (body || !pts.length) for (const s of form.segments) pts.push([...s.a, s.r0], [...s.b, s.r1]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const top = Math.min(1, Math.max(...pts.map((p) => p[1])));
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[2] - cz) + p[3]));
  let ringY;
  if (form.cones.length) ringY = Math.min(...form.cones.map((c) => c.y0));
  else if (!body && (form.bulbs.length || form.leaves.length)) {
    const ys = [...form.bulbs.map((b) => b.p[1]), ...form.leaves.flatMap((l) => [l.a[1], l.b[1]])];
    ringY = ys.reduce((t, y) => t + y, 0) / ys.length;
  } else ringY = 0.55 * top;
  return { ringY: Math.min(ringY, top * 0.9), r, top, cx, cz };
}

/** Weighted pick from a [name, weight] table, by a 0..1 number. */
export function pickSpecies(table, u) {
  const total = table.reduce((t, [, w]) => t + w, 0);
  let x = u * total;
  for (const [name, w] of table) { if ((x -= w) < 0) return name; }
  return table[table.length - 1][0];
}

/** A fast, stable 32-bit hash of two integers (and a salt). */
export function hash2(i, j, salt = 0) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const M_PER_DEG = 111320;

/**
 * The cells of a global lat/lon grid (`cell` metres on a side) within `radius`
 * metres of (lat, lon). Each cell has one candidate spot, jittered by its hash,
 * so a plant stands in the same place whoever asks and from wherever.
 * Returns [{ i, j, lat, lon, h }], h a 32-bit hash for the cell's other choices.
 */
export function cellsAround(lat, lon, radius, cell, salt) {
  const dLat = cell / M_PER_DEG;
  const out = [];
  const j0 = Math.floor((lat - radius / M_PER_DEG) / dLat), j1 = Math.floor((lat + radius / M_PER_DEG) / dLat);
  const kx = M_PER_DEG * Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  for (let j = j0; j <= j1; j++) {
    const rowLat = (j + 0.5) * dLat;
    const dLon = dLat / Math.max(0.05, Math.cos((rowLat * Math.PI) / 180));
    const span = radius / kx;
    const i0 = Math.floor((lon - span) / dLon), i1 = Math.floor((lon + span) / dLon);
    for (let i = i0; i <= i1; i++) {
      const h = hash2(i, j, salt);
      const cLat = (j + 0.15 + 0.7 * ((h & 0xff) / 255)) * dLat;
      const cLon = (i + 0.15 + 0.7 * (((h >>> 8) & 0xff) / 255)) * dLon;
      const dx = (cLon - lon) * kx, dz = (cLat - lat) * M_PER_DEG;
      if (dx * dx + dz * dz > radius * radius) continue;
      out.push({ i, j, lat: cLat, lon: cLon, h: hash2(h, j, salt + 1) });
    }
  }
  return out;
}

/** 0..1 from bits of a hash. */
export const unit = (h, shift = 0) => ((h >>> shift) & 0xffff) / 65536;

/**
 * What grows on a cell, given its hash, its biome's density and plant table:
 * null, or { species, variant, height, yaw, squash }.
 */
export function choosePlant(h, density, table) {
  if (!table.length || unit(h) >= density) return null;
  const species = pickSpecies(table, unit(h, 16));
  const g = hash2(h, 7);
  const [lo, hi] = SPECIES[species].height;
  return { species, variant: g % VARIANTS, height: lo + (hi - lo) * unit(g, 2), yaw: unit(g, 9) * Math.PI * 2, squash: 0.85 + 0.3 * unit(g, 16) };
}
