// The rhizome (Jason, 11-09: "A rhizome - an expanding network of slots. Topology Generated from a seed per player. Dream
// quests give gems, links between slotted gems produce the effects. They can be stat boosts, stat ceiling increases," and
// powers, deeper realms, looks, more slots). Every player's is grown from their own seed: slots in three colours (rose for
// your shape, cyan for how you see, gold for the world, like the shrines and their dreams), joined by links that each carry
// an effect. A gem fits a slot of its colour. Fill both ends of a link and it wakes. You begin with three open slots near
// the middle, one of each colour; each slot you fill shows the slots it links to, and you can only fill a slot next to one
// already filled, so you grow outward from where you began, choosing directions, the rest in fog. No root, no trunk: links
// cross and loop. A few links, woken, make the rhizome itself grow new slots past its edge. Pure, so Node can test it.
import { mulberry32 } from "./rng.js";

export const COLOURS = ["rose", "cyan", "gold"];
export const GEM_OF = { rose: "rosegem", cyan: "cyangem", gold: "goldgem" };
export const COLOUR_OF_GEM = { rosegem: "rose", cyangem: "cyan", goldgem: "gold" };
/** What each colour's links mostly raise: rose your body, cyan your senses, gold any of them. */
const STATS_OF = { rose: ["climb", "run", "swim", "fly"], cyan: ["perception", "gleam"], gold: ["climb", "swim", "run", "gleam", "perception", "fly"] };
/** How far a stat's ceiling can rise, past six. */
export const CEILING_MAX = 9;
export const POWERS = {
  wings: { name: "Wings", about: "You can fly: a sixth stat, fly, opens, from the same twelve points." },
  highview: { name: "The high view", about: "The camera pulls back without limit, out to the whole Earth." },
  leysight: { name: "Ley sight", about: "The ley lines show for you without the prism (a slot freed)." },
  shrinewake: { name: "Shrine waking", about: "A sleeping shrine wakes for you when you touch it, once a moon each." },
};
export const LOOKS = { halo: "a halo of light", motes: "motes that circle you", sheen: "a golden sheen" };
const BASE = 54, SPROUT = 5, MIN_GAP = 0.165;

/** A link's effect, in a few words. */
export function effectWords(e) {
  if (e.kind === "boost") return `+1 ${e.stat}`;
  if (e.kind === "ceiling") return `${e.stat} can go one higher`;
  if (e.kind === "power") return POWERS[e.power].name;
  if (e.kind === "deeper") return `deeper ${e.colour} dreams`;
  if (e.kind === "look") return LOOKS[e.look];
  if (e.kind === "grow") return "the rhizome grows";
  return "";
}

/**
 * A player's rhizome from their seed: { seed, slots: [{ i, x, y, colour, start, sprout }], links: [{ i, a, b, effect, sprout }] }.
 * x, y lie within about ±1.4. sprout: the grow link that brings this slot or link into being (-1: there from the start).
 */
export function rhizomeOf(seed) {
  const rand = mulberry32(seed >>> 0);
  const turn = rand() * Math.PI * 2;
  const colourAt = (x, y) => {
    // Three wedges, one per colour, with their borders frayed so colours mix where they meet.
    const a = (((Math.atan2(y, x) - turn) % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2);
    let k = Math.floor(a / ((Math.PI * 2) / 3));
    const edge = Math.min(a % ((Math.PI * 2) / 3), (Math.PI * 2) / 3 - (a % ((Math.PI * 2) / 3)));
    if (edge < 0.35 && rand() < 0.45) k = (k + (rand() < 0.5 ? 1 : 2)) % 3;
    return COLOURS[k];
  };
  const slots = [];
  COLOURS.forEach((colour, k) => {
    const a = turn + ((k + 0.5) * Math.PI * 2) / 3;
    slots.push({ i: k, x: Math.cos(a) * 0.13, y: Math.sin(a) * 0.13, colour, start: true, sprout: -1 });
  });
  for (let tries = 0; slots.length < BASE && tries < 6000; tries++) {
    const r = Math.sqrt(rand()), a = rand() * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (slots.some((s) => Math.hypot(s.x - x, s.y - y) < MIN_GAP)) continue;
    slots.push({ i: slots.length, x, y, colour: colourAt(x, y), start: false, sprout: -1 });
  }
  // Links: each slot to its two nearest, sometimes a third; then whatever's apart is joined to its nearest neighbour.
  const pairs = new Set(), links = [];
  const join = (a, b, sprout = -1) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || pairs.has(k)) return;
    pairs.add(k);
    links.push({ i: links.length, a, b, effect: null, sprout });
  };
  const near = (s, pool) => pool.filter((q) => q !== s).sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y));
  for (const s of slots) {
    const n = near(s, slots);
    join(s.i, n[0].i); join(s.i, n[1].i);
    if (rand() < 0.35) join(s.i, n[2].i);
  }
  join(0, 1); join(1, 2); join(2, 0); // the three beginnings touch
  for (;;) {
    const comp = component(slots.length, links, 0);
    if (comp.size === slots.length) break;
    let best = null;
    for (const s of slots) if (comp.has(s.i)) for (const q of slots) if (!comp.has(q.i)) {
      const d = Math.hypot(s.x - q.x, s.y - q.y);
      if (!best || d < best.d) best = { a: s.i, b: q.i, d };
    }
    join(best.a, best.b);
  }
  // How many hops each slot is from where you begin, to place the effects.
  const hops = hopsFrom(slots.length, links, [0, 1, 2]);
  const linkHop = (l) => Math.max(hops[l.a], hops[l.b]);
  const colourOf = (l) => (slots[l.a].colour === slots[l.b].colour ? slots[l.a].colour : null);
  const touches = (l, c) => slots[l.a].colour === c || slots[l.b].colour === c;
  const free = () => links.filter((l) => !l.effect && l.sprout === -1);
  const place = (effect, ok, lo, hi) => {
    for (const [a, b] of [[lo, hi], [lo - 1, hi + 2], [0, 99]]) {
      const pool = free().filter((l) => ok(l) && linkHop(l) >= a && linkHop(l) <= b);
      if (pool.length) { pool[Math.floor(rand() * pool.length)].effect = effect; return true; }
    }
    return false;
  };
  place({ kind: "power", power: "wings" }, (l) => colourOf(l) === "rose", 2, 3);
  place({ kind: "power", power: "highview" }, (l) => touches(l, "cyan"), 2, 4);
  place({ kind: "power", power: "leysight" }, (l) => colourOf(l) === "cyan", 4, 6);
  place({ kind: "power", power: "shrinewake" }, (l) => touches(l, "gold"), 3, 5);
  for (const c of COLOURS) place({ kind: "deeper", colour: c }, (l) => touches(l, c), 4, 6);
  place({ kind: "look", look: "halo" }, (l) => touches(l, "rose"), 2, 5);
  place({ kind: "look", look: "motes" }, (l) => touches(l, "cyan"), 2, 5);
  place({ kind: "look", look: "sheen" }, (l) => touches(l, "gold"), 2, 5);
  // The rhizome grows past its edge from two links near the rim.
  const maxHop = Math.max(...hops);
  const growers = [];
  for (let g = 0; g < 2; g++) {
    const pool = free().filter((l) => linkHop(l) >= maxHop - 2);
    if (!pool.length) break;
    const l = pool[Math.floor(rand() * pool.length)];
    l.effect = { kind: "grow" };
    growers.push(l);
  }
  const statFor = (l) => { const c = colourOf(l), pool = c ? STATS_OF[c] : [...new Set([...STATS_OF[slots[l.a].colour], ...STATS_OF[slots[l.b].colour]])]; return pool[Math.floor(rand() * pool.length)]; };
  for (let k = 0; k < 7; k++) place({ kind: "ceiling" }, (l) => linkHop(l) >= 2, 2, 99);
  for (const l of links) {
    if (!l.effect) l.effect = { kind: "boost", stat: statFor(l) };
    else if (l.effect.kind === "ceiling") l.effect.stat = statFor(l);
  }
  // Sprouts: five slots past the rim beyond each grow link, there only once it's woken.
  for (const g of growers) {
    const far = Math.hypot(slots[g.a].x, slots[g.a].y) > Math.hypot(slots[g.b].x, slots[g.b].y) ? slots[g.a] : slots[g.b];
    const a0 = Math.atan2(far.y, far.x);
    let prev = far.i;
    for (let k = 0; k < SPROUT; k++) {
      const r = 1.12 + (k % 3) * 0.11 + rand() * 0.04, a = a0 + (k - 2) * 0.16 + (rand() - 0.5) * 0.06;
      const s = { i: slots.length, x: Math.cos(a) * r, y: Math.sin(a) * r, colour: rand() < 0.6 ? far.colour : COLOURS[Math.floor(rand() * 3)], start: false, sprout: g.i };
      slots.push(s);
      join(prev, s.i, g.i);
      if (k >= 2) join(s.i, slots[slots.length - 3].i, g.i);
      prev = k % 2 ? prev : s.i;
    }
  }
  for (const l of links) if (!l.effect) l.effect = rand() < 0.3 ? { kind: "ceiling", stat: statFor(l) } : { kind: "boost", stat: statFor(l) };
  return { seed: seed >>> 0, slots, links };
}

function component(n, links, from) {
  const adj = Array.from({ length: n }, () => []);
  for (const l of links) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
  const seen = new Set([from]), q = [from];
  while (q.length) for (const m of adj[q.shift()]) if (!seen.has(m)) { seen.add(m); q.push(m); }
  return seen;
}
function hopsFrom(n, links, starts) {
  const adj = Array.from({ length: n }, () => []);
  for (const l of links) if (l.sprout === -1) { adj[l.a].push(l.b); adj[l.b].push(l.a); }
  const d = new Array(n).fill(Infinity), q = [...starts];
  for (const s of starts) d[s] = 0;
  while (q.length) { const v = q.shift(); for (const m of adj[v]) if (d[m] === Infinity) { d[m] = d[v] + 1; q.push(m); } }
  return d;
}

/** filled: { [slot index]: gem kind }. Which links are woken (both ends filled, and the link exists). */
export function wokenLinks(R, filled) {
  const out = [];
  let grew = new Set();
  // Growth can unlock links that are themselves grow links' children: settle it in passes.
  for (let pass = 0; pass < 3; pass++) {
    out.length = 0;
    for (const l of R.links) if ((l.sprout === -1 || grew.has(l.sprout)) && filled[l.a] && filled[l.b]) out.push(l);
    const g = new Set(out.filter((l) => l.effect.kind === "grow").map((l) => l.i));
    if (g.size === grew.size) break;
    grew = g;
  }
  return out;
}
/** Which grow links are woken (their sprouts exist). */
export const grownFrom = (R, filled) => new Set(wokenLinks(R, filled).filter((l) => l.effect.kind === "grow").map((l) => l.i));
const exists = (R, grown, x) => x.sprout === -1 || grown.has(x.sprout);

/**
 * What you can see and do: { visible (slot indices), fillable (empty slots a gem could go in), links (visible link
 * indices), woken (link indices) }. You see your three beginnings, every filled slot, and everything one link from a
 * filled slot; you can fill a beginning, or an empty slot linked to a filled one.
 */
export function viewOf(R, filled) {
  const grown = grownFrom(R, filled), woken = wokenLinks(R, filled);
  const visible = new Set([0, 1, 2]), fillable = new Set();
  for (const s of [0, 1, 2]) if (!filled[s]) fillable.add(s);
  for (const l of R.links) {
    if (!exists(R, grown, l)) continue;
    for (const [p, q] of [[l.a, l.b], [l.b, l.a]]) if (filled[p]) { visible.add(p); visible.add(q); if (!filled[q]) fillable.add(q); }
  }
  const links = R.links.filter((l) => exists(R, grown, l) && visible.has(l.a) && visible.has(l.b)).map((l) => l.i);
  return { visible, fillable, links, woken: new Set(woken.map((l) => l.i)) };
}

/** Whether a gem of this kind can go in slot i now. */
export function canSlot(R, filled, i, gem) {
  const s = R.slots[i];
  return !!s && !filled[i] && COLOUR_OF_GEM[gem] === s.colour && viewOf(R, filled).fillable.has(i);
}
/** Whether slot i's gem can come out (with a moonseed): what's left must still reach a beginning. */
export function canUnslot(R, filled, i) {
  if (!filled[i]) return false;
  const rest = { ...filled };
  delete rest[i];
  const grown = grownFrom(R, rest), keys = Object.keys(rest).map(Number);
  // Every filled slot must still exist and be joined, through filled slots, to a filled beginning.
  const adj = new Map(keys.map((k) => [k, []]));
  for (const l of R.links) if (exists(R, grown, l) && rest[l.a] && rest[l.b]) { adj.get(l.a).push(l.b); adj.get(l.b).push(l.a); }
  const seen = new Set(), q = [0, 1, 2].filter((k) => rest[k]);
  for (const k of q) seen.add(k);
  while (q.length) for (const m of adj.get(q.shift()) || []) if (!seen.has(m)) { seen.add(m); q.push(m); }
  return keys.every((k) => seen.has(k) && exists(R, grown, R.slots[k]));
}

/**
 * Everything your woken links give: { boosts: { stat: n }, ceilings: { stat: n } (over six, the whole at most nine),
 * powers: Set, deeper: Set (colours), looks: Set }.
 */
export function effectsOf(R, filled) {
  const out = { boosts: {}, ceilings: {}, powers: new Set(), deeper: new Set(), looks: new Set() };
  for (const l of wokenLinks(R, filled)) {
    const e = l.effect;
    if (e.kind === "boost") out.boosts[e.stat] = (out.boosts[e.stat] ?? 0) + 1;
    else if (e.kind === "ceiling") out.ceilings[e.stat] = Math.min(CEILING_MAX - 6, (out.ceilings[e.stat] ?? 0) + 1);
    else if (e.kind === "power") out.powers.add(e.power);
    else if (e.kind === "deeper") out.deeper.add(e.colour);
    else if (e.kind === "look") out.looks.add(e.look);
  }
  return out;
}

/** Filled slots from a record, checked against the rhizome: known slots, the right colour, connected. */
export function cleanFilled(R, raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  // Re-fill in an order that respects the rules, so a forged or stale record can't fill what couldn't be reached.
  const want = Object.entries(raw).filter(([k, g]) => /^\d{1,3}$/.test(k) && COLOUR_OF_GEM[g]).map(([k, g]) => [Number(k), g]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [i, g] of want) if (!out[i] && canSlot(R, out, i, g)) { out[i] = g; changed = true; }
  }
  return out;
}
