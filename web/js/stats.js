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
 * Movement numbers, in metres per second. Each is a power law in its stat (Jason, 11-09: "Should be a power law"):
 *
 *   v = v0 · (1 + stat)^p
 *
 * so every point multiplies your speed, the first the most (×2^p) and the sixth the least (×(7/6)^p): spreading
 * points pays better than piling them on. Movement your body makes (running, jumping, swimming, diving) also scales
 * with your size the way animals' does, as the square root of leg length (the same Froude number, v²/gL, keeps the
 * same gait): `size` is your body's scale against a typical creature's (1 at scale 1.2; a giant is 6, so √6 ≈ 2.4×
 * faster). Shrinking every creature to 0.4 m per body unit (11-09) took ground speeds down by √0.4 ≈ 0.63. Wings are
 * the dream's: flying doesn't care how big you are. With no points you're slow, not stuck.
 */
export const POWER = {
  run: { v0: 5, p: 1.1 }, // 5 → 42.6 m/s (was 8 + 10·run: 8 → 68)
  jump: { v0: 3.8, p: 0.71 }, // 3.8 → 15.2 m/s off the ground (was 6 + 3·run)
  swim: { v0: 2.5, p: 1.18 }, // 2.5 → 24.9 m/s (was 4 + 6·swim)
  dive: { v0: 1.3, p: 1.65 }, // 1.3 → 32 m/s down (was 2 + 8·swim)
  fly: { v0: 30, p: 0.97 }, // 30 → 198 m/s (as before, now a power law)
  climb: { v0: 4, p: 1.18 }, // 4 → 39.6 m/s up (as before)
};
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
