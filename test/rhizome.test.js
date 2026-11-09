import test from "node:test";
import assert from "node:assert/strict";
import { rhizomeOf, viewOf, canSlot, canUnslot, effectsOf, wokenLinks, cleanFilled, GEM_OF, COLOURS, POWERS } from "../web/js/rhizome.js";

const seeds = [7, 42, 1234567, 2 ** 31 + 99, 4000000000];

test("a rhizome is its seed's: the same every time, different for another", () => {
  assert.deepEqual(rhizomeOf(7), rhizomeOf(7));
  assert.notDeepEqual(rhizomeOf(7).slots.map((s) => [s.x, s.y]), rhizomeOf(8).slots.map((s) => [s.x, s.y]));
});

test("every rhizome: three beginnings, one of each colour; all joined; every power and every deeper dream once; two grow links", () => {
  for (const seed of seeds) {
    const R = rhizomeOf(seed), base = R.slots.filter((s) => s.sprout === -1);
    assert.deepEqual(R.slots.slice(0, 3).map((s) => [s.start, s.colour]), COLOURS.map((c) => [true, c]));
    assert.ok(base.length >= 50, `${seed}: ${base.length} slots`);
    const effects = R.links.filter((l) => l.sprout === -1).map((l) => l.effect);
    for (const p of Object.keys(POWERS)) assert.equal(effects.filter((e) => e.kind === "power" && e.power === p).length, 1, `${seed}: ${p}`);
    for (const c of COLOURS) assert.equal(effects.filter((e) => e.kind === "deeper" && e.colour === c).length, 1);
    assert.equal(effects.filter((e) => e.kind === "grow").length, 2);
    assert.ok(R.slots.filter((s) => s.sprout !== -1).length === 10, "five sprouts behind each grow link");
    for (const l of R.links) assert.ok(l.effect && l.effect.kind, "every link does something");
    // Joined: from the beginnings, every base slot is reachable over base links.
    const seen = new Set([0, 1, 2]), q = [0, 1, 2];
    while (q.length) { const v = q.shift(); for (const l of R.links) if (l.sprout === -1) for (const [p, o] of [[l.a, l.b], [l.b, l.a]]) if (p === v && !seen.has(o)) { seen.add(o); q.push(o); } }
    assert.equal(seen.size, base.length);
  }
});

/** Fill outward greedily until a power is woken; returns the filled map and how many gems it took. */
function growTo(R, want) {
  const filled = {};
  for (let n = 0; n < 200; n++) {
    if (effectsOf(R, filled).powers.has(want)) return { filled, n };
    const v = viewOf(R, filled);
    // Head for the link with the power: fill whichever fillable slot is nearest to it (by position).
    const target = R.links.find((l) => l.effect.kind === "power" && l.effect.power === want);
    const goal = filled[target.a] ? R.slots[target.b] : R.slots[target.a];
    const pick = [...v.fillable].sort((i, j) => Math.hypot(R.slots[i].x - goal.x, R.slots[i].y - goal.y) - Math.hypot(R.slots[j].x - goal.x, R.slots[j].y - goal.y))[0];
    filled[pick] = GEM_OF[R.slots[pick].colour];
  }
  return { filled, n: Infinity };
}

test("you see only what you've grown toward, fill only next to what's filled, and gems fit their colour", () => {
  const R = rhizomeOf(42);
  const v0 = viewOf(R, {});
  assert.deepEqual([...v0.visible].sort(), [0, 1, 2]);
  assert.deepEqual([...v0.fillable].sort(), [0, 1, 2]);
  assert.ok(!canSlot(R, {}, 0, GEM_OF[COLOURS[1]]), "a cyan gem won't fit a rose slot");
  assert.ok(canSlot(R, {}, 0, GEM_OF.rose));
  const far = R.slots.find((s) => s.sprout === -1 && !s.start && Math.hypot(s.x, s.y) > 0.8);
  assert.ok(!canSlot(R, {}, far.i, GEM_OF[far.colour]), "not out in the fog");
  const f1 = { 0: "rosegem" }, v1 = viewOf(R, f1);
  assert.ok(v1.visible.size > 3, "filling shows its neighbours");
  for (const i of v1.fillable) assert.ok(i <= 2 || R.links.some((l) => (l.a === 0 && l.b === i) || (l.b === 0 && l.a === i)));
});

test("woken links give their effects, and Wings comes within a handful of gems", () => {
  for (const seed of seeds) {
    const R = rhizomeOf(seed), { filled, n } = growTo(R, "wings");
    assert.ok(n <= 9, `${seed}: Wings took ${n} gems`);
    const e = effectsOf(R, filled);
    assert.ok(e.powers.has("wings"));
    const sum = Object.values(e.boosts).reduce((t, x) => t + x, 0) + Object.values(e.ceilings).reduce((t, x) => t + x, 0);
    assert.ok(sum >= 1, "and some boosts on the way");
    for (const l of wokenLinks(R, filled)) assert.ok(filled[l.a] && filled[l.b]);
  }
});

test("growth: a woken grow link brings its sprouts into being", () => {
  const R = rhizomeOf(7), g = R.links.find((l) => l.effect.kind === "grow");
  const sprouts = R.slots.filter((s) => s.sprout === g.i).map((s) => s.i);
  // Fill a path to both ends of the grow link (all base slots, for simplicity).
  const all = {};
  for (const s of R.slots) if (s.sprout === -1) all[s.i] = GEM_OF[s.colour];
  const v = viewOf(R, all);
  for (const i of sprouts.slice(0, 1)) assert.ok(v.visible.has(i), "the first sprout shows");
  const none = {};
  for (const s of R.slots) if (s.sprout === -1 && s.i !== g.a && s.i !== g.b) none[s.i] = GEM_OF[s.colour];
  assert.ok(sprouts.every((i) => !viewOf(R, none).visible.has(i)), "not before the link wakes");
});

test("a gem comes out only if the rest still reaches a beginning; records are re-checked against the rules", () => {
  const R = rhizomeOf(42), { filled } = growTo(R, "wings");
  const keys = Object.keys(filled).map(Number);
  assert.ok(keys.some((k) => canUnslot(R, filled, k)), "some leaf can come out");
  const cut = keys.find((k) => !canUnslot(R, filled, k));
  if (cut !== undefined) assert.ok(!canUnslot(R, filled, cut), "a slot holding the rest together stays");
  assert.deepEqual(cleanFilled(R, filled), filled, "a fair record survives");
  const forged = { ...filled, 53: GEM_OF[R.slots[53].colour], 1: "cyangem", 999: "rosegem", 2: "sword" };
  const clean = cleanFilled(R, forged);
  assert.ok(!(53 in clean) || viewOf(R, filled).fillable.has(53), "nothing out in the fog");
  assert.equal(clean[999], undefined);
  assert.equal(cleanFilled(R, "lots").constructor, Object);
});

import { slotGem, unslotGem, makeInventoryRecord, parseInventoryRecord, countOf } from "../web/js/inventory.js";
test("gems move between your pouch and your rhizome, and the record keeps where", () => {
  let inv = { items: { rosegem: 2 }, lunation: -1, rhizome: { seed: 42, slots: {} } };
  inv = slotGem(inv, 0, "rosegem");
  assert.equal(countOf(inv, "rosegem"), 1);
  assert.equal(slotGem(inv, 0, "rosegem"), null, "taken");
  assert.equal(slotGem({ ...inv, items: {} }, 5, "rosegem"), null, "none to slot");
  const back = parseInventoryRecord(makeInventoryRecord(inv));
  assert.deepEqual(back.rhizome, { seed: 42, slots: { 0: "rosegem" } });
  assert.deepEqual(parseInventoryRecord({ ...makeInventoryRecord(inv), rhizome: { seed: -3, slots: { 0: "sword", x: "rosegem", 7: "cyangem" } } }).rhizome, { seed: null, slots: { 7: "cyangem" } });
  const out = unslotGem(inv, 0);
  assert.equal(countOf(out, "rosegem"), 2);
  assert.deepEqual(out.rhizome.slots, {});
});
