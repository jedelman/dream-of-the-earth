// Creature stats: fly, swim, run, gleam. One budget (proposal: 12 points, 0-6
// each). Gleam only makes you shinier.
export const STATS = ["fly", "swim", "run", "gleam"];
export const BUDGET = 12;
export const MAX = 6;

export function valid(s) {
  return STATS.every((k) => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= MAX) &&
    STATS.reduce((t, k) => t + s[k], 0) <= BUDGET;
}

/** Spend the whole budget at random (seeded). */
export function randomStats(rand) {
  const s = { fly: 0, swim: 0, run: 0, gleam: 0 };
  let left = BUDGET;
  while (left > 0) {
    const k = STATS[Math.floor(rand() * STATS.length)];
    if (s[k] < MAX) { s[k]++; left--; }
  }
  return s;
}

/** Parse "f,s,r,g" from a URL; null if it breaks the rules. */
export function parseStats(str) {
  if (!str) return null;
  const parts = str.split(",").map(Number);
  if (parts.length !== 4) return null;
  const s = Object.fromEntries(STATS.map((k, i) => [k, parts[i]]));
  return valid(s) ? s : null;
}

/**
 * Movement numbers in metres per second. With no points you're slow, not
 * stuck: zero fly still glides, zero swim still paddles, zero run still walks.
 */
export function speeds(s) {
  return {
    fly: 30 + 28 * s.fly, // cruise in the air
    climb: 4 + 6 * s.fly,
    glideSink: s.fly === 0 ? 6 : 0, // zero fly: a slow glide down
    run: 8 + 10 * s.run,
    jump: 6 + 3 * s.run,
    swim: 4 + 6 * s.swim,
    dive: 2 + 8 * s.swim, // how fast you can go down (oceans keep their real depth)
    gleam: s.gleam / MAX, // 0..1, purely visual
  };
}
