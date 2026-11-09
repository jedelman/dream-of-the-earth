// Dream realms (Jason, 11-09: "dream realms are a great idea, reachable by shrines"; then "Dream quests give gems" and,
// of what a quest is, "Gather the lights"). Behind an awake shrine, while its spell holds, a small dreamscape: islands in
// the sky joined by bridges, three lights on the far islands, and, once you've gathered them, a gem at the heart. Seeded
// by the shrine and the moon: the same dream for everyone who goes in this moon, a new one the next. Each colour of shrine
// dreams its own way: rose (shape) islands breathe, cyan (sight) islands hide in mist, gold (world) islands turn like a
// clock. Every bridge is gentle enough for a creature with no climb at all. Pure, so Node can test it.
import { mulberry32, hashString } from "./rng.js";
import { lunationOf } from "./moon.js";

/** Where a dream hangs: this high over the shrine (m above sea level), over the weather. */
export const REALM_ALT = 2400;
export const BRIDGE_W = 3; // wide enough to walk without watching your feet
/** Steepest bridge (rise over run): under tan 18°, a creature with no climb's limit. */
export const BRIDGE_SLOPE = 0.28;
/** How near a light (or the gem) gathers it, metres. */
export const GATHER_M = 2.4;
/** The gold realm turns this fast about its heart (rad/s): a slow clock. */
export const TURN = 0.025;
export const LIGHTS = 3;

/** What each colour's dream is called, the gem it gives, and its twist. */
export const REALMS = {
  shape: { name: "the dream of islands", gem: "rosegem", twist: "breathe" },
  camera: { name: "the dream of mist", gem: "cyangem", twist: "mist" },
  world: { name: "the dream of the clock", gem: "goldgem", twist: "turn" },
};

/**
 * A dream's shape: { seed, kind, tier, islands: [{ x, y, z, r, depth, phase }], bridges: [{ a, b }], lights: [island index],
 * heart: island index (0) }. key: the shrine's; kind: its spell's kind; t: now (s), for the moon; tier: how deep (more
 * islands, further lights).
 */
export function realmLayout(key, kind, t, tier = 1) {
  const seed = hashString(`dream:${key}:${lunationOf(t)}:${tier}`), rand = mulberry32(seed);
  const islands = [{ x: 0, y: 0, z: 0, r: 7, depth: 0, phase: 0, parent: -1 }];
  const want = 9 + 4 * tier;
  for (let tries = 0; islands.length < want && tries < 600; tries++) {
    const pi = Math.floor(rand() * islands.length), p = islands[pi];
    if (p.depth >= 3 + 2 * tier) continue;
    const a = rand() * Math.PI * 2, len = 12 + rand() * 12, r = 3.5 + rand() * 4;
    const d = p.r + len + r, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (islands.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 5)) continue;
    // The bridge mustn't cross another island.
    if (islands.some((q, qi) => qi !== pi && segPointDist(p.x, p.z, x, z, q.x, q.z) < q.r + BRIDGE_W)) continue;
    const dy = ((rand() * 2 - 0.8) / 1.2) * len * BRIDGE_SLOPE * 0.9; // a little more often up than down
    islands.push({ x, y: p.y + dy, z, r, depth: p.depth + 1, phase: rand() * Math.PI * 2, parent: pi });
  }
  const bridges = islands.slice(1).map((q, i) => ({ a: q.parent, b: i + 1 }));
  // The lights: on the furthest islands, kept apart.
  const order = islands.map((q, i) => i).slice(1).sort((i, j) => islands[j].depth - islands[i].depth || Math.hypot(islands[j].x, islands[j].z) - Math.hypot(islands[i].x, islands[i].z));
  const lights = [];
  for (const i of order) {
    if (lights.length >= LIGHTS + tier - 1) break;
    if (lights.every((j) => Math.hypot(islands[i].x - islands[j].x, islands[i].z - islands[j].z) > 25)) lights.push(i);
  }
  for (const i of order) { if (lights.length >= LIGHTS + tier - 1) break; if (!lights.includes(i)) lights.push(i); }
  return { seed, kind, tier, islands, bridges, lights, heart: 0 };
}

function segPointDist(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const u = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return Math.hypot(ax + dx * u - px, az + dz * u - pz);
}

/** How far an island has risen or sunk at t (the rose dream breathes; the others are still). */
export const lift = (L, i, t) => (REALMS[L.kind].twist === "breathe" ? Math.sin(t * 0.55 + L.islands[i].phase) * 0.7 : 0);
/** How far the gold dream has turned at t (radians). */
export const turned = (L, t) => (REALMS[L.kind].twist === "turn" ? t * TURN : 0);

/** A point in the dream's own frame, from one in the realm's local frame (undoing the clock's turn). */
export function unturn(L, x, z, t) {
  const a = -turned(L, t), c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - z * s, z: x * s + z * c };
}
/** A point on an island or a bridge, from the dream's frame to the realm's local frame (applying the turn). */
export function returnTo(L, x, z, t) {
  const a = turned(L, t), c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - z * s, z: x * s + z * c };
}

/** Where island i (or its light) is now, in the realm's local frame: { x, y, z }. */
export function islandAt(L, i, t) {
  const q = L.islands[i], p = returnTo(L, q.x, q.z, t);
  return { x: p.x, y: q.y + lift(L, i, t), z: p.z };
}

/**
 * The floor under (x, z) in the realm's local frame, the highest island or bridge top no more than a small step above y,
 * or -Infinity: nothing there but sky.
 */
export function floorAt(L, x, z, y, t) {
  const p = unturn(L, x, z, t);
  let best = -Infinity;
  L.islands.forEach((q, i) => {
    if (Math.hypot(p.x - q.x, p.z - q.z) > q.r) return;
    const h = q.y + lift(L, i, t);
    if (h <= y + 0.6 && h > best) best = h;
  });
  for (const b of L.bridges) {
    const A = L.islands[b.a], B = L.islands[b.b], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    const u = ((p.x - A.x) * dx + (p.z - A.z) * dz) / L2;
    if (u < 0 || u > 1) continue;
    if (Math.hypot(A.x + dx * u - p.x, A.z + dz * u - p.z) > BRIDGE_W / 2) continue;
    // Level across each island's own ground, a ramp between their rims.
    const d = Math.sqrt(L2), u0 = A.r / d, u1 = 1 - B.r / d, k = Math.max(0, Math.min(1, (u - u0) / (u1 - u0)));
    const ha = A.y + lift(L, b.a, t), hb = B.y + lift(L, b.b, t), h = ha + (hb - ha) * k;
    if (h <= y + 0.6 && h > best) best = h;
  }
  return best;
}

/** The lowest island top: fall this far below it and you wake back on the heart. */
export const lowest = (L) => Math.min(...L.islands.map((q) => q.y));
