// Tilt to steer (Jason, 11-09: "Let's give the mobile HUD a makeover as well. Minimalist and context driven. Maybe we can
// use the accelerometer?"). Opt-in, from the ☰ menu: tip the phone left or right to turn, away or toward you to go or slow,
// measured from however you held it when you switched it on. A quick shake squeaks. The phone's motion never leaves the
// phone, and it says nothing about where you are (this game never asks for location). Pure, so Node can test it.

/** Degrees of tilt that do nothing (a hand is never quite still), and the tilt that gives full turn or thrust. */
export const TILT_DEAD = 5, TILT_FULL = 24;
/** Going forward and back needs a firmer tilt than turning (so holding the phone loosely doesn't wander). */
export const PITCH_DEAD = 9, PITCH_FULL = 28;

/**
 * The phone's tilt in the screen's terms: { roll (right side down, degrees), pitch (top tipped away, degrees) }. beta,
 * gamma: from deviceorientation; angle: the screen's rotation (0, 90, 180, 270 or -90).
 */
export function screenTilt(beta, gamma, angle = 0) {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  if (a === 90) return { roll: beta, pitch: gamma };
  if (a === 270) return { roll: -beta, pitch: -gamma };
  if (a === 180) return { roll: -gamma, pitch: beta };
  return { roll: gamma, pitch: -beta };
}

const wrap = (d) => ((d + 540) % 360) - 180; // −180..180, so a reading crossing ±180 doesn't jump
const curve = (d, dead, full) => {
  const m = Math.abs(d);
  return m <= dead ? 0 : Math.sign(d) * Math.min(1, (m - dead) / (full - dead));
};

/** Turn (−1 left … 1 right) and thrust (−1 back … 1 forward) from a tilt and the neutral it's measured from. */
export function tiltSteer(now, neutral) {
  return { turn: curve(wrap(now.roll - neutral.roll), TILT_DEAD, TILT_FULL), thrust: curve(wrap(now.pitch - neutral.pitch), PITCH_DEAD, PITCH_FULL) };
}

/** A shake: two hard jolts (|a| over SHAKE_G m/s², gravity included) within SHAKE_GAP s; then quiet for SHAKE_REST s. */
export const SHAKE_G = 24, SHAKE_GAP = 0.5, SHAKE_REST = 1.5;
/** A detector: feed it (magnitude m/s², t s); it returns true on the jolt that completes a shake. */
export function shakeDetector() {
  let last = -Infinity, armed = false, quietUntil = -Infinity, above = false;
  return (mag, t) => {
    const hard = mag > SHAKE_G;
    const rising = hard && !above; // count each jolt once, on its way up
    above = hard;
    if (!rising || t < quietUntil) return false;
    if (armed && t - last <= SHAKE_GAP) { armed = false; quietUntil = t + SHAKE_REST; return true; }
    armed = true; last = t;
    return false;
  };
}
