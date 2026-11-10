import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readPng } from "./png.js";
import { useQuests, questOf, allQuests, wayKey, readOf, springAwake, target, clueLine, alongStem, landing, stretch, densify, stoneOf, songOf, metres, bearing, compassWords, arrow, kmText } from "../web/js/quests.js";
import { basinCell, basinId } from "../web/js/basins.js";
import { makeAtlasRecord, parseAtlasRecord } from "../web/js/atlas-record.js";
import { parseWorn } from "../web/js/intents.js";

const DIR = new URL("../web/data/basins/", import.meta.url);
const basins = JSON.parse(fs.readFileSync(new URL("basins.json", DIR), "utf8")).basins;
useQuests(JSON.parse(fs.readFileSync(new URL("quests.json", DIR), "utf8")));
const tiles = new Map();
const basinAtFile = (lat, lon) => {
  const c = basinCell(lat, lon);
  if (!tiles.has(c.key)) { const { px } = readPng(fs.readFileSync(new URL(`${c.key}.png`, DIR))); tiles.set(c.key, (k) => basinId(px[k * 3], px[k * 3 + 1])); }
  return tiles.get(c.key)(c.y * 300 + c.x);
};

test("every river and lake basin has a quest; hollows and dry coasts have none", () => {
  const quested = basins.filter((b) => b.kind === "river" || b.kind === "lake");
  assert.equal(allQuests().length, quested.length);
  for (const b of quested) assert.ok(questOf(b.key), b.key);
  for (const b of basins.filter((x) => x.kind === "hollow" || x.kind === "coast")) assert.equal(questOf(b.key), null);
});

test("the waymarks: 3 to 12, rising from the sea in order, each in its own basin, the stem from sea to source", () => {
  for (const q of allQuests()) {
    const b = basins.find((x) => x.key === q.key);
    assert.ok(q.ways.length >= 3 && q.ways.length <= 12, `${q.key}: ${q.ways.length}`);
    q.ways.forEach((w, i) => {
      if (i) assert.ok(w.s > q.ways[i - 1].s, `${q.key} ${i}`);
      assert.equal(basinAtFile(w.at[0], w.at[1]), b.id, `${q.key} waymark ${i} at ${w.at} is in its basin`);
    });
    assert.ok(q.ways[q.ways.length - 1].s < q.len);
    assert.equal(q.line[0][2], 0); assert.equal(q.line[q.line.length - 1][2], q.len);
    for (let k = 1; k < q.line.length; k++) assert.ok(q.line[k][2] >= q.line[k - 1][2], q.key);
    assert.match(q.song, /^[0-9]{12}$/);
  }
});

test("where the compass points: the nearest waymark, then the one above the highest read, then the spring, then nothing", () => {
  const q = questOf("seine-river"), K = q.ways.length, ways = {}, springs = {};
  assert.equal(target(q, ways, springs, [48.85, 2.35]).i, 1, "from Paris, the waymark by Versailles");
  assert.equal(target(q, ways, springs, [49.5, 0.7]).i, 0, "from by Rouen, the first");
  ways[wayKey(q, 1)] = 1;
  assert.deepEqual(readOf(q, ways), [1]);
  assert.equal(target(q, ways, springs, [49.5, 0.7]).i, 2, "the next up, wherever you are");
  assert.ok(!springAwake(q, ways, springs));
  ways[wayKey(q, K - 1)] = 2;
  assert.ok(springAwake(q, ways, springs));
  assert.deepEqual(target(q, ways, springs, [0, 0]), { kind: "spring", at: q.source.at });
  springs[q.key] = 3;
  assert.equal(target(q, ways, springs, [0, 0]), null, "the river is yours");
});

test("what a waymark says: where it is, and where the next is, by the river's own names", () => {
  const seine = questOf("seine-river");
  assert.equal(clueLine(seine, 0, { river: "Seine River" }), "Waymark 1 of 3 of the Seine River, near Rouen. Upstream, 124 km south-east, near Versailles, the river is still the Seine. Touch the waymark again, and the water carries you there.");
  assert.match(clueLine(seine, 2, { river: "Seine River" }), /: the last\. Upstream, 136 km south-east, near Dijon, the river begins, and its spring wakes for you\./);
  const amazon = questOf("amazon-river");
  assert.match(clueLine(amazon, 8, { river: "Amazon River" }), /on the Amazonas, near Iquitos\. Upstream, \d+ km south-west, near Contamana, the river is called the Ucayali\./);
});

test("the water sets you down 1.5 km below a waymark, facing it", () => {
  for (const q of allQuests()) {
    for (const t of [...q.ways.map((w, i) => ({ kind: "way", i, at: w.at })), { kind: "spring", at: q.source.at }]) {
      const l = landing(q, t), d = metres([l.lat, l.lon], t.at);
      assert.ok(d > 1400 && d < 1600, `${q.key}: ${Math.round(d)} m`);
      const off = Math.abs((((bearing([l.lat, l.lon], t.at) - l.heading) % 360) + 540) % 360 - 180);
      assert.ok(off < 1, "facing it");
    }
  }
});

test("a stretch of river, for the clouds to clear: from one point to another along the stem, densified", () => {
  const q = questOf("mississippi-river"), a = alongStem(q, 100), b = alongStem(q, 400), path = densify(stretch(q, 100, 400), 0.1);
  assert.deepEqual(path[0], a); assert.deepEqual(path[path.length - 1], b);
  for (let k = 1; k < path.length; k++) assert.ok(Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]) <= 0.1 + 1e-9);
  assert.deepEqual(alongStem(q, -5), [q.line[0][0], q.line[0][1]]);
});

test("each spring stone is its river's own: a colour, a shape, a song from its heights", () => {
  const looks = new Set(allQuests().map((q) => JSON.stringify(stoneOf(q))));
  assert.ok(looks.size > allQuests().length * 0.95, "nearly every stone different");
  assert.deepEqual(stoneOf(questOf("nile-river")), stoneOf(questOf("nile-river")));
  const song = songOf(questOf("mississippi-river"));
  assert.equal(song.length, 12);
  assert.ok(song[0] > song[11], "from high at the source to low at the sea");
  assert.ok(song.every((f) => f >= 330 && f < 1400));
});

test("words and arrows for the compass", () => {
  assert.equal(compassWords(0), "north"); assert.equal(compassWords(224), "south-west"); assert.equal(compassWords(359), "north");
  assert.equal(arrow(0), "↑"); assert.equal(arrow(-90), "←"); assert.equal(arrow(180), "↓"); assert.equal(arrow(400), "↗");
  assert.equal(kmText(1440), "1.4 km"); assert.equal(kmText(378400), "378 km");
  assert.ok(Math.abs(metres([0, 0], [0, 1]) - 111195) < 5);
});

test("waymarks read and springs drunk from go in your atlas record; the compass is something to wear", () => {
  const been = { ways: { "seine-river:1": 1794000000, "seine-river:2": 1794000100 }, springs: { "seine-river": 1794000200 } };
  const v = makeAtlasRecord({}, 0, been), back = parseAtlasRecord(v);
  assert.deepEqual(back.ways, been.ways); assert.deepEqual(back.springs, been.springs);
  v.ways.push({ key: "seine-river", at: 1 }, { key: "x:100", at: 1 }, { key: "<b>:1", at: 1 });
  v.springs.push({ key: "Seine River", at: 1 });
  assert.deepEqual(Object.keys(parseAtlasRecord(v).ways).sort(), ["seine-river:1", "seine-river:2"]);
  assert.deepEqual(Object.keys(parseAtlasRecord(v).springs), ["seine-river"]);
  assert.deepEqual(parseWorn(["prism", "rivercompass", "crown"]), ["prism", "rivercompass"]);
});
