// An avatar is a body graph, not a mesh: a few low-poly primitives joined to a
// body. Pure data, seeded, capped at 256 triangles. creature.js turns it into
// three.js meshes and animates it from the body and the motion.
//
// A creature is its seed, plus optional genes: changes its player chose in the
// editor. Each trait grows from its own stretch of the seed's random stream, so
// with no genes a creature is exactly what its seed always made (Nyo is still
// Nyo). A gene re-rolls one trait from a stream of its own, sets how many of a
// part there are, turns the colours round the wheel, or sets the size. The other
// traits keep their own random numbers and only move to fit: re-roll the body and
// the wings stay the same wings, attached to the new body.
import { mulberry32, mulberry32At, range, int, pick } from "./rng.js";

export const TRIANGLE_CAP = 256;

// Triangles each primitive produces in three.js (checked against the built
// geometry at runtime by creature.js).
export const PRIM_TRIS = {
  ico: 20, // IcosahedronGeometry(r, 0)
  octa: 8, // OctahedronGeometry(r, 0)
  tetra: 4, // TetrahedronGeometry(r, 0)
  box: 12, // BoxGeometry
  cone3: 6, // ConeGeometry(r, h, 3): 3 sides + 3 cap
  cone4: 8, // ConeGeometry(r, h, 4)
  wing1: 1, // one flat triangle
  wing2: 2, // a flat quad
};

/** The traits that can be re-rolled, in the order they grow. */
export const TRAITS = ["palette", "body", "heads", "eyes", "wings", "legs", "tail", "spikes"];
/** How many of each part a player may choose (wings and legs in pairs). */
export const COUNTS = { heads: [0, 3], eyes: [0, 9], wings: [0, 4], legs: [0, 4], tail: [0, 4], spikes: [0, 10] };
/** Size, as a percentage of the creature's own units (what a seed rolls lies in this range too). */
export const SIZE = [80, 160];

const hsl = (h, s, l) => ({ h: ((h % 1) + 1) % 1, s, l });
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * Genes from anywhere (the editor, local storage, another player's record), checked: anything out of range or
 * unknown is dropped, the rest kept. { roll?: { trait: uint32 }, count?: { part: n }, hue?: 1..359, size?: 80..160 },
 * or null if nothing is left.
 */
export function parseGenes(v) {
  if (!isObj(v)) return null;
  const out = {};
  if (isObj(v.roll)) {
    const roll = {};
    for (const t of TRAITS) { const x = v.roll[t]; if (Number.isInteger(x) && x >= 0 && x <= 0xffffffff) roll[t] = x; }
    if (Object.keys(roll).length) out.roll = roll;
  }
  if (isObj(v.count)) {
    const count = {};
    for (const [k, [lo, hi]] of Object.entries(COUNTS)) { const x = v.count[k]; if (Number.isInteger(x) && x >= lo && x <= hi) count[k] = x; }
    if (Object.keys(count).length) out.count = count;
  }
  if (Number.isInteger(v.hue) && v.hue > 0 && v.hue < 360) out.hue = v.hue;
  if (Number.isInteger(v.size) && v.size >= SIZE[0] && v.size <= SIZE[1]) out.size = v.size;
  return Object.keys(out).length ? out : null;
}

/** Generate a creature from a seed and (optionally) genes. Unhinged within the budget. */
export function generateCreature(seed, genes = null) {
  const g = parseGenes(genes);
  if (!g) return grow(seed >>> 0, null, null);
  // Where each trait's stretch of the seed's stream starts, from the creature as its seed made it.
  const starts = {};
  grow(seed >>> 0, null, starts);
  return grow(seed >>> 0, g, starts);
}

function grow(seed, g, starts) {
  // Without genes, one stream runs through every trait in order (and records where each trait began).
  // With genes, each trait gets a stream of its own: its re-roll, or the seed's stream from where it began.
  const shared = mulberry32(seed);
  let calls = 0;
  const counted = () => { calls++; return shared(); };
  const streamFor = (trait) => {
    if (!g) { if (starts) starts[trait] = calls; return counted; }
    const roll = g.roll?.[trait];
    return roll !== undefined ? mulberry32(roll) : mulberry32At(seed, starts[trait]);
  };
  // How many of a part: the player's choice if they made one, else what the stream drew (drawn either way, so
  // the numbers after it stay the same).
  const counts = {};
  const chosen = (k, drawn) => (counts[k] = g?.count?.[k] ?? drawn);

  const parts = [];
  let tris = 0;
  const add = (part) => {
    const t = PRIM_TRIS[part.prim];
    if (tris + t > TRIANGLE_CAP) return false;
    parts.push(part);
    tris += t;
    return true;
  };

  // A psychedelic palette: a base hue and wild companions.
  let rand = streamFor("palette");
  const base = rand();
  const palette = [
    hsl(base, range(rand, 0.6, 1), range(rand, 0.45, 0.6)),
    hsl(base + range(rand, 0.25, 0.5), range(rand, 0.7, 1), range(rand, 0.5, 0.65)),
    hsl(base + range(rand, 0.5, 0.8), range(rand, 0.7, 1), range(rand, 0.55, 0.7)),
    hsl(rand(), 1, range(rand, 0.6, 0.75)),
  ];
  if (g?.hue) for (const c of palette) c.h = (c.h + g.hue / 360) % 1; // turned round the colour wheel
  const color = () => pick(rand, palette);

  // Body: stretched in three directions. Forward is -z.
  rand = streamFor("body");
  const bodyPrim = pick(rand, ["ico", "octa", "box", "cone4", "ico"]);
  const body = { x: range(rand, 2.5, 5), y: range(rand, 2, 4.5), z: range(rand, 3.5, 8) };
  add({ kind: "body", prim: bodyPrim, pos: [0, 0, 0], size: [body.x, body.y, body.z], rot: [bodyPrim === "cone4" ? -Math.PI / 2 : 0, 0, 0], color: palette[0] });

  // Head(s): usually one, sometimes not, sometimes three.
  rand = streamFor("heads");
  const heads = chosen("heads", pick(rand, [1, 1, 1, 1, 0, 2, 3]));
  const headPos = [];
  for (let i = 0; i < heads; i++) {
    const r = range(rand, 1.2, 2.6);
    const p = [range(rand, -1, 1) * (heads > 1 ? body.x * 0.6 : 0), body.y * range(rand, 0.1, 0.6), -body.z * 0.55 - r * 0.6];
    if (add({ kind: "head", prim: pick(rand, ["tetra", "octa", "ico", "box"]), pos: p, size: [r, r, r], rot: [rand(), rand(), rand()], color: color() })) headPos.push({ p, r });
  }

  // Eyes: any number, on heads or, failing that, on the body.
  rand = streamFor("eyes");
  const eyes = chosen("eyes", int(rand, 0, 9));
  for (let i = 0; i < eyes; i++) {
    const h = headPos.length ? pick(rand, headPos) : { p: [0, body.y * 0.4, -body.z * 0.5], r: 1.5 };
    const e = range(rand, 0.25, 0.7);
    add({ kind: "eye", prim: "tetra", pos: [h.p[0] + range(rand, -1, 1) * h.r * 0.7, h.p[1] + range(rand, 0, 1) * h.r * 0.6, h.p[2] - h.r * 0.6], size: [e, e, e], rot: [rand(), rand(), rand()], color: hsl(rand(), 1, pick(rand, [0.9, 0.15, 0.6])) });
  }

  // Wings: zero to four pairs. They flap; that's all the animation they need.
  rand = streamFor("wings");
  const wingPairs = chosen("wings", pick(rand, [0, 1, 1, 1, 2, 2, 3, 4]));
  for (let i = 0; i < wingPairs; i++) {
    const span = range(rand, 4, 12), chord = range(rand, 2, 6);
    const prim = pick(rand, ["wing1", "wing2"]);
    const z = -body.z * 0.3 + i * (body.z * 0.5 / Math.max(1, wingPairs - 1 || 1));
    const c = color();
    for (const side of [-1, 1]) {
      add({ kind: "wing", prim, side, pos: [side * body.x * 0.45, body.y * range(rand, 0.1, 0.5), z], size: [span, chord, 1], rot: [0, 0, 0], color: c, phase: i * 0.6 });
    }
  }

  // Legs: in pairs, zero to four pairs.
  rand = streamFor("legs");
  const legPairs = chosen("legs", pick(rand, [0, 1, 2, 2, 2, 3, 4]));
  const legLen = range(rand, 2, 6);
  for (let i = 0; i < legPairs; i++) {
    const z = -body.z * 0.35 + (i / Math.max(1, legPairs - 1)) * body.z * 0.7;
    for (const side of [-1, 1]) {
      add({ kind: "leg", prim: "cone3", side, pos: [side * body.x * 0.4, -body.y * 0.4, legPairs === 1 ? 0 : z], size: [0.6, legLen, 0.6], rot: [Math.PI, 0, 0], color: color(), phase: i * Math.PI * 0.5 + (side > 0 ? Math.PI : 0) });
    }
  }

  // Tail: a chain of cones.
  rand = streamFor("tail");
  const tail = chosen("tail", int(rand, 0, 4));
  for (let i = 0; i < tail; i++) {
    const s = range(rand, 1, 2.5) * (1 - i * 0.18);
    add({ kind: "tail", prim: pick(rand, ["cone3", "cone4"]), pos: [0, 0, body.z * 0.5 + i * s * 1.6 + s], size: [s, s * 2.2, s], rot: [Math.PI / 2, 0, 0], color: color(), phase: i * 0.7 });
  }

  // Horns and spikes, until the budget or the mood runs out.
  rand = streamFor("spikes");
  const spikes = chosen("spikes", int(rand, 0, 10));
  for (let i = 0; i < spikes; i++) {
    const s = range(rand, 0.5, 1.8);
    add({ kind: "spike", prim: "cone3", pos: [range(rand, -1, 1) * body.x * 0.5, body.y * range(rand, 0.3, 0.6), range(rand, -0.5, 0.5) * body.z], size: [s * 0.5, s * 2.5, s * 0.5], rot: [range(rand, -0.6, 0.6), 0, range(rand, -0.6, 0.6)], color: color() });
  }

  rand = streamFor("size");
  const rolled = range(rand, SIZE[0] / 100, SIZE[1] / 100);
  // counts: how many of each part it asked for (wings and legs in pairs; past the triangle cap some aren't built).
  return { seed, parts, triangles: tris, palette, scale: g?.size ? g.size / 100 : rolled, counts };
}
