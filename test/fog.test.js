import test from "node:test";
import assert from "node:assert/strict";
import { SEEN_W, SEEN_H, SEEN_MAX, cellOf, cellMiddle, isCell, cleared, clampView, project, unproject, zoomAbout, panBy, PPD_MAX } from "../web/js/fog.js";
import { makeAtlasRecord, parseAtlasRecord, mergeSeen, atlasKey } from "../web/js/atlas-record.js";

test("cells: a quarter degree, numbered from the north-west, the dateline wrapped", () => {
  assert.equal(SEEN_W, 1440); assert.equal(SEEN_H, 720);
  assert.equal(cellOf(90, -180), 0);
  assert.equal(cellOf(-90, 179.99), SEEN_W * SEEN_H - 1);
  assert.equal(cellOf(10, 190), cellOf(10, -170));
  for (const [lat, lon] of [[51.5, -0.12], [-33.9, 151.2], [0.1, 0.1], [64.1, -21.9]]) {
    const m = cellMiddle(cellOf(lat, lon));
    assert.ok(Math.abs(m.lat - lat) <= 0.125 && Math.abs(m.lon - lon) <= 0.125, `${lat}, ${lon}`);
  }
  assert.ok(isCell(0) && isCell(1036799) && !isCell(1036800) && !isCell(-1) && !isCell(1.5) && !isCell("3"));
});

test("the clear: within about 45 km of a seen cell or a found place, across the dateline too", () => {
  const seen = new Set([cellOf(58.28, -4.8)]);
  assert.ok(cleared(58.28, -4.8, seen));
  assert.ok(cleared(58.28 + 0.3, -4.8, seen), "a cell away");
  assert.ok(!cleared(58.28 + 1, -4.8, seen), "four cells away");
  assert.ok(!cleared(-3.1, -60, seen));
  assert.ok(cleared(-3.1, -60, seen, [{ lat: -3.0, lon: -60.1 }]), "beside a place you found");
  const east = new Set([cellOf(0, 179.9)]);
  assert.ok(cleared(0, -179.9, east), "over the dateline");
});

test("the view: never farther than the whole Earth, never nearer than a cell 16 px, the poles not passed", () => {
  const w = 500, h = 380;
  const far = clampView({ lat: 70, lon: 10, ppd: 0.01 }, w, h);
  assert.equal(far.ppd, w / 360); assert.equal(far.lat, 0, "the whole Earth fits the height: centred");
  assert.equal(clampView({ lat: 0, lon: 0, ppd: 1e6 }, w, h).ppd, PPD_MAX);
  const near = clampView({ lat: 89.9, lon: 200, ppd: 40 }, w, h);
  assert.ok(near.lat + h / 2 / 40 <= 90 + 1e-9, "the top edge at the pole, no farther"); assert.equal(near.lon, -160);
});

test("project and unproject are inverse, the nearest copy east or west is drawn, and zoom keeps the point under the pointer", () => {
  const w = 500, h = 380, v = clampView({ lat: 50, lon: 175, ppd: 20 }, w, h);
  const p = project(52, -178, v, w, h); // just over the dateline: drawn east of the middle, not 7,000 px west
  assert.ok(p.x > w / 2 && p.x < w, `${p.x}`);
  const q = unproject(p.x, p.y, v, w, h);
  assert.ok(Math.abs(q.lat - 52) < 1e-9 && Math.abs(q.lon + 178) < 1e-9);
  const z = zoomAbout(v, 2, 400, 100, w, h), a = unproject(400, 100, v, w, h), b = unproject(400, 100, z, w, h);
  assert.equal(z.ppd, 40); assert.ok(Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9);
  const m = panBy(v, 40, -20, w, h);
  assert.ok(Math.abs(m.lon - (175 - 2)) < 1e-9 && Math.abs(m.lat - (50 - 1)) < 1e-9);
});

test("seen cells go in your atlas record, capped, and merge across devices", () => {
  const seen = new Set([5, 99, 123456, 1036799]);
  const v = makeAtlasRecord({}, 0, { nodes: {}, marks: {}, basins: {}, seen });
  assert.deepEqual(v.seen, [5, 99, 123456, 1036799]);
  assert.deepEqual([...parseAtlasRecord(v).seen], [5, 99, 123456, 1036799]);
  v.seen.push(-1, 1036800, 2.5, "7", null);
  assert.equal(parseAtlasRecord(v).seen.size, 4);
  assert.equal(parseAtlasRecord({ shrines: [] }).seen.size, 0, "an atlas from before the map");
  const big = new Set(Array.from({ length: SEEN_MAX + 50 }, (_, k) => k));
  assert.equal(makeAtlasRecord({}, 0, { seen: big }).seen.length, SEEN_MAX);
  const m = mergeSeen(seen, new Set([5, 7]));
  assert.deepEqual([...m].sort((a, b) => a - b), [5, 7, 99, 123456, 1036799]);
  assert.notEqual(atlasKey({}, { seen }), atlasKey({}, { seen: m }));
});
