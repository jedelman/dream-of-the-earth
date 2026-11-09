import test from "node:test";
import assert from "node:assert/strict";
import { bornOf, asleep, effective, bornStats, maxDepth, spawnAround, ASLEEP, WAKER } from "../web/js/birth.js";
import { findsAround, SEABED_MIN, SUMMIT_MIN } from "../web/js/findlore.js";
import { take, tookHere, countOf, boostsOf, ITEMS } from "../web/js/inventory.js";
import { valid } from "../web/js/stats.js";
import { nearestNewMoon, SYNODIC_S } from "../web/js/moon.js";

const s = { climb: 2, swim: 4, run: 3, gleam: 1, perception: 2, fly: 0 };

test("a creature from before births is born where its stats lean (run on a tie)", () => {
  assert.equal(bornOf(s), "sea");
  assert.equal(bornOf({ ...s, swim: 3 }), "land");
  assert.equal(bornOf(s, "land"), "land", "a chosen birth stands");
  assert.equal(bornOf(s, "air"), "sea", "an unknown one is ignored");
});

test("the stat a birth puts to sleep counts as nothing until its waker is worn; boosts add, capped", () => {
  assert.equal(ASLEEP.land, "swim"); assert.equal(WAKER.land, "tidefin");
  assert.ok(asleep("swim", "land", ["prism"]));
  assert.ok(!asleep("swim", "land", ["tidefin"]));
  assert.ok(!asleep("run", "land", []));
  assert.equal(effective(s, "land", []).swim, 0);
  assert.equal(effective(s, "land", ["tidefin"]).swim, 4);
  assert.equal(effective(s, "sea", []).run, 0);
  assert.equal(effective(s, "sea", [], { boosts: { perception: 2 } }).perception, 4);
  assert.equal(effective({ ...s, perception: 5 }, "sea", [], { boosts: { perception: 2 } }).perception, 6, "never past six");
  assert.equal(effective({ ...s, perception: 5 }, "sea", [], { boosts: { perception: 2 }, ceilings: { perception: 1 } }).perception, 7, "unless the ceiling's raised");
  assert.equal(effective({ ...s, fly: 3 }, "sea", []).fly, 0, "no wings, no flight");
  assert.equal(effective({ ...s, fly: 3 }, "sea", [], { wings: true }).fly, 3);
  assert.equal(s.swim, 4, "the stats themselves don't change");
});

test("a new creature's points move out of the stat its birth puts to sleep, none lost", () => {
  const land = bornStats(s, "land");
  assert.deepEqual(land, { climb: 2, swim: 0, run: 6, gleam: 1, perception: 3, fly: 0 });
  assert.ok(valid(land));
  const sea = bornStats({ climb: 6, swim: 5, run: 6, gleam: 0, perception: 0, fly: 0 }, "sea");
  assert.deepEqual(sea, { climb: 6, swim: 6, run: 0, gleam: 0, perception: 0 + 5, fly: 0 });
});

test("dive depth: a duck under with no swim, then four times deeper a point, anywhere at six", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(maxDepth), [3, 15, 60, 240, 960, 3840]);
  assert.ok(maxDepth(6) > 11000, "past the Mariana Trench");
  assert.ok(maxDepth(0) < SEABED_MIN, "a sleeping swim can't reach the seabed finds");
});

test("waking places: land well inland for the land-born, coastal water for the sea-born", () => {
  const land = (lat, lon) => lon > 0; // everything east of the meridian is land
  let k = 0;
  const rand = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  const nodes = [{ lat: 10, lon: -0.05 }];
  const a = spawnAround("land", nodes, land, rand);
  assert.ok(a && a.lon > 0.02, `inland: ${a && a.lon}`);
  const b = spawnAround("sea", nodes, land, rand);
  assert.ok(b && b.lon < 0 && b.lon > -0.15, `near the shore: ${b && b.lon}`);
  assert.equal(spawnAround("land", [{ lat: 10, lon: -40 }], land, rand), null, "no land in reach of this node");
});

test("finds: beaches, seabeds, meadows and summits hold what each kind of creature needs", () => {
  // A coast along x = 0 (sea to the west, falling 1 m in 10; land rising to a 60 m plain), and a hill to the east
  // topping out at 1,600 m.
  const height = (x, z) => (x < 0 ? x / 10 : Math.max(Math.min(60, x / 10), 1600 - Math.hypot(x - 6000, z) * 0.6));
  const toLocal = (lat, lon) => ({ x: (lon - 0) * 111320 * Math.cos((lat * Math.PI) / 180), z: -(lat - 20) * 110574 });
  const finds = findsAround(20, 0, { toLocal, height });
  const by = (p) => finds.filter((f) => f.place === p);
  assert.ok(by("seabed").length > 3 && by("seabed").every((f) => f.y <= -SEABED_MIN && f.holds === "tidefin"));
  assert.ok(by("meadow").length > 3 && by("meadow").every((f) => f.y >= 3 && f.holds === "mossfoot"));
  assert.ok(by("shore").length >= 1 && by("shore").every((f) => f.y >= 0.5 && f.y <= 6 && Math.abs(f.x) < 120), JSON.stringify(by("shore")));
  assert.ok(by("summit").length === 1 && by("summit")[0].y >= SUMMIT_MIN && Math.hypot(by("summit")[0].x - 6000, by("summit")[0].z) < 60, "one eye on the one peak");
  assert.deepEqual(findsAround(20, 0, { toLocal, height }), finds, "the same finds every time");
  assert.equal(new Set(finds.map((f) => f.key)).size, finds.length);
});

test("taking a find: once a moon per spot, up to what fits", () => {
  const t = nearestNewMoon(Date.parse("2026-11-20T00:00:00Z") / 1000) + 86400 * 5;
  const f = { key: "shore123", holds: "tidefin" };
  let inv = { items: {}, worn: [], lunation: -1 };
  const r = take(inv, f, t);
  assert.ok(r.ok);
  assert.equal(countOf(r.inv, "tidefin"), 1);
  assert.ok(tookHere(r.inv, "shore123", t));
  assert.equal(take(r.inv, f, t + 3600).why, "taken");
  assert.ok(take(r.inv, f, t + SYNODIC_S).ok, "next moon it's there again");
  inv = { items: { tidefin: ITEMS.tidefin.max }, lunation: -1 };
  assert.equal(take(inv, f, t).why, "full");
  assert.deepEqual(boostsOf({ items: { owleye: 1, prism: 1 }, worn: ["owleye", "prism"] }), { perception: 2 });
});
