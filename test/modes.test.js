import test from "node:test";
import assert from "node:assert/strict";
import { TRAVEL, TRANSITIONS, next, travelOf, can, ALLOW, reachable, viewOf } from "../web/js/modes.js";
import { mulberry32 } from "../web/js/rng.js";

const EVENTS = [...new Set(Object.values(TRANSITIONS).flatMap((t) => Object.keys(t)))];

test("the table is closed: every state has its events, and every event leads to a known state", () => {
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), [...TRAVEL].sort());
  for (const [from, t] of Object.entries(TRANSITIONS)) for (const [ev, to] of Object.entries(t)) assert.ok(TRAVEL.includes(to), `${from} --${ev}--> ${to}`);
});

test("from every state there's a way back to the world", () => {
  for (const s of TRAVEL) assert.ok(reachable(s).has("world"), s);
});

test("property: any sequence of events keeps one known state; a refused event changes nothing", () => {
  const rand = mulberry32(20261110);
  for (let run = 0; run < 400; run++) {
    let s = "world";
    for (let k = 0; k < 60; k++) {
      const ev = EVENTS[Math.floor(rand() * EVENTS.length)], to = next(s, ev);
      if (to === null) continue; // refused: s stays
      assert.ok(TRAVEL.includes(to));
      s = to;
    }
  }
});

test("the transitions that bit us are refused or routed", () => {
  assert.equal(next("ring", "board"), null, "no boarding a tapped highway from inside a ring: only a lane");
  assert.equal(next("ring", "takeLane"), "ride");
  assert.equal(next("ride", "holdInRing"), null, "a ride reaches a ring only through travelling (the regrow)");
  assert.equal(next("travelling", "holdInRing"), "ring");
  assert.equal(next("dream", "travel"), "travelling", "travel from a dream is allowed (main.js wakes you first)");
  assert.equal(next("dream", "board"), null);
  assert.equal(next("dream", "enterStones"), null);
  assert.equal(next("travelling", "trip"), null, "no tapping off somewhere mid-regrow");
});

test("the data says one state at a time, and a clash is reported", () => {
  assert.deepEqual(travelOf({}), { state: "world", conflict: null });
  assert.equal(travelOf({ target: {} }).state, "trip");
  assert.equal(travelOf({ gate: {}, target: {} }).state, "ring", "a stale trip under a ring doesn't count");
  assert.equal(travelOf({ ride: {} }).state, "ride");
  assert.equal(travelOf({ ride: { leaving: true } }).state, "travelling");
  assert.deepEqual(travelOf({ ride: { leaving: true }, travelling: {} }), { state: "travelling", conflict: null }, "leaving a ride is travelling, once");
  assert.equal(travelOf({ realm: {} }).state, "dream");
  assert.deepEqual(travelOf({ realm: {}, travelling: {} }).conflict, ["dream", "travelling"]);
  assert.deepEqual(travelOf({ gate: {}, ride: {} }).conflict, ["ring", "ride"]);
});

test("what each state allows", () => {
  const snap = (travel, extra = {}) => ({ travel, overlay: "none", view: "near", ready: true, ...extra });
  for (const s of TRAVEL) {
    assert.equal(can(snap(s), "tap"), s === "world" || s === "trip", `tap in ${s}`);
    assert.equal(can(snap(s), "reach"), s === "world" || s === "trip", `reach in ${s}`);
    assert.equal(can(snap(s), "capture"), s === "world", `capture in ${s}`);
    assert.equal(can(snap(s), "pigeon"), s === "world" || s === "trip", `pigeon in ${s}`);
    assert.equal(can(snap(s), "travel"), s !== "travelling", `travel in ${s}`);
  }
  assert.equal(can(snap("world", { overlay: "editor" }), "reach"), false, "in the editor nothing else asks for you");
  assert.equal(can(snap("world", { overlay: "sheet" }), "reach"), true);
  assert.equal(can(snap("world", { view: "far" }), "reach"), false);
  assert.equal(can(snap("world", { view: "far" }), "tap"), true);
  assert.equal(can(snap("world", { view: "globe" }), "tap"), false);
  assert.equal(can(snap("ring", { view: "globe" }), "globeTap"), true);
  assert.equal(can(snap("ride", { view: "globe" }), "globeTap"), false);
  assert.equal(can(snap("world", { ready: false }), "tap"), false, "not while the world regrows");
  assert.equal(can(snap("world", { ready: false }), "travel"), true);
  assert.equal(can(snap("world"), "no such thing"), false);
  for (const set of Object.values(ALLOW)) for (const s of set) assert.ok(TRAVEL.includes(s));
});

test("the camera's region", () => {
  assert.equal(viewOf(100, 2500, 400000), "near");
  assert.equal(viewOf(3000, 2500, 400000), "far");
  assert.equal(viewOf(500000, 2500, 400000), "globe");
});
