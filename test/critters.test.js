import test from "node:test";
import assert from "node:assert/strict";
import { critterHomes, idleAt, startledAt, KINDS, CHANCE, STARTLE_S } from "../web/js/critterlife.js";

// A flat world of one biome around (lat, lon), 1 m per metre east/north.
const flat = (biomeId, h = 50) => (c) => ({ p: { x: (c.lon - 10) * 111320 * Math.cos((45 * Math.PI) / 180), z: -(c.lat - 45) * 111320 }, h, biomeId });

test("small creatures live where they would: no frogs in the desert, no bunnies in the rainforest, nobody on the ice", () => {
  const count = (kind, biome) => critterHomes(kind, 45, 10, flat(biome)).length;
  assert.equal(count("frog", "desert"), 0);
  assert.equal(count("bunny", "rainforest"), 0);
  for (const k of Object.keys(KINDS)) assert.equal(count(k, "ice"), 0, k);
  assert.ok(count("frog", "rainforest") > 5);
  assert.ok(count("bunny", "steppe") > 5);
  assert.ok(count("bird", "oceanic") > 5);
  assert.equal(critterHomes("frog", 45, 10, flat("rainforest", 2000)).length, 0, "not up a mountain");
  assert.equal(critterHomes("bird", 45, 10, () => null).length, 0, "nobody at sea");
  for (const k of Object.keys(KINDS)) assert.ok(count(k, "oceanic") <= KINDS[k].max);
  for (const b of Object.keys(CHANCE)) for (const k of Object.keys(KINDS)) assert.ok(CHANCE[b][k] >= 0 && CHANCE[b][k] <= 1);
});

test("the same creatures in the same places on every phone, with names and looks for their biome", () => {
  const a = critterHomes("bunny", 45, 10, flat("tundra")), b = critterHomes("bunny", 45, 10, flat("tundra"));
  assert.deepEqual(a, b);
  assert.ok(a.every((c) => c.name === "snow hare"));
  assert.ok(critterHomes("bunny", 45, 10, flat("desert")).every((c) => c.name === "jackrabbit"));
  assert.ok(critterHomes("frog", 45, 10, flat("rainforest")).every((c) => c.name.endsWith("tree frog")));
  assert.ok(critterHomes("bird", 45, 10, flat("oceanic")).every((c) => c.name.startsWith("little ")));
});

test("their day is continuous: no jumps from one moment to the next, never under the ground", () => {
  for (const kind of Object.keys(KINDS)) {
    const [c] = critterHomes(kind, 45, 10, flat(kind === "frog" ? "rainforest" : "oceanic"));
    const perch = kind === "bird" ? { x: c.x + 8, z: c.z - 5, y: 20 } : null;
    let prev = idleAt(c, 1000, perch), far = 0;
    for (let t = 1000.02; t < 1300; t += 0.02) {
      const p = idleAt(c, t, perch);
      assert.ok(p.lift >= -1e-9, `${kind} under the ground at ${t}`);
      const step = Math.hypot(p.x - prev.x, p.z - prev.z, p.lift - prev.lift);
      assert.ok(step < 1.5, `${kind} jumped ${step.toFixed(2)} m at ${t.toFixed(2)}`);
      far = Math.max(far, Math.hypot(p.x - c.x, p.z - c.z));
      prev = p;
    }
    assert.ok(far > 1, `${kind} goes somewhere`);
    assert.ok(far <= KINDS[kind].range + Math.hypot(8, 5) + 0.01, `${kind} stays near home (${far.toFixed(1)} m)`);
  }
});

test("startled, each runs away from you and then it's over", () => {
  for (const kind of Object.keys(KINDS)) {
    const [c] = critterHomes(kind, 45, 10, flat(kind === "frog" ? "rainforest" : "oceanic"));
    const from = { x: c.x, z: c.z, lift: 0 }, away = { x: 1, z: 0 };
    const mid = startledAt(c, from, away, STARTLE_S[kind] * 0.3, 0);
    assert.ok(mid.x > from.x + 1, `${kind} goes away`);
    assert.ok(mid.lift > 0, `${kind} leaves the ground`);
    assert.equal(startledAt(c, from, away, STARTLE_S[kind] + 0.01, 0), null);
  }
});

test("each small creature has its own way of being greeted, and words for running off", async () => {
  const { promptFor, critterLine, fledLine } = await import("../web/js/interactions.js");
  assert.equal(promptFor({ kind: "critter", species: "bunny", name: "snow hare" }), "Pet the snow hare");
  assert.equal(promptFor({ kind: "critter", species: "frog", name: "blue tree frog" }), "Boop the blue tree frog");
  assert.equal(promptFor({ kind: "critter", species: "bird", name: "little red bird" }), "Whistle to the little red bird");
  for (const k of ["bunny", "frog", "bird"]) {
    const a = critterLine(k, "x", "Nyo", 5, 0), b = critterLine(k, "x", "Nyo", 5, 1);
    assert.ok(a.includes("x") && !a.includes("undefined"), a);
    assert.ok(typeof b === "string");
    assert.ok(fledLine(k, "x", true).endsWith("Tap one to walk up gently."));
    assert.ok(!fledLine(k, "x", false).includes("Tap"));
  }
});
