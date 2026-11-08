// Plant forms: ten charismatic trees, each its own genus and body plan, plus
// shrubs, grass and moss underneath. Each grows from a seeded procedure (the
// shrub from a small L-system) into a low-poly shape of unit height. Where they
// stand is a pure function of the place too, so every phone grows the same
// forest. Pure, so Node can test the budgets and the placement.
import { expand, turtle } from "./lsystem.js";
import { mulberry32, hashString, range } from "./rng.js";

export const PLANT_TRIANGLES = 128; // per plant up close, at most (far away it's 6)
export const VARIANTS = 3; // shapes per species, chosen per plant by hash

// Triangle costs: an n-sided prism or cone or bipyramid is 2n; a flat leaf,
// a fin or a grass blade is 2 (a front and a back).
const cost = { segment: (s) => 2 * (s.sides || 3), bulb: (b) => 2 * (b.sides || 4), cone: (c) => 2 * (c.sides || 5), leaf: () => 2, fin: () => 2, blade: () => 2 };

// Small geometry helpers for the builders (y is up; pitch is from vertical).
const dir = (yawDeg, pitchDeg) => {
  const y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  return [Math.sin(p) * Math.cos(y), Math.cos(p), Math.sin(p) * Math.sin(y)];
};
const along = (a, d, len) => [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const seg = (a, b, r0, r1, sides = 3, wood = true) => ({ a, b, r0, r1, sides, wood });

/**
 * The builders. Each returns { trunk, fins, crown: { bulbs, cones, leaves },
 * limbs } in roughly unit-height space; plantForm normalizes and budgets them.
 */
const BUILD = {
  // Kapok: a rainforest emergent. A tall straight trunk on buttress fins, near-
  // level limbs, and a flat, tiered crown far above everything else.
  ceiba(r) {
    const trunk = [seg([0, 0, 0], [0, 0.42, 0], 0.045, 0.034, 5), seg([0, 0.42, 0], [0, 0.8, 0], 0.034, 0.024, 5)];
    const fins = [];
    const nf = 4, f0 = range(r, 0, 90);
    for (let k = 0; k < nf; k++) {
      const d = dir(f0 + (k * 360) / nf + range(r, -12, 12), 90);
      fins.push({ a: [d[0] * 0.03, 0.15, d[2] * 0.03], b: [d[0] * range(r, 0.1, 0.14), 0, d[2] * range(r, 0.1, 0.14)], c: [d[0] * 0.03, 0, d[2] * 0.03] });
    }
    const n = 4 + Math.floor(r() * 2), y0 = range(r, 0, 360), limbs = [], bulbs = [];
    for (let k = 0; k < n; k++) {
      const start = [0, range(r, 0.74, 0.8), 0], end = along(start, dir(y0 + (k * 360) / n + range(r, -15, 15), range(r, 66, 76)), range(r, 0.28, 0.36));
      limbs.push(seg(start, end, 0.016, 0.009));
      bulbs.push({ p: end, r: range(r, 0.11, 0.15), sy: 0.6, sides: 4 });
    }
    // A rounded crown of clumps over the limbs, sunlit on top.
    for (let k = 0; k < 3; k++) {
      const d = dir(y0 + 60 + k * 120, 90), off = range(r, 0.04, 0.12);
      bulbs.push({ p: [d[0] * off, range(r, 0.88, 0.94), d[2] * off], r: range(r, 0.12, 0.16), sy: 0.6, sides: 4 });
    }
    return { trunk, fins, crown: { bulbs }, limbs };
  },

  // Banyan: a short massive trunk, limbs flung wide and level, and prop roots
  // dropping from them like pillars, under a dome wider than it is tall.
  ficus(r) {
    const trunk = [seg([0, 0, 0], [0, 0.4, 0], 0.08, 0.065, 5)];
    const n = 4 + Math.floor(r() * 2), y0 = range(r, 0, 360), limbs = [], bulbs = [];
    for (let k = 0; k < n; k++) {
      const start = [0, 0.38, 0], end = along(start, dir(y0 + (k * 360) / n + range(r, -12, 12), range(r, 64, 72)), range(r, 0.55, 0.68));
      limbs.push(seg(start, end, 0.03, 0.018));
      bulbs.push({ p: end, r: range(r, 0.26, 0.31), sy: 0.7, sides: 4 });
      if (k < 3) { const at = lerp3(start, end, range(r, 0.55, 0.75)); limbs.push(seg(at, [at[0], 0, at[2]], 0.016, 0.02)); } // a prop root
    }
    // The dome: lumps heaped over the middle, like broccoli.
    for (let k = 0; k < 3; k++) {
      const d = dir(y0 + 30 + k * 120, 90), off = range(r, 0.12, 0.24);
      bulbs.push({ p: [d[0] * off, range(r, 0.72, 0.8), d[2] * off], r: range(r, 0.26, 0.32), sy: 0.7, sides: 4 });
    }
    return { trunk, fins: [], crown: { bulbs }, limbs };
  },

  // Coconut palm: a slender trunk leaning in a long curve, and a fountain of
  // drooping fronds.
  cocos(r) {
    const lean = range(r, 0, 360), bend = range(r, 0.08, 0.16), trunk = [];
    let prev = [0, 0, 0];
    for (let k = 1; k <= 4; k++) {
      const t = k / 4, off = bend * t * t, d = dir(lean, 90);
      const next = [d[0] * off, 0.82 * t, d[2] * off];
      trunk.push(seg(prev, next, 0.026 - 0.004 * t, 0.024 - 0.004 * t, 4));
      prev = next;
    }
    const top = prev, leaves = [], nf = 10, y0 = range(r, 0, 360);
    for (let k = 0; k < nf; k++) {
      const yaw = y0 + (k * 360) / nf + range(r, -10, 10);
      const mid = along(top, dir(yaw, range(r, 45, 65)), range(r, 0.18, 0.24));
      const tip = along(mid, dir(yaw, range(r, 100, 125)), range(r, 0.15, 0.2));
      leaves.push({ a: top, b: mid, w: 0.3 }, { a: mid, b: tip, w: 0.26 });
    }
    return { trunk, fins: [], crown: { bulbs: [{ p: [top[0], top[1] - 0.02, top[2]], r: 0.035, sy: 1, sides: 4 }], leaves }, limbs: [] };
  },

  // Baobab: the upside-down tree. A swollen bottle of a trunk and stubby limbs
  // like roots in the air, mostly bare.
  adansonia(r) {
    const fat = range(r, 0.9, 1.15);
    const trunk = [
      seg([0, 0, 0], [0, 0.22, 0], 0.17 * fat, 0.2 * fat, 6),
      seg([0, 0.22, 0], [0, 0.45, 0], 0.2 * fat, 0.15 * fat, 6),
      seg([0, 0.45, 0], [0, 0.6, 0], 0.15 * fat, 0.08 * fat, 6),
    ];
    const n = 6, y0 = range(r, 0, 360), limbs = [], bulbs = [];
    const leafy = r() < 0.4; // some are in leaf, most stand bare
    for (let k = 0; k < n; k++) {
      const yaw = y0 + (k * 360) / n + range(r, -15, 15);
      const start = [0, range(r, 0.55, 0.6), 0], end = along(start, dir(yaw, range(r, 45, 62)), range(r, 0.2, 0.28));
      limbs.push(seg(start, end, 0.05, 0.025, 4));
      const tip = along(end, dir(yaw + range(r, -40, 40), range(r, 20, 50)), range(r, 0.1, 0.15));
      if (leafy) bulbs.push({ p: tip, r: range(r, 0.07, 0.1), sy: 0.6, sides: 3 });
      else limbs.push(seg(end, tip, 0.024, 0.01));
    }
    return { trunk, fins: [], crown: { bulbs }, limbs };
  },

  // Umbrella thorn: a thin trunk forking into angled limbs under a flat,
  // wide pancake of a crown.
  vachellia(r) {
    const trunk = [seg([0, 0, 0], [0, 0.32, 0], 0.04, 0.03, 4)];
    const n = 3, y0 = range(r, 0, 360), limbs = [], bulbs = [];
    for (let k = 0; k < n; k++) {
      const yaw = y0 + (k * 360) / n + range(r, -20, 20);
      const start = [0, 0.32, 0], end = along(start, dir(yaw, range(r, 40, 50)), range(r, 0.45, 0.55));
      limbs.push(seg(start, end, 0.022, 0.012));
      const at = lerp3(start, end, 0.5), end2 = along(at, dir(yaw + 60, range(r, 50, 60)), range(r, 0.28, 0.34));
      limbs.push(seg(at, end2, 0.014, 0.008));
      bulbs.push({ p: end, r: range(r, 0.26, 0.31), sy: 0.18, sides: 5 });
    }
    bulbs.push({ p: [0, 0.78, 0], r: range(r, 0.28, 0.33), sy: 0.18, sides: 5 });
    return { trunk, fins: [], crown: { bulbs }, limbs };
  },

  // Saguaro: a ribbed green column, arms bending up like a greeting.
  carnegiea(r) {
    const arms = 1 + Math.floor(r() * 3); // 1-3
    const sides = arms === 3 ? 5 : 6, rad = range(r, 0.06, 0.075);
    const trunk = arms === 3
      ? [seg([0, 0, 0], [0, 0.5, 0], rad, rad, sides, false), seg([0, 0.5, 0], [0, 0.92, 0], rad, rad * 0.95, sides, false)]
      : [seg([0, 0, 0], [0, 0.35, 0], rad, rad, sides, false), seg([0, 0.35, 0], [0, 0.7, 0], rad, rad, sides, false), seg([0, 0.7, 0], [0, 0.92, 0], rad, rad * 0.95, sides, false)];
    const bulbs = [{ p: [0, 0.92, 0], r: rad, sy: 1, sides }], limbs = [], y0 = range(r, 0, 360);
    for (let k = 0; k < arms; k++) {
      const d = dir(y0 + (k * 360) / arms + range(r, -25, 25), 90), ar = rad * 0.75;
      const a = [0, range(r, 0.3, 0.5), 0], b = along(a, d, range(r, 0.12, 0.16)), c = [b[0], b[1] + range(r, 0.22, 0.34), b[2]];
      limbs.push(seg(a, b, ar, ar, sides, false), seg(b, c, ar, ar * 0.95, sides, false));
      bulbs.push({ p: c, r: ar, sy: 1, sides });
    }
    return { trunk, fins: [], crown: { bulbs }, limbs };
  },

  // Spreading oak: a short thick trunk, great limbs reaching out low, and a
  // lumpy crown half again as wide as it is tall.
  quercus(r) {
    const lean = dir(range(r, 0, 360), range(r, 0, 6));
    const top = along([0, 0, 0], lean, 0.28);
    const trunk = [seg([0, 0, 0], top, 0.075, 0.06, 6)];
    const n = 5, y0 = range(r, 0, 360), limbs = [], bulbs = [];
    for (let k = 0; k < n; k++) {
      const end = along(top, dir(y0 + (k * 360) / n + range(r, -18, 18), range(r, 55, 68)), range(r, 0.48, 0.6));
      limbs.push(seg(top, end, 0.035, 0.018, 4));
      bulbs.push({ p: end, r: range(r, 0.23, 0.29), sy: 0.75, sides: 5 });
    }
    bulbs.push({ p: [top[0] + range(r, -0.1, 0.1), 0.72, top[2] + range(r, -0.1, 0.1)], r: range(r, 0.26, 0.31), sy: 0.75, sides: 5 });
    bulbs.push({ p: [top[0] + range(r, -0.15, 0.15), 0.66, top[2] + range(r, -0.15, 0.15)], r: range(r, 0.24, 0.28), sy: 0.75, sides: 5 });
    return { trunk, fins: [], crown: { bulbs }, limbs };
  },

  // Italian cypress: a dark green flame.
  cupressus(r) {
    const w = range(r, 0.075, 0.095);
    return {
      trunk: [seg([0, 0, 0], [0, 0.1, 0], 0.02, 0.018)],
      fins: [],
      crown: { cones: [{ y0: 0.05, y1: 0.62, r: w, sides: 6 }, { y0: 0.34, y1: 0.86, r: w * 0.82, sides: 6 }, { y0: 0.6, y1: 1, r: w * 0.55, sides: 6 }] },
      limbs: [],
    };
  },

  // Giant sequoia: the mega conifer. A flared cinnamon column, bare for its
  // first half, under a lumpy, rounded spire of a crown.
  sequoiadendron(r) {
    const trunk = [seg([0, 0, 0], [0, 0.08, 0], 0.075, 0.05, 6), seg([0, 0.08, 0], [0, 0.55, 0], 0.05, 0.032, 6), seg([0, 0.55, 0], [0, 0.97, 0], 0.032, 0.012, 5)];
    const fins = [];
    for (let k = 0; k < 3; k++) {
      const d = dir(range(r, 0, 360), 90);
      fins.push({ a: [d[0] * 0.05, 0.06, d[2] * 0.05], b: [d[0] * 0.11, 0, d[2] * 0.11], c: [d[0] * 0.05, 0, d[2] * 0.05] });
    }
    const bulbs = [];
    for (let k = 0; k < 6; k++) {
      const t = k / 5, y = 0.47 + t * 0.42, rr = 0.13 - t * 0.07;
      bulbs.push({ p: [range(r, -0.035, 0.035), y, range(r, -0.035, 0.035)], r: rr * range(r, 0.9, 1.15), sy: 0.9, sides: 5 });
    }
    return { trunk, fins, crown: { bulbs, cones: [{ y0: 0.84, y1: 1, r: 0.05, sides: 5 }] }, limbs: [] };
  },

  // Spruce: a narrow spire of drooping tiers.
  picea(r) {
    const tiers = 6 + Math.floor(r() * 2), w = range(r, 0.19, 0.24), cones = [];
    for (let i = 0; i < tiers; i++) {
      const y0 = 0.07 + (i / tiers) * 0.78;
      cones.push({ y0, y1: Math.min(1, y0 + 0.24), r: w * (1 - i / (tiers + 0.6)) * range(r, 0.92, 1.08), sides: 5 });
    }
    return { trunk: [seg([0, 0, 0], [0, 0.3, 0], 0.03, 0.025, 4)], fins: [], crown: { cones }, limbs: [] };
  },
};

/**
 * Species: a builder (or an L-system, for the shrub), a height range in metres
 * and a draw distance from the creature (far). The ten trees are ten genera.
 */
export const SPECIES = {
  ceiba: { build: BUILD.ceiba, height: [45, 60], far: 3000 }, // kapok, rainforest emergent
  ficus: { build: BUILD.ficus, height: [18, 28], far: 2500 }, // banyan, prop roots
  cocos: { build: BUILD.cocos, height: [12, 22], far: 2000 }, // coconut palm
  adansonia: { build: BUILD.adansonia, height: [14, 24], far: 2500 }, // baobab
  vachellia: { build: BUILD.vachellia, height: [6, 12], far: 2500 }, // umbrella thorn acacia
  carnegiea: { build: BUILD.carnegiea, height: [6, 12], far: 1500 }, // saguaro
  quercus: { build: BUILD.quercus, height: [14, 24], far: 2500 }, // spreading oak
  cupressus: { build: BUILD.cupressus, height: [12, 22], far: 1800 }, // Italian cypress
  sequoiadendron: { build: BUILD.sequoiadendron, height: [55, 85], far: 3500 }, // giant sequoia
  picea: { build: BUILD.picea, height: [15, 35], far: 2500 }, // spruce
  shrub: { ls: { axiom: "[&FO]////[&FO]////[&FO]O", rules: {}, iterations: 0, opts: { angle: 35, lengthDecay: 0.9, radius: 0.08, radiusDecay: 0.8, jitter: 15 } }, bulb: 2.6, bulbY: 0.8, height: [1.5, 3], far: 700 },
  grass: { blades: 5, height: [1.4, 2.6], far: 220 },
  moss: { mounds: 3, height: [0.5, 0.9], far: 220 },
};
export const SPECIES_NAMES = Object.keys(SPECIES);
export const TREES = SPECIES_NAMES.filter((n) => SPECIES[n].build);

/**
 * A plant shape of unit height: { segments: [{a, b, r0, r1, sides, wood}],
 * leaves: [{a, b, w}], bulbs: [{p, r, sy, sides}], cones: [{y0, y1, r, sides,
 * cx, cz}], fins: [{a, b, c}], blades: [{base, tip, w}], triangles, dropped }.
 * Within the budget, trunks come first, then buttresses, then the crown, then
 * limbs and roots; `dropped` counts parts that didn't fit (the tests want 0).
 */
export function plantForm(species, variant) {
  const sp = SPECIES[species];
  const r = mulberry32(hashString(`${species}:${variant}`));
  const out = { segments: [], leaves: [], bulbs: [], cones: [], fins: [], blades: [], triangles: 0, dropped: 0 };
  const take = (n) => { if (out.triangles + n > PLANT_TRIANGLES) { out.dropped++; return false; } out.triangles += n; return true; };

  if (sp.build) {
    const parts = sp.build(r);
    const crown = { bulbs: [], cones: [], leaves: [], ...parts.crown };
    let top = 0.001;
    for (const s of [...parts.trunk, ...parts.limbs]) top = Math.max(top, s.a[1], s.b[1]);
    for (const b of crown.bulbs) top = Math.max(top, b.p[1] + b.r * b.sy);
    for (const c of crown.cones) top = Math.max(top, c.y1);
    for (const l of crown.leaves) top = Math.max(top, l.a[1], l.b[1]);
    const k = 1 / top, sc = (v) => v.map((x) => x * k);
    const addSeg = (s) => { if (take(cost.segment(s))) out.segments.push({ ...s, a: sc(s.a), b: sc(s.b), r0: s.r0 * k, r1: s.r1 * k }); };
    parts.trunk.forEach(addSeg);
    for (const f of parts.fins) if (take(cost.fin())) out.fins.push({ a: sc(f.a), b: sc(f.b), c: sc(f.c) });
    for (const b of crown.bulbs) if (take(cost.bulb(b))) out.bulbs.push({ ...b, p: sc(b.p), r: b.r * k });
    for (const c of crown.cones) if (take(cost.cone(c))) out.cones.push({ cx: 0, cz: 0, ...c, y0: c.y0 * k, y1: c.y1 * k, r: c.r * k });
    for (const l of crown.leaves) if (take(cost.leaf())) out.leaves.push({ a: sc(l.a), b: sc(l.b), w: l.w });
    parts.limbs.forEach(addSeg);
  } else if (sp.ls) {
    const str = expand(sp.ls.axiom, sp.ls.rules, sp.ls.iterations, r, 600);
    const t = turtle(str, { length: 1, ...sp.ls.opts }, r);
    const bulbs = t.bulbs.map((b) => ({ p: b.p, r: b.r * sp.bulb }));
    let top = 0.001;
    for (const s of t.segments) top = Math.max(top, s.b[1], s.a[1]);
    for (const b of bulbs) top = Math.max(top, b.p[1] + b.r * sp.bulbY);
    const k = 1 / top;
    const addSeg = (s) => { if (take(6)) out.segments.push({ a: s.a.map((x) => x * k), b: s.b.map((x) => x * k), r0: s.r0 * k, r1: s.r1 * k, sides: 3, wood: true }); };
    t.segments.filter((s) => s.depth === 0).forEach(addSeg);
    for (const b of bulbs) if (take(8)) out.bulbs.push({ p: b.p.map((x) => x * k), r: b.r * k * range(r, 0.9, 1.15), sy: sp.bulbY, sides: 4 });
    t.segments.filter((s) => s.depth > 0).forEach(addSeg);
  } else if (sp.blades) {
    for (let i = 0; i < sp.blades; i++) {
      if (!take(cost.blade())) break;
      const a = (i / sp.blades) * Math.PI * 2 + range(r, -0.3, 0.3), lean = range(r, 0.15, 0.45);
      out.blades.push({ base: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], tip: [Math.cos(a) * lean, range(r, 0.7, 1), Math.sin(a) * lean], w: range(r, 0.08, 0.13) });
    }
  } else if (sp.mounds) {
    for (let i = 0; i < sp.mounds; i++) {
      if (!take(8)) break;
      const a = range(r, 0, Math.PI * 2), d = i === 0 ? 0 : range(r, 0.3, 0.7);
      out.bulbs.push({ p: [Math.cos(a) * d, 0.35, Math.sin(a) * d], r: range(r, 0.45, 0.7), sy: 0.6, sides: 4 });
    }
  }
  return out;
}

// Distance tiers. Within NEAR_M of the camera (further for giants) a plant is
// its full shape; beyond it, trees and shrubs become one simple shape grown from
// the same form: a five-sided dome for a broadleaf crown, a spindle to the
// ground for conifers and cacti, out to their `far`.
// Grass and moss have no far shape: they just stop.
export const NEAR_M = 250;
export const GROUND_COVER_M = 400; // grass and moss, from the camera
export const MID_TRIANGLES = 10; // at most: a five-sided dome (conifers and cacti: a three-sided spindle, 6)

/**
 * Which tier a plant draws at: "near", "mid", or null (not at all). scale
 * (0..1, from the detail governor) shortens how far trees and shrubs reach.
 */
export function lodFor(species, fromCreature, fromCamera, scale = 1, height = 0) {
  const sp = SPECIES[species];
  if (sp.blades || sp.mounds) return fromCreature <= sp.far && fromCamera <= GROUND_COVER_M ? "near" : null;
  if (fromCreature > Math.max(NEAR_M, sp.far * scale)) return null;
  // Giants keep their full shape further out, so a sequoia doesn't pop at 250 m.
  return fromCamera <= Math.max(NEAR_M, height * 6) ? "near" : "mid";
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
  for (const c of form.cones) pts.push([c.cx || 0, c.y0, c.cz || 0, c.r], [c.cx || 0, c.y1, c.cz || 0, 0]);
  // Green stems (a cactus) are the body itself, not wood hidden under a crown.
  const body = form.segments.length > 0 && form.segments.every((s) => !s.wood);
  if (body || !pts.length) for (const s of form.segments) pts.push([...s.a, s.r0], [...s.b, s.r1]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const top = Math.min(1, Math.max(...pts.map((p) => p[1])));
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[2] - cz) + p[3]));
  let ringY;
  if (!body && (form.bulbs.length || form.leaves.length)) {
    const ys = [...form.bulbs.map((b) => b.p[1]), ...form.leaves.flatMap((l) => [l.a[1], l.b[1]])];
    ringY = ys.reduce((t, y) => t + y, 0) / ys.length;
  } else if (form.cones.length) ringY = Math.min(...form.cones.map((c) => c.y0));
  else ringY = 0.55 * top;
  ringY = Math.min(ringY, top * 0.9);
  // A broadleaf crown seen from afar is a dome; its trunk is far below a pixel.
  // Conifers and cacti keep a spindle down to the ground.
  const crowned = !body && !form.cones.length && (form.bulbs.length > 0 || form.leaves.length > 0);
  const under = crowned ? Math.min(...form.bulbs.map((b) => b.p[1] - b.r * b.sy), ...form.leaves.map((l) => Math.min(l.a[1], l.b[1]))) : 0;
  return { ringY, r, top, cx, cz, bottom: crowned ? Math.max(0, Math.min(under, ringY - 0.05)) : 0, sides: crowned ? 5 : 3 };
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
