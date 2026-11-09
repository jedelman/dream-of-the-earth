// The moon's phase, from the mean synodic month: new moons fall 29.53 days apart, counted from the one on
// 6 January 2000 at 18:14 UTC. The mean can be off from the true new moon by some hours (the moon's orbit isn't a
// circle), so the window is a day either side. Jason, 11-09: "respecs only during a new moon", then "Let's grant respecs
// at the new moon but have them be an item so they can be spent or saved": a moonseed falls in each window.
export const SYNODIC_S = 29.530588853 * 86400;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14) / 1000;
export const RESPEC_S = 86400; // a day either side of the new moon

/** Where in its month the moon is at t (s since 1970): 0 new, 0.5 full, back to 1. */
export const moonPhase = (t) => ((((t - NEW_MOON_2000) / SYNODIC_S) % 1) + 1) % 1;
/** The nearest new moon to t (s). */
export const nearestNewMoon = (t) => NEW_MOON_2000 + Math.round((t - NEW_MOON_2000) / SYNODIC_S) * SYNODIC_S;
/** The next new moon at or after t (s). */
export const nextNewMoon = (t) => NEW_MOON_2000 + Math.ceil((t - NEW_MOON_2000) / SYNODIC_S) * SYNODIC_S;
/** Which new moon is nearest t, counted from January 2000 (each lunation has its own number). */
export const lunationOf = (t) => Math.round((t - NEW_MOON_2000) / SYNODIC_S);
/** Whether t is within a day of a new moon: when a moonseed falls (11-09: respecs became an item). */
export const canRespec = (t) => Math.abs(t - nearestNewMoon(t)) <= RESPEC_S;
export const seedFalls = canRespec;
/** When the window around the coming (or current) new moon opens and closes: { opens, closes } (s). */
export function respecWindow(t) {
  const m = canRespec(t) ? nearestNewMoon(t) : nextNewMoon(t);
  return { opens: m - RESPEC_S, closes: m + RESPEC_S };
}
/** "tonight", "tomorrow", "in 12 days", for the editor. */
export function whenText(s, nowS) {
  const d = (s - nowS) / 86400;
  if (d < 0.5) return "within hours";
  if (d < 1.5) return "tomorrow";
  return `in ${Math.round(d)} days`;
}
