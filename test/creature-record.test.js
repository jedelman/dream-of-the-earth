import test from "node:test";
import assert from "node:assert/strict";
import { makeCreatureRecord, parseCreatureRecord, reconcile, CREATURE_NSID } from "../web/js/creature-record.js";

const nyo = { seed: 7, stats: { climb: 1, swim: 5, run: 4, gleam: 2, perception: 0 }, genes: { count: { wings: 3 }, hue: 40 } };

test("a creature record round-trips", () => {
  const v = makeCreatureRecord(nyo, Date.parse("2026-11-09T02:00:00Z"));
  assert.equal(v.$type, CREATURE_NSID);
  assert.deepEqual(v.stats, [1, 5, 4, 2, 0]);
  assert.deepEqual(parseCreatureRecord({ ...v, stats: [1, 5, 4, 2] }).stats, nyo.stats, "a record from before perception");
  assert.deepEqual(parseCreatureRecord(v), { ...nyo, at: Date.parse("2026-11-09T02:00:00Z") });
  assert.equal(makeCreatureRecord({ ...nyo, genes: null }).genes, undefined, "no genes, no field");
});

test("bad records are refused; bad genes only lose the genes", () => {
  const v = makeCreatureRecord(nyo);
  assert.equal(parseCreatureRecord(null), null);
  assert.equal(parseCreatureRecord({ ...v, $type: "app.bsky.feed.post" }), null);
  assert.equal(parseCreatureRecord({ ...v, seed: -1 }), null);
  assert.equal(parseCreatureRecord({ ...v, stats: [6, 6, 6, 6] }), null, "over the budget");
  assert.equal(parseCreatureRecord({ ...v, stats: [1, 2, 3] }), null);
  const odd = parseCreatureRecord({ ...v, genes: { count: { wings: 99 } }, updatedAt: "whenever" });
  assert.equal(odd.genes, null);
  assert.equal(odd.at, 0);
});

test("signing in: the newest creature you chose wins; one you only met always yields", () => {
  const remote = { ...nyo, at: 1000 };
  const other = { seed: 9, stats: nyo.stats, genes: null };
  assert.equal(reconcile({ ...other, at: 0, chosen: false }, remote), "remote", "a new device's random creature yields");
  assert.equal(reconcile({ ...other, at: 999999, chosen: false }, remote), "remote", "however recently you met it");
  assert.equal(reconcile({ ...other, at: 2000, chosen: true }, remote), "local", "changed here since");
  assert.equal(reconcile({ ...other, at: 500, chosen: true }, remote), "remote", "changed elsewhere since");
  assert.equal(reconcile({ ...nyo, at: 5, chosen: true }, remote), "same");
  assert.equal(reconcile({ ...other, at: 0, chosen: false }, null), "local", "nothing in your repo yet: this one becomes yours");
  assert.equal(reconcile(null, remote), "remote");
});
