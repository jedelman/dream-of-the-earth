import test from "node:test";
import assert from "node:assert/strict";
import { windSign, cloudiness, driftLon, cloudsNear, cumulusPuffs, WIND } from "../web/js/cloudfield.js";

test("prevailing winds: trades from the east, westerlies, polar easterlies", () => {
  assert.equal(windSign(10), -1);
  assert.equal(windSign(-45), 1);
  assert.equal(windSign(70), -1);
});

test("the subtropical highs are the clearest band", () => {
  assert.ok(cloudiness(25) < cloudiness(5) && cloudiness(25) < cloudiness(50));
  const count = (lat) => cloudsNear(lat, 0, 1762560000, 1.5).length;
  assert.ok(count(25) < count(3), `subtropics ${count(25)} vs doldrums ${count(3)}`);
});

test("clouds are the same for everyone and drift with the wind", () => {
  const t = 1762560000;
  assert.deepEqual(cloudsNear(10, 40, t), cloudsNear(10, 40, t));
  const a = cloudsNear(10, 40, t), b = cloudsNear(10, 40, t + 600);
  const shared = a.filter((c) => b.some((d) => d.key === c.key));
  assert.ok(shared.length > 10);
  const c0 = shared[0], c1 = b.find((d) => d.key === c0.key);
  const metres = (c1.lon - c0.lon) * 111320 * Math.cos((10 * Math.PI) / 180);
  assert.ok(Math.abs(metres + WIND * 600) < 1, `trade winds carry it west by ${WIND * 600} m, got ${metres.toFixed(1)}`);
  assert.ok(driftLon(10, t) >= 0 && driftLon(10, t) < 360);
});

test("a cumulus is a handful of puffs from a small L-system", () => {
  for (let s = 1; s < 200; s++) {
    const p = cumulusPuffs(s * 7919);
    assert.ok(p.length >= 1 && p.length <= 24, `seed ${s}: ${p.length}`);
    for (const q of p) assert.ok(q.r > 0 && q.p[1] >= 0);
  }
});
