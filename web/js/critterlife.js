// Small creatures: bunnies, frogs and little birds (Jason, 11-09: "Maybe we could add small creatures? Bunnies and
// frogs and little birds"). Where they live and how they move, pure, so Node can test it; critters.js draws them.
//
// Each lives around a home on the global cell grid, chosen by biome, and goes about its day on the shared clock: a
// bunny sits and nibbles, then hops somewhere new; a frog sits, then leaps; a little bird pecks about on the ground
// and now and then flies off to another spot or up into a tree. So everyone sees the same bunny in the same place.
// Only what they do about *you* is local: rush at one and it bolts (a bunny), leaps away (a frog) or takes off (a
// bird), then comes back to its day.
import { cellsAround, unit, hash2 } from "./plantforms.js";

// Dream-sized, like the butterflies (3-5 m wingspans). Since creatures shrank (11-09: Nyo about 5 m long), a bunny
// comes up to half of you, which is bigger for its size than before. range: how far from home it wanders (m);
// startle: how near you can rush (m).
export const KINDS = {
  bunny: { cell: 55, radius: 260, salt: 811, max: 48, size: [2.1, 3], range: 12, startle: 24 },
  frog: { cell: 45, radius: 200, salt: 823, max: 40, size: [1.4, 2], range: 7, startle: 14 },
  bird: { cell: 50, radius: 260, salt: 837, max: 60, size: [1.3, 1.8], range: 14, startle: 26 },
};
export const CRITTER_TRIANGLES = { bunny: 26, frog: 20, bird: 13 };
/** How likely a home cell is to hold each, by biome (0 = never). Frogs like it wet, bunnies open, birds everywhere with plants. */
export const CHANCE = {
  rainforest: { bunny: 0, frog: 0.6, bird: 0.7 },
  savanna: { bunny: 0.3, frog: 0.08, bird: 0.45 },
  desert: { bunny: 0.15, frog: 0, bird: 0.12 },
  colddesert: { bunny: 0.2, frog: 0, bird: 0.1 },
  steppe: { bunny: 0.5, frog: 0.03, bird: 0.25 },
  coldsteppe: { bunny: 0.45, frog: 0.03, bird: 0.2 },
  mediterranean: { bunny: 0.45, frog: 0.15, bird: 0.5 },
  subtropical: { bunny: 0.2, frog: 0.4, bird: 0.6 },
  highland: { bunny: 0.35, frog: 0.15, bird: 0.45 },
  oceanic: { bunny: 0.45, frog: 0.25, bird: 0.55 },
  continental: { bunny: 0.4, frog: 0.25, bird: 0.55 },
  taiga: { bunny: 0.25, frog: 0.1, bird: 0.45 },
  tundra: { bunny: 0.3, frog: 0, bird: 0.2 },
  ice: { bunny: 0, frog: 0, bird: 0 },
};

// Looks, by biome: [name, body hsl, accent hsl]. Accent: a bunny's tail and belly, a frog's belly, a bird's breast.
const LOOKS = {
  bunny: (biome, u) =>
    biome === "tundra" || biome === "taiga" ? ["snow hare", [0.6, 0.1, 0.93], [0.6, 0.05, 0.99]]
    : biome === "desert" || biome === "colddesert" || biome === "savanna" ? ["jackrabbit", [0.08, 0.35, 0.62], [0.1, 0.2, 0.9]]
    : [["bunny", [0.07, 0.35, 0.45], [0.1, 0.2, 0.95]], ["bunny", [0.6, 0.06, 0.6], [0.6, 0.05, 0.95]], ["bunny", [0.1, 0.35, 0.8], [0.1, 0.2, 0.97]]][Math.floor(u * 3)],
  frog: (biome, u) =>
    biome === "rainforest" || biome === "subtropical"
      ? [["blue tree frog", [0.58, 0.9, 0.55], [0.15, 0.9, 0.55]], ["red tree frog", [0.99, 0.85, 0.55], [0.6, 0.8, 0.5]], ["yellow tree frog", [0.14, 0.95, 0.55], [0.0, 0.0, 0.12]], ["green tree frog", [0.3, 0.85, 0.5], [0.08, 0.9, 0.6]]][Math.floor(u * 4)]
      : [["frog", [0.27, 0.55, 0.42], [0.15, 0.4, 0.8]], ["frog", [0.2, 0.4, 0.35], [0.12, 0.3, 0.75]], ["toad", [0.09, 0.35, 0.4], [0.1, 0.3, 0.7]]][Math.floor(u * 3)],
  bird: (biome, u) => {
    const bright = biome === "rainforest" || biome === "subtropical" || biome === "savanna";
    const set = bright
      ? [["little blue bird", [0.58, 0.9, 0.55], [0.12, 0.95, 0.6]], ["little red bird", [0.99, 0.85, 0.5], [0.0, 0.0, 0.15]], ["little yellow bird", [0.15, 0.95, 0.55], [0.3, 0.6, 0.35]], ["little green bird", [0.33, 0.8, 0.45], [0.95, 0.8, 0.6]]]
      : biome === "tundra" || biome === "ice" ? [["little snow bird", [0.6, 0.05, 0.92], [0.08, 0.3, 0.35]]]
      : [["little brown bird", [0.08, 0.35, 0.4], [0.05, 0.75, 0.55]], ["little grey bird", [0.6, 0.08, 0.55], [0.15, 0.8, 0.6]], ["little blue bird", [0.6, 0.6, 0.5], [0.1, 0.25, 0.9]], ["little black bird", [0.7, 0.1, 0.15], [0.1, 0.9, 0.55]]];
    return set[Math.floor(u * set.length)];
  },
};

/**
 * Small creatures of one kind near a point: [{ kind, x, z, h (ground), seed, size, name, body, accent, key }].
 * at(cell) -> { p: { x, z }, h, biomeId } or null (the sea, say), as for insects.
 */
export function critterHomes(kind, lat, lon, at) {
  const K = KINDS[kind], out = [];
  for (const c of cellsAround(lat, lon, K.radius, K.cell, K.salt)) {
    const s = at(c);
    if (!s || !CHANCE[s.biomeId]) continue;
    if (unit(c.h) >= CHANCE[s.biomeId][kind]) continue;
    if (kind === "frog" && s.h > 1200) continue; // not up a mountain
    const g = hash2(c.h, 5);
    const [name, body, accent] = LOOKS[kind](s.biomeId, unit(g, 3));
    out.push({ kind, x: s.p.x, z: s.p.z, h: s.h, seed: unit(c.h, 12), size: K.size[0] + (K.size[1] - K.size[0]) * unit(g, 17), name, body, accent, key: `${kind}${c.h}` });
    if (out.length >= K.max) break;
  }
  return out;
}

// ---- Their day, on the shared clock ----
const frac = (x) => x - Math.floor(x);
const smooth = (u) => u * u * (3 - 2 * u);
/** A spot around home for step k: within range metres, the same on every phone. */
function spot(c, k) {
  const g = hash2(Math.floor(c.seed * 1e6), k | 0, 97);
  const a = unit(g) * Math.PI * 2, r = KINDS[c.kind].range * Math.sqrt(unit(g, 16));
  return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
}
const PERIOD = { bunny: 6, frog: 9, bird: 7 };
const MOVE = { bunny: 1.1, frog: 0.7, bird: 1.6 };

/**
 * Where a small creature is at time t (s, the shared clock): { x, z, lift (m above the ground), yaw (radians, 0 =
 * facing -z), squash (1 = at rest), flap (bird wings, radians), pitch (a peck, a crouch), moving, flying }.
 * perch(c): a tree top { x, z, y (above ground) } a bird may fly up into, or null.
 */
export function idleAt(c, t, perch = null) {
  const P = PERIOD[c.kind] * (0.8 + 0.4 * c.seed), phase = c.seed * 97;
  const u = (t + phase) / P, k = Math.floor(u), f = frac(u);
  const move = Math.min(0.45, MOVE[c.kind] / P); // the part of each period spent getting somewhere
  const birdUp = c.kind === "bird" && perch && unit(hash2(Math.floor(c.seed * 1e6), k, 61)) < 0.35; // this time, up into the tree
  const birdWasUp = c.kind === "bird" && perch && unit(hash2(Math.floor(c.seed * 1e6), k - 1, 61)) < 0.35;
  const from = birdWasUp ? { x: perch.x, z: perch.z } : spot(c, k - 1), to = birdUp ? { x: perch.x, z: perch.z } : spot(c, k);
  const fromLift = birdWasUp ? perch.y : 0, toLift = birdUp ? perch.y : 0;
  const yawTo = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  if (f < move) {
    const m = f / move;
    const x = from.x + (to.x - from.x) * smooth(m), z = from.z + (to.z - from.z) * smooth(m);
    if (c.kind === "bunny") {
      const hops = 3, hp = frac(m * hops);
      return { x, z, lift: Math.sin(Math.PI * hp) * 0.7 * c.size, yaw: yawTo, squash: 1 + 0.25 * Math.sin(Math.PI * hp) - (hp > 0.85 ? 0.2 : 0), flap: 0, pitch: -0.25 * Math.sin(Math.PI * hp), moving: true, flying: false };
    }
    if (c.kind === "frog") {
      const crouch = m < 0.2 ? m / 0.2 : 0, air = m < 0.2 ? 0 : (m - 0.2) / 0.8;
      const xx = from.x + (to.x - from.x) * air, zz = from.z + (to.z - from.z) * air;
      return { x: xx, z: zz, lift: Math.sin(Math.PI * air) * 1.1 * c.size, yaw: yawTo, squash: m < 0.2 ? 1 - 0.3 * crouch : 1.15 - 0.15 * air, flap: 0, pitch: m < 0.2 ? 0.2 * crouch : -0.35 * Math.cos(Math.PI * air), moving: true, flying: false };
    }
    // A bird flies: up in an arc, wings beating, then glides down to land.
    const arc = Math.sin(Math.PI * m) * (3 + 3 * c.seed) * c.size;
    return { x, z, lift: fromLift + (toLift - fromLift) * smooth(m) + arc, yaw: yawTo, squash: 1, flap: Math.sin(t * 40 + phase) * (m < 0.8 ? 1 : 0.3), pitch: -0.15, moving: true, flying: true };
  }
  // Sitting: a bunny nibbles, a frog breathes, a bird pecks and turns about.
  const s = (f - move) / (1 - move), yaw = yawTo + (c.kind === "frog" ? 0 : 0.6 * Math.sin(k * 2.3 + c.seed * 9) * smooth(Math.min(1, s * 3)));
  if (c.kind === "bunny") return { ...to, lift: 0, yaw, squash: 1 + 0.03 * Math.sin(t * 9 + phase), flap: 0, pitch: 0.18 * Math.max(0, Math.sin(t * 2.2 + phase)), moving: false, flying: false };
  if (c.kind === "frog") return { ...to, lift: 0, yaw, squash: 1 + 0.06 * Math.sin(t * 3 + phase), flap: 0, pitch: 0, moving: false, flying: false };
  const peck = toLift > 0 ? 0 : Math.max(0, Math.sin(t * 5 + phase)) ** 6 * 0.7;
  return { ...to, lift: toLift, yaw, squash: 1, flap: 0, pitch: peck, moving: false, flying: false };
}

/** How long a startle lasts (s), then how long it takes to come back to its day. */
export const STARTLE_S = { bunny: 2.2, frog: 1.4, bird: 7 }, RETURN_S = 3;

/**
 * Running from you: from where it was (from: { x, z, lift }), away along `away` (a unit { x, z }), `age` seconds in.
 * The same shape of motion as idleAt; null once the startle is over.
 */
export function startledAt(c, from, away, age, t) {
  const D = STARTLE_S[c.kind];
  if (age > D) return null;
  const m = age / D, yaw = Math.atan2(-away.x, -away.z);
  if (c.kind === "bunny") { // three quick bounds, 40 m, then a frozen sit
    const run = Math.min(1, m / 0.6), hp = frac(run * 3);
    const d = 40 * smooth(run);
    return { x: from.x + away.x * d, z: from.z + away.z * d, lift: run < 1 ? Math.sin(Math.PI * hp) * 0.8 * c.size : 0, yaw, squash: run < 1 ? 1.2 : 1, flap: 0, pitch: run < 1 ? -0.3 : 0, moving: run < 1, flying: false };
  }
  if (c.kind === "frog") { // two big leaps
    const leap = Math.min(1, m / 0.9), hp = frac(leap * 2);
    const d = 20 * leap;
    return { x: from.x + away.x * d, z: from.z + away.z * d, lift: leap < 1 ? Math.sin(Math.PI * hp) * 1.2 * c.size : 0, yaw, squash: 1.15, flap: 0, pitch: -0.3, moving: leap < 1, flying: false };
  }
  // A bird bursts up and away, circles, and comes down near where it was.
  const up = Math.min(1, m / 0.25), circle = Math.max(0, (m - 0.25) / 0.75);
  const r = 24, a = circle * Math.PI * 2;
  const cx = from.x + away.x * r, cz = from.z + away.z * r;
  const x = up < 1 ? from.x + away.x * r * smooth(up) : cx - away.x * r * Math.cos(a) + away.z * r * Math.sin(a) * 0.8;
  const z = up < 1 ? from.z + away.z * r * smooth(up) : cz - away.z * r * Math.cos(a) - away.x * r * Math.sin(a) * 0.8;
  const lift = (from.lift || 0) + (22 + 10 * c.seed) * Math.sin(Math.PI * Math.min(1, m * 1.1));
  return { x, z, lift, yaw: up < 1 ? yaw : yaw + a + Math.PI / 2, squash: 1, flap: Math.sin(t * 46) * (circle > 0.85 ? 0.35 : 1), pitch: -0.25, moving: true, flying: true };
}
