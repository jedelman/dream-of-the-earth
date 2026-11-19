// Life under the sea: shoals of little fish and forests of kelp (from the list since 11-08: "maybe kelp and fish
// underwater"). Where they are and how they move, pure, so Node can test it; fish.js draws them.
//
// Like the small creatures on land, each shoal lives round a home on the global cell grid and goes about its day on
// the shared clock, so everyone sees the same shoal in the same water. A shoal swims a slow loop round its home at
// its own depth; rush through it and it bursts apart and gathers again; touch it gently and it swirls round you.
// Only those two are local. Kelp grows in forests on cool, shallow seabeds, reaching for the surface.
import { cellsAround, unit, hash2 } from "./plantforms.js";

// Dream-sized, like everything small: a fish about a third of you. cell/radius in metres; chance: of a sea cell deep
// enough holding a shoal; max: how many at once.
export const SHOAL = { cell: 80, radius: 340, salt: 853, max: 22, chance: 0.45, minDepth: 4, fish: [5, 10], size: [1.1, 1.8] };
export const KELP = { cell: 14, radius: 160, salt: 871, max: 420, depth: [3, 26], lat: [30, 66], warmest: 22, forest: 0.5, chance: 0.6 };
export const FISH_TRIANGLES = 14, KELP_TRIANGLES = 24;

/**
 * Who lives in the sea, by how warm it is: "tropical", "temperate" or "cold". warmth: { cold, warm } (°C, the coldest
 * and warmest monthly means, sst.js), from NOAA's ERSSTv5 since 11-19: reef fish where the coldest month stays at 18 °C
 * or more (about where coral grows), cold-water fish where even the warmest month stays under 10 °C. Before the grid
 * has loaded (or without it), latitude stands in.
 */
export function seaBand(lat, warmth = null) {
  if (warmth) return warmth.cold >= 18 ? "tropical" : warmth.warm < 10 ? "cold" : "temperate";
  const a = Math.abs(lat);
  return a < 28 ? "tropical" : a < 52 ? "temperate" : "cold";
}
/** Kelp needs cool water all year: the warmest month at 22 °C or under (by latitude, before the grid loads: 30° to 66°). */
export const kelpWater = (lat, warmth = null) => (warmth ? warmth.warm <= KELP.warmest : Math.abs(lat) >= KELP.lat[0] && Math.abs(lat) <= KELP.lat[1]);

// Looks, by band: [name, body hsl, accent (belly, fins) hsl].
const LOOKS = {
  tropical: [["little blue reef fish", [0.6, 0.85, 0.5], [0.14, 0.95, 0.55]], ["little yellow reef fish", [0.14, 0.95, 0.55], [0.6, 0.6, 0.45]], ["little orange reef fish", [0.06, 0.95, 0.55], [0.0, 0.0, 0.97]], ["little violet reef fish", [0.78, 0.6, 0.5], [0.15, 0.9, 0.6]]],
  temperate: [["little silver fish", [0.58, 0.12, 0.72], [0.58, 0.05, 0.95]], ["little blue-backed fish", [0.56, 0.55, 0.38], [0.55, 0.1, 0.9]], ["little bronze fish", [0.09, 0.5, 0.45], [0.1, 0.25, 0.85]]],
  cold: [["little ice fish", [0.52, 0.18, 0.85], [0.52, 0.1, 0.97]], ["little grey fish", [0.6, 0.08, 0.5], [0.1, 0.15, 0.85]]],
};

/**
 * Shoals near a point: [{ key, x, z, y (its swimming depth, < 0), floor, n, size, seed, name, body, accent, band }].
 * at(cell) -> { p: { x, z }, floor (the seabed's height, m; < 0 under the sea) } or null.
 */
export function shoalHomes(lat, lon, at, warmth = () => null) {
  const out = [];
  for (const c of cellsAround(lat, lon, SHOAL.radius, SHOAL.cell, SHOAL.salt)) {
    if (unit(c.h) >= SHOAL.chance) continue;
    const s = at(c);
    if (!s || -s.floor < SHOAL.minDepth) continue;
    const g = hash2(c.h, 7), band = seaBand(c.lat, warmth(c.lat, c.lon)), set = LOOKS[band];
    const [name, body, accent] = set[Math.floor(unit(g, 3) * set.length)];
    const size = SHOAL.size[0] + (SHOAL.size[1] - SHOAL.size[0]) * unit(g, 17);
    const top = 1.5 + size * 0.6, bottom = Math.max(top, Math.min(-s.floor - 1.2 - size * 0.5, 30)); // under the surface, over the seabed, not too deep to meet
    const y = -(top + (bottom - top) * unit(c.h, 9));
    const n = SHOAL.fish[0] + Math.floor(unit(g, 11) * (SHOAL.fish[1] - SHOAL.fish[0] + 1));
    out.push({ key: `shoal${c.h}`, x: s.p.x, z: s.p.z, y, floor: s.floor, n: Math.min(n, SHOAL.fish[1]), size, seed: unit(c.h, 12), name, body, accent, band });
    if (out.length >= SHOAL.max) break;
  }
  return out;
}

const smooth = (u) => u * u * (3 - 2 * u);
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
/** How far a shoal's loop reaches from home (m), and how long a lap takes (s). */
export const loopOf = (s) => ({ r: 16 + 16 * s.seed, period: 50 + 40 * s.seed });

/**
 * Where a shoal's middle is at time t (s, the shared clock): { x, y, z, yaw (0 = facing -z) }. A figure of eight
 * round home, bobbing a little, the same on every phone.
 */
export function shoalAt(s, t) {
  const { r, period } = loopOf(s), w = (Math.PI * 2) / period, a = w * t + s.seed * 40;
  const x = s.x + r * Math.sin(a), z = s.z + r * 0.6 * Math.sin(2 * a);
  const dx = r * w * Math.cos(a), dz = r * 0.6 * 2 * w * Math.cos(2 * a);
  return { x, y: s.y + 0.6 * Math.sin(a * 3 + s.seed * 9), z, yaw: Math.atan2(-dx, -dz) };
}

/**
 * One fish of a shoal at time t: { x, y, z, yaw, pitch, wag (tail phase, radians) }. Each keeps its own place in the
 * shoal, drifting about it. burst: 0..1, how far it's been scattered (a rush); swirl: 0..1, how far round you it has
 * swum (a touch); me: where you are, for the swirl.
 */
export function fishAt(s, i, t, burst = 0, swirl = 0, me = null) {
  const mid = shoalAt(s, t), g = hash2(Math.floor(s.seed * 1e6), i, 29);
  const spread = s.size * (1.2 + 0.35 * Math.sqrt(s.n));
  // A place in the shoal: a lens wider than it is tall, slowly wandering.
  const a0 = unit(g) * Math.PI * 2, r0 = Math.sqrt(unit(g, 16)) * spread, h0 = (unit(g, 8) - 0.5) * spread * 0.5;
  const drift = 0.25 * Math.sin(t * (0.4 + unit(g, 4) * 0.3) + i);
  let ox = Math.cos(a0 + drift) * r0, oz = Math.sin(a0 + drift) * r0, oy = h0 + 0.3 * Math.sin(t * 0.7 + i * 1.7);
  let yaw = mid.yaw + 0.25 * Math.sin(t * 0.9 + i * 2.1), pitch = 0;
  let cx = mid.x, cy = mid.y, cz = mid.z, wagRate = 9 + 3 * unit(g, 2);
  if (swirl > 0 && me) {
    // Round you, once, then back to the shoal's own way.
    const k = Math.sin(Math.PI * swirl), ring = 5 + s.size * 2 + r0 * 0.5;
    const ang = a0 + Math.PI * 2 * smooth(swirl) * 1.5;
    const sx = me.x + Math.cos(ang) * ring, sz = me.z + Math.sin(ang) * ring, sy = me.y + h0 * 0.5;
    cx += (sx - (cx + ox)) * k; cz += (sz - (cz + oz)) * k; cy += (sy - (cy + oy)) * k;
    yaw += wrapAngle(Math.atan2(Math.sin(ang), -Math.cos(ang)) - yaw) * k; // along the ring, the short way round
    wagRate += 8 * k;
  }
  if (burst > 0) {
    // Outward from the middle, each its own way, then gathering again.
    const out = 1 + 6 * burst, L = Math.hypot(ox, oz) || 1;
    ox *= out; oz *= out; oy *= 1 + 2 * burst;
    yaw = burst > 0.05 ? Math.atan2(-ox / L, -oz / L) : yaw;
    pitch = (unit(g, 6) - 0.5) * 0.6 * burst;
    wagRate += 18 * burst;
  }
  return { x: cx + ox, y: Math.min(-0.6, cy + oy), z: cz + oz, yaw, pitch, wag: t * wagRate + i * 1.3 };
}

/** A rush through a shoal: how scattered it is `age` seconds on (0..1); quick out, slow back. 0 once over. */
export const BURST_S = 4.5;
export function burstAt(age) {
  if (age < 0 || age >= BURST_S) return 0;
  return age < 0.35 ? smooth(age / 0.35) : (1 - (age - 0.35) / (BURST_S - 0.35)) ** 2;
}
/** A touch: how far round you the shoal has swum (0..1), `age` seconds on; null once over. */
export const SWIRL_S = 3.2;
export const swirlAt = (age) => (age < 0 || age >= SWIRL_S ? null : age / SWIRL_S);

/**
 * Kelp near a point: [{ key, x, z, floor, height, seed }]. It grows in forests (patches some 160 m across) on cool,
 * shallow seabeds, 3 to 26 m down, reaching most of the way to the surface. at(cell) as for shoals; warmth(lat, lon)
 * as for seaBand, or null.
 */
export function kelpHomes(lat, lon, at, warmth = () => null) {
  const out = [];
  if (!kelpWater(lat, warmth(lat, lon))) return out; // the sea here is one warmth for 160 m round (the grid is 2°)
  for (const c of cellsAround(lat, lon, KELP.radius, KELP.cell, KELP.salt)) {
    if (unit(hash2(Math.floor(c.lat * 700), Math.floor(c.lon * 700), KELP.salt + 5)) >= KELP.forest) continue; // not a forest here
    if (unit(c.h) >= KELP.chance) continue;
    const s = at(c);
    if (!s) continue;
    const depth = -s.floor;
    if (depth < KELP.depth[0] || depth > KELP.depth[1]) continue;
    const height = Math.max(2, Math.min(22, (depth - 0.8) * (0.7 + 0.25 * unit(c.h, 5))));
    out.push({ key: `kelp${c.h}`, x: s.p.x, z: s.p.z, floor: s.floor, height, seed: unit(c.h, 12) });
    if (out.length >= KELP.max) break;
  }
  return out;
}

// ---- Touching a shoal ----
const pickOf = (list, h) => list[h % list.length];
const SHOAL_LINES = (n, me) => [
  `The shoal of ${n} swirls once round ${me}, then goes back to its own way.`,
  `The ${n} flicker round you like a handful of thrown light.`,
  `A shoal of ${n} turns all at once, as if it had one mind, and circles you.`,
  `The ${n} nibble at ${me}'s whiskers, then dart off together.`,
];
/** The log line for a shoal touched gently. name is plural-ready ("little silver fish"). */
export function shoalLine(name, me, seed, n = 0) {
  return pickOf(SHOAL_LINES(name, me), hash2(seed | 0, n, 89));
}
export const SCATTER_LINE = (name, first) => `The ${name} scatter from you in a flash.` + (first ? " Swim up slowly, or tap the shoal." : "");

// ---- Reefs (Jason, 11-19: "Then let's do reefs!") ----
// Coral grows in reefs (patches some 120 m across, a little over half of them) on warm seabeds, 1.5 to 30 m down, where
// the sea is reef water (seaBand "tropical": the coldest month at 18 °C or more once the sea's warmth is in, else within
// 28° of the equator). Four forms, dream-sized: brain coral (a lumpy dome), staghorn (a thicket of branches), table coral
// (a plate on a stalk) and sea fans (a flat lace that sways). The same for everyone.
export const REEF = { cell: 9, radius: 150, salt: 887, max: 600, depth: [1.5, 30], patch: 0.55, chance: 0.55 };
export const CORAL_FORMS = ["brain", "staghorn", "table", "fan"];
const CORAL_SIZE = { brain: [1.4, 3.2], staghorn: [1.6, 3.6], table: [2, 4.4], fan: [1.6, 3.4] };
const CORAL_NAMES = { brain: "brain coral", staghorn: "staghorn coral", table: "table coral", fan: "sea fan" };
// Colours: [hue, saturation, lightness], a reef's whole range, brighter in the shallows.
const CORAL_HUES = [[0.97, 0.75, 0.62], [0.08, 0.85, 0.6], [0.13, 0.85, 0.6], [0.55, 0.6, 0.55], [0.78, 0.55, 0.6], [0.33, 0.5, 0.5], [0.02, 0.6, 0.45], [0.9, 0.65, 0.65]];

/**
 * Coral near a point: [{ key, form, name, x, z, floor, size, yaw, seed, hsl }]. at(cell) as for shoals; warmth(lat, lon)
 * as for seaBand, or null.
 */
export function coralHomes(lat, lon, at, warmth = () => null) {
  const out = [];
  if (seaBand(lat, warmth(lat, lon)) !== "tropical") return out;
  for (const c of cellsAround(lat, lon, REEF.radius, REEF.cell, REEF.salt)) {
    if (unit(hash2(Math.floor(c.lat * 900), Math.floor(c.lon * 900), REEF.salt + 3)) >= REEF.patch) continue; // not a reef here
    if (unit(c.h) >= REEF.chance) continue;
    const s = at(c);
    if (!s) continue;
    const depth = -s.floor;
    if (depth < REEF.depth[0] || depth > REEF.depth[1]) continue;
    const g = hash2(c.h, 13), form = CORAL_FORMS[Math.floor(unit(g, 2) * CORAL_FORMS.length)], [lo, hi] = CORAL_SIZE[form];
    const size = Math.min(lo + (hi - lo) * unit(g, 9), depth * 0.6);
    const [h, sat, l] = CORAL_HUES[Math.floor(unit(g, 5) * CORAL_HUES.length)];
    const shallow = Math.max(0, 1 - depth / REEF.depth[1]); // brighter near the light
    out.push({ key: `coral${c.h}`, form, name: CORAL_NAMES[form], x: s.p.x, z: s.p.z, floor: s.floor, size, yaw: unit(c.h, 7) * Math.PI * 2, seed: unit(c.h, 12), hsl: [h, sat, Math.min(0.8, l * (0.8 + 0.35 * shallow))] });
    if (out.length >= REEF.max) break;
  }
  return out;
}
const CORAL_LINES = (n) => [`You brush the ${n}. It glows, very softly, from somewhere inside.`, `The ${n} lights up where you touch it, and the light spreads slowly out to its edges.`, `Tiny things living in the ${n} pull back in, then peek out again.`, `The ${n} is rough and warm, and full of small lives.`];
/** The log line for coral brushed gently. */
export const coralLine = (name, seed, n = 0) => pickOf(CORAL_LINES(name), hash2(seed | 0, n, 97));
