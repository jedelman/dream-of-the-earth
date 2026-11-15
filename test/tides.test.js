import test from "node:test";
import assert from "node:assert/strict";
import { tideLevel, tideNow, tideLine, soonText } from "../web/js/tides.js";
import { moonEcliptic, horizontal, sunLongitude } from "../web/js/astro.js";
import { promptFor, seaLine, drinkLine, waterName, waterAsks, chooseFocus } from "../web/js/interactions.js";

const T0 = Date.UTC(2026, 10, 15, 9) / 1000; // 15 November 2026, 09:00 UTC
const moonAlt = (t, lat, lon) => horizontal(moonEcliptic(t), t, lat, lon).altitude;

test("the tide stands high under the Moon and opposite it, low when the Moon is on the horizon", () => {
  // Scan a day on the equator: the highest water is with the Moon high or far underfoot, the lowest with it low.
  let hi = { v: -9 }, lo = { v: 9 };
  for (let s = 0; s < 86400; s += 300) {
    const v = tideLevel(T0 + s, 0, -30);
    if (v > hi.v) hi = { v, alt: moonAlt(T0 + s, 0, -30) };
    if (v < lo.v) lo = { v, alt: moonAlt(T0 + s, 0, -30) };
  }
  assert.ok(Math.abs(hi.alt) > 55, `high water with the Moon at ${hi.alt}`);
  assert.ok(Math.abs(lo.alt) < 25, `low water with the Moon at ${lo.alt}`);
  assert.ok(hi.v > 0.4 && lo.v < 0 && hi.v - lo.v > 0.5, `${hi.v} ${lo.v}`); // near a quarter moon: neaps, a small swing
});

test("two high waters a day, about 12 h 25 min apart", () => {
  const highs = [];
  let t = T0;
  for (let k = 0; k < 8; k++) {
    const td = tideNow(t, 10, 60);
    assert.ok(td.turnS != null && td.turnS > 0 && td.turnS < 9 * 3600, `the turn comes within nine hours (${td.turnS})`);
    if (td.turn === "high") highs.push(t + td.turnS);
    t += td.turnS + 900; // just past the turn
  }
  assert.ok(highs.length >= 3);
  for (let k = 1; k < highs.length; k++) {
    const gap = (highs[k] - highs[k - 1]) / 3600;
    assert.ok(gap > 11 && gap < 14, `highs ${gap.toFixed(2)} h apart`);
  }
});

test("rising means the water is higher a little later, and the turn is a real turn", () => {
  for (const [lat, lon] of [[0, 0], [35, 139], [-33, 18], [47, -3], [60, -150]]) {
    for (let k = 0; k < 12; k++) {
      const t = T0 + k * 7919, td = tideNow(t, lat, lon);
      assert.equal(td.rising, tideLevel(t + 600, lat, lon) > td.level);
      if (td.turnS == null || td.turnS < 1800) continue;
      const at = tideLevel(t + td.turnS, lat, lon), before = tideLevel(t + td.turnS - 1500, lat, lon), after = tideLevel(t + td.turnS + 1500, lat, lon);
      if (td.rising) assert.ok(at >= before && at >= after, "a high");
      else assert.ok(at <= before && at <= after, "a low");
    }
  }
});

test("spring tides at new and full moon, neaps at the quarters", () => {
  const elong = (t) => (((moonEcliptic(t).lon - sunLongitude(t)) % 360) + 360) % 360;
  let seen = { spring: 0, neap: 0 };
  for (let d = 0; d < 30; d++) {
    const t = T0 + d * 86400, e = elong(t), m = tideNow(t, 0, 0).moons;
    if (e < 20 || e > 340 || Math.abs(e - 180) < 20) { assert.equal(m, "spring"); seen.spring++; }
    if (Math.abs(e - 90) < 20 || Math.abs(e - 270) < 20) { assert.equal(m, "neap"); seen.neap++; }
  }
  assert.ok(seen.spring >= 4 && seen.neap >= 4);
  // The range really is bigger at springs: compare a day's swing at the two.
  const swing = (t) => { let a = 9, b = -9; for (let s = 0; s < 90000; s += 600) { const v = tideLevel(t + s, 0, 0); a = Math.min(a, v); b = Math.max(b, v); } return b - a; };
  let spring = null, neap = null;
  for (let d = 0; d < 30 && !(spring && neap); d++) { const t = T0 + d * 86400, m = tideNow(t, 0, 0).moons, e = elong(t); if (m === "spring" && (e < 8 || e > 352 || Math.abs(e - 180) < 8)) spring ??= t; if (m === "neap" && (Math.abs(e - 90) < 8 || Math.abs(e - 270) < 8)) neap ??= t; }
  assert.ok(spring && neap && swing(spring) > swing(neap) * 1.3, "springs swing wider than neaps");
});

test("the tide in words", () => {
  assert.equal(soonText(600), "minutes");
  assert.equal(soonText(1800), "about half an hour");
  assert.equal(soonText(3600), "about an hour");
  assert.equal(soonText(3 * 3600 + 500), "about 3 hours");
  assert.equal(tideLine({ rising: true, turn: "high", turnS: 3 * 3600, moons: "" }), "By the Moon's pull the tide is rising here: high water in about 3 hours.");
  assert.equal(tideLine({ rising: false, turn: "low", turnS: 300, moons: "spring" }), "By the Moon's pull it's low water here, the tide on the turn. Spring tides: the Sun and the Moon pull in line.");
  assert.match(tideLine({ rising: false, turn: "low", turnS: null, moons: "neap" }), /hardly stirs.*Neap tides/);
  assert.match(tideLine(tideNow(T0, 36.9, -76)), /^By the Moon's pull /);
});

test("touching water: the prompt, the lines, and its place in the queue", () => {
  assert.equal(promptFor({ kind: "water", water: "sea" }), "Splash the sea");
  assert.equal(promptFor({ kind: "water", water: "river", name: "Loire" }), "Drink from the Loire");
  assert.equal(promptFor({ kind: "water", water: "lake", name: "Lago Titicaca" }), "Drink from Lago Titicaca");
  assert.equal(waterName({ water: "river", name: "" }), "the river");
  assert.equal(waterName({ water: "lake", name: "", reservoir: true }), "the reservoir");
  assert.match(seaLine("TIDE.", 0), /^You .* TIDE\.$/);
  assert.notEqual(seaLine("x", 0) === seaLine("x", 1) && seaLine("x", 1) === seaLine("x", 2) && seaLine("x", 2) === seaLine("x", 3), true, "splashes vary");
  const loire = { kind: "river", river: "Loire", lake: undefined }, chad = { kind: "lake", lake: "Lake Chad", river: "Chari" };
  assert.equal(drinkLine({ water: "river", name: "Loire" }, loire, "215 km west"), "You drink from the Loire. This water is bound for the sea, 215 km west of here.");
  assert.equal(drinkLine({ water: "river", name: "Loire" }, { kind: "river", river: "Loire River" }, "216 km west"), "You drink from the Loire. This water is bound for the sea, 216 km west of here.");
  assert.equal(drinkLine({ water: "river", name: "Vienne" }, loire, "240 km north-west"), "You drink from the Vienne. This water joins the Loire, and meets the sea, 240 km north-west of here.");
  assert.equal(drinkLine({ water: "lake", name: "Lac Léman", level: 372.4 }, { kind: "river", river: "Rhône" }, "410 km south"), "You drink from Lac Léman. It lies 372 m above the sea. This water leaves by the Rhône, and meets the sea, 410 km south of here.");
  assert.match(drinkLine({ water: "lake", name: "Lake Chad", level: 280 }, chad, "3 km east"), /never reaches the sea: every river round here ends in it\.$/);
  assert.match(drinkLine({ water: "river", name: "Chari" }, chad, "300 km north"), /it ends in Lake Chad, 300 km north of here\.$/);
  assert.match(drinkLine({ water: "river", name: "" }, null), /^You drink from the river\. Cold, and in a hurry\.$/);
  assert.match(drinkLine({ water: "river", name: "Wadi" }, { kind: "hollow" }), /lowest ground/);
  assert.match(drinkLine({ water: "river", name: "Beck" }, { kind: "coast" }), /straight to the sea/);
  // A tree close and ahead takes the prompt from the water; with nothing nearer, the water has it.
  const water = { kind: "water", key: "water:sea:", d: 0, range: 1, facing: 1 };
  assert.equal(chooseFocus([water]).kind, "water");
  assert.equal(chooseFocus([water, { kind: "tree", key: "t1", species: "quercus", d: 6, range: 30, facing: 0.9 }]).kind, "tree");
  assert.equal(waterAsks([{ kind: "tree" }, { kind: "butterfly" }, { kind: "being" }]), true);
  for (const kind of ["find", "shrine", "stones", "door", "waymark", "spring", "artifact", "critter", "mutual", "firefly"]) assert.equal(waterAsks([{ kind: "tree" }, { kind }]), false, kind);
  assert.equal(chooseFocus([water, { kind: "tree", key: "t2", species: "quercus", d: 28, range: 30, facing: -1 }]).kind, "water");
});
