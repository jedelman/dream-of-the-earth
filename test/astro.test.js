import test from "node:test";
import assert from "node:assert/strict";
import { planetEcliptic, moonEcliptic, PLANETS, skyClock, zodiac, horizontal, sunLongitude } from "../web/js/astro.js";
import { sunPosition } from "../web/js/sun.js";

// Geocentric ecliptic longitude and latitude of date (degrees), from JPL Horizons (QUANTITIES=31), fetched 2026-11-09.
const HORIZONS = {
  "2026-11-09T12:00:00Z": { mercury: [216.6976868, 1.1971032], venus: [203.279634, -2.7448293], mars: [142.7780287, 1.7841256], jupiter: [145.2690155, 0.7198368], saturn: [8.7941633, -2.6625371], uranus: [64.3525655, -0.1503769], neptune: [1.9197367, -1.4108103], pluto: [303.2094863, -4.2668325], moon: [229.4517546, -4.9609159] },
  "2031-03-20T06:00:00Z": { mercury: [17.5471137, 2.5447572], venus: [34.5716479, 0.3527172], mars: [231.1817123, 1.7344918], jupiter: [267.9299046, 0.535083], saturn: [63.9085413, -1.6676709], uranus: [79.0686782, 0.1046317], neptune: [12.5304354, -1.4949821], pluto: [312.9779622, -6.2252114], moon: [321.8783833, 5.0182137] },
};
const dLon = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test("the planets and the Moon are where JPL Horizons puts them, to a fraction of a degree (the discs are 5°)", () => {
  for (const [iso, want] of Object.entries(HORIZONS)) {
    const t = Date.parse(iso) / 1000;
    for (const p of PLANETS) {
      const e = planetEcliptic(p, t);
      assert.ok(dLon(e.lon, want[p][0]) < 0.25, `${p} at ${iso}: ${e.lon.toFixed(3)} vs ${want[p][0]}`);
      assert.ok(Math.abs(e.lat - want[p][1]) < 0.1, `${p} latitude at ${iso}`);
    }
    const m = moonEcliptic(t);
    assert.ok(dLon(m.lon, want.moon[0]) < 0.5, `moon at ${iso}: ${m.lon.toFixed(3)} vs ${want.moon[0]}`);
    assert.ok(Math.abs(m.lat - want.moon[1]) < 0.3, `moon latitude at ${iso}`);
  }
});

test("the clock: signs, retrogrades, and the Moon's light", () => {
  assert.deepEqual(zodiac(0), { sign: 0, name: "Aries", glyph: "♈", deg: 0 });
  assert.equal(zodiac(359.5).name, "Pisces");
  assert.equal(zodiac(227.6).name, "Scorpio");
  const c = skyClock(Date.parse("2026-11-09T12:00:00Z") / 1000);
  assert.equal(c.bodies.length, 10);
  assert.ok(c.moonLit < 0.01, "the night of a new moon");
  const full = skyClock(Date.parse("2026-11-24T14:00:00Z") / 1000);
  assert.ok(full.moonLit > 0.97, `about full two weeks on (${full.moonLit.toFixed(3)})`);
  // Mercury moves backward through the zodiac on 9 November 2026 (Horizons: 216.6977° at 12:00, 216.4°-ish a day later).
  assert.equal(c.bodies.find((b) => b.body === "mercury").retro, true);
});

test("altitude and azimuth agree with the sun's own reckoning", () => {
  const t = Date.parse("2026-11-09T15:00:00Z") / 1000, lat = 36.85, lon = -76.29;
  const mine = horizontal({ lon: sunLongitude(t), lat: 0 }, t, lat, lon), theirs = sunPosition(new Date(t * 1000), lat, lon);
  assert.ok(Math.abs(mine.altitude - theirs.altitude) < 0.1 && dLon(mine.azimuth, theirs.azimuth) < 0.2, JSON.stringify({ mine, theirs }));
});
