import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { waterTileKey, waterTilesNear, unpackLine, parseWaterTile, riverWidth, densify, ribbon, lakeLevel, signedArea, inRing, lakePolygons, subdivide, distToLine, wadeLine, TILE_DEG } from "../web/js/inland.js";

const DIR = new URL("../web/data/water/", import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL("index.json", DIR), "utf8"));
const listed = new Set(index.tiles);
const tile = (key) => parseWaterTile(JSON.parse(fs.readFileSync(new URL(`${key}.json`, DIR), "utf8")));

test("tiles: 10° from 180°W and the North Pole, the dateline and poles clamped", () => {
  assert.equal(TILE_DEG, index.tile);
  assert.equal(waterTileKey(0, 0), "18-9");
  assert.equal(waterTileKey(89.99, -180), "0-0");
  assert.equal(waterTileKey(-90, 179.99), "35-17");
  assert.equal(waterTileKey(10, 190), waterTileKey(10, -170));
  // A box across a tile corner touches four; only listed ones come back.
  assert.deepEqual(waterTilesNear(50, 10, 50000).sort(), ["18-3", "18-4", "19-3", "19-4"]);
  assert.deepEqual(waterTilesNear(50, 10, 50000, new Set(["19-3"])), ["19-3"]);
  assert.equal(waterTilesNear(45.3, 4.1, 1000).length, 1);
});

test("unpacking: deltas in 1e-4 degrees, malformed lines refused", () => {
  assert.deepEqual(unpackLine([10000, 20000, 5000, -10000]), [[1, 2], [1.5, 1]]);
  assert.deepEqual(unpackLine([3, 10000, 20000, 1, 1], 1), [[1, 2], [1.0001, 2.0001]]);
  assert.equal(unpackLine([1, 2, 3]), null);
  assert.equal(unpackLine([1, 2]), null);
  assert.equal(unpackLine([1, 2, "3", 4]), null);
  assert.equal(unpackLine("nope"), null);
  const t = parseWaterTile({ names: ["Loire", 7], rivers: [[3, 0, 0, 0, 10, 10], [3, 1, 0], "x", [2, -1, 1, 1, 2, 2]], lakes: [[5, "Lac", 9, [0, 0, 10, 0, 0, 10]], [6, 3, 0, [0, 0, 1, 1, 1, 1]]] });
  assert.deepEqual(t.rivers.map((r) => [r.rank, r.name]), [[3, "Loire"], [2, ""]]);
  assert.deepEqual(t.lakes.map((l) => [l.id, l.name, l.kind, l.rings.length]), [[5, "Lac", 0, 1]]);
  assert.deepEqual(parseWaterTile(null), { rivers: [], lakes: [] });
});

test("the shipped tiles: every one listed parses, and the rivers and lakes everyone knows are there", () => {
  for (const key of index.tiles) {
    const raw = JSON.parse(fs.readFileSync(new URL(`${key}.json`, DIR), "utf8"));
    const t = parseWaterTile(raw);
    assert.equal(t.rivers.length, raw.rivers.length, key);
    assert.equal(t.lakes.length, raw.lakes.length, key);
  }
  const has = (lat, lon, kind, name) => {
    const t = tile(waterTileKey(lat, lon));
    return t[kind].some((x) => x.name === name);
  };
  assert.ok(has(47.5, 1, "rivers", "Loire"));
  assert.ok(has(46, 4.8, "rivers", "Saône"), "Natural Earth's 'Sane', put right");
  assert.ok(has(50, 7.6, "rivers", "Rhine"));
  assert.ok(has(-3.3, -60, "rivers", "Amazonas") || has(-3.3, -60, "rivers", "Amazon"));
  assert.ok(has(-15.8, -69.4, "lakes", "Lago Titicaca"));
  assert.ok(has(47.6, -87.5, "lakes", "Lake Superior"));
  // Lake Titicaca's point is inside its own outline.
  const titi = tile(waterTileKey(-15.8, -69.4)).lakes.find((l) => l.name === "Lago Titicaca");
  const p = lakePolygons(titi.rings);
  assert.ok(p.some((q) => inRing(-69.4, -15.8, q.outer)));
});

test("river widths: a kilometre for the Amazon's rank, never under 30 m", () => {
  assert.equal(riverWidth(0), 1600);
  assert.equal(riverWidth(1), 992);
  assert.ok(riverWidth(4) < riverWidth(3));
  assert.equal(riverWidth(12), 30);
});

test("a ribbon: two vertices a point, on the ground, cut where the sea takes the river", () => {
  const line = densify([[0, 0], [1000, 0]], 250);
  assert.equal(line.length, 5);
  const flat = ribbon(line, 100, () => 50);
  assert.equal(flat.pos.length, 5 * 2 * 3);
  assert.equal(flat.idx.length, 4 * 6);
  assert.deepEqual(flat.pos.slice(0, 6), [0, 50, 50, 0, 50, -50]);
  assert.deepEqual([flat.uv[8], flat.uv[9]], [500, 0]);
  // The ground falls into the sea past x = 600: the last two points go, and the triangles that reached them.
  const coast = ribbon(line, 100, (x) => (x > 600 ? -5 : 20));
  assert.equal(coast.pos.length, 3 * 2 * 3);
  assert.equal(coast.idx.length, 2 * 6);
  // A bank on a slope is laid on the slope, never below the sea.
  const slope = ribbon([[0, 0], [100, 0]], 40, (x, z) => 10 + z);
  assert.equal(slope.pos[1], 30); assert.equal(slope.pos[4], 1);
});

test("a lake's level: low round the shore, but not the lowest gully", () => {
  assert.equal(lakeLevel([]), null);
  assert.equal(lakeLevel([NaN, 30]), 30);
  const shore = [3809, 3810, 3812, 3815, 3820, 3830, 3850, 3900, 3700, 3811, 3813, 3816, 3825, 3840];
  const l = lakeLevel(shore);
  assert.ok(l > 3700 && l <= 3812, String(l));
});

test("lake polygons: clockwise outers, anticlockwise holes inside them", () => {
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0]]; // clockwise with y up
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6]];
  assert.ok(signedArea(outer) < 0 && signedArea(hole) > 0);
  const p = lakePolygons([outer, hole, [[20, 0], [20, 5], [25, 5], [25, 0]]]);
  assert.equal(p.length, 2);
  assert.equal(p[0].holes.length, 1);
  assert.ok(inRing(2, 2, outer) && !inRing(11, 2, outer) && inRing(5, 5, hole));
});

test("subdividing: no edge over the limit, nothing wholly outside the box, area kept", () => {
  const big = [[[0, 0], [40000, 0], [0, 40000]]];
  const box = { minX: -1e9, maxX: 1e9, minZ: -1e9, maxZ: 1e9 };
  const parts = subdivide(big, 6000, box);
  const edge = (t) => Math.max(...[0, 1, 2].map((i) => Math.hypot(t[i][0] - t[(i + 1) % 3][0], t[i][1] - t[(i + 1) % 3][1])));
  assert.ok(parts.every((t) => edge(t) <= 6000));
  const area = (t) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
  assert.ok(Math.abs(parts.reduce((s, t) => s + area(t), 0) - 8e8) < 1);
  const clipped = subdivide(big, 6000, { minX: 0, maxX: 5000, minZ: 0, maxZ: 5000 });
  assert.ok(clipped.length > 0 && clipped.length < parts.length / 10);
});

test("wading: the distance to a river, and what you're told", () => {
  assert.equal(distToLine(50, 30, [[0, 0], [100, 0]]), 30);
  assert.equal(distToLine(-40, 30, [[0, 0], [100, 0]]), 50);
  assert.equal(wadeLine({ kind: "river", name: "Loire" }), "You wade into the Loire. It tugs at your feet on its way downhill.");
  assert.match(wadeLine({ kind: "river", name: "" }), /^You wade into a river\./);
  assert.match(wadeLine({ kind: "lake", name: "Lago Titicaca" }), /^You wade into Lago Titicaca\. Its water is still/);
  assert.match(wadeLine({ kind: "lake", name: "", reservoir: true }), /^You wade into a reservoir\. .*dam/);
  assert.equal(wadeLine(null), "");
});
