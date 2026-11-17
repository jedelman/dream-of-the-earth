import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { basinOutline, basinBoxes, basinTint, gridLatLon, GRID_W, GRID_H } from "../web/js/basinmap.js";
import { basinId } from "../web/js/basins.js";
import { readPng } from "./png.js";

// A small world: rows of letters, each letter a basin (. the sea).
const grid = (rows) => { const ids = { ".": 0, A: 1, B: 2, C: 3 }; return (x, y) => ids[rows[y][((x % rows[0].length) + rows[0].length) % rows[0].length]]; };
const total = (segs) => segs.reduce((s, [x0, y0, x1, y1]) => s + Math.abs(x1 - x0) + Math.abs(y1 - y0), 0);

test("a known basin is outlined all round, and nothing else is", () => {
  const at = grid(["......", ".AA...", ".AA.B.", "......"]);
  const { segs } = basinOutline(at, new Set([1]), 0, null, 6, 4);
  assert.equal(total(segs), 8); // a 2 × 2 square
  assert.deepEqual(segs.filter((s) => s[1] === s[3]).map((s) => s.slice(0, 4)).sort(), [[1, 1, 3, 1], [1, 3, 3, 3]]); // runs merged
  assert.equal(basinOutline(at, new Set(), 0, null, 6, 4).segs.length, 0);
});

test("two known neighbours share one divide; the one you're in is marked", () => {
  const at = grid(["....", "AABB", "AABB", "...."]);
  const { segs } = basinOutline(at, new Set([1, 2]), 2, null, 4, 4);
  const divide = segs.filter((s) => s[0] === 2 && s[2] === 2);
  assert.equal(divide.length, 1);
  assert.equal(divide[0][4], 1);
  const top = segs.filter((s) => s[1] === 1 && s[3] === 1);
  assert.deepEqual(top.map((s) => [s[0], s[2], s[4]]).sort(), [[0, 2, 0], [2, 4, 1]]); // a run splits where "here" begins
});

test("a basin across the dateline has no edge there, and none at the poles", () => {
  const at = grid(["A..A", "A..A"]);
  const { segs } = basinOutline(at, new Set([1]), 0, null, 4, 2);
  assert.ok(!segs.some((s) => s[0] === 0 && s[2] === 0)); // x = 0 meets x = 3: both A
  assert.equal(total(segs), 4); // the two inner sides only
});

test("boxes: only as much as each basin covers, so only that much is scanned", () => {
  const t = (rows) => Uint16Array.from(rows.join(""), (c) => ({ ".": 0, A: 1, B: 2 })[c]);
  const tiles = [[t(["..", ".A"]), t(["A.", ".."])], [null, t(["..", "B."])]];
  const boxes = basinBoxes(tiles, new Set([1, 2]), 2);
  assert.deepEqual(boxes.get(1), { x0: 1, y0: 0, x1: 2, y1: 1 });
  assert.deepEqual(boxes.get(2), { x0: 2, y0: 3, x1: 2, y1: 3 });
  const at = (x, y) => { const tt = tiles[(y / 2) | 0][((x % 4) / 2) | 0]; return tt ? tt[(y % 2) * 2 + (x % 2)] : 0; };
  assert.deepEqual(basinOutline(at, new Set([1]), 0, boxes.get(1), 4, 4).segs.sort(), basinOutline(at, new Set([1]), 0, null, 4, 4).segs.sort());
});

test("the tint: known pixels only, the one you're in stronger, null when there's none", () => {
  const at = grid(["AB", "C."]);
  const px = basinTint(at, new Set([1, 2]), 2, 0, 0, 2, 2);
  assert.deepEqual([px[3], px[7], px[11], px[15]], [60, 110, 0, 0]);
  assert.equal(basinTint(at, new Set([9]), 0, 0, 0, 2, 2), null);
  assert.deepEqual(gridLatLon(0, 0), { lat: 90, lon: -180 });
  assert.deepEqual(gridLatLon(GRID_W / 2, GRID_H / 2), { lat: 0, lon: 0 });
});

test("the real Loire: its outline closes round Tours, and only round the Loire", () => {
  const DIR = new URL("../web/data/basins/", import.meta.url);
  const list = JSON.parse(fs.readFileSync(new URL("basins.json", DIR), "utf8"));
  const loire = list.basins.find((b) => b.key === "loire-river");
  assert.ok(loire);
  const tiles = new Map();
  const idAt = (gx, gy) => {
    const x = ((gx % 3600) + 3600) % 3600, col = (x / 300) | 0, row = (gy / 300) | 0, key = `${col}-${row}`;
    if (!tiles.has(key)) {
      const f = new URL(`${key}.png`, DIR);
      if (!fs.existsSync(f)) tiles.set(key, null);
      else { const { px } = readPng(fs.readFileSync(f)); tiles.set(key, Uint16Array.from({ length: 90000 }, (_, k) => basinId(px[k * 3], px[k * 3 + 1]))); }
    }
    const t = tiles.get(key);
    return t ? t[(gy - row * 300) * 300 + (x - col * 300)] : 0;
  };
  const whole = basinOutline(idAt, new Set([loire.id]), loire.id).segs; // also loads the tiles
  const rows = Array.from({ length: 6 }, (_, r) => Array.from({ length: 12 }, (_, c) => tiles.get(`${c}-${r}`)));
  const t0 = performance.now();
  const box = basinBoxes(rows, new Set([loire.id])).get(loire.id);
  const { segs } = basinOutline(idAt, new Set([loire.id]), loire.id, box);
  const ms = performance.now() - t0;
  console.log(`outline: ${segs.length} runs in ${Math.round(ms)} ms`);
  assert.deepEqual([...segs].sort(), [...whole].sort());
  assert.ok(segs.length > 50 && segs.every((s) => s[4] === 1));
  // Every edge touches a Loire pixel; the box holds Tours (47.39 N, 0.69 E) and stays in France.
  const xs = segs.flatMap((s) => [s[0], s[2]]), ys = segs.flatMap((s) => [s[1], s[3]]);
  const nw = gridLatLon(Math.min(...xs), Math.min(...ys)), se = gridLatLon(Math.max(...xs), Math.max(...ys));
  assert.ok(nw.lat > 47.39 && se.lat < 47.39 && nw.lon < 0.69 && se.lon > 0.69, JSON.stringify({ nw, se }));
  assert.ok(nw.lat < 49.5 && se.lat > 44 && nw.lon > -3.5 && se.lon < 5.5, JSON.stringify({ nw, se }));
  // Closed: every corner is met by an even number of segment ends.
  // (Counted per unit of edge, since a run can end where another passes through.)
  const deg = new Map(), bump = (k) => deg.set(k, (deg.get(k) ?? 0) + 1);
  for (const [x0, y0, x1, y1] of segs) {
    if (y0 === y1) for (let x = x0; x < x1; x++) { bump(`${x},${y0}`); bump(`${x + 1},${y0}`); }
    else for (let y = y0; y < y1; y++) { bump(`${x0},${y}`); bump(`${x0},${y + 1}`); }
  }
  assert.ok([...deg.values()].every((d) => d % 2 === 0), "the outline closes");
  assert.ok(ms < 200, `${ms} ms`);
});
