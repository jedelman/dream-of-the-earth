// Intents: what a creature is doing, not where it is. Each player keeps one
// record, their current intent, overwritten whenever their plan changes (rkey
// "self", never accumulated). Every mutual's phone works out where that creature
// is from it, the way the world itself is computed: a trip is replayed along its
// route, a highway ride is a pure function of time, a creature steering by hand
// is dead-reckoned until the next intent. Records from others are untrusted:
// parseIntent checks every field. Also here, the one rule for whose things we
// show at all. Pure, so Node can test it.
import { WORLD_URL, metresBetween, cleanNote } from "./artifacts.js";
import { STATS, statsFrom } from "./stats.js";
import { parseGenes } from "./creature-graph.js";
import { pointOn, rideSpeed, lineAt, lineCount } from "./ride.js";
import { vecToLatLon } from "./geo.js";

export const INTENT_NSID = "org.jason-edelman.dream.intent";
export const INTENT_RKEY = "self";
export const KINDS = ["rest", "goto", "ride", "steer"];
export const STALE_S = 600; // an intent not renewed for 10 minutes is a creature that's left
export const HEARTBEAT_S = 240; // so a player renews it every 4 minutes while playing
export const MAX_POINTS = 64;
export const SAY_MAX = 80; // characters in a speech bubble
export const MOMENT_S = 8; // how long a bubble (or a squeak) shows after it's said
export const ACTS = ["squeak"];
const STEER_FOR_S = 90; // dead reckoning stops this long after the intent (the next one should have come)

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const E6 = (x) => Math.round(x * 1e6);

/**
 * My intent now. p: { lat, lon, alt (m, above sea level) }; creature: { seed, stats, genes? }; plus one of
 * goto: { pts: [{ lat, lon }], speed (m/s), fly, cruise (m) }, ride: { line, t (0..1), dir }, steer: { heading (rad), speed, climb }.
 */
export function makeIntent({ kind, p, creature, goto, ride, steer, say, act, now = new Date() }) {
  const v = {
    $type: INTENT_NSID,
    world: WORLD_URL,
    kind,
    at: now.toISOString(),
    latE6: E6(p.lat), lonE6: E6(p.lon), altDm: Math.round((p.alt ?? 0) * 10),
    creature: { seed: creature.seed >>> 0, stats: STATS.map((k) => creature.stats[k]) },
  };
  const genes = parseGenes(creature.genes);
  if (genes) v.creature.genes = genes;
  if (kind === "goto") v.goto = { pts: goto.pts.slice(0, MAX_POINTS).map((q) => [E6(q.lat), E6(q.lon)]), speedCm: Math.round(goto.speed * 100), fly: !!goto.fly, cruiseDm: Math.round((goto.cruise ?? 0) * 10) };
  if (kind === "ride") v.ride = { line: ride.line, tE6: Math.round(ride.t * 1e6), dir: ride.dir > 0 ? 1 : -1 };
  if (kind === "steer") v.steer = { headingMdeg: Math.round(((((steer.heading * 180) / Math.PI) % 360) + 360) % 360 * 1000), speedCm: Math.round(steer.speed * 100), climbCm: Math.round(steer.climb * 100) };
  // Moments ride along on the same record, for a few seconds: something said, a squeak.
  if (say?.text) v.say = { text: Array.from(cleanNote(say.text)).slice(0, SAY_MAX).join(""), at: new Date(say.at * 1000).toISOString() };
  if (act && ACTS.includes(act.kind)) v.act = { kind: act.kind, at: new Date(act.at * 1000).toISOString() };
  return v;
}

/**
 * Someone's intent, checked: { kind, at, lat, lon, alt, creature: { seed, stats, genes }, goto?, ride?, steer? } or null
 * (bad, or stale). Bad genes are dropped, not the creature: it shows as its seed made it.
 */
export function parseIntent(v, nowS = Date.now() / 1000) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== INTENT_NSID) return null;
  if (!KINDS.includes(v.kind)) return null;
  const at = typeof v.at === "string" && v.at.length <= 40 ? Date.parse(v.at) / 1000 : NaN;
  if (!Number.isFinite(at) || at > nowS + 60 || nowS - at > STALE_S) return null;
  if (!int(v.latE6, -90e6, 90e6) || !int(v.lonE6, -180e6, 180e6) || !int(v.altDm, -120000, 120000)) return null;
  const c = v.creature;
  if (!c || !int(c.seed, 0, 0xffffffff)) return null;
  const stats = statsFrom(c.stats); // five, or the four from before perception
  if (!stats) return null;
  const out = { kind: v.kind, at, lat: v.latE6 / 1e6, lon: v.lonE6 / 1e6, alt: v.altDm / 10, creature: { seed: c.seed, stats, genes: parseGenes(c.genes) } };
  if (v.kind === "goto") {
    const g = v.goto;
    if (!g || !Array.isArray(g.pts) || g.pts.length < 1 || g.pts.length > MAX_POINTS) return null;
    if (!g.pts.every((q) => Array.isArray(q) && q.length === 2 && int(q[0], -90e6, 90e6) && int(q[1], -180e6, 180e6))) return null;
    if (!int(g.speedCm, 1, 100000) || !int(g.cruiseDm ?? 0, -120000, 120000) || typeof (g.fly ?? false) !== "boolean") return null;
    out.goto = { pts: g.pts.map(([a, b]) => ({ lat: a / 1e6, lon: b / 1e6 })), speed: g.speedCm / 100, fly: !!g.fly, cruise: (g.cruiseDm ?? 0) / 10 };
  }
  if (v.kind === "ride") {
    const r = v.ride;
    if (!r || !int(r.line, 0, lineCount() - 1) || !int(r.tE6, 0, 1e6) || (r.dir !== 1 && r.dir !== -1)) return null;
    out.ride = { line: r.line, t: r.tE6 / 1e6, dir: r.dir };
  }
  if (v.kind === "steer") {
    const s = v.steer;
    if (!s || !int(s.headingMdeg, 0, 360000) || !int(s.speedCm, -100000, 100000) || !int(s.climbCm, -100000, 100000)) return null;
    out.steer = { heading: ((s.headingMdeg / 1000) * Math.PI) / 180, speed: s.speedCm / 100, climb: s.climbCm / 100 };
  }
  // Moments: something said (a bubble) and an act (a squeak), each with its own time; bad ones are dropped, not fatal.
  const when = (x) => (typeof x === "string" && x.length <= 40 ? Date.parse(x) / 1000 : NaN);
  if (v.say && typeof v.say === "object" && typeof v.say.text === "string" && v.say.text.length <= 1000) {
    const at2 = when(v.say.at), text = Array.from(cleanNote(v.say.text)).slice(0, SAY_MAX).join("");
    if (Number.isFinite(at2) && at2 <= nowS + 60 && text) out.say = { text, at: at2 };
  }
  if (v.act && typeof v.act === "object" && ACTS.includes(v.act.kind)) {
    const at2 = when(v.act.at);
    if (Number.isFinite(at2) && at2 <= nowS + 60) out.act = { kind: v.act.kind, at: at2 };
  }
  return out;
}

/** Whether a moment (say or act) is still showing at nowS. */
export const fresh = (m, nowS) => !!m && nowS - m.at >= -1 && nowS - m.at < MOMENT_S;

const R = 6371008.8, D2R = Math.PI / 180;
/** A step of d metres from (lat, lon) along a bearing (radians, 0 = north, clockwise). Fine at game distances. */
function step(lat, lon, bearing, d) {
  const dLat = (d * Math.cos(bearing)) / R / D2R, dLon = (d * Math.sin(bearing)) / (R * Math.max(0.01, Math.cos(lat * D2R))) / D2R;
  return { lat: lat + dLat, lon: lon + dLon };
}
const bearingOf = (a, b) => Math.atan2((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * D2R), b.lat - a.lat);

/**
 * Where an intent puts its creature at time tS: { lat, lon, alt (m, or null to stand on the ground), bearing (radians,
 * 0 = north), moving, mode ("air" | "ground" | "ride") }.
 */
export function whereAt(it, tS) {
  const dt = Math.max(0, tS - it.at);
  const here = { lat: it.lat, lon: it.lon, alt: it.alt, bearing: 0, moving: false, mode: "air" };
  if (it.kind === "rest") return { ...here, mode: "rest" }; // hovering or sitting: the ground decides which
  if (it.kind === "steer") {
    const d = it.steer.speed * Math.min(dt, STEER_FOR_S), p = step(it.lat, it.lon, it.steer.heading, d);
    return { ...p, alt: it.alt + it.steer.climb * Math.min(dt, STEER_FOR_S), bearing: it.steer.heading, moving: dt < STEER_FOR_S && Math.abs(it.steer.speed) > 0.5, mode: "air" };
  }
  if (it.kind === "ride") {
    const line = lineAt(it.ride.line), speed = rideSpeed(line.cls.rank);
    const t = Math.min(1, Math.max(0, it.ride.t + (it.ride.dir * speed * dt) / (line.arc * R)));
    const p = vecToLatLon(pointOn(line, t)), q = vecToLatLon(pointOn(line, Math.min(1, Math.max(0, t + it.ride.dir * 1e-4))));
    return { lat: p.lat, lon: p.lon, alt: null, bearing: bearingOf(p, q), moving: t > 0 && t < 1, mode: "ride" };
  }
  // goto: along the route from where it started, at its speed; there, it stops.
  const legs = [{ lat: it.lat, lon: it.lon }, ...it.goto.pts];
  let left = it.goto.speed * dt;
  for (let k = 1; k < legs.length; k++) {
    const a = legs[k - 1], b = legs[k], L = metresBetween(a.lat, a.lon, b.lat, b.lon);
    if (left <= L) {
      const f = L > 0 ? left / L : 1;
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, alt: it.goto.fly ? it.goto.cruise : null, bearing: bearingOf(a, b), moving: true, mode: it.goto.fly ? "air" : "ground" };
    }
    left -= L;
  }
  const end = legs[legs.length - 1], prev = legs[Math.max(0, legs.length - 2)];
  return { lat: end.lat, lon: end.lon, alt: null, bearing: bearingOf(prev, end), moving: false, mode: "ground" };
}

/** How far I've drifted from where my mutuals are computing me to be (metres). */
export function driftOf(it, tS, lat, lon) {
  const w = whereAt(it, tS);
  return metresBetween(lat, lon, w.lat, w.lon);
}

// ---- Whose things we show ----
export const HIDE_LABELS = new Set(["!hide", "!takedown", "!suspend"]);
/**
 * The one rule for showing anyone's cairns or creature: a mutual (both follow), no block either way (direct or by
 * list), an account Bluesky still serves (profile present), not hidden by Bluesky's moderation, and not muted by you.
 */
export function allowed(rel, profile, muted = false) {
  if (!rel || !rel.following || !rel.followedBy) return false;
  if (rel.blocking || rel.blockedBy || rel.blockingByList || rel.blockedByList) return false;
  if (!profile) return false;
  if ((profile.labels || []).some((l) => l && HIDE_LABELS.has(l.val))) return false;
  return !muted;
}
