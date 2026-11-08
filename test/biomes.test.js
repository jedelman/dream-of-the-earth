import test from "node:test";
import assert from "node:assert/strict";
import { biomeFor, BIOMES, KOPPEN, RUNG_M, koppenCode } from "../web/js/biome.js";
import { SPECIES, SPECIES_NAMES, TREES, VARIANTS, PLANT_TRIANGLES, plantForm, cellsAround, choosePlant, pickSpecies, lodFor, midShape, NEAR_M, GROUND_COVER_M } from "../web/js/plantforms.js";
import { butterflyHomes, fireflyHomes, BUTTERFLY_TRIANGLES } from "../web/js/insecthomes.js";
import { governDetail, median, DETAIL_MIN, DETAIL_MAX } from "../web/js/detail.js";

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
  for (const sp of ["ficus", "ceiba", "vachellia", "quercus", "shrub"]) assert.ok(plantForm(sp, 0).bulbs.length >= 3, sp);
  // Every part of every design fits: nothing is silently cut.
  for (const sp of SPECIES_NAMES) for (let v = 0; v < VARIANTS; v++) assert.equal(plantForm(sp, v).dropped, 0, `${sp}/${v}`);
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
  assert.ok(d.every((p) => p.species === "carnegiea" || p.species === "shrub"));
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

test("distance tiers: full shapes near the camera, spindles beyond, nothing past far", () => {
  assert.equal(lodFor("quercus", 100, NEAR_M - 1, 1, 20), "near");
  assert.equal(lodFor("quercus", 100, NEAR_M + 1, 1, 20), "mid");
  assert.equal(lodFor("quercus", SPECIES.quercus.far + 1, 10), null);
  assert.equal(lodFor("sequoiadendron", 100, 400, 1, 80), "near"); // giants stay whole further out
  assert.equal(lodFor("grass", 100, GROUND_COVER_M - 1), "near");
  assert.equal(lodFor("grass", 100, GROUND_COVER_M + 1), null); // grass has no far shape
  // Zoomed out, the camera is far from everything: no full shapes at all.
  for (const sp of SPECIES_NAMES) assert.notEqual(lodFor(sp, 50, 5000), "near");
});

test("each far spindle sits where its full shape does", () => {
  for (const sp of SPECIES_NAMES) {
    const f = plantForm(sp, 0);
    if (f.blades.length || !f.segments.length) continue; // grass and moss
    const m = midShape(f);
    assert.ok(m.top > 0.5 && m.top <= 1, `${sp} top ${m.top}`);
    assert.ok(m.ringY > 0 && m.ringY < m.top, `${sp} ring ${m.ringY}`);
    assert.ok(m.r > 0.05 && m.r < 1.5, `${sp} radius ${m.r}`);
  }
  assert.ok(midShape(plantForm("vachellia", 0)).ringY > 0.7); // a flat crown up top
  assert.ok(midShape(plantForm("picea", 0)).ringY < 0.2); // skirts nearly to the ground
  assert.ok(midShape(plantForm("sequoiadendron", 0)).ringY > 0.5); // crown high on the column
  const dome = midShape(plantForm("ficus", 0));
  assert.ok(dome.sides === 5 && dome.bottom > 0.2 && dome.bottom < dome.ringY, "far away a banyan is a dome in the air");
  assert.equal(midShape(plantForm("picea", 0)).bottom, 0); // a spruce still reaches the ground
});

test("the detail governor: slow frames shorten the forests, headroom grows them back", () => {
  assert.equal(governDetail(1, 16), 1); // 60 fps: already full
  assert.ok(governDetail(1, 30) < 1 && governDetail(1, 30) > governDetail(1, 50)); // slower falls faster
  assert.equal(governDetail(0.5, 20), 0.5); // between: hold
  let s = 1;
  for (let i = 0; i < 20; i++) s = governDetail(s, 200);
  assert.equal(s, DETAIL_MIN); // never below the floor
  for (let i = 0; i < 40; i++) s = governDetail(s, 10);
  assert.equal(s, DETAIL_MAX);
  assert.equal(median([16, 17, 300, 16, 18]), 17); // one hitch doesn't count
  // A shorter reach drops far trees, never the ones near the camera.
  assert.equal(lodFor("quercus", 2000, 2000, 0.5), null);
  assert.equal(lodFor("quercus", 1000, 1000, 0.5), "mid");
  assert.equal(lodFor("quercus", 200, 200, DETAIL_MIN), "near");
});

test("ten trees, ten genera, ten silhouettes", () => {
  assert.equal(TREES.length, 10);
  // Width over height of each tree's shape, from the widest reach of crown, cone, frond or limb.
  const aspect = (sp) => {
    const f = plantForm(sp, 0);
    let w = 0;
    for (const b of f.bulbs) w = Math.max(w, Math.hypot(b.p[0], b.p[2]) + b.r);
    for (const c of f.cones) w = Math.max(w, c.r);
    for (const l of f.leaves) w = Math.max(w, Math.hypot(l.b[0], l.b[2]));
    for (const g of f.segments) w = Math.max(w, Math.hypot(g.b[0], g.b[2]) + g.r1, g.r0);
    return 2 * w;
  };
  assert.ok(aspect("ficus") > 1.6, "a banyan is far wider than tall");
  assert.ok(aspect("quercus") > 1.4, "a spreading oak too");
  assert.ok(aspect("vachellia") > 1.3, "the umbrella thorn's flat crown");
  assert.ok(aspect("cupressus") < 0.25, "a cypress is a flame");
  assert.ok(aspect("sequoiadendron") < 0.4 && SPECIES.sequoiadendron.height[0] >= 50, "a sequoia is a tall column");
  assert.ok(plantForm("adansonia", 0).segments[0].r0 > 0.12, "a baobab's trunk is a bottle");
  assert.ok(plantForm("ficus", 0).segments.filter((s) => Math.abs(s.a[0] - s.b[0]) < 1e-9 && Math.abs(s.a[2] - s.b[2]) < 1e-9 && s.b[1] === 0).length >= 3, "a banyan stands on prop roots");
  assert.ok(plantForm("ceiba", 0).fins.length >= 4, "a kapok stands on buttresses");
  assert.ok(plantForm("carnegiea", 0).segments.every((s) => !s.wood), "a saguaro is green all through");
  // Heights put the emergents over the canopy.
  assert.ok(SPECIES.ceiba.height[0] > SPECIES.ficus.height[1]);
});
