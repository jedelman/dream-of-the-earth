import test from "node:test";
import assert from "node:assert/strict";
import { screenTilt, tiltSteer, shakeDetector, TILT_DEAD, TILT_FULL, PITCH_DEAD, SHAKE_G, SHAKE_REST } from "../web/js/tilt.js";

test("held upright in portrait: right side down turns right, the top tipped away goes forward", () => {
  const neutral = screenTilt(60, 0, 0);
  assert.deepEqual(tiltSteer(screenTilt(60, 0, 0), neutral), { turn: 0, thrust: 0 });
  assert.ok(tiltSteer(screenTilt(60, 15, 0), neutral).turn > 0.3, "right side down: right");
  assert.ok(tiltSteer(screenTilt(60, -15, 0), neutral).turn < -0.3, "left side down: left");
  assert.ok(tiltSteer(screenTilt(40, 0, 0), neutral).thrust > 0.3, "top tipped away (toward flat): forward");
  assert.ok(tiltSteer(screenTilt(80, 0, 0), neutral).thrust < -0.3, "top tipped toward you: back");
});

test("a hand's wobble does nothing; past the full tilt it's full", () => {
  const n = { roll: 0, pitch: 0 };
  assert.equal(tiltSteer({ roll: TILT_DEAD - 0.5, pitch: PITCH_DEAD - 0.5 }, n).turn, 0);
  assert.equal(tiltSteer({ roll: TILT_DEAD - 0.5, pitch: PITCH_DEAD - 0.5 }, n).thrust, 0);
  assert.equal(tiltSteer({ roll: TILT_FULL + 10, pitch: 0 }, n).turn, 1);
  assert.equal(tiltSteer({ roll: -(TILT_FULL + 10), pitch: 0 }, n).turn, -1);
  assert.ok(tiltSteer({ roll: TILT_DEAD + 0.5, pitch: 0 }, n).turn < 0.05, "no jump at the edge of the dead zone");
});

test("each screen rotation maps the phone's axes to the screen's", () => {
  // Turned to landscape (90), beta is the screen's roll; upside down (180) everything flips.
  assert.deepEqual(screenTilt(10, 20, 90), { roll: 10, pitch: 20 });
  assert.deepEqual(screenTilt(10, 20, 270), { roll: -10, pitch: -20 });
  assert.deepEqual(screenTilt(10, 20, -90), { roll: -10, pitch: -20 }, "-90 is 270");
  assert.deepEqual(screenTilt(10, 20, 180), { roll: -20, pitch: 10 });
});

test("a reading crossing ±180 doesn't swing the steering", () => {
  const r = tiltSteer({ roll: -178, pitch: 0 }, { roll: 178, pitch: 0 });
  assert.equal(r.turn, 0, "4° apart across the seam: still in the dead zone");
});

test("a shake is two hard jolts close together, once, then a rest", () => {
  const shake = shakeDetector(), hard = SHAKE_G + 6, soft = 9.8;
  assert.equal(shake(hard, 0), false, "one jolt isn't a shake");
  assert.equal(shake(hard, 0.05), false, "still the same jolt");
  assert.equal(shake(soft, 0.1), false);
  assert.equal(shake(hard, 0.3), true, "the second jolt: a shake");
  assert.equal(shake(soft, 0.4), false);
  assert.equal(shake(hard, 0.6), false, "resting");
  assert.equal(shake(soft, 0.7), false);
  assert.equal(shake(hard, 0.8), false, "still resting");
  const s2 = shakeDetector();
  assert.equal(s2(hard, 0), false); assert.equal(s2(soft, 0.2), false);
  assert.equal(s2(hard, 1.2), false, "too far apart: a new first jolt");
  void SHAKE_REST;
});
