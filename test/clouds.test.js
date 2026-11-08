import test from "node:test";
import assert from "node:assert/strict";
import { windSign, cloudiness, driftLon, WIND } from "../web/js/cloudfield.js";
import { weatherAt, airKm, windKm, CLOUD_BASE } from "../web/js/weather.js";
import { makeNoise3, makeWeather, sampleWrap2 } from "../web/js/skynoise.js";

test("prevailing winds: trades from the east, westerlies, polar easterlies", () => {
  assert.equal(windSign(10), -1);
  assert.equal(windSign(-45), 1);
  assert.equal(windSign(70), -1);
  assert.ok(driftLon(10, 1762560000) >= 0 && driftLon(10, 1762560000) < 360);
});

test("the subtropical highs are the clearest band, and storms live in the tropics", () => {
  assert.ok(cloudiness(25) < cloudiness(5) && cloudiness(25) < cloudiness(50));
  const t = 1762560000;
  const stats = (lats) => {
    let cover = 0, storm = 0, n = 0;
    for (const lat of lats) for (let lon = -180; lon < 180; lon += 0.37) { const w = weatherAt(lat, lon, t); cover += w.cover > 0.2 ? 1 : 0; storm += w.storm > 0.3 ? 1 : 0; n++; }
    return { cover: cover / n, storm: storm / n };
  };
  const doldrums = stats([-8, -4, 0, 4, 8]), highs = stats([22, 26, 30, -22, -26]), tracks = stats([45, 50, 55, -45, -50]);
  assert.ok(highs.cover < doldrums.cover && highs.cover < tracks.cover, JSON.stringify({ doldrums, highs, tracks }));
  assert.ok(doldrums.storm > 0.01 && doldrums.storm > tracks.storm * 2, JSON.stringify({ doldrums, tracks }));
});

test("the weather is the same for everyone and rides the wind", () => {
  const t = 1762560000, lat = 10;
  assert.deepEqual(weatherAt(lat, 40, t), weatherAt(lat, 40, t));
  // Ten minutes later the trades have carried the same air WIND × 600 m west.
  const dLon = (WIND * 600) / (111320 * Math.cos((lat * Math.PI) / 180));
  for (const lon of [40, 41.3, 39.2]) {
    const a = weatherAt(lat, lon, t), b = weatherAt(lat, lon - dLon, t + 600);
    assert.ok(Math.abs(a.n - b.n) < 1e-3, `${a.n} vs ${b.n}`);
  }
  assert.ok(windKm(t) >= 0 && windKm(t) < 40000);
  const [x0] = airKm(lat, 40, t), [x1] = airKm(lat, 40, t + 1000);
  assert.ok(Math.abs(x1 - x0 - (WIND * 1000) / 1000) < 1e-6); // the air moves west, so the place moves east through it
  for (const lon of [0, 90]) { const w = weatherAt(-5, lon, t); assert.ok(w.top >= CLOUD_BASE && w.cover >= 0 && w.cover <= 1); }
});

test("sky noise is seeded and tiles seamlessly", () => {
  const a = makeNoise3(16), b = makeNoise3(16);
  assert.deepEqual(a, b);
  const w = makeWeather(64);
  assert.deepEqual(w, makeWeather(64));
  // Bilinear samples agree across the wrap.
  assert.ok(Math.abs(sampleWrap2(w, 64, 0, 0.3) - sampleWrap2(w, 64, 1, 0.3)) < 1e-9);
  // The texture uses its full range.
  assert.ok(Math.min(...w) === 0 && Math.max(...w) === 255);
});
