// An avatar is a body graph, not a mesh: a few low-poly primitives joined to a
// body. Pure data, seeded, capped at 256 triangles. creature.js turns it into
// three.js meshes and animates it from the body and the motion.
import { mulberry32, range, int, pick } from "./rng.js";

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

const hsl = (h, s, l) => ({ h: ((h % 1) + 1) % 1, s, l });

/** Generate a creature from a seed. Unhinged within the budget. */
export function generateCreature(seed) {
  const rand = mulberry32(seed);
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
  const base = rand();
  const palette = [
    hsl(base, range(rand, 0.6, 1), range(rand, 0.45, 0.6)),
    hsl(base + range(rand, 0.25, 0.5), range(rand, 0.7, 1), range(rand, 0.5, 0.65)),
    hsl(base + range(rand, 0.5, 0.8), range(rand, 0.7, 1), range(rand, 0.55, 0.7)),
    hsl(rand(), 1, range(rand, 0.6, 0.75)),
  ];
  const color = () => pick(rand, palette);

  // Body: stretched in three directions. Forward is -z.
  const bodyPrim = pick(rand, ["ico", "octa", "box", "cone4", "ico"]);
  const body = { x: range(rand, 2.5, 5), y: range(rand, 2, 4.5), z: range(rand, 3.5, 8) };
  add({ kind: "body", prim: bodyPrim, pos: [0, 0, 0], size: [body.x, body.y, body.z], rot: [bodyPrim === "cone4" ? -Math.PI / 2 : 0, 0, 0], color: palette[0] });

  // Head(s): usually one, sometimes not, sometimes three.
  const heads = pick(rand, [1, 1, 1, 1, 0, 2, 3]);
  const headPos = [];
  for (let i = 0; i < heads; i++) {
    const r = range(rand, 1.2, 2.6);
    const p = [range(rand, -1, 1) * (heads > 1 ? body.x * 0.6 : 0), body.y * range(rand, 0.1, 0.6), -body.z * 0.55 - r * 0.6];
    if (add({ kind: "head", prim: pick(rand, ["tetra", "octa", "ico", "box"]), pos: p, size: [r, r, r], rot: [rand(), rand(), rand()], color: color() })) headPos.push({ p, r });
  }

  // Eyes: any number, on heads or, failing that, on the body.
  const eyes = int(rand, 0, 9);
  for (let i = 0; i < eyes; i++) {
    const h = headPos.length ? pick(rand, headPos) : { p: [0, body.y * 0.4, -body.z * 0.5], r: 1.5 };
    const e = range(rand, 0.25, 0.7);
    add({ kind: "eye", prim: "tetra", pos: [h.p[0] + range(rand, -1, 1) * h.r * 0.7, h.p[1] + range(rand, 0, 1) * h.r * 0.6, h.p[2] - h.r * 0.6], size: [e, e, e], rot: [rand(), rand(), rand()], color: hsl(rand(), 1, pick(rand, [0.9, 0.15, 0.6])) });
  }

  // Wings: zero to four pairs. They flap; that's all the animation they need.
  const wingPairs = pick(rand, [0, 1, 1, 1, 2, 2, 3, 4]);
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
  const legPairs = pick(rand, [0, 1, 2, 2, 2, 3, 4]);
  const legLen = range(rand, 2, 6);
  for (let i = 0; i < legPairs; i++) {
    const z = -body.z * 0.35 + (i / Math.max(1, legPairs - 1)) * body.z * 0.7;
    for (const side of [-1, 1]) {
      add({ kind: "leg", prim: "cone3", side, pos: [side * body.x * 0.4, -body.y * 0.4, legPairs === 1 ? 0 : z], size: [0.6, legLen, 0.6], rot: [Math.PI, 0, 0], color: color(), phase: i * Math.PI * 0.5 + (side > 0 ? Math.PI : 0) });
    }
  }

  // Tail: a chain of cones.
  const tail = int(rand, 0, 4);
  for (let i = 0; i < tail; i++) {
    const s = range(rand, 1, 2.5) * (1 - i * 0.18);
    add({ kind: "tail", prim: pick(rand, ["cone3", "cone4"]), pos: [0, 0, body.z * 0.5 + i * s * 1.6 + s], size: [s, s * 2.2, s], rot: [Math.PI / 2, 0, 0], color: color(), phase: i * 0.7 });
  }

  // Horns and spikes, until the budget or the mood runs out.
  const spikes = int(rand, 0, 10);
  for (let i = 0; i < spikes; i++) {
    const s = range(rand, 0.5, 1.8);
    add({ kind: "spike", prim: "cone3", pos: [range(rand, -1, 1) * body.x * 0.5, body.y * range(rand, 0.3, 0.6), range(rand, -0.5, 0.5) * body.z], size: [s * 0.5, s * 2.5, s * 0.5], rot: [range(rand, -0.6, 0.6), 0, range(rand, -0.6, 0.6)], color: color() });
  }

  return { seed, parts, triangles: tris, palette, scale: range(rand, 0.8, 1.6) };
}
