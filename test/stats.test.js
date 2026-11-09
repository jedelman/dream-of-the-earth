import test from "node:test";
import assert from "node:assert/strict";
import { speeds, POWER, randomStats, valid, BUDGET } from "../web/js/stats.js";
import { mulberry32 } from "../web/js/rng.js";

const at = (n) => speeds({ fly: n, swim: n, run: n, gleam: 0 });

test("every speed is a power law in its stat: v = v0 · (1 + stat)^p", () => {
  for (const k of ["run", "jump", "swim", "dive", "fly", "climb"]) {
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
  const s = { fly: 3, swim: 3, run: 3, gleam: 3 };
  assert.ok(Math.abs(speeds(s, 4).run / speeds(s, 1).run - 2) < 1e-9);
  assert.ok(Math.abs(speeds(s, 0.25).swim / speeds(s, 1).swim - 0.5) < 1e-9);
  assert.equal(speeds(s, 6).fly, speeds(s, 1).fly);
  assert.ok(speeds(s, 0).run > 0, "never stuck");
});

test("random stats spend the whole budget within the rules", () => {
  for (let i = 0; i < 50; i++) {
    const s = randomStats(mulberry32(i));
    assert.ok(valid(s));
    assert.equal(s.fly + s.swim + s.run + s.gleam, BUDGET);
  }
});
