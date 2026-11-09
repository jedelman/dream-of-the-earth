// How far back your eye can pull (Jason, 11-09: "let's limit zoom out distance. We can have shrines and items that
// temporarily boost it and zoom way out."). Most of the time the camera stays near you, about 500 m off at most: the
// land is something you cross, not a map. A far feather lifts your eye to 60 km for three minutes; a shrine of the
// soaring eye takes it all the way up, to the whole Earth, for its minute; the rhizome's high view keeps it there for
// good. Either boost also carries the eye up on its own, and when one ends the eye sinks back to you. Pure, so Node can test it.

/** Your eye's reach (m) with no boost. */
export const ZOOM_REACH = 500;
/** A far feather's reach (m), and for how long (s). */
export const FEATHER_REACH = 60000, FEATHER_S = 180;
/** The farthest the camera ever goes: the whole Earth and then some. */
export const ZOOM_MAX = 4e7;
/** Where each boost carries your eye on its own (m): a feather over the country round you; the soaring eye to the globe. */
export const LIFT_TO = { feather: 20000, soaring: 16e6 };
/** How fast the eye rises to a boost's height and sinks back after (e-folds a second, in distance). */
export const RISE = 1.6, SINK = 3;

/**
 * The reach (m) just now. highview: the rhizome's power; soaring: the soaring eye's strength, 0 to 1 (it eases in and
 * out with its spell); feather: seconds of a far feather left (0 or less: none).
 */
export function zoomReach({ highview = false, soaring = 0, feather = 0 } = {}) {
  if (highview) return ZOOM_MAX;
  const floor = feather > 0 ? FEATHER_REACH : ZOOM_REACH;
  if (soaring <= 0) return floor;
  if (soaring >= 1) return ZOOM_MAX;
  // In log distance, so the eye's last seconds of soaring drop smoothly back down to the floor.
  return Math.exp(Math.log(floor) + (Math.log(ZOOM_MAX) - Math.log(floor)) * soaring);
}

/**
 * One frame of the eye: { zoom, goal }. Past the reach it sinks back (not snapping, so a boost ending is a slow fall
 * home), and any goal is dropped; short of a goal it rises toward it, as far as the reach allows (a boost's reach grows
 * as its spell eases in, and the eye waits on it), and the goal is spent once reached.
 */
export function zoomStep(zoom, goal, reach, dt) {
  if (zoom > reach) return { zoom: Math.max(reach, zoom * Math.exp(-SINK * dt)), goal: null };
  if (goal == null || zoom >= goal) return { zoom, goal: null };
  const next = Math.min(goal, reach, zoom * Math.exp(RISE * dt));
  return { zoom: next, goal: next >= goal ? null : goal };
}
