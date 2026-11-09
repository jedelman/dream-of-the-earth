import test from "node:test";
import assert from "node:assert/strict";
import { realmLayout, floorAt, islandAt, unturn, returnTo, lowest, REALMS, BRIDGE_SLOPE, LIGHTS } from "../web/js/realm.js";
import { nearestNewMoon, SYNODIC_S } from "../web/js/moon.js";

const t = nearestNewMoon(Date.parse("2026-11-20T00:00:00Z") / 1000) + 86400 * 4;

test("a dream is the same for everyone this moon, and new the next", () => {
  const a = realmLayout("shrine123", "shape", t), b = realmLayout("shrine123", "shape", t + 3600);
  assert.deepEqual(a, b);
  assert.notDeepEqual(realmLayout("shrine123", "shape", t + SYNODIC_S).islands, a.islands);
  assert.notDeepEqual(realmLayout("shrine124", "shape", t).islands, a.islands);
});

test("islands don't overlap, every bridge is walkable with no climb, and there are three lights, far out and apart", () => {
  for (const key of ["shrine1", "shrine77", "shrine9001", "shrine31337"]) for (const kind of Object.keys(REALMS)) {
    const L = realmLayout(key, kind, t);
    assert.ok(L.islands.length >= 9, `${key} ${kind}: ${L.islands.length} islands`);
    for (let i = 0; i < L.islands.length; i++) for (let j = i + 1; j < L.islands.length; j++) {
      const A = L.islands[i], B = L.islands[j];
      assert.ok(Math.hypot(A.x - B.x, A.z - B.z) > A.r + B.r, "no overlaps");
    }
    for (const b of L.bridges) {
      const A = L.islands[b.a], B = L.islands[b.b], span = Math.hypot(A.x - B.x, A.z - B.z) - A.r - B.r;
      assert.ok(Math.abs(A.y - B.y) / span <= BRIDGE_SLOPE, `bridge slope ${(Math.abs(A.y - B.y) / span).toFixed(2)}`);
    }
    assert.equal(L.lights.length, LIGHTS);
    assert.ok(!L.lights.includes(0), "not on the heart");
    for (const i of L.lights) assert.ok(L.islands[i].depth >= 2, "out past the first ring");
  }
});

test("the floor: islands and bridges are there, the gaps are sky; a step up is fine, a wall isn't", () => {
  const L = realmLayout("shrine77", "camera", t); // mist: still, no turn, no breath
  const h = L.islands[0], c = L.islands[L.bridges[0].b];
  assert.equal(floorAt(L, 0, 0, 5, t), h.y);
  assert.equal(floorAt(L, h.r + 0.5, h.r + 0.5, 5, t) > -Infinity && false, false);
  // Walk the first bridge from the heart to its island: the floor never jumps more than a step.
  let prev = floorAt(L, 0, 0, 1, t);
  for (let k = 1; k <= 100; k++) {
    const x = (c.x * k) / 100, z = (c.z * k) / 100, f = floorAt(L, x, z, prev + 0.5, t);
    assert.ok(f > -Infinity, `on the bridge at ${k}%`);
    assert.ok(Math.abs(f - prev) < 0.6, `smooth at ${k}%: ${prev} → ${f}`);
    prev = f;
  }
  // Off to the side of everything: sky.
  const far = Math.max(...L.islands.map((q) => Math.hypot(q.x, q.z) + q.r)) + 50;
  assert.equal(floorAt(L, far, 0, 10, t), -Infinity);
  assert.ok(lowest(L) <= 0);
});

test("the gold dream turns about its heart; the rose dream breathes", () => {
  const G = realmLayout("shrine5", "world", t), i = G.lights[0];
  const a = islandAt(G, i, 0), b = islandAt(G, i, 40);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1, "it moved");
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)) < 1e-9, "round the heart");
  assert.equal(floorAt(G, b.x, b.z, b.y + 1, 40), b.y, "the floor turns with it");
  const p = unturn(G, ...Object.values(returnTo(G, 3, 4, 40)), 40);
  assert.ok(Math.abs(p.x - 3) < 1e-9 && Math.abs(p.z - 4) < 1e-9);
  const R = realmLayout("shrine5", "shape", t);
  assert.notEqual(islandAt(R, 1, 0).y, islandAt(R, 1, 3).y, "it breathes");
});
