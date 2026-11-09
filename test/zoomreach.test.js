import test from "node:test";
import assert from "node:assert/strict";
import { zoomReach, zoomStep, ZOOM_REACH, FEATHER_REACH, ZOOM_MAX, LIFT_TO } from "../web/js/zoomreach.js";
import { shrineHomes, SPELL_IDS, SOARING_SHARE, skyState, WAKES } from "../web/js/shrinelore.js";
import { hash2 } from "../web/js/plantforms.js";
import { findsAround, FEATHER_SHARE } from "../web/js/findlore.js";
import { ITEMS } from "../web/js/inventory.js";

test("the eye's reach: near you, a feather's 60 km, the soaring eye's whole Earth, the high view's for good", () => {
  assert.equal(zoomReach(), ZOOM_REACH);
  assert.equal(zoomReach({ feather: 120 }), FEATHER_REACH);
  assert.equal(zoomReach({ feather: -3 }), ZOOM_REACH, "a spent feather lifts nothing");
  assert.equal(zoomReach({ soaring: 1 }), ZOOM_MAX);
  assert.equal(zoomReach({ highview: true }), ZOOM_MAX);
  // As the soaring eye eases out, its reach falls smoothly to what's under it.
  let prev = Infinity;
  for (let w = 1; w >= 0; w -= 0.05) { const r = zoomReach({ soaring: w }); assert.ok(r <= prev && r >= ZOOM_REACH); prev = r; }
  assert.ok(Math.abs(zoomReach({ soaring: 1e-9, feather: 10 }) - FEATHER_REACH) < 1, "eased out over a feather, it lands on the feather's reach");
  assert.ok(ZOOM_REACH < 1000 && LIFT_TO.feather < FEATHER_REACH && LIFT_TO.soaring > 400000);
});

test("a boost carries the eye up on its own; when it ends, the eye sinks back, never snapping", () => {
  // The soaring eye: from just behind you to the globe in a few seconds.
  let z = 34, goal = LIFT_TO.soaring, s = 0;
  for (; goal != null && s < 30; s += 0.05) ({ zoom: z, goal } = zoomStep(z, goal, ZOOM_MAX, 0.05));
  assert.equal(z, LIFT_TO.soaring);
  assert.ok(s > 4 && s < 12, `rose in ${s.toFixed(1)} s`);
  // Ended: back down to the plain reach, a little each frame.
  let frames = 0;
  while (z > ZOOM_REACH && frames < 1000) { const before = z; ({ zoom: z, goal } = zoomStep(z, null, ZOOM_REACH, 0.05)); assert.ok(z < before && z >= ZOOM_REACH && before / z < 1.2); frames++; }
  assert.equal(z, ZOOM_REACH);
  assert.ok(frames * 0.05 < 6, `sank in ${(frames * 0.05).toFixed(1)} s`);
  // The goal waits for a reach that's still growing (a spell easing in), rather than giving up at it.
  ({ zoom: z, goal } = zoomStep(ZOOM_REACH, LIFT_TO.soaring, ZOOM_REACH, 0.05));
  assert.equal(z, ZOOM_REACH);
  assert.equal(goal, LIFT_TO.soaring);
  // Already past the goal: nothing to do.
  assert.deepEqual(zoomStep(30000, LIFT_TO.feather, FEATHER_REACH, 0.05), { zoom: 30000, goal: null });
});

test("about one shrine in twelve is a soaring eye; every other keeps the spell it held before", () => {
  const land = (c) => ({ p: { x: c.lon * 1000, z: c.lat * 1000 }, h: 10 });
  const held = SPELL_IDS.filter((id) => id !== "soaring");
  assert.equal(held.length, 11, "the eleven spells from before, in their old order");
  let n = 0, soaring = 0;
  for (let lat = -50; lat <= 60; lat += 10) for (let lon = -170; lon <= 170; lon += 20) for (const s of shrineHomes(lat, lon, land)) {
    n++;
    if (s.spell === "soaring") { soaring++; continue; }
    const g = hash2(Number(s.key.slice(6)), 3);
    assert.equal(s.spell, held[g % held.length], s.key);
  }
  assert.ok(Math.abs(soaring / n - SOARING_SHARE) < 0.03, `${soaring} of ${n}`);
});

test("the soaring eye wakes by day", () => {
  const sky = (sunAlt) => ({ moonLon: () => 0, sunLon: () => 0, mercuryLon: (t) => t / 86400, moonAlt: () => 1, sunAlt: () => sunAlt });
  assert.equal(skyState(0, sky(10)).day, true);
  assert.equal(skyState(0, sky(-1)).day, false);
  assert.equal(WAKES.soaring.test(skyState(0, sky(10))), true);
  assert.equal(WAKES.soaring.test(skyState(0, sky(-10))), false);
});

test("far feathers turn up now and then on summits, beaches and meadows, and never on the seabed", () => {
  assert.ok(ITEMS.farfeather && !ITEMS.farfeather.wear);
  const height = (x, z) => (x < 0 ? x / 10 : Math.max(Math.min(60, x / 10), 1600 - Math.hypot(x - 6000, z) * 0.6));
  const toLocal = (lat, lon) => ({ x: lon * 111320 * Math.cos((lat * Math.PI) / 180), z: -(lat - 20) * 110574 });
  const all = [];
  for (let k = 0; k < 40; k++) all.push(...findsAround(20 + k * 0.4, 0, { toLocal: (lat, lon) => toLocal(lat - k * 0.4, lon), height }));
  const feathers = all.filter((f) => f.holds === "farfeather");
  assert.ok(feathers.length > 0);
  assert.ok(feathers.every((f) => FEATHER_SHARE[f.place]), "no feathers on the seabed");
  const meadows = all.filter((f) => f.place === "meadow"), share = meadows.filter((f) => f.holds === "farfeather").length / meadows.length;
  assert.ok(Math.abs(share - FEATHER_SHARE.meadow) < 0.08, `meadow share ${share.toFixed(2)}`);
});
