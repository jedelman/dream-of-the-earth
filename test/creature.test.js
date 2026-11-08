import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { generateCreature, parseGenes, TRAITS, COUNTS, SIZE, TRIANGLE_CAP } from "../web/js/creature-graph.js";
import { mulberry32, mulberry32At } from "../web/js/rng.js";

const legacy = JSON.parse(readFileSync(new URL("./fixtures/creatures-legacy.json", import.meta.url)));
// The fields a creature had before genes existed.
const shape = (c) => ({ seed: c.seed, parts: c.parts, triangles: c.triangles, palette: c.palette, scale: c.scale });
const hash = (c) => createHash("sha256").update(JSON.stringify(shape(c))).digest("hex").slice(0, 32);
const ofKind = (c, kind) => c.parts.filter((p) => p.kind === kind);

test("a stream can start part-way along", () => {
  const a = mulberry32(1153403823);
  for (let i = 0; i < 57; i++) a();
  const b = mulberry32At(1153403823, 57);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test("with no genes, every creature is exactly what its seed always made (Nyo is still Nyo)", () => {
  assert.deepEqual(shape(generateCreature(7)), legacy.nyo);
  for (const [seed, h] of Object.entries(legacy.hashes)) {
    assert.equal(hash(generateCreature(Number(seed))), h, `seed ${seed}`);
    assert.equal(hash(generateCreature(Number(seed), {})), h, `seed ${seed}, empty genes`);
    assert.equal(hash(generateCreature(Number(seed), { roll: {}, hue: 0, bogus: 3 })), h, `seed ${seed}, genes that come to nothing`);
  }
});

test("the per-trait streams, untouched, give back the original creature", () => {
  // A gene that changes nothing (the size it already had) still takes the per-trait path.
  for (let seed = 1; seed <= 40; seed++) {
    const plain = generateCreature(seed);
    const size = Math.round(plain.scale * 100);
    if (size < SIZE[0] || size > SIZE[1]) continue;
    const same = generateCreature(seed, { size });
    assert.deepEqual(same.parts, plain.parts, `seed ${seed}`);
    assert.deepEqual(same.palette, plain.palette, `seed ${seed}`);
  }
});

test("re-rolling one trait changes that trait and leaves the rest", () => {
  const seed = 7, plain = generateCreature(seed);
  const wings = generateCreature(seed, { roll: { wings: 99 } });
  assert.deepEqual(ofKind(wings, "body"), ofKind(plain, "body"));
  for (const k of ["head", "eye", "leg", "tail", "spike"]) assert.deepEqual(ofKind(wings, k), ofKind(plain, k), k);
  assert.notDeepEqual(ofKind(wings, "wing"), ofKind(plain, "wing"));
  assert.deepEqual(wings.palette, plain.palette);
  assert.equal(wings.scale, plain.scale);

  // Recolouring keeps every shape: same parts, new colours.
  const palette = generateCreature(seed, { roll: { palette: 5 } });
  assert.deepEqual(palette.parts.map((p) => [p.kind, p.prim, p.pos, p.size]), plain.parts.map((p) => [p.kind, p.prim, p.pos, p.size]));
  assert.notDeepEqual(palette.palette, plain.palette);
});

test("a new body keeps the same limbs, moved to fit it", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const plain = generateCreature(seed), body = generateCreature(seed, { roll: { body: 12345 } });
    assert.deepEqual(body.counts, plain.counts, `seed ${seed}`);
    // Same wing shapes (span, chord), new places.
    assert.deepEqual(ofKind(body, "wing").map((w) => w.size), ofKind(plain, "wing").map((w) => w.size), `seed ${seed}`);
  }
});

test("counts set how many; the ones already there stay put", () => {
  const plain = generateCreature(7);
  const more = generateCreature(7, { count: { eyes: Math.min(9, plain.counts.eyes + 1) } });
  if (plain.counts.eyes < 9) {
    assert.equal(more.counts.eyes, plain.counts.eyes + 1);
    assert.deepEqual(ofKind(more, "eye").slice(0, plain.counts.eyes), ofKind(plain, "eye"));
  }
  const none = generateCreature(7, { count: { heads: 0, eyes: 0, wings: 0, legs: 0, tail: 0, spikes: 0 } });
  assert.deepEqual(none.parts.map((p) => p.kind), ["body"]);
  const most = generateCreature(7, { count: { heads: 3, eyes: 9, wings: 4, legs: 4, tail: 4, spikes: 10 } });
  assert.ok(most.triangles <= TRIANGLE_CAP);
  assert.equal(most.counts.wings, 4);
});

test("hue turns every palette colour by the same amount; size sets the scale", () => {
  const plain = generateCreature(7), turned = generateCreature(7, { hue: 90 });
  turned.palette.forEach((c, i) => {
    const d = (c.h - plain.palette[i].h + 1) % 1;
    assert.ok(Math.abs(d - 0.25) < 1e-9, `colour ${i}`);
  });
  assert.equal(generateCreature(7, { size: 160 }).scale, 1.6);
});

test("genes from strangers are checked: out of range or unknown is dropped", () => {
  assert.equal(parseGenes(null), null);
  assert.equal(parseGenes([1, 2]), null);
  assert.equal(parseGenes({ hue: 0 }), null);
  assert.deepEqual(parseGenes({ roll: { wings: 3, body: -1, legs: 2 ** 32, eyes: 1.5, nose: 4 }, count: { heads: 4, eyes: 9, wings: "2" }, hue: 400, size: 300, extra: true }),
    { roll: { wings: 3 }, count: { eyes: 9 } });
  // Canonical order, whatever order they came in, so the same genes compare the same.
  assert.equal(JSON.stringify(parseGenes({ size: 100, roll: { tail: 1, palette: 2 } })), JSON.stringify({ roll: { palette: 2, tail: 1 }, size: 100 }));
  assert.deepEqual(Object.keys(COUNTS).filter((k) => !TRAITS.includes(k)), []);
  // However it's asked, a creature stays inside the triangle cap.
  for (let seed = 1; seed <= 60; seed++) {
    const c = generateCreature(seed, { count: { heads: 3, eyes: 9, wings: 4, legs: 4, tail: 4, spikes: 10 }, roll: { body: seed * 7 } });
    assert.ok(c.triangles <= TRIANGLE_CAP, `seed ${seed}`);
  }
});
