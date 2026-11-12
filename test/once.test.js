import test from "node:test";
import assert from "node:assert/strict";
import { oncePer, hadIn, marksOfList } from "../web/js/once.js";
import { moonseedFor, portalFor, take, tookHere, firstInventory, countOf } from "../web/js/inventory.js";
import { shrineState, spellOver, SPELL_S, EASE_S } from "../web/js/shrinelore.js";
import { nearestNewMoon, lunationOf, fullLunationOf, SYNODIC_S, RESPEC_S } from "../web/js/moon.js";
import { mulberry32 } from "../web/js/rng.js";

const newMoon = nearestNewMoon(Date.parse("2026-11-09T12:00:00Z") / 1000);

test("oncePer: allowed once per period, the record passed in never changed", () => {
  const r0 = {};
  const a = oncePer(r0, 7, "k");
  assert.equal(a.allowed, true);
  assert.deepEqual(r0, {}, "untouched");
  assert.deepEqual(a.next, { k: 7 });
  const b = oncePer(a.next, 7, "k");
  assert.equal(b.allowed, false);
  assert.equal(b.next, a.next, "unchanged when held back");
  assert.equal(oncePer(a.next, 8, "k").allowed, true, "the period turns");
  assert.equal(oncePer(a.next, 7, "other").allowed, true, "each key its own");
  assert.deepEqual(oncePer(undefined, 1, "k").next, { k: 1 });
  // Old records keep -1 for "never", and junk counts as never.
  for (const m of [-1, null, undefined, "7", NaN, Infinity]) assert.equal(oncePer({ k: m }, 0, "k").allowed, m !== Infinity, String(m));
  // A stamp: a moment inside the period, as the shrines keep.
  const s = oncePer({}, 1000, "shrine", 1234);
  assert.deepEqual(s.next, { shrine: 1234 });
  assert.equal(hadIn(s.next, 1000, "shrine"), true);
  assert.equal(hadIn(s.next, 2000, "shrine"), false, "a later waking");
});

test("marksOfList: keys had this period, nothing from another", () => {
  assert.deepEqual(marksOfList({ period: 3, keys: ["a", "b"] }, 3), { a: 3, b: 3 });
  assert.deepEqual(marksOfList({ period: 2, keys: ["a"] }, 3), {});
  assert.deepEqual(marksOfList(null, 3), {});
});

test("property: never two moonseeds in one lunation, and every new lunation allows one", () => {
  const rand = mulberry32(59);
  let inv = firstInventory(newMoon + SYNODIC_S / 2);
  const gave = new Map();
  // 4,000 visits at random moments across 30 moons, in order (time runs forward).
  const ts = Array.from({ length: 4000 }, () => newMoon + rand() * 30 * SYNODIC_S).sort((a, b) => a - b);
  for (const t of ts) {
    const r = moonseedFor(inv, t);
    if (r.fell) {
      const L = lunationOf(t);
      assert.ok(!gave.has(L), `two in lunation ${L}`);
      gave.set(L, t);
      assert.equal(countOf(r.inv, "moonseed") >= countOf(inv, "moonseed"), true);
    }
    inv = r.inv;
  }
  // Every new moon in range had a visit in its window, so every one gave a seed.
  for (let k = 1; k < 30; k++) assert.ok(gave.has(lunationOf(newMoon + k * SYNODIC_S)), `moon ${k} gave none`);
  // And straight after a seed, the window still open, a new lunation (the next) always allows one.
  const L = lunationOf(newMoon);
  const fresh = { items: {}, lunation: L };
  assert.equal(moonseedFor(fresh, newMoon).fell, false);
  assert.equal(moonseedFor(fresh, newMoon + SYNODIC_S - RESPEC_S / 2).fell, true);
});

test("property: one portal per full moon", () => {
  const rand = mulberry32(61);
  let inv = { items: { portal: 0 }, portalMoon: -1 };
  const got = new Set();
  const ts = Array.from({ length: 3000 }, () => newMoon + rand() * 20 * SYNODIC_S).sort((a, b) => a - b);
  for (const t of ts) {
    const r = portalFor(inv, t);
    if (r.fell) { assert.ok(!got.has(fullLunationOf(t)), "two portals in one moon"); got.add(fullLunationOf(t)); }
    inv = r.inv;
  }
  assert.ok(got.size >= 19, `${got.size} full moons gave a portal`);
});

test("finds: each spot once a moon, the record on disk kept as took: { lunation, keys }", () => {
  let inv = { items: {}, lunation: -1 };
  const f = { key: "meadow12", holds: "mossfoot" }, g = { key: "shore3", holds: "tidefin" };
  let r = take(inv, f, newMoon);
  assert.equal(r.ok, true);
  inv = r.inv;
  assert.deepEqual(inv.took, { lunation: lunationOf(newMoon), keys: ["meadow12"] });
  assert.equal(take(inv, f, newMoon + 86400).why, "taken");
  assert.equal(tookHere(inv, "meadow12", newMoon + 86400), true);
  inv = take(inv, g, newMoon + 3600).inv;
  assert.deepEqual(inv.took.keys, ["meadow12", "shore3"], "kept in the order taken");
  // The next moon, both are there again, and the old keys are dropped.
  const next = newMoon + SYNODIC_S;
  assert.equal(tookHere(inv, "meadow12", next), false);
  r = take(inv, f, next);
  assert.equal(r.ok, true);
  assert.deepEqual(r.inv.took, { lunation: lunationOf(next), keys: ["meadow12"] });
});

test("property: a shrine's gift comes back after it sleeps and wakes, and not before", () => {
  // A made-up sky: the Moon is up for 5 hours of every 11, so the shrine of the upturned sky wakes on that rhythm.
  const H = 3600, CYCLE = 11 * H;
  const sky = { moonLon: () => 0, sunLon: () => 0, mercuryLon: () => 0, moonAlt: (t) => ((t % CYCLE) < 5 * H ? 10 : -10), sunAlt: () => 10 };
  const rand = mulberry32(7);
  let used = null;
  const gave = new Set(), visited = new Set();
  for (let i = 0; i < 500; i++) {
    const t = CYCLE * 100 + i * 1700 + rand() * 600, waking = Math.floor(t / CYCLE), up = (t % CYCLE) < 5 * H;
    const st = shrineState("upturned", t, sky, used);
    assert.equal(st === "asleep", !up, "asleep exactly while the Moon is down");
    if (up) visited.add(waking);
    if (st === "awake") { assert.ok(!gave.has(waking), `two gifts in waking ${waking}`); gave.add(waking); used = t; }
  }
  // Every waking that had a visit gave its gift exactly once.
  assert.deepEqual([...gave].sort(), [...visited].sort());
  assert.ok(gave.size >= 20, `${gave.size} wakings`);
});

test("a spell runs its course: its minute up, or eased out after you end it", () => {
  assert.equal(spellOver({ t0: 0, endAt: null }, SPELL_S - 0.01), false);
  assert.equal(spellOver({ t0: 0, endAt: null }, SPELL_S), true);
  assert.equal(spellOver({ t0: 0, endAt: 10 }, 10 + EASE_S - 0.01), false, "still easing out");
  assert.equal(spellOver({ t0: 0, endAt: 10 }, 10 + EASE_S), true);
});
