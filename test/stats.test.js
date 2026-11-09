import test from "node:test";
import assert from "node:assert/strict";
import { speeds, POWER, randomStats, valid, BUDGET, parseStats, maxSlopeDeg, SLOPE_LIMIT, sightOf } from "../web/js/stats.js";
import { mulberry32 } from "../web/js/rng.js";

const at = (n) => speeds({ climb: n, swim: n, run: n, gleam: 0, perception: 0, fly: n });

test("every speed is a power law in its stat: v = v0 · (1 + stat)^p", () => {
  for (const k of ["run", "swim", "dive", "fly", "climb"]) {
    assert.equal(at(0)[k], POWER[k].v0, k);
    for (let n = 0; n < 6; n++) {
      // Each point multiplies by ((n + 2) / (n + 1))^p: the same rule all the way up, the first point the biggest.
      assert.ok(Math.abs(at(n + 1)[k] / at(n)[k] - ((n + 2) / (n + 1)) ** POWER[k].p) < 1e-9, `${k} at ${n}`);
    }
  }
});

test("p is √3, pinned at 3 points: a balanced creature moves as it did; more is much faster, fewer slower", () => {
  for (const k of ["run", "jump", "swim", "dive", "fly", "climb"]) assert.equal(POWER[k].p, Math.sqrt(3), k);
  const mid = { run: 23, swim: 12.8, fly: 115.1 };
  for (const [k, v] of Object.entries(mid)) assert.ok(Math.abs(at(3)[k] - v) < 1e-9, k);
  assert.ok(Math.abs(at(6).run / at(0).run - 7 ** Math.sqrt(3)) < 1e-9, "a maxed stat is 7^√3 ≈ 29× none");
  assert.ok(at(6).fly > 300 && at(0).fly > 10, "a maxed flyer passes 300 m/s; none still flies at 10");
});

test("bigger legs run faster as the square root of size; wings don't care", () => {
  const s = { climb: 3, swim: 3, run: 3, gleam: 3, perception: 0 };
  assert.ok(Math.abs(speeds(s, 4).run / speeds(s, 1).run - 2) < 1e-9);
  assert.ok(Math.abs(speeds(s, 0.25).swim / speeds(s, 1).swim - 0.5) < 1e-9);
  assert.equal(speeds(s, 6).fly, speeds(s, 1).fly);
  assert.ok(speeds(s, 0).run > 0, "never stuck");
});

test("random stats spend the whole budget within the rules", () => {
  for (let i = 0; i < 50; i++) {
    const s = randomStats(mulberry32(i));
    assert.ok(valid(s));
    assert.equal(s.climb + s.swim + s.run + s.gleam, BUDGET);
    assert.equal(s.perception, 0, "perception starts at 0");
  }
});

test("six stats now (fly last, back with Wings); five read with no fly; the old four (fly first) as climb, swim, run, gleam", () => {
  assert.deepEqual(parseStats("1,5,4,2"), { climb: 1, swim: 5, run: 4, gleam: 2, perception: 0, fly: 0 });
  assert.deepEqual(parseStats("2,2,2,2,4"), { climb: 2, swim: 2, run: 2, gleam: 2, perception: 4, fly: 0 });
  assert.deepEqual(parseStats("1,1,2,1,4,3"), { climb: 1, swim: 1, run: 2, gleam: 1, perception: 4, fly: 3 });
  assert.equal(parseStats("6,6,6,6,6"), null);
  assert.deepEqual(parseStats("9,0,3,0,0,0").climb, 9, "someone's raised ceiling reads");
  assert.equal(parseStats("10,0,2,0,0,0"), null, "nothing past nine");
  assert.ok(!valid({ climb: 7, swim: 0, run: 5, gleam: 0, perception: 0, fly: 0 }, {}), "seven needs a raised ceiling");
  assert.ok(valid({ climb: 7, swim: 0, run: 5, gleam: 0, perception: 0, fly: 0 }, { climb: 1 }));
  assert.equal(parseStats("1,2,3"), null);
  // A seed's creature keeps its old stats (the same draw), fly becoming climb.
  assert.deepEqual(randomStats(mulberry32(7)), randomStats(mulberry32(7)));
});

test("climb sets the steepest slope you can climb; nothing climbs past 45°", () => {
  assert.equal(maxSlopeDeg(0), 18);
  assert.equal(maxSlopeDeg(6), SLOPE_LIMIT);
  assert.ok(maxSlopeDeg(6) <= 45 && maxSlopeDeg(10) === 45);
  assert.ok(Math.abs(speeds({ climb: 6, swim: 0, run: 0, gleam: 0, perception: 0 }).maxSlope - 1) < 1e-9, "45° is a rise of 1 in 1");
});

test("perception: half the sight with none, as far as before at three, 1.3× at six", () => {
  assert.equal(sightOf(0), 0.5);
  assert.equal(sightOf(3), 1);
  assert.ok(Math.abs(sightOf(6) - Math.sqrt(7 / 4)) < 1e-12);
});

import { jumpHeight, JUMP_G } from "../web/js/stats.js";
test("a jump rises gently with run, not on the power curve: 0.4 m at none, 3.1 m at six", () => {
  const h = (n) => at(n).jump ** 2 / (2 * JUMP_G);
  assert.ok(Math.abs(h(0) - 0.4) < 1e-9);
  assert.ok(Math.abs(h(6) - 3.1) < 1e-9);
  assert.ok(Math.abs(h(3) - jumpHeight(3)) < 1e-9);
});
