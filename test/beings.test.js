import test from "node:test";
import assert from "node:assert/strict";
import { expand, turtle } from "../web/js/lsystem.js";
import { generateBeing, beingsOnLine, SPACING, SPEED, TRIANGLE_BUDGET, PLAN_NAMES } from "../web/js/beings.js";
import { mulberry32 } from "../web/js/rng.js";

test("expansion is deterministic, stochastic rules follow the seed", () => {
  assert.equal(expand("X", { X: "F[+X]" }, 2, mulberry32(1)), "F[+F[+X]]");
  const rules = { X: [["FX", 1], ["GX", 1]] };
  assert.equal(expand("X", rules, 8, mulberry32(5)), expand("X", rules, 8, mulberry32(5)));
});

test("the turtle turns where the grammar says", () => {
  const { segments } = turtle("F+F", { angle: 90, length: 1 }, mulberry32(1));
  assert.equal(segments.length, 2);
  const end = segments[1].b;
  assert.ok(Math.abs(end[0] + 1) < 1e-9 && Math.abs(end[1] - 1) < 1e-9 && Math.abs(end[2]) < 1e-9, JSON.stringify(end));
  const { bulbs } = turtle("F[O]FO", { length: 1 }, mulberry32(1));
  assert.equal(bulbs.length, 2);
});

test("beings stay within their triangle budget, and every body plan appears", () => {
  const plans = new Set();
  for (let s = 1; s <= 300; s++) {
    const b = generateBeing(s);
    assert.ok(b.triangles <= TRIANGLE_BUDGET, `seed ${s}: ${b.triangles}`);
    assert.ok(b.segments.length + b.bulbs.length > 3, `seed ${s} grew almost nothing (${b.plan})`);
    assert.ok(b.size >= 350 && b.size <= 1100);
    plans.add(b.plan);
  }
  assert.deepEqual([...plans].sort(), [...PLAN_NAMES].sort());
  assert.deepEqual(generateBeing(77), generateBeing(77));
});

test("migration: evenly spaced, on the line, moving at SPEED, the same for everyone", () => {
  const L = 3527000;
  const a = beingsOnLine(320, L, 1762560000);
  assert.equal(a.length, Math.floor(L / SPACING));
  for (const b of a) assert.ok(b.s >= 0 && b.s < L);
  const b = beingsOnLine(320, L, 1762560001);
  const moved = (((b[0].s - a[0].s) % L) + L) % L;
  assert.ok(Math.abs(Math.min(moved, L - moved) - SPEED) < 1e-6, `moved ${moved}`);
  assert.deepEqual(beingsOnLine(320, L, 1762560000), a);
});
