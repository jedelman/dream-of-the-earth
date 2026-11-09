// What you carry. Jason, 11-09: "inventory and equipment (psychedelic of course)", kept in your own Bluesky repo (one
// record, org.jason-edelman.dream.inventory/self, overwritten), so it follows you; and "Let's grant respecs at the new
// moon but have them be an item so they can be spent or saved": the moonseed, the first thing you can carry.
// Honour system: with no server to referee, anyone could write any count into their own repo; with no scores or races,
// that only spoils their own fun. Pure, so Node can test it.
import { lunationOf, seedFalls, nearestNewMoon, nextNewMoon, RESPEC_S, SYNODIC_S } from "./moon.js";

export const INVENTORY_NSID = "org.jason-edelman.dream.inventory";
export const INVENTORY_RKEY = "self";

/**
 * What there is to carry. max: how many fit in your pouch. wear: a thing you put on (Jason, 11-09: "it'd be cool to
 * alter the player's creature based on what's equipped. We should have limited equip slots too so we have to choose
 * between abilities"): it shows on your creature, to you and your mutuals, and does something while it's on.
 */
export const ITEMS = {
  moonseed: {
    name: "moonseed", plural: "moonseeds", max: 13,
    about: "Falls at each new moon, one for you. Eat one to change your stats, or keep it: they keep (thirteen fit, a year of moons).",
  },
  prism: {
    name: "prism", plural: "prisms", max: 3, wear: true,
    about: "Worn, it hangs over your head and splits the light, and the ley lines show in it: you can see them, and ride them.",
    on: "The prism splits the light over your head, and the ley lines shine out of nowhere.",
    off: "You take the prism off. The ley lines are gone, as if they'd never been.",
  },
  // Born of land or sea (birth.js): what wakes the stat your birth put to sleep. Each is found where the other kind of
  // creature goes easily, and only now and then where you do: a reason to have friends of the other kind.
  tidefin: {
    name: "tidefin", plural: "tidefins", max: 5, wear: true,
    about: "A fin of sea glass. Worn, a land-born creature's swim wakes, and the sea opens. Now and then one washes up on a beach; the sea-born find them on the seabed. (To the sea-born it's only pretty: keep it for a friend born on land.)",
    on: "The tidefin settles along your back. The water feels like yours now.",
    off: "You take the tidefin off. The water is heavy again.",
  },
  mossfoot: {
    name: "mossfoot", plural: "mossfeet", max: 5, wear: true,
    about: "A tuft of walking moss. Worn, a sea-born creature's run wakes, and the land opens. It grows inland, and now and then the tide leaves one on a beach. (To the land-born it's only soft: keep it for a friend born in the sea.)",
    on: "Moss curls round your feet. The ground feels like yours now.",
    off: "You take the mossfoot off. The ground drags at you again.",
  },
  owleye: {
    name: "owl's eye", plural: "owl's eyes", max: 3, wear: true, boost: { perception: 2 },
    about: "An eye of amber, found on high summits. Worn, you see further: two more perception (from three, the sky beings show).",
    on: "The owl's eye opens on your brow. The world comes from further off.",
    off: "You take the owl's eye off. The distance closes in.",
  },
};
export const ITEM_KINDS = Object.keys(ITEMS);
export const WEARABLE = ITEM_KINDS.filter((k) => ITEMS[k].wear);
/** How many things you can wear at once. */
export const WORN_MAX = 2;
/** The starting kit's version: a pouch from an older kit is given what it lacks (kitUp). */
export const KIT = 1;

/**
 * A creature's first pouch: one moonseed to begin with (and, born at a new moon, that moon's seed is this one), and a
 * prism, worn.
 */
export function firstInventory(t) {
  return { items: { moonseed: 1, prism: 1 }, worn: ["prism"], kit: KIT, lunation: seedFalls(t) ? lunationOf(t) : -1 };
}

/** A pouch from before the prism (kit 0) is given one, worn if there's room. Returns the same object if nothing changes. */
export function kitUp(inv) {
  if ((inv.kit ?? 0) >= KIT) return inv;
  const items = { ...inv.items };
  let worn = cleanWorn(inv.worn, items);
  if (!(items.prism > 0)) items.prism = 1;
  if (!worn.includes("prism") && worn.length < WORN_MAX) worn = [...worn, "prism"];
  return { ...inv, items, worn, kit: KIT };
}

/** What you're wearing, by kind (an empty list if nothing). */
export const wornOf = (inv) => cleanWorn(inv?.worn, inv?.items);
/** What your worn things add to your stats: { stat: points }. */
export function boostsOf(inv) {
  const out = {};
  for (const k of wornOf(inv)) for (const [stat, n] of Object.entries(ITEMS[k].boost ?? {})) out[stat] = (out[stat] ?? 0) + n;
  return out;
}
export const wearing = (inv, kind) => wornOf(inv).includes(kind);

/** Put something on: the new inventory, or null (not wearable, none carried, already on, or no room). */
export function wear(inv, kind) {
  const worn = wornOf(inv);
  if (!ITEMS[kind]?.wear || countOf(inv, kind) <= 0 || worn.includes(kind) || worn.length >= WORN_MAX) return null;
  return { ...inv, worn: [...worn, kind] };
}
/** Take something off: the new inventory, or null if it wasn't on. */
export function takeOff(inv, kind) {
  const worn = wornOf(inv);
  if (!worn.includes(kind)) return null;
  return { ...inv, worn: worn.filter((k) => k !== kind) };
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

/** One of a kind used up (or given away): the new inventory, or null if there's none. The last one comes off if worn. */
export function spend(inv, kind) {
  const n = countOf(inv, kind);
  if (n <= 0) return null;
  const items = { ...inv.items, [kind]: n - 1 };
  return { ...inv, items, worn: cleanWorn(inv.worn, items) };
}
/** Most finds remembered as taken in a moon (each spot gives each player its thing once a moon). */
export const TOOK_MAX = 300;
const TOOK_KEY = /^(shore|seabed|meadow|summit)\d{1,10}$/;
/** Whether you've had this find's thing in the moon running at t. */
export const tookHere = (inv, key, t) => inv?.took?.lunation === lunationOf(t) && inv.took.keys.includes(key);
/**
 * Pick up a find ({ key, holds }): { inv, ok, why } (why: "taken", already this moon; or "full", your pouch holds no
 * more of it).
 */
export function take(inv, find, t) {
  if (tookHere(inv, find.key, t)) return { inv, ok: false, why: "taken" };
  const n = countOf(inv, find.holds);
  if (!ITEMS[find.holds] || n >= ITEMS[find.holds].max) return { inv, ok: false, why: "full" };
  const L = lunationOf(t), keys = inv.took?.lunation === L ? inv.took.keys : [];
  return { ok: true, why: null, inv: { ...inv, items: { ...inv.items, [find.holds]: n + 1 }, took: { lunation: L, keys: [...keys, find.key].slice(-TOOK_MAX) } } };
}
function cleanTook(took) {
  if (!took || typeof took !== "object" || !Number.isInteger(took.lunation) || took.lunation < 0 || took.lunation > 100000 || !Array.isArray(took.keys)) return { lunation: -1, keys: [] };
  return { lunation: took.lunation, keys: [...new Set(took.keys.filter((k) => typeof k === "string" && TOOK_KEY.test(k)))].slice(-TOOK_MAX) };
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

/** Worn kinds: known wearables you carry at least one of, no repeats, at most WORN_MAX, in the order put on. */
function cleanWorn(worn, items) {
  if (!Array.isArray(worn)) return [];
  const out = [];
  for (const k of worn) {
    if (out.length >= WORN_MAX) break;
    if (typeof k === "string" && ITEMS[k]?.wear && !out.includes(k) && (items?.[k] ?? 0) > 0) out.push(k);
  }
  return out;
}
const cleanKit = (k) => (Number.isInteger(k) && k >= 0 && k <= 1000 ? k : 0);

export function makeInventoryRecord(inv, at = Date.now()) {
  const items = cleanItems(inv.items);
  return { $type: INVENTORY_NSID, items, worn: cleanWorn(inv.worn, items), kit: cleanKit(inv.kit), lunation: Number.isInteger(inv.lunation) ? inv.lunation : -1, took: cleanTook(inv.took), updatedAt: new Date(at).toISOString() };
}

/**
 * An inventory record, checked: { items, worn, kit, lunation, took, at (ms) } or null. Unknown kinds and bad counts are
 * dropped, and worn things you don't carry.
 */
export function parseInventoryRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (v.$type !== undefined && v.$type !== INVENTORY_NSID) return null;
  const at = typeof v.updatedAt === "string" && v.updatedAt.length <= 40 ? Date.parse(v.updatedAt) : NaN;
  const lunation = Number.isInteger(v.lunation) && v.lunation >= -1 && v.lunation < 100000 ? v.lunation : -1;
  const items = cleanItems(v.items);
  return { items, worn: cleanWorn(v.worn, items), kit: cleanKit(v.kit), lunation, took: cleanTook(v.took), at: Number.isFinite(at) ? at : 0 };
}

const inventoryKey = (a) => JSON.stringify([cleanItems(a.items), cleanWorn(a.worn, cleanItems(a.items)), cleanKit(a.kit), a.lunation ?? -1, cleanTook(a.took)]);
export const sameInventory = (a, b) => inventoryKey(a) === inventoryKey(b);

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
