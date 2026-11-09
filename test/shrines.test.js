import test from "node:test";
import assert from "node:assert/strict";
import { shrineHomes, spellWeight, shapeOf, sunAhead, SPELLS, SPELL_IDS, SHRINE, SPELL_S, KIND_COLOUR } from "../web/js/shrinelore.js";

const land = (c) => ({ p: { x: (c.lon - 10) * 78700, z: -(c.lat - 45) * 111320 }, h: 120 });

test("shrines are scattered on land, the same everywhere, each holding a spell", () => {
  const a = shrineHomes(45, 10, land), b = shrineHomes(45, 10, land);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 3 && a.length <= SHRINE.max, `${a.length} shrines`);
  assert.ok(a.every((s) => SPELLS[s.spell]));
  assert.equal(shrineHomes(45, 10, () => null).length, 0, "none at sea");
  // Across the Earth every spell turns up.
  const seen = new Set();
  for (let lat = -50; lat <= 60; lat += 10) for (let lon = -170; lon <= 170; lon += 20) for (const s of shrineHomes(lat, lon, land)) seen.add(s.spell);
  assert.deepEqual([...seen].sort(), [...SPELL_IDS].sort());
});

test("every spell has a kind with a colour, a name and words", () => {
  for (const [id, s] of Object.entries(SPELLS)) {
    assert.ok(KIND_COLOUR[s.kind], id);
    assert.ok(s.name.length > 5 && s.line.length > 10, id);
  }
});

test("a spell eases in, holds, and eases out to nothing", () => {
  assert.equal(spellWeight(-1), 0);
  assert.ok(spellWeight(0.5) > 0 && spellWeight(0.5) < 0.2);
  assert.equal(spellWeight(30), 1);
  assert.ok(spellWeight(SPELL_S - 0.5) < 0.2);
  assert.equal(spellWeight(SPELL_S), 0);
  let prev = 0;
  for (let t = 0; t < SPELL_S; t += 0.01) { const w = spellWeight(t); assert.ok(Math.abs(w - prev) < 0.01, `jump at ${t}`); prev = w; }
});

test("shape spells change your body and pull the camera to suit; at weight 0 nothing changes", () => {
  for (const id of ["giant", "tiny", "taffy", "mask", "colours"]) assert.deepEqual(shapeOf(id, 0), { x: 1, y: 1, z: 1, zoom: 1 });
  assert.equal(shapeOf("giant", 1).y, 6);
  assert.ok(shapeOf("tiny", 1).y < 0.5 && shapeOf("tiny", 1).zoom < 1);
  assert.ok(shapeOf("taffy", 1).y > 3 && shapeOf("taffy", 1).x < 1);
});

test("the spinning days run the sun a whole day ahead and back to now, with no jump at either end", () => {
  assert.equal(sunAhead(0), 0);
  assert.equal(sunAhead(SPELL_S), 0);
  assert.ok(Math.abs(sunAhead(SPELL_S - 1e-6) - 86400) < 1);
  assert.ok(Math.abs(sunAhead(SPELL_S / 2) - 43200) < 1);
});

import { WAKES, skyState, awake, wokeAt, shrineState } from "../web/js/shrinelore.js";
import { moonEcliptic, planetEcliptic, sunLongitude, horizontal } from "../web/js/astro.js";
import { sunPosition } from "../web/js/sun.js";

// The real sky over Norfolk, Virginia.
const realSky = (lat = 36.85, lon = -76.29) => ({
  moonLon: (t) => moonEcliptic(t).lon, sunLon: sunLongitude, mercuryLon: (t) => planetEcliptic("mercury", t).lon,
  moonAlt: (t) => horizontal(moonEcliptic(t), t, lat, lon).altitude, sunAlt: (t) => sunPosition(new Date(t * 1000), lat, lon).altitude,
});

test("every spell's shrine wakes to part of the real sky, and says when", () => {
  for (const id of SPELL_IDS) assert.ok(WAKES[id] && WAKES[id].when.length > 4, id);
  const t = Date.parse("2026-11-09T18:00:00Z") / 1000, s = skyState(t, realSky());
  assert.ok(s.phase < 0.03 || s.phase > 0.97, "the new moon");
  assert.equal(s.element, "water", "the Moon in Scorpio");
  assert.equal(s.mercuryRetro, true);
  assert.equal(awake("tiny", t, realSky()), true);
  assert.equal(awake("giant", t, realSky()), false);
  assert.equal(awake("melt", t, realSky()), true);
  assert.equal(awake("colours", t, realSky()), false);
  assert.equal(awake("turning", t, realSky()), true);
  // Over a moon's month every phase shrine wakes and sleeps.
  for (const id of ["giant", "tiny", "taffy", "mask"]) {
    let on = 0;
    for (let d = 0; d < 30; d++) on += awake(id, t + d * 86400, realSky()) ? 1 : 0;
    assert.ok(on >= 5 && on <= 10, `${id} awake ${on} of 30 days`);
  }
});

test("a shrine you used rests until it has slept and woken again", () => {
  // A made-up sky where the "Moon" goes round in 10 days, so phases come and go quickly.
  const P = 10 * 86400, fake = { moonLon: (t) => (t / P) * 360, sunLon: () => 0, mercuryLon: (t) => t / 86400, moonAlt: () => 1, sunAlt: () => 10 };
  const t = P * 100 + P * 0.5; // the middle of a "full moon"
  assert.equal(awake("giant", t, fake), true);
  const w = wokeAt("giant", t, fake);
  assert.ok(Math.abs(w - (P * 100 + P * 0.375)) <= 3600, "woke when the phase reached a quarter past new");
  assert.equal(wokeAt("tiny", t, fake), null, "asleep: no waking");
  assert.equal(shrineState("giant", t, fake), "awake");
  assert.equal(shrineState("giant", t + 3600, fake, t), "resting", "used an hour ago, this waking");
  assert.equal(shrineState("giant", t + P, fake, t), "awake", "woken again, ten days on");
  assert.equal(shrineState("tiny", t, fake, t - P), "asleep");
});
