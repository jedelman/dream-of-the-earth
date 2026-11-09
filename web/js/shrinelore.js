// Shrines (Jason, 11-09: "let's make the game more psychedelic by scattering shrines that temporarily alter your shape,
// camera, or worldview!"). Where they stand and what each does, pure, so Node can test it; shrines.js draws them and
// main.js casts their spells. Like everything else in the world they're computed: the same shrine in the same place on
// every phone, holding the same spell. The spell itself is yours alone, for a minute, and changes nothing.
import { cellsAround, unit, hash2 } from "./plantforms.js";

export const SHRINE = { cell: 1400, radius: 3600, salt: 977, chance: 0.4, max: 24 };
export const SPELL_S = 60, EASE_S = 2.5;
/** A spell's colour, by what it changes: your shape (pink), the camera (cyan), the world (gold). */
export const KIND_COLOUR = { shape: 0xff7ad9, camera: 0x7af0ff, world: 0xffd34d };

export const SPELLS = {
  giant: { short: "GIANT", kind: "shape", name: "the shrine of giants", line: "You grow and grow. The kapoks come up to your chest now." },
  tiny: { short: "TINY", kind: "shape", name: "the shrine of small things", line: "You shrink and shrink. The grass is a forest." },
  taffy: { short: "TAFFY", kind: "shape", name: "the taffy shrine", line: "You stretch up, long and thin as pulled taffy." },
  mask: { short: "MASKED", kind: "shape", name: "the shrine of masks", line: "You put on another creature, and it fits." },
  upturned: { short: "UPTURNED SKY", kind: "camera", name: "the shrine of the upturned sky", line: "The sky swings down beneath you. You hang from the land." },
  fisheye: { short: "FISHEYE", kind: "camera", name: "the fisheye shrine", line: "The world bulges round you like the inside of a bubble." },
  turning: { short: "TURNING", kind: "camera", name: "the shrine of turning", line: "The horizon begins to turn, slow as a millwheel." },
  colours: { short: "COLOURS", kind: "world", name: "the shrine of colours", line: "Every colour starts to slide along the rainbow." },
  kaleido: { short: "KALEIDOSCOPE", kind: "world", name: "the kaleidoscope shrine", line: "The world folds itself into six mirrors." },
  melt: { short: "MELTING", kind: "world", name: "the melting shrine", line: "Everything begins to melt and run, gently." },
  days: { short: "SPINNING DAYS", kind: "world", name: "the shrine of spinning days", line: "The sun races round the sky: a day goes by in a minute." },
};
export const SPELL_IDS = Object.keys(SPELLS);

// ---- The shrines keep the astrological clock (11-09) ----
// Each wakes under part of the real sky, matched to its spell: the Moon's phase for your shape, the Moon's element for
// the world's look, and for the camera, Mercury turning back, the Moon being up where the shrine stands, or night.
// Asleep it's dark; awake it glows; used, it rests for you until it has slept and woken again.
const ELEMENT = ["fire", "earth", "air", "water"]; // ♈ fire, ♉ earth, ♊ air, ♋ water, and round again
export const WAKES = {
  giant: { when: "at the full moon", test: (s) => s.phase >= 0.375 && s.phase < 0.625 },
  tiny: { when: "at the new moon", test: (s) => s.phase < 0.125 || s.phase >= 0.875 },
  taffy: { when: "while the Moon waxes", test: (s) => s.phase >= 0.125 && s.phase < 0.375 },
  mask: { when: "while the Moon wanes", test: (s) => s.phase >= 0.625 && s.phase < 0.875 },
  colours: { when: "when the Moon is in a fire sign (♈ ♌ ♐)", test: (s) => s.element === "fire" },
  days: { when: "when the Moon is in an earth sign (♉ ♍ ♑)", test: (s) => s.element === "earth" },
  kaleido: { when: "when the Moon is in an air sign (♊ ♎ ♒)", test: (s) => s.element === "air" },
  melt: { when: "when the Moon is in a water sign (♋ ♏ ♓)", test: (s) => s.element === "water" },
  turning: { when: "when Mercury turns retrograde", test: (s) => s.mercuryRetro },
  upturned: { when: "while the Moon is up", test: (s) => s.moonUp },
  fisheye: { when: "at night", test: (s) => s.night },
};

/**
 * The parts of the sky the shrines wake to, at t (s) for a place: { phase (0 new, 0.5 full), element (the Moon's),
 * mercuryRetro, moonUp, night }. sky: { moonLon, sunLon, mercuryLon(t) } and alt(t, which) come from astro.js and
 * sun.js through the caller, so this stays pure and cheap to test.
 */
export function skyState(t, sky) {
  const elong = (((sky.moonLon(t) - sky.sunLon(t)) % 360) + 360) % 360;
  const m0 = sky.mercuryLon(t), m1 = sky.mercuryLon(t + 86400);
  return {
    phase: elong / 360,
    element: ELEMENT[Math.floor((((sky.moonLon(t) % 360) + 360) % 360) / 30) % 4],
    mercuryRetro: ((m1 - m0 + 540) % 360) - 180 < 0,
    moonUp: sky.moonAlt(t) > 0,
    night: sky.sunAlt(t) < -6,
  };
}
/** Whether a spell's shrine is awake at t. */
export const awake = (spell, t, sky) => WAKES[spell].test(skyState(t, sky));
/**
 * When the present waking began (s): scanning back an hour at a time, up to 45 days. A shrine you used before this
 * has rested. -Infinity if it has been awake that whole time; null if it isn't awake now.
 */
export function wokeAt(spell, t, sky) {
  if (!awake(spell, t, sky)) return null;
  for (let k = 1; k <= 45 * 24; k++) if (!awake(spell, t - k * 3600, sky)) return t - (k - 1) * 3600;
  return -Infinity;
}
/** A shrine's state for you: "asleep", "awake", or "resting" (you've had its gift this waking). */
export function shrineState(spell, t, sky, usedAt = null) {
  const w = wokeAt(spell, t, sky);
  if (w === null) return "asleep";
  return usedAt !== null && usedAt >= w ? "resting" : "awake";
}

/** Shrines near a point: [{ key, x, z, h, seed, spell }]. at(cell) -> { p: { x, z }, h } or null (the sea). */
export function shrineHomes(lat, lon, at) {
  const out = [];
  for (const c of cellsAround(lat, lon, SHRINE.radius, SHRINE.cell, SHRINE.salt)) {
    if (unit(c.h) >= SHRINE.chance) continue;
    const s = at(c);
    if (!s) continue;
    const g = hash2(c.h, 3);
    out.push({ key: `shrine${c.h}`, x: s.p.x, z: s.p.z, h: s.h, seed: unit(g, 5), spell: SPELL_IDS[g % SPELL_IDS.length] });
    if (out.length >= SHRINE.max) break;
  }
  return out;
}

/** How strongly a spell holds at age seconds: easing in, a minute at full, easing out; 0 when it's over. */
export function spellWeight(age, dur = SPELL_S) {
  if (age < 0 || age >= dur) return 0;
  const k = Math.min(1, age / EASE_S, (dur - age) / EASE_S);
  return k * k * (3 - 2 * k);
}

/** Your body under a shape spell: a scale per axis (x, y, z) and how far the camera pulls back, at weight w. */
export function shapeOf(spell, w) {
  const mix = (a, b) => a + (b - a) * w;
  if (spell === "giant") return { x: mix(1, 6), y: mix(1, 6), z: mix(1, 6), zoom: mix(1, 5) };
  if (spell === "tiny") return { x: mix(1, 0.25), y: mix(1, 0.25), z: mix(1, 0.25), zoom: mix(1, 0.35) };
  if (spell === "taffy") return { x: mix(1, 0.55), y: mix(1, 3.2), z: mix(1, 0.55), zoom: mix(1, 1.8) };
  return { x: 1, y: 1, z: 1, zoom: 1 };
}

/** The turning camera: four whole turns over the spell, slow at each end (so it comes back level). */
export function turnOf(age, dur = SPELL_S) {
  if (age <= 0 || age >= dur) return 0;
  const u = age / dur;
  return Math.PI * 2 * 4 * u * u * (3 - 2 * u);
}

/** The spinning days: how far ahead the sun is (s) at age seconds, a whole day over the spell, slow at each end. */
export function sunAhead(age, dur = SPELL_S) {
  if (age <= 0 || age >= dur) return 0;
  const u = age / dur;
  return 86400 * u * u * (3 - 2 * u);
}
