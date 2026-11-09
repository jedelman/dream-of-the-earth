import test from "node:test";
import assert from "node:assert/strict";
import { moonPhase, nextNewMoon, nearestNewMoon, canRespec, respecWindow, SYNODIC_S, whenText } from "../web/js/moon.js";

const at = (iso) => Date.parse(iso) / 1000;

test("new moons fall a synodic month apart, from the one in January 2000", () => {
  assert.ok(moonPhase(at("2000-01-06T18:14:00Z")) < 1e-9 || moonPhase(at("2000-01-06T18:14:00Z")) > 1 - 1e-9);
  const n = nextNewMoon(at("2026-11-09T12:00:00Z"));
  assert.ok(Math.abs(n - at("2026-11-09T21:57:00Z")) < 120, new Date(n * 1000).toISOString());
  assert.ok(Math.abs(nextNewMoon(n + 1) - n - SYNODIC_S) < 1e-6);
  assert.ok(Math.abs(moonPhase(n + SYNODIC_S / 2) - 0.5) < 1e-9, "full in between");
});

test("stats change only within a day of a new moon", () => {
  const n = nearestNewMoon(at("2026-11-09T12:00:00Z"));
  assert.ok(canRespec(n));
  assert.ok(canRespec(n - 86000) && canRespec(n + 86000));
  assert.ok(!canRespec(n + 90000) && !canRespec(n + SYNODIC_S / 2));
  const w = respecWindow(n + SYNODIC_S / 2);
  assert.ok(Math.abs(w.opens - (n + SYNODIC_S - 86400)) < 1e-6);
  assert.equal(whenText(n + 3600, n), "within hours");
  assert.equal(whenText(n + 86400, n), "tomorrow");
  assert.equal(whenText(n + 86400 * 12, n), "in 12 days");
});
