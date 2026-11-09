// Your atlas in your repo (Jason, 11-09: "I'm okay with publishing the atlas to the repo! I guess it means bots can
// wall hack but what's the point of cheating at a cozy exploration game?"). One record,
// org.jason-edelman.dream.atlas/self, overwritten: the shrines you've found (ley nodes will join them), so your atlas
// follows you to any device. Read only from your own repo; never indexed or shown to anyone else by the game (a repo is
// public, so anyone who looks can see it). Devices merge: a place found on any of them is found. Pure, so Node can test it.
import { SPELLS } from "./shrinelore.js";

export const ATLAS_NSID = "org.jason-edelman.dream.atlas";
export const ATLAS_RKEY = "self";
/** Most places an atlas keeps (about 60 bytes each, so a record stays small). */
export const ATLAS_MAX = 2000;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const E6 = (x) => Math.round(x * 1e6);
const KEY = /^shrine\d{1,10}$/;

/** found: { [key]: { lat, lon, spell, at (s) } } -> a record (the earliest-found first, up to ATLAS_MAX). */
export function makeAtlasRecord(found, at = Date.now()) {
  const shrines = Object.entries(found)
    .filter(([key, f]) => KEY.test(key) && SPELLS[f.spell])
    .sort((a, b) => (a[1].at ?? 0) - (b[1].at ?? 0))
    .slice(0, ATLAS_MAX)
    .map(([key, f]) => ({ key, latE6: E6(f.lat), lonE6: E6(f.lon), spell: f.spell, at: Math.round(f.at ?? 0) }));
  return { $type: ATLAS_NSID, shrines, updatedAt: new Date(at).toISOString() };
}

/** An atlas record, checked: { shrines: { [key]: { lat, lon, spell, at } } } or null. Bad entries are dropped. */
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
  return { shrines };
}

/** Two atlases as one: every place in either, each found when it was first found. */
export function mergeAtlas(a, b) {
  const out = { ...a };
  for (const [key, f] of Object.entries(b || {})) if (!out[key] || f.at < out[key].at) out[key] = f;
  return out;
}

/** What identifies an atlas's contents (its places), to tell whether it needs writing. */
export const atlasKey = (shrines) => Object.keys(shrines).sort().join(",");
