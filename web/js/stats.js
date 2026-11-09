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
 * Movement numbers, in metres per second. Each is a power law in its stat (Jason, 11-09: "Should be a power law",
 * then "Let's aim for p=√3"):
 *
 *   v = v0 · (1 + stat)^√3
 *
 * so every point multiplies your speed, and the later points multiply it more in metres a second: a maxed stat
 * (×29 over none) is far quicker than a middling one. The curves are pinned at the middle: a creature with 3 points
 * in a stat (the average, 12 points over four stats) moves as it did before p changed; fewer is slower, more is much
 * faster. Movement your body makes (running, jumping, swimming, diving) also scales with your size the way animals'
 * does, as the square root of leg length (the same Froude number, v²/gL, keeps the same gait): `size` is your body's
 * scale against a typical creature's (1 at scale 1.2; a giant is 6, so √6 ≈ 2.4× faster). Wings are the dream's:
 * flying doesn't care how big you are. With no points you're slow, not stuck (except for jumping: a hop of 2 cm).
 */
export const P = Math.sqrt(3);
/** What a creature with 3 points does (the curves' pin), m/s. */
const MID = { run: 23, jump: 10.2, swim: 12.8, dive: 12.8, fly: 115.1, climb: 20.5 };
/** v0 for each (its speed with no points), from the pin: v0 = MID / 4^√3. */
export const POWER = Object.fromEntries(Object.entries(MID).map(([k, v3]) => [k, { v0: v3 / 4 ** P, p: P }]));
/** A typical creature's scale, against which `size` is measured. */
export const TYPICAL_SCALE = 1.2;
const power = (k, stat) => POWER[k].v0 * (1 + stat) ** POWER[k].p;

export function speeds(s, size = 1) {
  const leg = Math.sqrt(Math.max(0.01, size));
  return {
    fly: power("fly", s.fly), // cruise in the air
    climb: power("climb", s.fly),
    glideSink: s.fly === 0 ? 6 : 0, // zero fly: a slow glide down
    run: power("run", s.run) * leg,
    jump: power("jump", s.run) * leg,
    swim: power("swim", s.swim) * leg,
    dive: power("dive", s.swim) * leg, // how fast you can go down (oceans keep their real depth)
    gleam: s.gleam / MAX, // 0..1, purely visual
  };
}
