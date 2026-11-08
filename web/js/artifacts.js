// Artifacts: things players leave in the world for their mutuals to find. Each is
// one record in its maker's own atproto repo (so no server of ours holds it), and
// it points at the place it stands in (see places.js). Records from other people
// are untrusted: parseArtifact checks every field against hard caps and drops
// anything else. They fade with the moon: a lunar month after being made or
// renewed they're gone from the game, thinning out over their last week.
// Pure, so Node can test it.
import { placeOf } from "./places.js";
import { mulberry32 } from "./rng.js";

export const NSID = "org.jason-edelman.dream.artifact";
export const KINDS = ["cairn", "postcard", "echo", "sound"]; // built so far: cairn
export const NOTE_MAX = 140; // characters (code points)
export const MOON_S = 29.530588 * 86400; // a synodic month
export const FADE_S = 7 * 86400; // the last week, thinning out
const MAX_FUTURE_S = 3600;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const when = (s) => {
  if (typeof s !== "string" || s.length > 40) return NaN;
  return Date.parse(s) / 1000;
};
/** A note made safe to show: control characters out, whitespace folded, at most NOTE_MAX characters. */
export function cleanNote(s) {
  if (typeof s !== "string") return "";
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(t).slice(0, NOTE_MAX).join("");
}

/** A new cairn record. lat/lon in degrees; seed: a 32-bit integer; hue: 0..359. */
export function makeCairn({ lat, lon, seed, hue, note = "", now = new Date() }) {
  const latE6 = Math.round(lat * 1e6), lonE6 = Math.round(lon * 1e6);
  return {
    $type: NSID,
    kind: "cairn",
    place: placeOf(latE6 / 1e6, lonE6 / 1e6).url,
    latE6, lonE6, // atproto records can't hold floats: microdegrees
    cairn: { seed: seed >>> 0, hue: ((Math.round(hue) % 360) + 360) % 360 },
    note: cleanNote(note),
    createdAt: now.toISOString(),
  };
}

/** The same record, renewed now: another moon. */
export const renew = (value, now = new Date()) => ({ ...value, renewedAt: now.toISOString() });

/**
 * Someone's record, checked: { kind, lat, lon, place, seed, hue, note, since } or null. since is when it was
 * made or last renewed (unix seconds). Unknown kinds, and kinds not built yet, come back null.
 */
export function parseArtifact(value, nowS = Date.now() / 1000, built = ["cairn"]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.$type !== undefined && value.$type !== NSID) return null;
  if (!KINDS.includes(value.kind) || !built.includes(value.kind)) return null;
  if (!int(value.latE6, -90e6, 90e6) || !int(value.lonE6, -180e6, 180e6)) return null;
  const lat = value.latE6 / 1e6, lon = value.lonE6 / 1e6;
  // It must say it's where it is, so the index can't put it somewhere else (allowing for a cell edge).
  const e = 2e-6, cells = new Set([placeOf(lat, lon).url, placeOf(lat + e, lon + e).url, placeOf(lat - e, lon - e).url]);
  if (typeof value.place !== "string" || !cells.has(value.place)) return null;
  const made = when(value.createdAt), renewed = value.renewedAt === undefined ? made : when(value.renewedAt);
  if (!Number.isFinite(made) || !Number.isFinite(renewed)) return null;
  const since = Math.max(made, renewed);
  if (since > nowS + MAX_FUTURE_S) return null;
  if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 1000)) return null;
  const note = cleanNote(value.note ?? "");
  if (value.kind === "cairn") {
    const c = value.cairn;
    if (!c || typeof c !== "object" || !int(c.seed, 0, 0xffffffff) || !int(c.hue, 0, 359)) return null;
    return { kind: "cairn", lat, lon, place: value.place, seed: c.seed, hue: c.hue, note, since };
  }
  return null;
}

/** How present an artifact still is: 1 for most of the moon, thinning to 0 over the last week; 0 once it's gone. */
export function fadeOf(since, nowS = Date.now() / 1000) {
  const age = Math.max(0, nowS - since);
  if (age >= MOON_S) return 0;
  return Math.min(1, (MOON_S - age) / FADE_S);
}

// ---- Cairns ----
export const CAIRN_TRIANGLES = 96, CAIRN_SCALE = 3;

/** A cairn's shape from its seed, pure: { stones: [{ y, r, h, dx, dz, yaw, light, sides }], crystal: { y, r, h }, height }, metres. */
export function cairnForm(seed) {
  const r = mulberry32((seed >>> 0) || 1);
  const n = 3 + Math.floor(r() * 4); // 3 to 6 stones
  const stones = [];
  let y = 0, rad = 0.85 + r() * 0.35;
  for (let k = 0; k < n; k++) {
    const h = rad * (0.5 + r() * 0.3);
    stones.push({ y: y + h / 2, r: rad, h, dx: (r() - 0.5) * 0.3 * rad, dz: (r() - 0.5) * 0.3 * rad, yaw: r() * Math.PI, light: 0.4 + r() * 0.25, sides: 5 + Math.floor(r() * 2) });
    y += h * 0.9;
    rad *= 0.66 + r() * 0.16;
  }
  const cr = Math.max(0.16, rad * 0.85);
  // Grown at 1 m, then made dream-sized: beside 50 m kapoks and a creature Nyo's size, a cairn is a landmark.
  const k = CAIRN_SCALE, sc = (s) => ({ ...s, y: s.y * k, r: s.r * k, h: s.h * k, dx: s.dx * k, dz: s.dz * k });
  return { stones: stones.map(sc), crystal: { y: (y + cr * 1.15) * k, r: cr * k, h: cr * 2.3 * k }, height: (y + cr * 2.3) * k };
}

/** Triangles a form will draw: each stone a pebble (2 per side), the crystal an octahedron (8). */
export const cairnTriangles = (form) => form.stones.reduce((n, s) => n + 2 * s.sides, 0) + 8;
