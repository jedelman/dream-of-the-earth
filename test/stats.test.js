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

test("running shrank with the creatures by √0.4; flying didn't", () => {
  const old = { run: [8, 68], swim: [4, 40], fly: [30, 198] };
  for (const [k, [lo, hi]] of Object.entries(old)) {
    const f = k === "fly" ? 1 : Math.sqrt(0.4);
    assert.ok(Math.abs(at(0)[k] / (lo * f) - 1) < 0.02, `${k} at 0`);
    assert.ok(Math.abs(at(6)[k] / (hi * f) - 1) < 0.02, `${k} at 6`);
  }
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
