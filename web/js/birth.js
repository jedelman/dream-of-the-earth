// Born of land or sea (Jason, 11-09: "give them a choice between run and swim and lock the other behind an item,
// making sure we spawn them at the appropriate region. Oceans gate by being large - dive depth is the unlock"). A
// creature born on land runs, and its swim sleeps until it wears a tidefin; one born in the sea swims, and its run
// sleeps until it wears a mossfoot. A sleeping stat counts as nothing (you paddle, or crawl), and can't be given points.
// Pure, so Node can test it.
import { STATS, MAX } from "./stats.js";
import { offset } from "./geo.js";

export const BORN = ["land", "sea"];
/** The stat each birth puts to sleep, and what you wear to wake it. */
export const ASLEEP = { land: "swim", sea: "run" };
export const WAKER = { land: "tidefin", sea: "mossfoot" };

/** A creature's birth: the one it chose, or, from before births, whichever of run and swim it has more of (run on a tie). */
export const bornOf = (stats, born) => (BORN.includes(born) ? born : stats.swim > stats.run ? "sea" : "land");

/** Whether a stat sleeps, for this birth and what's worn. */
export const asleep = (stat, born, worn = []) => ASLEEP[born] === stat && !worn.includes(WAKER[born]);

/**
 * The stats your body uses: a sleeping stat counts as 0; and what you wear adds (boosts: { stat: points }, from
 * inventory.js), up to the most a stat can be.
 */
export function effective(stats, born, worn = [], boosts = {}) {
  const out = { ...stats };
  for (const [k, n] of Object.entries(boosts)) if (STATS.includes(k)) out[k] = Math.min(MAX, out[k] + n);
  const a = ASLEEP[born];
  if (asleep(a, born, worn)) out[a] = 0;
  return out;
}

/**
 * A new creature's stats for its birth: the points the seed put in the stat that will sleep go to its partner (run or
 * swim), then perception, climb, gleam, as far as each can take them. Nothing is lost, nothing random.
 */
export function bornStats(stats, born) {
  const out = { ...stats }, a = ASLEEP[born];
  let left = out[a];
  out[a] = 0;
  for (const k of [a === "swim" ? "run" : "swim", "perception", "climb", "gleam"]) {
    const take = Math.min(left, MAX - out[k]);
    out[k] += take;
    left -= take;
  }
  return out;
}

/**
 * How deep you can dive (metres below the surface): 3 m with no swim (a duck under), then 15, 60, 240, 960, 3,840 m,
 * and at six, 15 km: anywhere (the Mariana Trench is about 11 km). The continental shelves run to about 200 m; the
 * open ocean's floor lies at 3-6 km.
 */
export const maxDepth = (swim) => (swim <= 0 ? 3 : 15 * 4 ** (swim - 1));

const RINGS = [2000, 3000, 4500, 6500, 9000, 13000, 18000, 25000, 35000, 50000];
const BEARINGS = 12;
/**
 * Where to wake, near a ley node, for a birth. nodes: in the order to try; land(lat, lon) -> true for land (the Köppen
 * map at 0.1°: coarse, so the caller settles the last few hundred metres on the terrain). rand: a seeded stream.
 * Land: a point with land 3 km round it on every side, so not a sliver of coast. Sea: water with land within 8 km,
 * so there's a shore to swim to and a seabed in reach. Returns { lat, lon, node } or null.
 */
export function spawnAround(born, nodes, land, rand) {
  for (const node of nodes) {
    const turn = rand() * 360;
    for (const r of RINGS) {
      for (let b = 0; b < BEARINGS; b++) {
        const p = offset(node.lat, node.lon, turn + (b * 360) / BEARINGS, r * (0.85 + 0.3 * rand()));
        if (Math.abs(p.lat) > 80 || Math.abs(p.lon) > 179.7) continue; // the map's edge reads as sea
        const ok = born === "land"
          ? land(p.lat, p.lon) && [0, 90, 180, 270].every((d) => { const q = offset(p.lat, p.lon, d, 3000); return land(q.lat, q.lon); })
          : !land(p.lat, p.lon) && [0, 45, 90, 135, 180, 225, 270, 315].some((d) => [3000, 5500, 8000].some((m) => { const q = offset(p.lat, p.lon, d, m); return land(q.lat, q.lon); }));
        if (ok) return { lat: p.lat, lon: p.lon, node };
      }
    }
  }
  return null;
}
