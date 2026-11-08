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

import { orographic, makeOrography } from "../web/js/weather.js";

test("orography: windward slopes cloud up and rain, lee sides dry out", () => {
  const flat = orographic(0.4, 0, 0), up = orographic(0.4, 0, 1500), down = orographic(0.4, 0, -1500);
  assert.ok(orographic(0.4, 0.5, 0, 2500).cover < 0.2 && orographic(0.4, 0.5, 0, 2500).storm === 0, "behind a high barrier: dry");
  assert.equal(flat.cover, 0.4);
  assert.ok(up.cover > 0.85 && up.storm > 0.2, JSON.stringify(up));
  assert.ok(down.cover < 0.1 && down.storm === 0, JSON.stringify(down));
});

test("a ridge under the westerlies: wet west face, rain shadow east, cap clouds on top", () => {
  // A north-south ridge at 10°E, 3 km high and ~50 km wide, at 45°N (the westerlies blow east).
  const ridge = (lat, lon) => 3000 * Math.max(0, 1 - Math.abs(lon - 10) / 0.3);
  const t0 = 1762560000;
  const mean = (lon) => {
    let cover = 0, storm = 0, n = 0;
    for (let lat = 44; lat <= 46; lat += 0.05) for (let k = 0; k < 6; k++) { const w = weatherAt(lat, lon, t0 + k * 7200, ridge); cover += w.cover; storm += w.storm; n++; }
    return { cover: cover / n, storm: storm / n };
  };
  const plain = mean(8), windward = mean(9.85), lee = mean(10.2);
  assert.ok(windward.cover > plain.cover + 0.15, JSON.stringify({ windward, plain }));
  assert.ok(windward.storm > plain.storm, JSON.stringify({ windward, plain }));
  assert.ok(lee.cover < plain.cover * 0.5, JSON.stringify({ lee, plain }));
  const farLee = mean(11.0); // ~55 km downwind of the crest, on flat ground
  assert.ok(farLee.cover < plain.cover * 0.75, `the rain shadow reaches far downwind: ${JSON.stringify({ farLee, plain })}`);
  assert.ok(weatherAt(45, 10, t0, ridge).base > weatherAt(45, 8, t0, ridge).base + 2000, "the base rides up over the ridge");
  // In the trades (blowing west) the same ridge is wet on its east face instead.
  const tradeRidge = (lat, lon) => ridge(45, lon);
  const meanTrade = (lon) => { let c = 0, n = 0; for (let lat = 14; lat <= 16; lat += 0.05) { c += weatherAt(lat, lon, t0, tradeRidge).cover; n++; } return c / n; };
  assert.ok(meanTrade(10.15) > meanTrade(9.8), "trade winds: the east face is windward");
});

test("the sky's terrain texture: heights and a ~15 km blur, in 30 m steps", () => {
  const spike = (x, z) => (Math.hypot(x, z) < 3000 ? 3000 : 600);
  const o = makeOrography(spike, -60000, -60000, 120000, 64);
  const at = (i, j, c) => o.data[(j * 64 + i) * 2 + c] * 30;
  assert.equal(at(0, 0, 0), 600);
  assert.ok(Math.abs(at(32, 32, 0) - 3000) <= 30); // the peak, sharp
  assert.ok(at(32, 32, 1) < 1500 && at(32, 32, 1) > 600); // blurred into the broad land
  assert.ok(o.min >= 590 && o.max < 1500);
});
