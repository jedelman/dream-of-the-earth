import test from "node:test";
import assert from "node:assert/strict";
import { createKept, newestChosen, isScopeError, RETRY_S } from "../web/js/kept.js";
import { reconcile } from "../web/js/creature-record.js";
import { reconcileInventory, firstInventory } from "../web/js/inventory.js";

/** A record with a fake clock and a fake repo that fails when told to. */
function rig(opts = {}) {
  const r = { t: 1000, value: "a", changedAt: -Infinity, repo: opts.repo ?? null, writes: [], reads: 0, failNext: 0, failWith: "offline", said: [], hold: null };
  const settle = () => (r.hold ? r.hold.promise : Promise.resolve());
  const fail = () => { if (r.failNext > 0) { r.failNext--; throw new Error(r.failWith); } };
  r.k = createKept({
    name: "test", now: () => r.t, key: () => r.value, changedAt: () => r.changedAt,
    settleS: opts.settleS ?? 2, gapS: opts.gapS ?? 0,
    push: async () => { const v = r.value; await settle(); fail(); r.repo = v; r.writes.push(v); },
    pull: opts.noPull ? null : async () => { r.reads++; await settle(); fail(); if (r.repo === null) { r.repo = r.value; r.writes.push(r.value); } else r.value = r.repo; },
    say: (ev) => r.said.push(ev),
  });
  r.change = (v) => { r.value = v; r.changedAt = r.t; };
  r.gate = () => { let open; r.hold = { promise: new Promise((res) => { open = res; }) }; return () => { r.hold = null; open(); }; };
  return r;
}

test("kept: off until a sign-in covers it; unsynced until a pull works; never written before", async () => {
  const r = rig({ repo: "theirs" });
  assert.equal(r.k.phase(), "off");
  assert.equal(r.k.tick(), null);
  r.k.reset(true);
  assert.equal(r.k.phase(), "unsynced");
  r.change("mine");
  r.t += 10;
  await r.k.tick(); // pulls, doesn't push
  assert.equal(r.reads, 1);
  assert.deepEqual(r.writes, [], "a pull adopts; it never pushed over the repo unseen");
  assert.equal(r.value, "theirs");
  assert.equal(r.k.phase(), "clean");
});

test("kept: a failed first read is retried, and nothing is written until it works", async () => {
  const r = rig({ repo: "theirs" });
  r.k.reset(true);
  r.failNext = 1;
  r.change("this device's");
  await r.k.tick();
  assert.equal(r.k.phase(), "failed");
  assert.deepEqual(r.said, ["failed"]);
  r.t += 100;
  assert.deepEqual(r.writes, []);
  await r.k.tick();
  assert.equal(r.value, "theirs", "the repo's copy, read on the retry, not overwritten");
  assert.deepEqual(r.writes, []);
  assert.deepEqual(r.said, ["failed", "recovered"]);
});

test("kept: a burst of changes settles into one write", async () => {
  const r = rig({ settleS: 2 });
  r.k.reset(true);
  await r.k.tick(); // empty repo: this device's goes there
  assert.deepEqual(r.writes, ["a"]);
  for (const v of ["b", "c", "d"]) { r.change(v); r.t += 1; assert.equal(r.k.phase(), "settling"); assert.equal(r.k.tick(), null); }
  r.t += 2;
  assert.equal(r.k.phase(), "dirty");
  await r.k.tick();
  assert.deepEqual(r.writes, ["a", "d"]);
  assert.equal(r.k.phase(), "saved");
  assert.equal(r.k.tick(), null, "nothing new, nothing written");
});

test("kept: gapS spaces writes out however often things change", async () => {
  const r = rig({ settleS: 0, gapS: 30 });
  r.k.reset(true);
  await r.k.tick();
  r.change("b"); await r.k.tick();
  assert.deepEqual(r.writes, ["a", "b"]);
  r.change("c"); r.t += 10;
  assert.equal(r.k.phase(), "settling");
  r.t += 20;
  await r.k.tick();
  assert.deepEqual(r.writes, ["a", "b", "c"]);
});

test("kept: a failed write backs off, is said once a streak, and isn't lost", async () => {
  const r = rig({ settleS: 0 });
  r.k.reset(true);
  await r.k.tick();
  r.change("b");
  r.failNext = 4;
  const at = [];
  for (let s = 0; s < 200 && r.writes.length < 2; s++) { // a tick a second for a few minutes
    const p = r.k.tick();
    if (p) { at.push(r.t); await p; }
    r.t += 1;
  }
  assert.deepEqual(r.writes, ["a", "b"], "written in the end");
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.deepEqual(gaps, RETRY_S.slice(0, 4), "2 s, 5 s, 15 s, 30 s");
  assert.deepEqual(r.said, ["failed", "recovered"], "said once, not every try");
  // A new change while failing waits for the backoff, then the newest goes.
  r.failNext = 1; r.change("c"); await r.k.tick();
  r.change("d"); assert.equal(r.k.tick(), null); assert.equal(r.k.phase(), "failed");
  r.t += RETRY_S[0]; await r.k.tick();
  assert.deepEqual(r.writes, ["a", "b", "d"]);
  // The backoff stops growing at its last step.
  const s = rig({ settleS: 0 }); s.k.reset(true); await s.k.tick();
  s.change("z"); s.failNext = 99;
  for (let i = 0; i < 12; i++) { s.t = Math.max(s.t, s.k.retryAt); await s.k.tick(); }
  assert.equal(s.k.fails, 12);
  assert.equal(s.k.retryAt - s.t, RETRY_S[RETRY_S.length - 1], "five minutes, not more");
  s.t += 299;
  assert.equal(s.k.tick(), null, "still waiting");
});

test("kept: a scope refusal switches the record off until the next sign-in", async () => {
  const r = rig({ settleS: 0 });
  r.k.reset(true);
  r.failNext = 1; r.failWith = "403: insufficient scope";
  await r.k.tick();
  assert.equal(r.k.phase(), "off");
  assert.deepEqual(r.said, ["off"]);
  r.t += 1000;
  assert.equal(r.k.tick(), null, "not hammered");
  r.k.reset(true);
  await r.k.tick();
  assert.equal(r.k.phase(), "clean");
  assert.equal(isScopeError(new Error("Forbidden")), true);
  assert.equal(isScopeError(new Error("fetch failed")), false);
});

test("kept: one thing in flight at a time; a sign-out mid-write lands nowhere", async () => {
  const r = rig({ settleS: 0 });
  r.k.reset(true);
  await r.k.tick();
  r.change("b");
  const open = r.gate();
  const p = r.k.tick();
  assert.equal(r.k.phase(), "writing");
  assert.equal(r.k.tick(), null);
  assert.equal(r.k.pullNow(), null, "a pull waits too");
  r.k.reset(true); // signed in as someone else meanwhile
  open();
  assert.deepEqual(await p, { stale: true });
  assert.equal(r.k.synced, null, "the new sign-in still pulls first");
  assert.equal(r.k.phase(), "unsynced");
});

test("kept: clear waits for a write in flight, then deletes (no write lands after it)", async () => {
  const order = [];
  let release;
  const k = createKept({
    name: "intent", now: () => 0, key: () => "", pull: null, due: () => true,
    push: () => new Promise((res) => { release = () => { order.push("put"); res(); }; }),
  });
  k.reset(true);
  assert.equal(k.phase(), "dirty");
  const p = k.tick();
  const c = k.clear(async () => { order.push("delete"); });
  assert.equal(k.tick(), null, "nothing new while clearing");
  release();
  await p; await c;
  assert.deepEqual(order, ["put", "delete"]);
  assert.equal(k.busy, null);
  assert.equal(k.phase(), "dirty", "ready to write again when asked");
});

test("newestChosen: the reconcile rules, shared by the creature and the pouch", () => {
  const same = (a, b) => a.v === b.v, chosen = (x) => x.chosen;
  const L = (v, at, c = true) => ({ v, at, chosen: c });
  assert.equal(newestChosen(null, null, same, chosen), "same");
  assert.equal(newestChosen(L(1, 5), null, same, chosen), "local", "nothing in the repo: this device's goes there");
  assert.equal(newestChosen(null, L(1, 5), same, chosen), "remote");
  assert.equal(newestChosen(L(1, 9), L(1, 5), same, chosen), "same");
  assert.equal(newestChosen(L(1, 9, false), L(2, 5), same, chosen), "remote", "one only started here always yields");
  assert.equal(newestChosen(L(1, 9), L(2, 5), same, chosen), "local", "newest chosen wins");
  assert.equal(newestChosen(L(1, 5), L(2, 9), same, chosen), "remote");
  assert.equal(newestChosen(L(1, 5), L(2, 5), same, chosen), "remote", "a tie goes to the repo");
  // The pouch: started on arrival here (changed false) yields; changed here and newer wins.
  const started = { ...firstInventory(1e9), at: 2e12, changed: false }, theirs = { ...firstInventory(1e9), items: { moonseed: 3 }, at: 1e12 };
  assert.equal(reconcileInventory(started, theirs), "remote");
  assert.equal(reconcileInventory({ ...started, changed: true }, theirs), "local");
  // The creature: one you only met yields; one you chose, newer, wins.
  const met = { seed: 1, stats: { fly: 3, swim: 3, run: 3, gleam: 3 }, genes: null, at: 9e12, chosen: false }, kept = { ...met, seed: 2, at: 1e12 };
  assert.equal(reconcile(met, kept), "remote");
  assert.equal(reconcile({ ...met, chosen: true }, kept), "local");
});
