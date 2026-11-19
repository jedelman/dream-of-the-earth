// The tide where you stand, from where the Moon and the Sun really are (astro.js, sun.js). This is the equilibrium
// tide: the height the pull itself would raise on an Earth all ocean, 3cos²ψ − 1 over 2, ψ the angle between straight up
// and the body, so high water falls under the Moon and opposite it. The Sun's tide is 0.46 of the Moon's; the Moon's
// grows as it comes near (1/distance³). Real coasts lag this by hours, as basins slosh: it's the sky's tide, not a tide
// table. Pure, so Node can test it. Nothing in the world moves by it; it's what the sea tells you when you touch it.
import { moonEcliptic, sunLongitude, horizontal } from "./astro.js";

const DEG = Math.PI / 180;
const SUN_SHARE = 0.46; // the Sun's tide-raising force over the Moon's
const MOON_MEAN = 60.27; // the Moon's mean distance, Earth radii
const pull = (altitudeDeg) => (3 * Math.sin(altitudeDeg * DEG) ** 2 - 1) / 2;
const wrap = (d) => ((d % 360) + 360) % 360;

/** The tide's height at (lat, lon) at t (unix s), in units of the Moon's mean tide: about −0.75 to 1.6. */
export function tideLevel(t, lat, lon) {
  const m = moonEcliptic(t);
  const moon = pull(horizontal(m, t, lat, lon).altitude) * (MOON_MEAN / m.dist) ** 3;
  const sun = pull(horizontal({ lon: sunLongitude(t), lat: 0 }, t, lat, lon).altitude);
  return moon + SUN_SHARE * sun;
}

const STEP = 600, AHEAD = 16 * 3600;
/**
 * The tide here and now: { level, rising, turnS (seconds until it next turns, or null where it hardly moves),
 * turn: "high" | "low", moons: "spring" | "neap" | "" }. Spring tides: the Sun and Moon in line (new and full moon);
 * neap: at right angles (the quarters).
 */
export function tideNow(t, lat, lon) {
  const at = (s) => tideLevel(s, lat, lon);
  const level = at(t), rising = at(t + STEP) > level;
  let turnS = null;
  for (let s = STEP, prev = level; s <= AHEAD; s += STEP) {
    const next = at(t + s);
    if (next > prev !== rising) {
      // The turn is in the last two steps: narrow it to about a minute.
      let lo = s - 2 * STEP, hi = s;
      for (let k = 0; k < 5; k++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (at(t + a) > at(t + b) === rising) hi = b; else lo = a;
      }
      turnS = Math.max(0, (lo + hi) / 2);
      break;
    }
    prev = next;
  }
  const elong = wrap(moonEcliptic(t).lon - sunLongitude(t)), fromLine = Math.min(elong % 180, 180 - (elong % 180));
  return { level, rising, turnS, turn: rising ? "high" : "low", moons: fromLine < 25 ? "spring" : fromLine > 65 ? "neap" : "" };
}

// The sea rises and falls (Jason, 11-19: "Absolutely! And large enough lakes should have tides!"). Dream tides: the
// equilibrium tide above, a metre to the Moon's mean pull, so from about 0.75 m under the mean to 1.6 m over at a spring
// tide. Real coasts range from nothing to 15 m and lag the sky by hours; this is the sky's tide, the same everywhere for
// the same Moon. Lakes rise and fall by the same pull, more the bigger they are: full at 20,000 km² (the Great Lakes,
// Victoria, Baikal), Titicaca about 40%, Geneva a few centimetres.
export const TIDE_M = 1;
export const LAKE_FULL_KM2 = 20000;
/** How high the sea stands above its mean at (lat, lon) at t (unix s), metres. */
export const seaRise = (t, lat, lon) => TIDE_M * tideLevel(t, lat, lon);
/** How much of the sea's rise a lake of this area (km²) feels, 0..1. */
export const lakeTideShare = (km2) => Math.max(0, Math.min(1, km2 / LAKE_FULL_KM2));

/** "about 3 hours", "about half an hour", "minutes". */
export function soonText(s) {
  if (s < 20 * 60) return "minutes";
  if (s < 45 * 60) return "about half an hour";
  const h = Math.round(s / 3600);
  return h <= 1 ? "about an hour" : `about ${h} hours`;
}

/** What the tide is doing, in a sentence: "By the Moon's pull the tide is rising here: high water in about 3 hours." */
export function tideLine(tide) {
  const moons = tide.moons === "spring" ? " Spring tides: the Sun and the Moon pull in line." : tide.moons === "neap" ? " Neap tides: the Sun pulls across the Moon." : "";
  if (tide.turnS == null) return `By the Moon's pull the tide hardly stirs here today.${moons}`;
  if (tide.turnS < 20 * 60) return `By the Moon's pull it's ${tide.turn} water here, the tide on the turn.${moons}`;
  return `By the Moon's pull the tide is ${tide.rising ? "rising" : "falling"} here: ${tide.turn} water in ${soonText(tide.turnS)}.${moons}`;
}
