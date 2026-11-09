import test from "node:test";
import assert from "node:assert/strict";
import { LANDMARKS, landmarkQuery } from "../web/js/landmarks.js";

test("every landmark is a real place, seen at the real hour (no times of their own)", () => {
  assert.ok(LANDMARKS.length >= 15);
  for (const l of LANDMARKS) {
    assert.ok(l.name && Math.abs(l.lat) <= 80 && Math.abs(l.lon) <= 180, l.name);
    assert.equal(l.t, undefined, l.name);
  }
  assert.equal(new URLSearchParams(landmarkQuery(LANDMARKS[0], "?t=2026-01-01T00:00:00Z")).get("t"), null, "an old link's time is dropped");
});

test("a landmark's link keeps your seed and drops your old place", () => {
  const q = new URLSearchParams(landmarkQuery(LANDMARKS[0], "?seed=7&stats=6,2,2,2&lat=1&lon=2&ride=3"));
  assert.equal(q.get("seed"), "7");
  assert.equal(q.get("stats"), "6,2,2,2");
  assert.equal(q.get("lat"), String(LANDMARKS[0].lat));
  assert.equal(q.get("ride"), null);
});
