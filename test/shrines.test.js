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
