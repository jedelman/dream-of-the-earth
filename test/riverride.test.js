import test from "node:test";
import assert from "node:assert/strict";
import { stemArea, rankArea, dischargeOf, depthOf, rideSpeed, riverAt, nearestOnStem, advance, pointAt, rideLine, SPEED_MAX, SPEED_MIN } from "../web/js/riverride.js";
import { promptFor } from "../web/js/interactions.js";
import { next, travelOf, can } from "../web/js/modes.js";

test("a river carries more water the further down its stem, and deeper water carries you faster", () => {
  assert.equal(stemArea(100000, 1000, 0), 100000, "all of it at the mouth");
  assert.equal(stemArea(100000, 1000, 1000), 0, "none at the source");
  assert.ok(stemArea(100000, 1000, 500) < 50000, "Hack's law: half way up drains well under half");
  const loire = riverAt({ basinKm2: 117000, lenKm: 1000, sFromSeaKm: 100 });
  assert.ok(loire.discharge > 500 && loire.discharge < 1500, `the Loire near Tours carries ${loire.discharge} m³/s (really about 900)`);
  const amazon = riverAt({ basinKm2: 5900000, lenKm: 4928, sFromSeaKm: 200 });
  assert.ok(amazon.depth > loire.depth * 3 && amazon.speed > loire.speed);
  assert.ok(rankArea(1) > rankArea(5) && rankArea(5) > rankArea(12));
  assert.ok(depthOf(dischargeOf(1000)) > depthOf(dischargeOf(10)));
  assert.equal(rideSpeed(1000), SPEED_MAX);
  assert.equal(rideSpeed(0), SPEED_MIN);
  assert.ok(riverAt({ rank: 3 }).speed > riverAt({ rank: 10 }).speed);
});

test("the ride finds where it is on a stem, moves along a line, and runs out at the end", () => {
  const line = [[0, 0, 0], [0, 1, 111.3], [0, 2, 222.6]];
  const n = nearestOnStem(line, 0.01, 1.5);
  assert.ok(Math.abs(n.s - 167) < 1 && n.km < 1.2);
  const L = [[0, 0], [100, 0], [100, 100]];
  assert.deepEqual(advance(L, 0, 0, 50), { k: 0, t: 50 });
  assert.deepEqual(advance(L, 0, 50, 100), { k: 1, t: 50 });
  assert.equal(advance(L, 1, 50, 80).end, true);
  const p = pointAt(L, 1, 50);
  assert.deepEqual([p.x, p.z, p.dx, p.dz], [100, 50, 0, 1]);
});

test("the river's words, its prompts, and a river ride as a travel state", () => {
  const line = rideLine("Loire", { depth: 4.2, discharge: 1170, speed: 63 });
  assert.equal(line, "The Loire takes you, about 4 m deep and 1,200 m³ a second: 227 km/h downstream.");
  assert.match(rideLine(null, { depth: 0.6, discharge: 7, speed: 9 }), /^The river takes you, about 0\.6 m deep and 7 m³ a second/);
  assert.equal(promptFor({ kind: "rideriver", name: "Loire" }), "Ride the Loire downstream");
  assert.equal(promptFor({ kind: "ashore" }), "Step out onto the bank");
  assert.equal(next("world", "float"), "river");
  assert.equal(next("trip", "float"), null, "not mid-trip");
  assert.equal(next("river", "ashore"), "world");
  assert.equal(travelOf({ float: {} }).state, "river");
  const snap = { travel: "river", overlay: "none", view: "near", ready: true };
  assert.equal(can(snap, "reach"), false, "the river has you: nothing else glints");
  assert.equal(can(snap, "regrowFar"), true);
});
