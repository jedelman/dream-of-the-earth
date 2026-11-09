// Creature stats: climb, swim, run, gleam, perception. One budget: 12 points, 0-6 each. Gleam only makes you
// shinier. (Jason, 11-09: "perception stat that expands what you can see", "We should swap the fly stat for a climb
// stat and make terrain above a certain slope impassible. Fly stat unlocks after a dream quest", and perception
// starts at 0, the budget staying 12.) Until the dream quest exists, your wings run on climb: the old fly points.
export const STATS = ["climb", "swim", "run", "gleam", "perception"];
export const BUDGET = 12;
export const MAX = 6;
const LEGACY = ["fly", "swim", "run", "gleam"]; // before 11-09: four stats, fly where climb is now

export function valid(s) {
  return STATS.every((k) => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= MAX) &&
    STATS.reduce((t, k) => t + s[k], 0) <= BUDGET;
}

/** Stats from a list of numbers: five (climb, swim, run, gleam, perception) or the old four (fly, swim, run, gleam:
 * fly becomes climb, perception 0). null if it breaks the rules. */
export function statsFrom(list) {
  if (!Array.isArray(list) || (list.length !== 4 && list.length !== 5)) return null;
  const s = { climb: list[0], swim: list[1], run: list[2], gleam: list[3], perception: list.length === 5 ? list[4] : 0 };
  return valid(s) ? s : null;
}
/** Stats as a list of five numbers, in STATS order (for records and URLs). */
export const statsList = (s) => STATS.map((k) => s[k]);

/**
 * Spend the whole budget at random (seeded), the way it was done before perception existed (so a seed's creature
 * keeps its stats), with perception starting at 0.
 */
export function randomStats(rand) {
  const s = { fly: 0, swim: 0, run: 0, gleam: 0 };
  let left = BUDGET;
  while (left > 0) {
    const k = LEGACY[Math.floor(rand() * LEGACY.length)];
    if (s[k] < MAX) { s[k]++; left--; }
  }
  return { climb: s.fly, swim: s.swim, run: s.run, gleam: s.gleam, perception: 0 };
}

/** Parse "c,s,r,g,p" (or the old "f,s,r,g") from a URL; null if it breaks the rules. */
export function parseStats(str) {
  if (!str) return null;
  return statsFrom(String(str).split(",").map(Number));
}

/**
 * The steepest slope you can climb on foot, in degrees: 18° with no climb, 4.5° more a point, 45° at six. Nothing
 * climbs past 45° (about 1-3% of the high ranges, at this terrain's resolution), whatever its stats.
 */
export const SLOPE_LIMIT = 45;
export const maxSlopeDeg = (climb) => Math.min(SLOPE_LIMIT, 18 + 4.5 * climb);

/**
 * How far you see, against a balanced creature (perception 3): √((1 + perception) / 4), half as far with none,
 * 1.3× at six. And from perception 3 you see the sky beings.
 */
export const sightOf = (perception) => Math.sqrt((1 + perception) / 4);
export const SEE_BEINGS = 3;

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

/** wings: the stat your flight runs on (climb, until the dream quest gives flight its own). */
export function speeds(s, size = 1, wings = s.climb) {
  const leg = Math.sqrt(Math.max(0.01, size));
  return {
    fly: power("fly", wings), // cruise in the air
    climb: power("climb", wings), // straight up, flying
    glideSink: wings === 0 ? 6 : 0, // no wings to speak of: a slow glide down
    maxSlope: Math.tan((maxSlopeDeg(s.climb) * Math.PI) / 180), // rise over run, on foot
    run: power("run", s.run) * leg,
    jump: power("jump", s.run) * leg,
    swim: power("swim", s.swim) * leg,
    dive: power("dive", s.swim) * leg, // how fast you can go down (oceans keep their real depth)
    gleam: s.gleam / MAX, // 0..1, purely visual
  };
}
