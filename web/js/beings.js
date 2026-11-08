// Sky beings: eldritch, sparkling, slow and gentle (Jason, 11-08: "they don't,
// anatomically, have to be whales; Eldritch monstrosities made of l-systems
// are cute as long as they sparkle and move slowly and gently").
//
// Each one grows from a seeded L-system. They drift along the ley lines on a
// schedule that is a pure function of the real clock, so every player sees the
// same being in the same place at the same moment, with no network and no
// stored state.
import { expand, turtle } from "./lsystem.js";
import { mulberry32, hashString, range, int, pick } from "./rng.js";

export const SPACING = 240000; // metres between beings along a line
export const SPEED = 25; // metres per second: about a body length every 40 s
export const TRIANGLE_BUDGET = 1600; // per being: big, but still low poly

// Body plans. Each returns a grammar for a seeded rand.
const PLANS = {
  // A lantern with hanging tentacles and a crown of fronds.
  lantern: (r) => {
    const n = int(r, 4, 8);
    const tent = "&&&&T";
    let axiom = "O";
    for (let i = 0; i < n; i++) axiom += `[${tent}]` + "/".repeat(int(r, 2, 3));
    axiom += "[^^C][^^/C][^^\\C]";
    return {
      axiom, iterations: int(r, 4, 6),
      rules: { T: [["F!T", 3], ["F[+O]T", 1], ["F[-!T]T", 1]], C: [["F[+C][-C]", 2], ["FO", 1]] },
      opts: { angle: range(r, 14, 26), length: 1, lengthDecay: 0.88, radius: 0.12, radiusDecay: 0.8, jitter: 9 },
      orient: "hang",
    };
  },
  // A floating coral crown with lanterns at its tips.
  coral: (r) => ({
    axiom: "X", iterations: int(r, 3, 4),
    rules: { X: [["F[+X][-X][&X][^X]O", 2], ["F[+X]/[&X]FX", 2], ["F[\\X][/X]O", 1]], F: [["FF", 1], ["F", 3]] },
    opts: { angle: range(r, 22, 36), length: 1, lengthDecay: 0.78, radius: 0.16, radiusDecay: 0.72, jitter: 12 },
    orient: "up",
  }),
  // A phyllotaxis spiral of eyes on a slowly curling stalk.
  spiral: (r) => ({
    axiom: "A", iterations: int(r, 14, 26),
    rules: { A: "F/[&&!fO]^A" },
    opts: { angle: 137.5 / 4, length: 0.55, lengthDecay: 0.97, radius: 0.1, radiusDecay: 0.95, jitter: 3 },
    orient: "side",
  }),
  // Many-armed and radially symmetric, eyes all along the arms.
  bloom: (r) => {
    const arms = int(r, 5, 9);
    let axiom = "O";
    for (let i = 0; i < arms; i++) axiom += "[&&&E]" + "/".repeat(3);
    return {
      axiom, iterations: int(r, 3, 5),
      rules: { E: [["F[+E]O[-E]", 2], ["FFO", 1], ["F!E", 2]] },
      opts: { angle: range(r, 18, 30), length: 1, lengthDecay: 0.82, radius: 0.12, radiusDecay: 0.78, jitter: 8 },
      orient: "flat",
    };
  },
};
export const PLAN_NAMES = Object.keys(PLANS);

/** Grow a being from a seed: geometry in metres, plus its palette and motion. */
export function generateBeing(seed) {
  const r = mulberry32(seed);
  const plan = pick(r, PLAN_NAMES);
  const g = PLANS[plan](r);
  const str = expand(g.axiom, g.rules, g.iterations, r, 6000);
  const shape = turtle(str, g.opts, r);
  // Fit to the triangle budget: 6 per segment (a three-sided prism), 8 per bulb.
  let tris = 0;
  const segments = [], bulbs = [];
  for (const s of shape.segments) { if (tris + 6 > TRIANGLE_BUDGET) break; segments.push(s); tris += 6; }
  for (const b of shape.bulbs) { if (tris + 8 > TRIANGLE_BUDGET) break; bulbs.push(b); tris += 8; }
  // Scale to hundreds of metres.
  let maxR = 0.001;
  for (const s of segments) maxR = Math.max(maxR, Math.hypot(...s.b));
  for (const b of bulbs) maxR = Math.max(maxR, Math.hypot(...b.p));
  const size = range(r, 350, 1100); // metres, radius
  const k = size / maxR;
  const scale = (p) => [p[0] * k, p[1] * k, p[2] * k];
  const hue = r();
  return {
    seed, plan, size, triangles: tris,
    orient: g.orient,
    segments: segments.map((s) => ({ ...s, a: scale(s.a), b: scale(s.b), r0: s.r0 * k, r1: s.r1 * k })),
    bulbs: bulbs.map((b) => ({ ...b, p: scale(b.p), r: b.r * k })),
    palette: { hue, spread: range(r, 0.15, 0.45), eye: r() },
    altitude: range(r, 500, 1600), // above the highway it follows
    sway: range(r, 0.04, 0.09), // as a fraction of its size
    spin: range(r, -0.02, 0.02), // radians per second
  };
}

/**
 * Which beings are on a line right now, and where. Line i carries
 * floor(L / SPACING) beings, flowing one way (alternating by line). Position is
 * a pure function of unix time in seconds.
 */
export function beingsOnLine(lineIndex, lengthM, unixSeconds) {
  const n = Math.max(1, Math.floor(lengthM / SPACING));
  const gap = lengthM / n;
  const dir = lineIndex % 2 === 0 ? 1 : -1;
  const travel = (dir * SPEED * unixSeconds) % lengthM;
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = (((k * gap + travel) % lengthM) + lengthM) % lengthM;
    out.push({ k, s, dir, seed: hashString(`being:${lineIndex}:${k}`) });
  }
  return out;
}
