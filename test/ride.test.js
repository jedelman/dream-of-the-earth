import test from "node:test";
import assert from "node:assert/strict";
import { lineAt, lineCount, pointOn, tangentEN, chooseCapture, startRide, advance, hop, linesNear, rideSpeed, RIDE_BASE } from "../web/js/ride.js";
import { vecToLatLon, R_EARTH } from "../web/js/geo.js";

const at = (line, t) => vecToLatLon(pointOn(line, t));

test("rarer is faster: speed doubles per rank", () => {
  assert.deepEqual([0, 1, 2, 3].map(rideSpeed), [1, 2, 4, 8].map((k) => k * RIDE_BASE));
});

test("flying along a line boards it, in the direction you're heading", () => {
  const line = lineAt(310); // a Becker-Hagens line
  const { lat, lon } = at(line, 0.37);
  const fwd = tangentEN(line, 0.37, 1);
  const c = chooseCapture(lat, lon, fwd);
  assert.ok(c, "should board");
  assert.equal(c.dir, 1);
  const back = chooseCapture(lat, lon, { e: -fwd.e, n: -fwd.n });
  assert.equal(back.dir, -1);
});

test("crossing a highway at right angles doesn't snatch you", () => {
  const line = lineAt(310);
  const { lat, lon } = at(line, 0.37);
  const fwd = tangentEN(line, 0.37, 1);
  const c = chooseCapture(lat, lon, { e: -fwd.n, n: fwd.e });
  assert.ok(!c || c.line.i !== line.i, "should not board the line you're crossing");
});

test("a ride reaches the node at the end of its line", () => {
  const line = lineAt(310);
  const ride = startRide({ line, t: 0.9, dir: 1 });
  let seconds = 0;
  while (!ride.done && seconds < 120) { advance(ride, 0.05); seconds += 0.05; }
  assert.ok(ride.done, "should arrive");
  assert.equal(ride.t, 1);
  const lengthKm = (line.arc * R_EARTH * 0.1) / 1000;
  assert.ok(seconds < 30, `took ${seconds.toFixed(1)} s for the last ${lengthKm.toFixed(0)} km`);
});

test("at a crossing, A/D hops onto the other line", () => {
  // Find a point where a Becker-Hagens line crosses a gravity-wells line mid-arc.
  let found = null;
  for (let i = 304; i < 484 && !found; i++) {
    const line = lineAt(i);
    for (let k = 1; k < 400 && !found; k++) {
      const t = k / 400;
      const { lat, lon } = at(line, t);
      const others = linesNear(lat, lon).filter((c) => c.line.i !== i && c.t > 0.02 && c.t < 0.98);
      if (others.length && t > 0.02 && t < 0.98) found = { line, t };
    }
  }
  assert.ok(found, "the networks should cross somewhere");
  const ride = startRide({ line: found.line, t: found.t, dir: 1 });
  const left = hop(ride, -1), right = hop(ride, 1);
  assert.ok(left && right);
  assert.notEqual(left.line.i, found.line.i);
  assert.equal(left.line.i, right.line.i);
  assert.equal(left.dir, -right.dir, "left and right go opposite ways along the new line");
});

test("line count", () => assert.equal(lineCount(), 724));
