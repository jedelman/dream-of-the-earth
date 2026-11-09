import test from "node:test";
import assert from "node:assert/strict";
import { makeAtlasRecord, parseAtlasRecord, mergeAtlas, atlasKey, ATLAS_NSID } from "../web/js/atlas-record.js";

const found = {
  shrine123: { lat: 51.5, lon: -0.12, spell: "taffy", at: 1794000000 },
  shrine77: { lat: -33.9, lon: 151.2, spell: "kaleido", at: 1793000000 },
};

test("the atlas record round-trips, earliest found first", () => {
  const v = makeAtlasRecord(found, Date.parse("2026-11-09T22:00:00Z"));
  assert.equal(v.$type, ATLAS_NSID);
  assert.deepEqual(v.shrines.map((s) => s.key), ["shrine77", "shrine123"]);
  assert.deepEqual(parseAtlasRecord(v).shrines, found);
});

test("bad entries from a record are dropped, not the atlas", () => {
  const v = makeAtlasRecord(found);
  v.shrines.push({ key: "shrine9", latE6: 91e6, lonE6: 0, spell: "giant", at: 1 }, { key: "<b>", latE6: 0, lonE6: 0, spell: "giant", at: 1 },
    { key: "shrine8", latE6: 0, lonE6: 0, spell: "sword", at: 1 }, { key: "shrine7", latE6: 0, lonE6: 0, spell: "toString", at: 1 }, null, "x");
  assert.deepEqual(Object.keys(parseAtlasRecord(v).shrines).sort(), ["shrine123", "shrine77"]);
  assert.equal(parseAtlasRecord({ $type: "app.bsky.feed.post" }), null);
  assert.deepEqual(parseAtlasRecord({ shrines: "lots" }).shrines, {});
});

test("devices merge: a place found on any is found, at its first finding", () => {
  const other = { shrine123: { ...found.shrine123, at: 1790000000 }, shrine5: { lat: 0, lon: 0, spell: "giant", at: 1795000000 } };
  const m = mergeAtlas(found, other);
  assert.deepEqual(Object.keys(m).sort(), ["shrine123", "shrine5", "shrine77"]);
  assert.equal(m.shrine123.at, 1790000000);
  assert.equal(atlasKey(m), "shrine123,shrine5,shrine77");
  assert.notEqual(atlasKey(found), atlasKey(m));
});
