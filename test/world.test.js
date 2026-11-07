import test from "node:test";
import assert from "node:assert/strict";
import { terrariumHeight, lonLatToTile, tileToLonLat, makeFrame, offset, distance, biomeFor, interimTemperature } from "../web/js/geo.js";
import { sunPosition } from "../web/js/sun.js";
import { generateCreature, TRIANGLE_CAP } from "../web/js/creature-graph.js";
import { randomStats, parseStats, valid, BUDGET } from "../web/js/stats.js";
import { mulberry32 } from "../web/js/rng.js";

test("terrarium decoding", () => {
  assert.equal(terrariumHeight(128, 0, 0), 0);
  assert.equal(terrariumHeight(0, 0, 0), -32768);
});

test("tile coordinates round-trip", () => {
  const t = lonLatToTile(31.2, 31.72, 11);
  const ll = tileToLonLat(t.x, t.y, 11);
  assert.ok(Math.abs(ll.lat - 31.72) < 1e-9 && Math.abs(ll.lon - 31.2) < 1e-9);
});

test("local frame round-trips, including across the antimeridian", () => {
  for (const [lat, lon] of [[10, 20], [-60, 179.9]]) {
    const f = makeFrame(lat, lon);
    const p = offset(lat, lon, 70, 12000);
    const l = f.toLocal(p.lat, p.lon);
    const back = f.toLatLon(l.x, l.z);
    assert.ok(Math.abs(back.lat - p.lat) < 1e-9 && Math.abs(back.lon - p.lon) < 1e-9);
    assert.ok(Math.abs(Math.hypot(l.x, l.z) - 12000) < 120, "within 1% over 12 km");
  }
  const d = distance(0, 0, 0, 1);
  assert.ok(Math.abs(d - 111195) < 10);
});

test("sun: overhead at the equator near the March equinox noon, down at midnight", () => {
  const noon = sunPosition(new Date("2026-03-20T12:07:00Z"), 0, 0);
  assert.ok(noon.altitude > 88, `altitude ${noon.altitude}`);
  const night = sunPosition(new Date("2026-03-21T00:07:00Z"), 0, 0);
  assert.ok(night.altitude < -85, `altitude ${night.altitude}`);
  const ny = sunPosition(new Date("2026-06-21T17:00:00Z"), 40.7, -74.0); // ~1 pm EDT, summer
  assert.ok(ny.altitude > 70 && ny.altitude < 74, `altitude ${ny.altitude}`);
});

test("temperature ladder: latitude sets the rung, elevation climbs it", () => {
  assert.equal(biomeFor(interimTemperature(0, 0)), "tropical");
  assert.equal(biomeFor(interimTemperature(45, 0)), "temperate");
  assert.equal(biomeFor(interimTemperature(0, 4000)), "boreal");
  assert.equal(biomeFor(interimTemperature(80, 0)), "ice");
});

test("every creature stays within 256 triangles, and seeds are deterministic", () => {
  let max = 0;
  for (let s = 1; s <= 2000; s++) {
    const c = generateCreature(s);
    assert.ok(c.triangles <= TRIANGLE_CAP, `seed ${s}: ${c.triangles}`);
    max = Math.max(max, c.triangles);
  }
  assert.deepEqual(generateCreature(42), generateCreature(42));
  assert.ok(max > 100, `creatures should get unhinged (max ${max})`);
});

test("stats: random spends exactly the budget; parse rejects over-budget", () => {
  for (let s = 1; s < 200; s++) {
    const st = randomStats(mulberry32(s));
    assert.ok(valid(st));
    assert.equal(Object.values(st).reduce((a, b) => a + b, 0), BUDGET);
  }
  assert.deepEqual(parseStats("6,0,3,3"), { fly: 6, swim: 0, run: 3, gleam: 3 });
  assert.equal(parseStats("6,6,6,6"), null);
  assert.equal(parseStats("7,0,0,0"), null);
});
