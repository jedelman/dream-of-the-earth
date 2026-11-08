import test from "node:test";
import assert from "node:assert/strict";
import { makeIntent, parseIntent, whereAt, driftOf, allowed, STALE_S, MAX_POINTS, INTENT_NSID } from "../web/js/intents.js";
import { metresBetween, WORLD_URL } from "../web/js/artifacts.js";
import { lineAt, rideSpeed } from "../web/js/ride.js";

const creature = { seed: 7, stats: { fly: 1, swim: 5, run: 4, gleam: 2 } };
const now = new Date("2026-11-08T20:00:00Z"), t0 = now.getTime() / 1000;
const ints = (v) => (typeof v === "number" ? assert.ok(Number.isInteger(v), `float ${v}`) : v && typeof v === "object" && Object.values(v).forEach(ints));

test("an intent is small, integers only, and points at the world", () => {
  const v = makeIntent({ kind: "goto", p: { lat: -3.1, lon: -60, alt: 60 }, creature, goto: { pts: [{ lat: -3.09, lon: -60 }], speed: 58, fly: true, cruise: 120 }, now });
  assert.equal(v.$type, INTENT_NSID);
  assert.equal(v.world, WORLD_URL);
  ints(v);
  assert.ok(JSON.stringify(v).length < 400);
  const it = parseIntent(JSON.parse(JSON.stringify(v)), t0);
  assert.equal(it.kind, "goto");
  assert.equal(it.goto.speed, 58);
  assert.deepEqual(it.creature.stats, creature.stats);
});

test("untrusted intents are checked, and stale ones are gone", () => {
  const good = makeIntent({ kind: "rest", p: { lat: 1, lon: 2, alt: 10 }, creature, now });
  const bad = (patch, why, at = t0) => assert.equal(parseIntent({ ...good, ...patch }, at), null, why);
  bad({ kind: "teleport" }, "unknown kind");
  bad({ latE6: 1.5 }, "a float");
  bad({ creature: { seed: 7, stats: [6, 6, 6, 6] } }, "stats over the budget");
  bad({ creature: { seed: -1, stats: [1, 5, 4, 2] } }, "a bad seed");
  bad({ at: "2026-11-08T21:00:00Z" }, "from the future");
  bad({}, "stale: not renewed for over ten minutes", t0 + STALE_S + 1);
  bad({ kind: "goto", goto: { pts: Array.from({ length: MAX_POINTS + 1 }, () => [0, 0]), speedCm: 100 } }, "too many points");
  bad({ kind: "ride", ride: { line: 999999, tE6: 0, dir: 1 } }, "no such highway");
  assert.ok(parseIntent(good, t0 + STALE_S - 1), "renewed in time, still here");
});

test("a trip is replayed along its route at its speed, then stops", () => {
  const it = parseIntent(makeIntent({ kind: "goto", p: { lat: 0, lon: 0, alt: 50 }, creature, goto: { pts: [{ lat: 0, lon: 0.01 }, { lat: 0.01, lon: 0.01 }], speed: 10, fly: false }, now }), t0);
  const leg = metresBetween(0, 0, 0, 0.01); // ~1112 m
  const mid = whereAt(it, t0 + leg / 10 / 2);
  assert.ok(Math.abs(mid.lon - 0.005) < 1e-4 && Math.abs(mid.lat) < 1e-6, "halfway along the first leg");
  assert.ok(mid.moving && mid.alt === null && mid.mode === "ground", "a walker, on the ground");
  assert.ok(Math.abs(mid.bearing - Math.PI / 2) < 0.01, "heading east");
  const end = whereAt(it, t0 + 10000);
  assert.ok(Math.abs(end.lat - 0.01) < 1e-9 && !end.moving, "there, and stopped");
});

test("steering is dead-reckoned, a ride follows its highway, rest stays put", () => {
  const s = parseIntent(makeIntent({ kind: "steer", p: { lat: 0, lon: 0, alt: 100 }, creature, steer: { heading: 0, speed: 20, climb: 1 }, now }), t0);
  const w = whereAt(s, t0 + 10);
  assert.ok(Math.abs(metresBetween(0, 0, w.lat, w.lon) - 200) < 1, "200 m north after 10 s");
  assert.ok(Math.abs(w.alt - 110) < 1e-6);
  assert.ok(driftOf(s, t0 + 10, w.lat, w.lon) < 0.01);
  const line = lineAt(3);
  const r = parseIntent(makeIntent({ kind: "ride", p: { lat: 0, lon: 0, alt: 900 }, creature, ride: { line: 3, t: 0.2, dir: 1 }, now }), t0);
  const dt = 2, moved = whereAt(r, t0), later = whereAt(r, t0 + dt);
  const expect = rideSpeed(line.cls.rank) * dt;
  assert.ok(Math.abs(metresBetween(moved.lat, moved.lon, later.lat, later.lon) - expect) / expect < 0.02, "at the highway's speed");
  assert.equal(whereAt(parseIntent(makeIntent({ kind: "rest", p: { lat: 5, lon: 6, alt: 7 }, creature, now }), t0), t0 + 500).lat, 5);
});

test("whose things we show: mutuals, no blocks, no takedowns, not muted", () => {
  const mutual = { following: "at://a", followedBy: "at://b" }, profile = { labels: [{ val: "bot" }] };
  assert.equal(allowed(mutual, profile), true, "a mutual (self-labelled bot is fine)");
  assert.equal(allowed({ following: "at://a" }, profile), false, "only one way");
  assert.equal(allowed({ ...mutual, blocking: "at://x" }, profile), false, "you block them");
  assert.equal(allowed({ ...mutual, blockedBy: "at://x" }, profile), false, "they block you");
  assert.equal(allowed({ ...mutual, blockedByList: "at://x" }, profile), false, "a list block");
  assert.equal(allowed(mutual, null), false, "deactivated or taken down: no profile");
  assert.equal(allowed(mutual, { labels: [{ val: "!hide" }] }), false, "hidden by moderation");
  assert.equal(allowed(mutual, profile, true), false, "muted");
});

import { SAY_MAX, MOMENT_S, fresh } from "../web/js/intents.js";
test("speech bubbles and squeaks ride on the intent, briefly, cleaned and capped", () => {
  const v = makeIntent({ kind: "rest", p: { lat: 1, lon: 2, alt: 3 }, creature, say: { text: "hello‮ there\n friend", at: t0 }, act: { kind: "squeak", at: t0 }, now });
  const it = parseIntent(v, t0);
  assert.equal(it.say.text, "hello there friend", "no direction overrides or newlines");
  assert.equal(it.act.kind, "squeak");
  assert.ok(fresh(it.say, t0 + 1) && !fresh(it.say, t0 + MOMENT_S + 1), "shows for a few seconds");
  const long = parseIntent({ ...v, say: { text: "x".repeat(500), at: v.say.at } }, t0);
  assert.equal(long.say.text.length, SAY_MAX, "cut to 80 characters");
  const bad = parseIntent({ ...v, say: { text: "x".repeat(5000), at: v.say.at }, act: { kind: "explode", at: v.act.at } }, t0);
  assert.ok(bad && !bad.say && !bad.act, "a bad moment is dropped; the creature still shows");
  assert.equal(parseIntent({ ...v, say: { text: "hi", at: "2026-11-08T21:00:00Z" } }, t0).say, undefined, "not from the future");
});
