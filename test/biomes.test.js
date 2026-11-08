import test from "node:test";
import assert from "node:assert/strict";
import { biomeFor, BIOMES, KOPPEN, RUNG_M, koppenCode } from "../web/js/biome.js";
import { SPECIES, SPECIES_NAMES, VARIANTS, PLANT_TRIANGLES, plantForm, cellsAround, choosePlant, pickSpecies } from "../web/js/plantforms.js";
import { butterflyHomes, fireflyHomes, BUTTERFLY_TRIANGLES } from "../web/js/insecthomes.js";

test("Köppen classes land in the biomes you'd expect", () => {
  assert.equal(biomeFor(1), "rainforest"); // Af, the Amazon
  assert.equal(biomeFor(4), "desert"); // BWh, the Sahara
  assert.equal(biomeFor(3), "savanna"); // Aw, the Serengeti
  assert.equal(biomeFor(15), "oceanic"); // Cfb, Scotland
  assert.equal(biomeFor(27), "taiga"); // Dfc, Siberia
  assert.equal(biomeFor(8), "mediterranean"); // Csa
  assert.equal(biomeFor(29), "tundra"); // ET
  assert.equal(biomeFor(30), "ice"); // EF
  assert.equal(koppenCode(14), "Cfa");
  for (const k of Object.keys(KOPPEN)) assert.ok(BIOMES[biomeFor(Number(k))], `class ${k}`);
});

test("relief climbs the ladder: every 900 m above the surroundings is one rung colder", () => {
  assert.equal(biomeFor(1, RUNG_M - 1), "rainforest");
  assert.equal(biomeFor(1, RUNG_M), "subtropical");
  assert.equal(biomeFor(1, RUNG_M * 2), "oceanic");
  assert.equal(biomeFor(4, RUNG_M * 2), "coldsteppe"); // a desert mountain
  assert.equal(biomeFor(15, RUNG_M * 9), "ice"); // and it bottoms out at ice
  assert.equal(biomeFor(1, -500), "rainforest"); // hollows don't warm up
});

test("no climate data: latitude and height decide", () => {
  assert.equal(biomeFor(0, 0, 0, 0), "rainforest");
  assert.equal(biomeFor(0, 0, 85, 0), "ice");
  assert.equal(biomeFor(0, 0, 0, 3500), "taiga"); // 27 °C less 6.5 °C/km
});

test("every biome's plants are real species", () => {
  for (const [name, b] of Object.entries(BIOMES)) {
    for (const [sp] of [...b.plants, ...b.ground]) assert.ok(SPECIES[sp], `${name}: ${sp}`);
    assert.ok(b.density >= 0 && b.density <= 1 && b.cover >= 0 && b.cover <= 1, name);
  }
});

test("every plant shape stays within its triangle budget, deterministically", () => {
  for (const sp of SPECIES_NAMES)
    for (let v = 0; v < VARIANTS; v++) {
      const f = plantForm(sp, v);
      assert.ok(f.triangles > 0 && f.triangles <= PLANT_TRIANGLES, `${sp}/${v}: ${f.triangles}`);
      assert.deepEqual(plantForm(sp, v), f);
      for (const s of f.segments) for (const y of [s.a[1], s.b[1]]) assert.ok(y <= 1.0001, `${sp} taller than 1`);
    }
  // Trees have foliage, not just a trunk.
  for (const sp of ["broadleaf", "emergent", "acacia", "shrub"]) assert.ok(plantForm(sp, 0).bulbs.length >= 3, sp);
});

test("a plant stands in the same spot whoever asks, from wherever", () => {
  const a = cellsAround(-3.1, -60.0, 600, 40, 101), b = cellsAround(-3.1 + 0.002, -60.0 - 0.003, 600, 40, 101);
  const key = (c) => `${c.i},${c.j}`;
  const inB = new Map(b.map((c) => [key(c), c]));
  let shared = 0;
  for (const c of a) {
    const o = inB.get(key(c));
    if (!o) continue;
    shared++;
    assert.equal(o.lat, c.lat); assert.equal(o.lon, c.lon); assert.equal(o.h, c.h);
  }
  assert.ok(shared > 300, `shared ${shared}`);
  // Spacing: about one candidate per cell.
  const area = Math.PI * 600 * 600;
  assert.ok(Math.abs(a.length - area / 1600) / (area / 1600) < 0.1, `${a.length} cells`);
});

test("density and the plant table set what grows", () => {
  const cells = cellsAround(-3.1, -60.0, 1200, 40, 101);
  const rf = BIOMES.rainforest, desert = BIOMES.desert;
  const grown = (b) => cells.map((c) => choosePlant(c.h, b.density, b.plants)).filter(Boolean);
  const r = grown(rf), d = grown(desert);
  assert.ok(Math.abs(r.length / cells.length - rf.density) < 0.03, `rainforest ${r.length / cells.length}`);
  assert.ok(Math.abs(d.length / cells.length - desert.density) < 0.02, `desert ${d.length / cells.length}`);
  assert.ok(d.every((p) => p.species === "cactus" || p.species === "shrub"));
  assert.equal(choosePlant(cells[0].h, 0, []), null);
  for (const p of r) {
    const [lo, hi] = SPECIES[p.species].height;
    assert.ok(p.height >= lo && p.height <= hi && p.variant < VARIANTS);
  }
  assert.equal(pickSpecies([["a", 1], ["b", 3]], 0.2), "a");
  assert.equal(pickSpecies([["a", 1], ["b", 3]], 0.3), "b");
});

test("insects: butterflies by biome, fireflies only where they live", () => {
  assert.equal(BUTTERFLY_TRIANGLES, 4);
  const land = (biome) => (c) => ({ p: { x: c.lon, z: c.lat }, h: 10, biome: BIOMES[biome] });
  const rf = butterflyHomes(-3.1, -60, land("rainforest")), ds = butterflyHomes(-3.1, -60, land("desert"));
  assert.ok(rf.length > 20 && rf.length > ds.length * 5, `${rf.length} vs ${ds.length}`);
  assert.deepEqual(butterflyHomes(-3.1, -60, land("rainforest")), rf);
  assert.ok(rf.every((b) => b.y >= 13 && b.y <= 19));
  assert.equal(fireflyHomes(-3.1, -60, land("taiga")).length, 0);
  assert.ok(fireflyHomes(-3.1, -60, land("rainforest")).length > 50);
  assert.equal(butterflyHomes(-3.1, -60, () => null).length, 0); // all sea
});
