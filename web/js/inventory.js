// What you carry. Jason, 11-09: "inventory and equipment (psychedelic of course)", kept in your own Bluesky repo (one
// record, org.jason-edelman.dream.inventory/self, overwritten), so it follows you; and "Let's grant respecs at the new
// moon but have them be an item so they can be spent or saved": the moonseed, the first thing you can carry.
// Honour system: with no server to referee, anyone could write any count into their own repo; with no scores or races,
// that only spoils their own fun. Pure, so Node can test it.
import { lunationOf, seedFalls, nearestNewMoon, nextNewMoon, RESPEC_S, SYNODIC_S } from "./moon.js";

export const INVENTORY_NSID = "org.jason-edelman.dream.inventory";
export const INVENTORY_RKEY = "self";

/** What there is to carry. max: how many fit in your pouch. */
export const ITEMS = {
  moonseed: {
    name: "moonseed", plural: "moonseeds", max: 13,
    about: "Falls at each new moon, one for you. Eat one to change your stats, or keep it: they keep (thirteen fit, a year of moons).",
  },
};
export const ITEM_KINDS = Object.keys(ITEMS);

/** A creature's first pouch: one moonseed to begin with (and, born at a new moon, that moon's seed is this one). */
export function firstInventory(t) {
  return { items: { moonseed: 1 }, lunation: seedFalls(t) ? lunationOf(t) : -1 };
}

/** How many of a kind you have. */
export const countOf = (inv, kind) => inv?.items?.[kind] ?? 0;

/**
 * At a new moon, a moonseed falls for you, once per moon (the lunation's number is kept, so another device or a
 * second visit that night doesn't make two). Returns { inv, fell }.
 */
export function moonseedFor(inv, t) {
  if (!seedFalls(t)) return { inv, fell: false };
  const L = lunationOf(t);
  if (inv.lunation >= L) return { inv, fell: false };
  const n = Math.min(ITEMS.moonseed.max, countOf(inv, "moonseed") + 1);
  return { inv: { ...inv, items: { ...inv.items, moonseed: n }, lunation: L }, fell: true };
}

/** When your next moonseed falls (s): now if one is due, else the opening of the next new moon's window that hasn't given you one. */
export function nextSeedAt(inv, t) {
  if (seedFalls(t) && inv.lunation < lunationOf(t)) return t;
  let m = seedFalls(t) ? nearestNewMoon(t) + SYNODIC_S : nextNewMoon(t);
  if (inv.lunation >= lunationOf(m)) m += SYNODIC_S; // that moon's seed is already yours
  return m - RESPEC_S;
}

/** One of a kind used up: the new inventory, or null if there's none to use. */
export function spend(inv, kind) {
  const n = countOf(inv, kind);
  if (n <= 0) return null;
  return { ...inv, items: { ...inv.items, [kind]: n - 1 } };
}
/** One given back (a moonseed eaten for nothing: the stats didn't change). */
export function refund(inv, kind) {
  return { ...inv, items: { ...inv.items, [kind]: Math.min(ITEMS[kind].max, countOf(inv, kind) + 1) } };
}

/** Only known kinds, as whole numbers within what fits. */
function cleanItems(items) {
  const out = {};
  if (items && typeof items === "object" && !Array.isArray(items)) {
    for (const k of ITEM_KINDS) { const n = items[k]; if (Number.isInteger(n) && n > 0) out[k] = Math.min(ITEMS[k].max, n); }
  }
  return out;
}

export function makeInventoryRecord(inv, at = Date.now()) {
  return { $type: INVENTORY_NSID, items: cleanItems(inv.items), lunation: Number.isInteger(inv.lunation) ? inv.lunation : -1, updatedAt: new Date(at).toISOString() };
}

/** An inventory record, checked: { items, lunation, at (ms) } or null. Unknown kinds and bad counts are dropped. */
export function parseInventoryRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== INVENTORY_NSID) return null;
  const at = typeof v.updatedAt === "string" && v.updatedAt.length <= 40 ? Date.parse(v.updatedAt) : NaN;
  const lunation = Number.isInteger(v.lunation) && v.lunation >= -1 && v.lunation < 100000 ? v.lunation : -1;
  return { items: cleanItems(v.items), lunation, at: Number.isFinite(at) ? at : 0 };
}

export const sameInventory = (a, b) => JSON.stringify(cleanItems(a.items)) === JSON.stringify(cleanItems(b.items)) && (a.lunation ?? -1) === (b.lunation ?? -1);

/**
 * Signing in on a device: "remote" (take what's in your repo), "local" (put this device's there), or "same". A pouch
 * this device only started (never changed here) always yields; otherwise the one changed last wins. local: { items,
 * lunation, at, changed }.
 */
export function reconcileInventory(local, remote) {
  if (!remote) return local ? "local" : "same";
  if (!local) return "remote";
  if (sameInventory(local, remote)) return "same";
  if (!local.changed) return "remote";
  return remote.at >= local.at ? "remote" : "local";
}
