import test from "node:test";
import assert from "node:assert/strict";
import { smoothDamp, shotWeight, bankFor, fovFor, orbitRate, angleTo } from "../web/js/camerawork.js";

test("the spring arrives in about its smooth time, without overshooting", () => {
  let x = 0, v = 0;
  const xs = [];
  for (let k = 0; k < 120; k++) { [x, v] = smoothDamp(x, 10, v, 0.4, 1 / 60); xs.push(x); }
  assert.ok(xs.every((q) => q <= 10 + 1e-9), "no overshoot");
  const at = (s) => xs[Math.round(s * 60) - 1];
  assert.ok(at(0.4) > 5 && at(0.4) < 10, `halfway-ish at the smooth time: ${at(0.4)}`);
  assert.ok(at(2) > 9.9, `there by 2 s: ${at(2)}`);
  // Frame rate doesn't change where it ends up.
  let y = 0, w = 0;
  for (let k = 0; k < 240; k++) [y, w] = smoothDamp(y, 10, w, 0.4, 1 / 120);
  assert.ok(Math.abs(y - xs[119]) < 0.05);
});

test("an event shot eases in, holds, and eases out", () => {
  assert.equal(shotWeight(-0.1, 3), 0);
  assert.equal(shotWeight(3.1, 3), 0);
  assert.ok(shotWeight(0.3, 3) > 0 && shotWeight(0.3, 3) < 1);
  assert.equal(shotWeight(1.5, 3), 1);
  assert.ok(shotWeight(2.7, 3) < 0.5);
  assert.equal(shotWeight(0, 4, 0, 1), 1); // an establishing shot starts at full
});

test("banking, field of view and the idle orbit", () => {
  assert.ok(bankFor(1, 1) < 0 && bankFor(-1, 1) > 0, "lean into the turn");
  assert.equal(bankFor(1, 0), 0);
  assert.ok(Math.abs(bankFor(50, 1)) <= 0.21, "capped");
  assert.ok(fovFor(1) > fovFor(0) && fovFor(0, true) > fovFor(1));
  assert.ok(orbitRate(1, 1) < orbitRate(0, 1) && orbitRate(1, 0) === orbitRate(0, 0), "lingers on a golden sun");
  assert.ok(Math.abs(angleTo(3.1, -3.1) - (2 * Math.PI - 6.2)) < 1e-9, "the short way round");
});
