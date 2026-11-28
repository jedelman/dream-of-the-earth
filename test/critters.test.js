import test from "node:test";
import assert from "node:assert/strict";
import { critterHomes, idleAt, startledAt, KINDS, CHANCE, STARTLE_S, FOLLOW, followStart, followStep, HOP_ALONG, hopAlongStart, hopAlongStep, LEAP_ALONG, leapAlongStart, leapAlongStep, frogMayGo } from "../web/js/critterlife.js";

// A flat world of one biome around (lat, lon), 1 m per metre east/north.
const flat = (biomeId, h = 50, wet = false) => (c) => ({ p: { x: (c.lon - 10) * 111320 * Math.cos((45 * Math.PI) / 180), z: -(c.lat - 45) * 111320 }, h, biomeId, wet, byWater: false, waterY: wet ? h + 1.2 : null });
const homeOf = (kind) => flat(kind === "frog" ? "rainforest" : "oceanic", 50, kind === "duck");

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
    const [c] = critterHomes(kind, 45, 10, homeOf(kind));
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
    const [c] = critterHomes(kind, 45, 10, homeOf(kind));
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

test("ducks live only on rivers and lakes, floating at the water's surface; frogs come to the water's edge", () => {
  assert.equal(critterHomes("duck", 45, 10, flat("oceanic")).length, 0, "no ducks on dry land");
  const ducks = critterHomes("duck", 45, 10, flat("oceanic", 50, true));
  assert.ok(ducks.length > 5 && ducks.length <= KINDS.duck.max);
  assert.ok(ducks.every((d) => d.h === 51.2 && d.name), "at the water's surface");
  assert.equal(critterHomes("duck", 45, 10, flat("ice", 50, true)).length, 0);
  for (const k of ["bunny", "frog", "bird"]) assert.equal(critterHomes(k, 45, 10, flat("oceanic", 50, true)).length, 0, `no ${k} in the water`);
  const dry = critterHomes("frog", 45, 10, flat("steppe")).length;
  const bank = critterHomes("frog", 45, 10, (c) => ({ ...flat("steppe")(c), byWater: true })).length;
  assert.ok(bank > dry * 3, `${dry} → ${bank}`);
});

test("a little bird you whistle to follows you a little way, then flies home", () => {
  const [c] = critterHomes("bird", 45, 10, homeOf("bird"));
  const ground = () => true, dt = 1 / 30;
  // You stand still: it hops over and settles beside you, a few metres off, pecking about.
  let me = { x: c.x + 10, z: c.z, air: 0, speed: 0 }, f = followStart(c, { x: c.x, z: c.z, lift: 0 }, 0), t = 0, r;
  for (; t < 8; t += dt) r = followStep(c, f, me, ground, dt, t);
  let d = Math.hypot(r.pose.x - me.x, r.pose.z - me.z);
  assert.ok(d >= FOLLOW.near[0] - 0.5 && d <= FOLLOW.near[1] + 1, `settles beside you (${d.toFixed(1)} m)`);
  assert.equal(r.pose.flying, false);
  assert.equal(r.done, null);
  // You walk off at 4 m/s: it flies after you and keeps close, never jumping, never under the ground; and sings now and then.
  let prev = r.pose, songs = 0, far = 0;
  for (; t < 40; t += dt) {
    me = { ...me, x: me.x + 4 * dt, speed: 4 };
    r = followStep(c, f, me, ground, dt, t);
    assert.ok(r.pose.lift >= 0, "never under the ground");
    assert.ok(Math.hypot(r.pose.x - prev.x, r.pose.z - prev.z) < 1.5, "no jumps");
    if (t > 12) far = Math.max(far, Math.hypot(r.pose.x - me.x, r.pose.z - me.z));
    songs += r.song;
    prev = r.pose;
    assert.equal(r.done, null, `still with you at ${t.toFixed(1)} s`);
  }
  assert.ok(far < 20, `keeps up (${far.toFixed(1)} m behind at most)`);
  assert.ok(songs >= 2, "sings now and then");
  // Over water it hovers rather than landing; flying, it flies with you.
  for (let k = 0; k < 150; k++, t += dt) r = followStep(c, f, me, () => false, dt, t);
  assert.ok(r.pose.lift > 1, "hovers over water");
  for (let k = 0; k < 300; k++, t += dt) r = followStep(c, f, { ...me, air: 25 }, ground, dt, t);
  assert.ok(Math.abs(r.pose.lift - 25) < 3 && r.pose.flying, "flies beside you");
  // Walk off from its home: past its leash it turns back.
  const w = followStart(c, { x: c.x, z: c.z, lift: 0 }, 0);
  me = { x: c.x + 5, z: c.z, air: 0, speed: 6 };
  for (t = 0, r = { done: null }; t < FOLLOW.s && !r.done; t += dt) { me = { ...me, x: me.x + 6 * dt }; r = followStep(c, w, me, ground, dt, t); }
  assert.equal(r.done, "home");
  assert.ok(Math.hypot(w.x - c.x, w.z - c.z) < FOLLOW.leash + 5);
  // It tires after a while even if you stay; and a fast creature leaves it behind.
  const g = followStart(c, { x: c.x, z: c.z, lift: 0 }, 0);
  r = followStep(c, g, { x: c.x + 5, z: c.z, air: 0, speed: 0 }, ground, dt, FOLLOW.s + 1);
  assert.equal(r.done, "tired");
  const h = followStart(c, { x: c.x, z: c.z, lift: 0 }, 0);
  r = followStep(c, h, { x: c.x + FOLLOW.lag + 30, z: c.z, air: 0, speed: 60 }, ground, dt, 1);
  assert.equal(r.done, "lost");
});

test("a bunny you pet follows you a little way, bounding, but not into the water or the air", () => {
  const [c] = critterHomes("bunny", 45, 10, homeOf("bunny"));
  const ground = () => true, dt = 1 / 30;
  // You stand still: it bounds over and sits beside you, sniffing now and then, sometimes with a binky.
  let me = { x: c.x + 12, z: c.z, air: 0, speed: 0 }, f = hopAlongStart(c, { x: c.x, z: c.z }, 0), t = 0, r, sniffs = 0, binkies = 0;
  for (; t < 50; t += dt) { r = hopAlongStep(c, f, me, ground, dt, t); sniffs += r.song; binkies += r.binky; }
  let d = Math.hypot(r.pose.x - me.x, r.pose.z - me.z);
  assert.ok(d >= HOP_ALONG.near[0] - 0.7 && d <= HOP_ALONG.near[1] + 1.5, `sits beside you (${d.toFixed(1)} m)`);
  assert.equal(r.done, null);
  assert.ok(sniffs >= 4, `sniffs now and then (${sniffs})`);
  assert.ok(binkies >= 1 && binkies < sniffs, `a binky sometimes (${binkies} of ${sniffs})`);
  // You walk off at 5 m/s: it bounds after you, never jumping, never under the ground, its bounds coming down.
  f = hopAlongStart(c, { x: c.x, z: c.z }, 0);
  me = { x: c.x + 5, z: c.z, air: 0, speed: 5 };
  let prev = null, far = 0, up = 0;
  for (t = 0; t < 25; t += dt) {
    me = { ...me, x: me.x + 5 * dt };
    r = hopAlongStep(c, f, me, ground, dt, t);
    assert.ok(r.pose.lift >= 0 && r.pose.lift <= 1.0 * c.size, "bounds, on the ground");
    if (prev) assert.ok(Math.hypot(r.pose.x - prev.x, r.pose.z - prev.z) < 1.5, "no jumps");
    if (t > 8) far = Math.max(far, Math.hypot(r.pose.x - me.x, r.pose.z - me.z));
    up = Math.max(up, r.pose.lift);
    prev = r.pose;
    assert.equal(r.done, null, `still with you at ${t.toFixed(1)} s`);
    assert.equal(r.pose.flying, false);
  }
  assert.ok(far < 15, `keeps up (${far.toFixed(1)} m off at most)`);
  assert.ok(up > 0.4 * c.size, "it really bounds");
  // Into the water: it stops at the edge (never on the water), waits, then gives up when you swim on.
  const shore = me.x + 3, dry = (x) => x < shore;
  let wet = false;
  for (let k = 0; k < 600 && !r.done; k++, t += dt) {
    me = { ...me, x: me.x + 3 * dt, speed: 3 };
    r = hopAlongStep(c, f, me, dry, dt, t);
    if (!dry(r.pose.x)) wet = true;
  }
  assert.equal(wet, false, "never hops onto the water");
  assert.equal(r.done, "shore");
  // Flying off: it can't come either.
  const a = hopAlongStart(c, { x: c.x, z: c.z }, 0);
  r = hopAlongStep(c, a, { x: c.x + 3, z: c.z, air: HOP_ALONG.lag + 5, speed: 10 }, ground, dt, 1);
  assert.equal(r.done, "shore");
  // Past its leash it turns back; it tires after a while; a fast creature leaves it behind.
  const w = hopAlongStart(c, { x: c.x, z: c.z }, 0);
  me = { x: c.x + 5, z: c.z, air: 0, speed: 6 };
  for (t = 0, r = { done: null }; t < HOP_ALONG.s && !r.done; t += dt) { me = { ...me, x: me.x + 6 * dt }; r = hopAlongStep(c, w, me, ground, dt, t); }
  assert.equal(r.done, "home");
  assert.ok(Math.hypot(w.x - c.x, w.z - c.z) < HOP_ALONG.leash + 5);
  const g = hopAlongStart(c, { x: c.x, z: c.z }, 0);
  assert.equal(hopAlongStep(c, g, { x: c.x + 5, z: c.z, air: 0, speed: 0 }, ground, dt, HOP_ALONG.s + 1).done, "tired");
  const h = hopAlongStart(c, { x: c.x, z: c.z }, 0);
  assert.equal(hopAlongStep(c, h, { x: c.x + HOP_ALONG.lag + 30, z: c.z, air: 0, speed: 60 }, ground, dt, 1).done, "lost");
});

test("a frog you boop on a bank leaps along by the water, swims after you, but keeps to fresh water and its banks", () => {
  const [c] = critterHomes("frog", 45, 10, homeOf("frog"));
  assert.ok(c, "a frog to boop");
  const dt = 1 / 30;
  // A river runs north-south from x = c.x + 30 to c.x + 40; its banks reach 36 m either side; past that it's dry, and
  // past c.x + 200 is the sea.
  const W0 = c.x + 30, W1 = c.x + 40;
  const where = (x) => (x > c.x + 200 ? "no" : x >= W0 && x <= W1 ? "water" : x > W0 - LEAP_ALONG.bank && x < W1 + LEAP_ALONG.bank ? "bank" : "dry");
  assert.equal(frogMayGo("bank") && frogMayGo("water"), true);
  assert.equal(frogMayGo("dry") || frogMayGo("no"), false);
  // You stand on the bank: it leaps over and sits beside you, croaking now and then.
  let me = { x: c.x + 20, z: c.z, air: 0, speed: 0 }, f = leapAlongStart(c, { x: c.x + 10, z: c.z }, 0), t = 0, r, croaks = 0, leaps = 0, was = false;
  for (; t < 20; t += dt) { r = leapAlongStep(c, f, me, where, dt, t); croaks += r.song; if (r.pose.moving && !was) leaps++; was = r.pose.moving; }
  let d = Math.hypot(r.pose.x - me.x, r.pose.z - me.z);
  assert.ok(d <= LEAP_ALONG.near[1] + 1.5, `sits beside you (${d.toFixed(1)} m)`);
  assert.equal(r.done, null);
  assert.ok(croaks >= 2, `croaks now and then (${croaks})`);
  assert.ok(leaps >= 2, `leaps, one leap at a time (${leaps})`);
  assert.equal(r.pose.swim, 0, "on the bank, not in the water");
  // You walk along the bank (north) at 4 m/s: it leaps after you, never jumping, its leaps coming down, sitting between.
  let prev = null, far = 0, up = 0, sat = 0;
  for (let k = 0; k < 20 / dt; k++, t += dt) {
    me = { ...me, z: me.z - 4 * dt, speed: 4 };
    r = leapAlongStep(c, f, me, where, dt, t);
    assert.ok(r.pose.lift >= 0 && r.pose.lift <= 2 * c.size, "leaps, on the ground");
    if (prev) assert.ok(Math.hypot(r.pose.x - prev.x, r.pose.z - prev.z) < 1, "no jumps");
    if (k * dt > 6) far = Math.max(far, Math.hypot(r.pose.x - me.x, r.pose.z - me.z));
    up = Math.max(up, r.pose.lift);
    if (!r.pose.moving) sat++;
    prev = r.pose;
    assert.equal(r.done, null, `still with you at ${t.toFixed(1)} s`);
  }
  assert.ok(far < 14, `keeps up (${far.toFixed(1)} m off at most)`);
  assert.ok(up > 0.6 * c.size, "really leaps");
  assert.ok(sat > 0.1 * (20 / dt), "and sits between leaps");
  // You wade into the river: it plops in after you, and swims beside you, low in the water, a stroke at a time.
  let plops = 0, swum = 0;
  for (let k = 0; k < 12 / dt; k++, t += dt) {
    me = { ...me, x: Math.min(c.x + 35, me.x + 3 * dt), speed: 3 };
    r = leapAlongStep(c, f, me, where, dt, t);
    plops += r.plop;
    if (r.pose.swim === 1) { swum++; assert.ok(r.pose.lift < 0, "floats low in the water"); }
    if (prev) assert.ok(Math.hypot(r.pose.x - prev.x, r.pose.z - prev.z) < 1, "no jumps");
    prev = r.pose;
  }
  assert.equal(plops, 1, "plop");
  assert.ok(swum > 0 && where(r.pose.x) === "water", "swims beside you");
  assert.equal(r.done, null);
  // You go on inland, far from the water: it comes as far as the bank goes, waits there, then gives up.
  f = leapAlongStart(c, { x: r.pose.x, z: r.pose.z }, 0, true); t = 0;
  let dry = false;
  for (let k = 0; k < 40 / dt && !r.done; k++, t += dt) {
    me = { ...me, x: me.x + 4 * dt, speed: 4 };
    r = leapAlongStep(c, f, me, where, dt, t);
    if (!frogMayGo(where(r.pose.x))) dry = true;
  }
  assert.equal(dry, false, "never leaves the banks");
  assert.equal(r.done, "stay");
  // Up into the air, or into the sea: it won't come either.
  const a = leapAlongStart(c, { x: c.x + 20, z: c.z }, 0);
  assert.equal(leapAlongStep(c, a, { x: c.x + 22, z: c.z, air: LEAP_ALONG.lag + 5, speed: 10 }, where, dt, 1).done, "stay");
  const b = leapAlongStart(c, { x: c.x + 20, z: c.z }, 0);
  assert.equal(leapAlongStep(c, b, { x: c.x + 260, z: c.z, air: 0, speed: 10 }, where, dt, 1).done, "stay");
  // Past its leash it turns back; it tires after a while; a fast creature leaves it behind.
  const w = leapAlongStart(c, { x: c.x + 20, z: c.z }, 0);
  me = { x: c.x + 22, z: c.z, air: 0, speed: 5 };
  for (t = 0, r = { done: null }; t < LEAP_ALONG.s && !r.done; t += dt) { me = { ...me, z: me.z + 5 * dt }; r = leapAlongStep(c, w, me, where, dt, t); }
  assert.equal(r.done, "home");
  assert.ok(Math.hypot(w.x - c.x, w.z - c.z) < LEAP_ALONG.leash + 10);
  const g = leapAlongStart(c, { x: c.x + 20, z: c.z }, 0);
  assert.equal(leapAlongStep(c, g, { x: c.x + 22, z: c.z, air: 0, speed: 0 }, where, dt, LEAP_ALONG.s + 1).done, "tired");
  const h = leapAlongStart(c, { x: c.x + 20, z: c.z }, 0);
  assert.equal(leapAlongStep(c, h, { x: c.x + 20, z: c.z + LEAP_ALONG.lag + 30, air: 0, speed: 60 }, where, dt, 1).done, "lost");
});
