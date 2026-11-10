import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { basinCell, basinId, areaText, endsText, knowLine, useBasins, basinByKey } from "../web/js/basins.js";
import { makeAtlasRecord, parseAtlasRecord, mergeBeen, atlasKey } from "../web/js/atlas-record.js";
import { readPng } from "./png.js";

const DIR = new URL("../web/data/basins/", import.meta.url);
const list = JSON.parse(fs.readFileSync(new URL("basins.json", DIR), "utf8"));

const tiles = new Map();
const tile = (key) => {
  if (!tiles.has(key)) {
    const { w, h, px } = readPng(fs.readFileSync(new URL(`${key}.png`, DIR)));
    assert.equal(w, 300); assert.equal(h, 300);
    tiles.set(key, Uint16Array.from({ length: w * h }, (_, k) => basinId(px[k * 3], px[k * 3 + 1])));
  }
  return tiles.get(key);
};
const at = (lat, lon) => { const c = basinCell(lat, lon), id = tile(c.key)[c.y * 300 + c.x]; return id ? list.basins.find((b) => b.id === id)?.key ?? `?${id}` : null; };

test("a point's tile and pixel: 30° tiles at 0.1°, the dateline and poles clamped", () => {
  assert.deepEqual(basinCell(0, 0), { col: 6, row: 3, key: "6-3", x: 0, y: 0 });
  assert.deepEqual(basinCell(89.99, -180), { col: 0, row: 0, key: "0-0", x: 0, y: 0 });
  assert.deepEqual(basinCell(-90, 179.99), { col: 11, row: 5, key: "11-5", x: 299, y: 299 });
  assert.equal(basinCell(10, 190).key, basinCell(10, -170).key);
  assert.equal(basinId(44, 1), 300);
});

test("the list: unique ids and keys, every basin named, its mouth and source on the Earth", () => {
  assert.equal(list.v, 1);
  const ids = new Set(list.basins.map((b) => b.id)), keys = new Set(list.basins.map((b) => b.key)), labels = new Set(list.basins.map((b) => b.label));
  assert.equal(ids.size, list.basins.length); assert.equal(keys.size, list.basins.length); assert.equal(labels.size, list.basins.length);
  for (const b of list.basins) {
    assert.match(b.key, /^[a-z0-9][a-z0-9-]{0,63}$/, b.key);
    assert.ok(["river", "lake", "hollow", "coast"].includes(b.kind), b.kind);
    assert.ok(b.area >= 50000, `${b.label} ${b.area}`);
    if (b.kind === "river") assert.ok(b.river, b.label);
    if (b.kind === "lake") assert.ok(b.lake, b.label);
    for (const [la, lo] of [b.mouth, b.source]) assert.ok(Math.abs(la) <= 90 && Math.abs(lo) <= 180);
  }
});

test("the tiles: every id in them is a listed basin, and every listed basin is in them", () => {
  const seen = new Set();
  for (let col = 0; col < 12; col++) for (let row = 0; row < 6; row++) for (const id of tile(`${col}-${row}`)) if (id) seen.add(id);
  const ids = new Set(list.basins.map((b) => b.id));
  assert.deepEqual([...seen].filter((id) => !ids.has(id)), []);
  assert.deepEqual([...ids].filter((id) => !seen.has(id)), []);
});

test("where the rain goes, at places whose rivers everyone knows", () => {
  const cases = {
    "amazon-river": [-3.1, -60.0], "mississippi-river": [38.6, -90.2], "nile-river": [15.6, 32.5], "congo-river": [-4.3, 15.3],
    "yenisey-river": [51.7, 94.45], "yangtze-river": [29.56, 106.55], "mekong-river": [17.97, 102.6], "danube-river": [48.2, 16.37],
    "tigris-euphrates": [33.3, 44.4], "ganges-brahmaputra": [25.3, 83.0], "lake-chad": [12.1, 15.05], "great-salt-lake": [40.76, -111.9],
    "volga-river": [55.75, 37.6], "rhine-river": [47.56, 7.59], "seine-river": [48.85, 2.35],
  };
  for (const [key, [la, lo]] of Object.entries(cases)) assert.equal(at(la, lo), key, `${la}, ${lo}`);
  assert.equal(at(0, -150), null); // the open Pacific
  assert.equal(at(51.5, -0.1), null); // the Thames: a basin too small to name
  // Lake Itasca, the Mississippi's own source, and the Kagera's country above Lake Victoria, are in their basins.
  assert.equal(at(47.2, -95.2), "mississippi-river");
  assert.equal(at(-2.0, 30.0), "nile-river");
});

test("the main stems end where the great rivers are said to begin", () => {
  const near = (key, lat, lon, km) => {
    const b = list.basins.find((q) => q.key === key), [la, lo] = b.source;
    const d = 6371 * Math.acos(Math.min(1, Math.sin(la * Math.PI / 180) * Math.sin(lat * Math.PI / 180) + Math.cos(la * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.cos((lo - lon) * Math.PI / 180)));
    assert.ok(d < km, `${key}: source ${b.source} is ${Math.round(d)} km from ${lat}, ${lon}`);
  };
  near("mississippi-river", 47.24, -95.21, 60); // Lake Itasca
  near("amazon-river", -15.5, -71.7, 120); // Nevado Mismi
  near("volga-river", 57.25, 32.47, 60); // Volgoverkhovye
  near("lena-river", 53.9, 108.1, 80); // by Lake Baikal
});

test("words: areas, where the water goes, and what you're told on arriving", () => {
  assert.equal(areaText(5923000), "5.9 million km²");
  assert.equal(areaText(3000000), "3 million km²");
  assert.equal(areaText(640400), "640,000 km²");
  assert.equal(areaText(51000), "51,000 km²");
  useBasins(list);
  const amazon = basinByKey("amazon-river"), chad = basinByKey("lake-chad");
  assert.equal(endsText(amazon), "reaches the sea at the mouth of the Amazon River");
  assert.equal(endsText(chad), "ends in Lake Chad");
  assert.match(knowLine(amazon), /^You're in the Amazon River basin now \(5\.9 million km²\): every drop of rain here runs to the Amazon River/);
  assert.match(knowLine(chad), /never reaches the sea. It runs to Lake Chad, down the Chari River/);
  const hollow = list.basins.find((b) => b.kind === "hollow");
  assert.match(knowLine(hollow), /runs to its lowest place and stays/);
  assert.equal(basinByKey("atlantis"), null);
});

test("the basins you know go in your atlas, round-trip, and merge across devices", () => {
  const been = { nodes: { 3: 1790000000 }, marks: {}, basins: { "lake-chad": 1795000000, "amazon-river": 1794000000 } };
  const v = makeAtlasRecord({}, Date.parse("2026-11-10T22:00:00Z"), been);
  assert.deepEqual(v.basins, [{ key: "amazon-river", at: 1794000000 }, { key: "lake-chad", at: 1795000000 }]);
  assert.deepEqual(parseAtlasRecord(v).basins, been.basins);
  v.basins.push({ key: "<script>", at: 1 }, { key: "x".repeat(65), at: 1 }, { key: "nile-river", at: -1 }, null);
  assert.deepEqual(Object.keys(parseAtlasRecord(v).basins).sort(), ["amazon-river", "lake-chad"]);
  assert.deepEqual(parseAtlasRecord({ shrines: [] }).basins, {}); // an atlas from before basins
  assert.deepEqual(mergeBeen(been.basins, { "amazon-river": 1793000000, "nile-river": 1796000000 }), { "lake-chad": 1795000000, "amazon-river": 1793000000, "nile-river": 1796000000 });
  assert.notEqual(atlasKey({}, been), atlasKey({}, { ...been, basins: {} }));
});
