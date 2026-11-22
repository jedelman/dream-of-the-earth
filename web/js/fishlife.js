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
export const KELP = { cell: 14, radius: 160, salt: 871, max: 420, depth: [3, 26], lat: [30, 66], forest: 0.5, chance: 0.6 };
export const FISH_TRIANGLES = 14, KELP_TRIANGLES = 24;

/** The sea's warmth by latitude, which is what decides who lives in it: "tropical", "temperate" or "cold". */
export function seaBand(lat) {
  const a = Math.abs(lat);
  return a < 28 ? "tropical" : a < 52 ? "temperate" : "cold";
}

// Looks, by band: [name, body hsl, accent (belly, fins) hsl].
const LOOKS = {
  tropical: [["little blue reef fish", [0.6, 0.85, 0.5], [0.14, 0.95, 0.55]], ["little yellow reef fish", [0.14, 0.95, 0.55], [0.6, 0.6, 0.45]], ["little orange reef fish", [0.06, 0.95, 0.55], [0.0, 0.0, 0.97]], ["little violet reef fish", [0.78, 0.6, 0.5], [0.15, 0.9, 0.6]]],
  temperate: [["little silver fish", [0.58, 0.12, 0.72], [0.58, 0.05, 0.95]], ["little blue-backed fish", [0.56, 0.55, 0.38], [0.55, 0.1, 0.9]], ["little bronze fish", [0.09, 0.5, 0.45], [0.1, 0.25, 0.85]]],
  cold: [["little ice fish", [0.52, 0.18, 0.85], [0.52, 0.1, 0.97]], ["little grey fish", [0.6, 0.08, 0.5], [0.1, 0.15, 0.85]]],
};
// Lake fish (the reefs' "Next, maybe": "lake fish"), by the same crude warmth: cichlids and tilapia in warm lakes,
// perch, roach and minnows in the middle latitudes, char and grayling in cold ones. Duller than the sea's reef fish.
const LAKE_LOOKS = {
  tropical: [["little blue cichlids", [0.58, 0.75, 0.52], [0.13, 0.85, 0.6]], ["little yellow cichlids", [0.13, 0.9, 0.55], [0.6, 0.5, 0.4]], ["little tilapia", [0.3, 0.2, 0.45], [0.02, 0.55, 0.6]]],
  temperate: [["little perch", [0.2, 0.45, 0.42], [0.06, 0.8, 0.55]], ["little roach", [0.58, 0.1, 0.7], [0.02, 0.75, 0.55]], ["little minnows", [0.28, 0.25, 0.4], [0.1, 0.3, 0.8]]],
  cold: [["little char", [0.55, 0.3, 0.35], [0.03, 0.8, 0.55]], ["little grayling", [0.62, 0.12, 0.5], [0.8, 0.35, 0.55]]],
};

/**
 * Shoals near a point: [{ key, x, z, y (its swimming height), floor, top, lake, n, size, seed, name, body, accent, band }].
 * at(cell) -> { p: { x, z }, floor (the bed's height, m; < 0 under the sea), top (the surface, default 0: the sea),
 * lake (its name, if it's a lake: then lake fish) } or null.
 */
export function shoalHomes(lat, lon, at) {
  const out = [];
  for (const c of cellsAround(lat, lon, SHOAL.radius, SHOAL.cell, SHOAL.salt)) {
    if (unit(c.h) >= SHOAL.chance) continue;
    const s = at(c);
    const top = s ? s.top ?? 0 : 0;
    if (!s || top - s.floor < SHOAL.minDepth) continue;
    const g = hash2(c.h, 7), band = seaBand(c.lat), set = (s.lake ? LAKE_LOOKS : LOOKS)[band];
    const [name, body, accent] = set[Math.floor(unit(g, 3) * set.length)];
    const size = SHOAL.size[0] + (SHOAL.size[1] - SHOAL.size[0]) * unit(g, 17);
    const high = 1.5 + size * 0.6, low = Math.max(high, Math.min(top - s.floor - 1.2 - size * 0.5, 30)); // under the surface, over the bed, not too deep to meet
    const y = top - (high + (low - high) * unit(c.h, 9));
    const n = SHOAL.fish[0] + Math.floor(unit(g, 11) * (SHOAL.fish[1] - SHOAL.fish[0] + 1));
    out.push({ key: `shoal${c.h}`, x: s.p.x, z: s.p.z, y, floor: s.floor, top, lake: s.lake ?? null, n: Math.min(n, SHOAL.fish[1]), size, seed: unit(c.h, 12), name, body, accent, band });
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
  return { x: cx + ox, y: Math.min((s.top ?? 0) - 0.6, cy + oy), z: cz + oz, yaw, pitch, wag: t * wagRate + i * 1.3 };
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
 * shallow seabeds, 3 to 26 m down, reaching most of the way to the surface. at(cell) as for shoals.
 */
export function kelpHomes(lat, lon, at) {
  const out = [];
  const a = Math.abs(lat);
  if (a < KELP.lat[0] - 0.5 || a > KELP.lat[1] + 0.5) return out;
  for (const c of cellsAround(lat, lon, KELP.radius, KELP.cell, KELP.salt)) {
    const al = Math.abs(c.lat);
    if (al < KELP.lat[0] || al > KELP.lat[1]) continue;
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

// ---- Reef fish that keep to the coral, and anemones (11-21, overnight; on the list since the reefs: "reef fish that keep
// to the coral; anemones") ----
// Some coral heads have a few little fish of their own, hovering over it in a small loop. Come close and they duck into
// it; keep still a while and they come out again. Anemones grow among the coral, each with two anemonefish living in its
// tentacles; visit one and they come out round you, then go home. Where they are is shared (computed from the coral, the
// cell grid and the clock); hiding and visiting are this phone's alone.
export const REEF_FISH = { share: 0.45, n: [1, 4], size: [0.45, 0.8], max: 600, hideR: 4, settleS: 3 };
export const ANEMONE = { cell: 24, radius: 150, salt: 907, max: 60, depth: [1.5, 20], chance: 0.35, size: [1.6, 3], fish: 2, fishSize: 0.7 };
export const ANEMONE_TRIANGLES = 18;
// [name (plural-ready), body hsl, accent hsl]
const REEF_FISH_LOOKS = [
  ["little blue damselfish", [0.6, 0.9, 0.55], [0.6, 0.9, 0.7]],
  ["little green chromis", [0.45, 0.7, 0.55], [0.5, 0.6, 0.75]],
  ["little butterflyfish", [0.14, 0.95, 0.6], [0.0, 0.0, 0.95]],
  ["little red cardinalfish", [0.0, 0.75, 0.5], [0.05, 0.6, 0.75]],
  ["little rainbow wrasse", [0.8, 0.6, 0.55], [0.35, 0.8, 0.55]],
];
const ANEMONE_HUES = [[0.92, 0.6, 0.7], [0.3, 0.45, 0.6], [0.75, 0.45, 0.62], [0.12, 0.4, 0.8], [0.5, 0.45, 0.65]];
export const ANEMONEFISH = { name: "anemonefish", body: [0.07, 0.95, 0.55], accent: [0, 0, 0.97] };

/** The little fish living on a coral head, or null: { n, size, name, body, accent, seed }. The same for everyone. */
export function reefFishOf(c) {
  const g = hash2(Math.floor(c.seed * 1e6), 41);
  if (unit(g) >= REEF_FISH.share) return null;
  const [name, body, accent] = REEF_FISH_LOOKS[Math.floor(unit(g, 3) * REEF_FISH_LOOKS.length)];
  const n = REEF_FISH.n[0] + Math.floor(unit(g, 5) * (REEF_FISH.n[1] - REEF_FISH.n[0] + 1));
  return { n: Math.min(n, REEF_FISH.n[1]), size: REEF_FISH.size[0] + (REEF_FISH.size[1] - REEF_FISH.size[0]) * unit(g, 7), name, body, accent, seed: unit(g, 9) };
}

/**
 * One reef fish of coral c at time t: { x, y, z, yaw, wag, scale }. It hovers over its coral head in a small loop of its
 * own, now and then darting a little way out and back. hide: 0..1, how far it has ducked into the coral (scale shrinks
 * with it, so a hidden fish is out of sight inside).
 */
export function reefFishAt(c, rf, i, t, hide = 0) {
  const g = hash2(Math.floor(rf.seed * 1e6), i, 43), ph = unit(g) * Math.PI * 2, w = 0.35 + 0.3 * unit(g, 2);
  const r = c.size * 0.45 + 0.4 + 0.5 * unit(g, 4), top = c.floor + c.size * (c.form === "table" ? 0.55 : 0.75) + 0.3 + 0.6 * unit(g, 6);
  // A dart: a quick run out and back, once every 6 to 10 s, each fish on its own beat.
  const beat = 6 + 4 * unit(g, 8), u = ((t + unit(g, 10) * beat) % beat) / beat, dart = u < 0.12 ? Math.sin((Math.PI * u) / 0.12) : 0;
  const a = w * t + ph, rr = r * (1 + 1.2 * dart);
  let x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = top + 0.25 * Math.sin(t * 0.8 + ph * 3);
  const yaw = Math.atan2(Math.sin(a), -Math.cos(a)); // along its loop
  const k = smooth(Math.max(0, Math.min(1, hide))), hx = c.x + Math.cos(ph) * c.size * 0.12, hy = c.floor + c.size * 0.3, hz = c.z + Math.sin(ph) * c.size * 0.12;
  x += (hx - x) * k; y += (hy - y) * k; z += (hz - z) * k;
  return { x, y, z, yaw, wag: t * (8 + 3 * unit(g, 12) + 14 * dart + 10 * k) + i, scale: 1 - 0.85 * k };
}

/**
 * How hidden a coral's fish are after dt more seconds: h (0..1) now; d: how far you are from the coral (m); still: how
 * long you've kept still (s). They duck in fast when you come within reach, and come out slowly once you've kept still
 * for a while or gone.
 */
export function hideStep(h, dt, d, size, still) {
  const want = d < REEF_FISH.hideR + size && still < REEF_FISH.settleS ? 1 : 0;
  return want ? Math.min(1, h + dt / 0.3) : Math.max(0, h - dt / 1.6);
}

/**
 * Anemones near a point, on reefs (the same patches as the coral): [{ key, x, z, floor, size, hsl, seed }]. at(cell) and
 * warmth as for coral.
 */
export function anemoneHomes(lat, lon, at, warmth = () => null) {
  const out = [];
  if (seaBand(lat, warmth(lat, lon)) !== "tropical") return out;
  for (const c of cellsAround(lat, lon, ANEMONE.radius, ANEMONE.cell, ANEMONE.salt)) {
    if (unit(hash2(Math.floor(c.lat * 900), Math.floor(c.lon * 900), REEF.salt + 3)) >= REEF.patch) continue; // only on a reef
    if (unit(c.h) >= ANEMONE.chance) continue;
    const s = at(c);
    if (!s) continue;
    const depth = -s.floor;
    if (depth < ANEMONE.depth[0] || depth > ANEMONE.depth[1]) continue;
    const size = Math.min(ANEMONE.size[0] + (ANEMONE.size[1] - ANEMONE.size[0]) * unit(c.h, 3), depth * 0.5);
    const hsl = ANEMONE_HUES[Math.floor(unit(c.h, 5) * ANEMONE_HUES.length)];
    out.push({ key: `anemone${c.h}`, x: s.p.x, z: s.p.z, floor: s.floor, size, hsl, seed: unit(c.h, 12) });
    if (out.length >= ANEMONE.max) break;
  }
  return out;
}

/**
 * One of an anemone's two fish at time t: { x, y, z, yaw, wag }. At home it weaves through the tentacles; visited
 * (visit: 0..1 of the way through, me: where you are) it comes out, circles your nose once and goes home.
 */
export function anemoneFishAt(a, i, t, visit = 0, me = null) {
  const ph = a.seed * 40 + i * Math.PI, w = 0.9 + 0.25 * i;
  const ang = w * t + ph, r = a.size * (0.25 + 0.12 * Math.sin(t * 0.6 + i));
  let x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r, y = a.floor + a.size * (0.55 + 0.15 * Math.sin(t * 1.1 + i * 2));
  let yaw = Math.atan2(Math.sin(ang), -Math.cos(ang)), rate = 10;
  if (visit > 0 && me) {
    const k = Math.sin(Math.PI * visit), va = Math.PI * 2 * smooth(visit) + i * Math.PI, ring = 1.8;
    const sx = me.x + Math.cos(va) * ring, sz = me.z + Math.sin(va) * ring, sy = me.y + 0.3 * (i ? 1 : -1);
    x += (sx - x) * k; y += (sy - y) * k; z += (sz - z) * k;
    yaw += wrapAngle(Math.atan2(Math.sin(va), -Math.cos(va)) - yaw) * k;
    rate += 10 * k;
  }
  return { x, y, z, yaw, wag: t * rate + i * 2 };
}
export const VISIT_S = 3.5;
export const visitAt = (age) => (age < 0 || age >= VISIT_S ? null : age / VISIT_S);

const ANEMONE_LINES = (me) => [
  `The two anemonefish come out to look at ${me}, then dive back into their anemone.`,
  `The anemone pulls its tentacles in at your touch. Its two fish circle you, very bold for their size.`,
  `Two anemonefish dart out, nip at ${me}'s whiskers, and go home to their anemone.`,
  `The anemone's tentacles sting a little, the way a good joke does. Its fish don't mind ${me} at all.`,
];
/** The log line for an anemone visited. */
export const anemoneLine = (me, seed, n = 0) => pickOf(ANEMONE_LINES(me), hash2(seed | 0, n, 101));
/** Said when a coral's fish first hide from you. */
export const HIDE_LINE = (name, coral, first) => `The ${name} duck into the ${coral}.` + (first ? " Keep still a while and they'll come out again." : "");
