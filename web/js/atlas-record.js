// Your atlas in your repo (Jason, 11-09: "I'm okay with publishing the atlas to the repo! I guess it means bots can
// wall hack but what's the point of cheating at a cozy exploration game?"). One record,
// org.jason-edelman.dream.atlas/self, overwritten: the shrines, ley nodes and landmarks you've been to, so your atlas
// follows you to any device. Read only from your own repo; never indexed or shown to anyone else by the game (a repo is
// public, so anyone who looks can see it). Devices merge: a place found on any of them is found. Pure, so Node can test it.
import { SPELLS } from "./shrinelore.js";
import { LANDMARKS } from "./landmarks.js";

/** Landmarks you can have been to, by name. */
const LANDMARK_NAMES = new Set(LANDMARKS.map((l) => l.name));

export const ATLAS_NSID = "org.jason-edelman.dream.atlas";
export const ATLAS_RKEY = "self";
/** Most places an atlas keeps (about 60 bytes each, so a record stays small). */
export const ATLAS_MAX = 2000;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const E6 = (x) => Math.round(x * 1e6);
const KEY = /^shrine\d{1,10}$/;

/**
 * found: { [key]: { lat, lon, spell, at (s) } }, the shrines; been: { nodes: { [index]: at }, marks: { [name]: at } }, the
 * ley nodes and landmarks you've been to -> a record (the earliest first, up to ATLAS_MAX of each).
 */
export function makeAtlasRecord(found, at = Date.now(), been = { nodes: {}, marks: {} }) {
  const shrines = Object.entries(found)
    .filter(([key, f]) => KEY.test(key) && SPELLS[f.spell])
    .sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))
    .slice(0, ATLAS_MAX)
    .map(([key, f]) => ({ key, latE6: E6(f.lat), lonE6: E6(f.lon), spell: f.spell, at: Math.round(f.at ?? 0) }));
  const nodes = Object.entries(been.nodes ?? {}).filter(([i]) => /^\d{1,4}$/.test(i)).sort((a, b) => a[1] - b[1]).slice(0, ATLAS_MAX).map(([i, t]) => ({ i: Number(i), at: Math.round(t) }));
  const landmarks = Object.entries(been.marks ?? {}).filter(([n]) => LANDMARK_NAMES.has(n)).sort((a, b) => a[1] - b[1]).slice(0, ATLAS_MAX).map(([name, t]) => ({ name, at: Math.round(t) }));
  return { $type: ATLAS_NSID, shrines, nodes, landmarks, updatedAt: new Date(at).toISOString() };
}

/**
 * An atlas record, checked: { shrines: { [key]: { lat, lon, spell, at } }, nodes: { [index]: at }, marks: { [name]: at } } or
 * null. Bad entries are dropped (landmarks only by names the game knows).
 */
export function parseAtlasRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== ATLAS_NSID) return null;
  const shrines = {};
  if (Array.isArray(v.shrines)) {
    for (const s of v.shrines.slice(0, ATLAS_MAX)) {
      if (!s || typeof s !== "object" || typeof s.key !== "string" || !KEY.test(s.key)) continue;
      if (typeof s.spell !== "string" || !Object.hasOwn(SPELLS, s.spell)) continue;
      if (!int(s.latE6, -90e6, 90e6) || !int(s.lonE6, -180e6, 180e6) || !int(s.at, 0, 1e11)) continue;
      shrines[s.key] = { lat: s.latE6 / 1e6, lon: s.lonE6 / 1e6, spell: s.spell, at: s.at };
    }
  }
  const nodes = {}, marks = {};
  if (Array.isArray(v.nodes)) for (const n of v.nodes.slice(0, ATLAS_MAX)) if (n && int(n.i, 0, 9999) && int(n.at, 0, 1e11)) nodes[n.i] = n.at;
  if (Array.isArray(v.landmarks)) for (const m of v.landmarks.slice(0, ATLAS_MAX)) if (m && typeof m.name === "string" && LANDMARK_NAMES.has(m.name) && int(m.at, 0, 1e11)) marks[m.name] = m.at;
  return { shrines, nodes, marks };
}

/** Two atlases as one: every place in either, each found when it was first found. */
export function mergeAtlas(a, b) {
  const out = { ...a };
  for (const [key, f] of Object.entries(b || {})) if (!out[key] || f.at < out[key].at) out[key] = f;
  return out;
}

/** Two maps of first visits as one: every place in either, at its first visit. */
export function mergeBeen(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, t] of Object.entries(b)) if (out[k] == null || t < out[k]) out[k] = t;
  return out;
}

/** What identifies an atlas's contents (its places), to tell whether it needs writing. */
export const atlasKey = (shrines, been = { nodes: {}, marks: {} }) => [Object.keys(shrines).sort().join(","), Object.keys(been.nodes ?? {}).sort().join(","), Object.keys(been.marks ?? {}).sort().join(",")].join("|");
