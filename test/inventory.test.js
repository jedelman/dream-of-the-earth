import test from "node:test";
import assert from "node:assert/strict";
import { firstInventory, moonseedFor, spend, refund, countOf, makeInventoryRecord, parseInventoryRecord, reconcileInventory, nextSeedAt, ITEMS, INVENTORY_NSID } from "../web/js/inventory.js";
import { nearestNewMoon, lunationOf, SYNODIC_S } from "../web/js/moon.js";

const newMoon = nearestNewMoon(Date.parse("2026-11-09T12:00:00Z") / 1000);
const fullMoon = newMoon + SYNODIC_S / 2;

test("a new creature starts with one moonseed; born at a new moon, that's the moon's seed", () => {
  const a = firstInventory(fullMoon);
  assert.equal(countOf(a, "moonseed"), 1);
  assert.equal(moonseedFor(a, newMoon + SYNODIC_S).fell, true, "the next new moon brings another");
  const b = firstInventory(newMoon);
  assert.equal(moonseedFor(b, newMoon + 3600).fell, false, "not two the same night");
});

test("a moonseed falls once per new moon, only in its window, and the pouch holds thirteen", () => {
  let inv = { items: {}, lunation: -1 };
  assert.equal(moonseedFor(inv, fullMoon).fell, false, "not at the full moon");
  ({ inv } = moonseedFor(inv, newMoon - 80000));
  assert.equal(countOf(inv, "moonseed"), 1);
  assert.equal(inv.lunation, lunationOf(newMoon));
  assert.equal(moonseedFor(inv, newMoon + 80000).fell, false, "the same moon, later that night");
  for (let k = 1; k < 40; k++) ({ inv } = moonseedFor(inv, newMoon + k * SYNODIC_S));
  assert.equal(countOf(inv, "moonseed"), ITEMS.moonseed.max);
});

test("spend and refund", () => {
  const inv = { items: { moonseed: 1 }, lunation: 3 };
  const after = spend(inv, "moonseed");
  assert.equal(countOf(after, "moonseed"), 0);
  assert.equal(spend(after, "moonseed"), null, "none left to eat");
  assert.equal(countOf(refund(after, "moonseed"), "moonseed"), 1);
});

test("the record: integers, known kinds only, round-trips", () => {
  const v = makeInventoryRecord({ items: { moonseed: 2 }, lunation: 333 }, Date.parse("2026-11-09T22:00:00Z"));
  assert.equal(v.$type, INVENTORY_NSID);
  assert.deepEqual(parseInventoryRecord(v), { items: { moonseed: 2 }, lunation: 333, at: Date.parse("2026-11-09T22:00:00Z") });
  assert.deepEqual(parseInventoryRecord({ ...v, items: { moonseed: 99, sword: 1, x: "y" } }).items, { moonseed: 13 });
  assert.deepEqual(parseInventoryRecord({ ...v, items: { moonseed: -2 } }).items, {});
  assert.equal(parseInventoryRecord({ ...v, $type: "app.bsky.feed.post" }), null);
});

test("signing in: a pouch only started here yields; otherwise the last changed wins", () => {
  const remote = { items: { moonseed: 3 }, lunation: 333, at: 1000 };
  assert.equal(reconcileInventory({ items: { moonseed: 1 }, lunation: -1, at: 5000, changed: false }, remote), "remote");
  assert.equal(reconcileInventory({ items: { moonseed: 2 }, lunation: 333, at: 5000, changed: true }, remote), "local");
  assert.equal(reconcileInventory({ items: { moonseed: 2 }, lunation: 333, at: 500, changed: true }, remote), "remote");
  assert.equal(reconcileInventory({ items: { moonseed: 3 }, lunation: 333, at: 1, changed: true }, remote), "same");
  assert.equal(reconcileInventory({ items: { moonseed: 1 }, lunation: -1, at: 0, changed: false }, null), "local");
});

test("when the next moonseed falls: now if one is due, else the next window that hasn't given you one", () => {
  const fresh = { items: {}, lunation: -1 };
  assert.equal(nextSeedAt(fresh, newMoon), newMoon, "due now");
  const born = firstInventory(newMoon - 3600); // born tonight: tonight's seed is the first one
  assert.ok(Math.abs(nextSeedAt(born, newMoon - 3600) - (newMoon + SYNODIC_S - 86400)) < 1, "next month, not tonight");
  assert.ok(Math.abs(nextSeedAt({ items: {}, lunation: lunationOf(newMoon) }, fullMoon) - (newMoon + SYNODIC_S - 86400)) < 1);
});
