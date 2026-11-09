// Pigeons: things carried between mutuals (Jason, 11-09: "item exchange between repos - via pigeon", and "we should
// give people reasons to collaborate"). A pigeon is a record in the sender's own repo,
// org.jason-edelman.dream.pigeon/<tid>: who it's for, what it carries, where it set off from and when. The recipient finds
// it through the backlink index (its `to` is their DID), only from a mutual, and it arrives when a pigeon flying 1,000
// km/h would have covered the distance. Taking it changes nothing in the sender's repo: the recipient's inventory keeps
// which pigeons it has had. A pigeon waits a moon; after that it's gone (and the sender's record is cleared away).
// Records from others are untrusted: parsePigeon checks every field. Pure, so Node can test it.
import { ITEMS, ITEM_KINDS } from "./inventory.js";
import { SYNODIC_S } from "./moon.js";
import { metresBetween, cleanNote } from "./artifacts.js";

export const PIGEON_NSID = "org.jason-edelman.dream.pigeon";
/** 1,000 km/h, in m/s: a day and a bit to the far side of the Earth. */
export const PIGEON_MPS = 1000000 / 3600;
/** How long a pigeon waits for its friend. */
export const PIGEON_LIFE_S = SYNODIC_S;
export const NOTE_MAX = 80;
const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.%-]{1,253})$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const E6 = (x) => Math.round(x * 1e6);

/** A pigeon setting off: to (a DID), kind and count (what it carries), from { lat, lon }, an optional note. */
export function makePigeon({ to, kind, count = 1, from, note = "" }, now = new Date()) {
  const v = { $type: PIGEON_NSID, to, kind, count, fromLatE6: E6(from.lat), fromLonE6: E6(from.lon), sentAt: now.toISOString() };
  const n = Array.from(cleanNote(note)).slice(0, NOTE_MAX).join("");
  if (n) v.note = n;
  return v;
}

/**
 * Someone's pigeon, checked: { to, kind, count, from: { lat, lon }, at (s), note } or null (bad, from the future, or
 * flown off after a moon). count is at most what fits in a pouch.
 */
export function parsePigeon(v, nowS = Date.now() / 1000) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== PIGEON_NSID) return null;
  if (typeof v.to !== "string" || !DID_RE.test(v.to)) return null;
  if (typeof v.kind !== "string" || !ITEM_KINDS.includes(v.kind)) return null;
  if (!int(v.count, 1, ITEMS[v.kind].max)) return null;
  if (!int(v.fromLatE6, -90e6, 90e6) || !int(v.fromLonE6, -180e6, 180e6)) return null;
  const at = typeof v.sentAt === "string" && v.sentAt.length <= 40 ? Date.parse(v.sentAt) / 1000 : NaN;
  if (!Number.isFinite(at) || at > nowS + 60 || nowS - at > PIGEON_LIFE_S) return null;
  const note = typeof v.note === "string" && v.note.length <= 1000 ? Array.from(cleanNote(v.note)).slice(0, NOTE_MAX).join("") : "";
  return { to: v.to, kind: v.kind, count: v.count, from: { lat: v.fromLatE6 / 1e6, lon: v.fromLonE6 / 1e6 }, at, note };
}

/** When a pigeon reaches you at (lat, lon) (s since 1970): its flight's length at 1,000 km/h after it set off. */
export const arrivalOf = (p, lat, lon) => p.at + metresBetween(p.from.lat, p.from.lon, lat, lon) / PIGEON_MPS;

/** Whether one of your own pigeons has flown off (so its record can be cleared away). */
export const flownOff = (sentAtS, nowS) => nowS - sentAtS > PIGEON_LIFE_S;
