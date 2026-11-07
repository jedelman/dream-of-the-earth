import test from "node:test";
import assert from "node:assert/strict";
import { network, orient, CLASSES, greatCircle, nearestNode } from "../web/js/ley.js";
import { LEY_DATA } from "../web/js/leydata.js";
import { vecToLatLon } from "../web/js/geo.js";

test("line counts per class (rarer = fewer lines)", () => {
  const counts = Object.fromEntries(CLASSES.map((c) => [c.id, LEY_DATA[c.data].lines.length]));
  assert.deepEqual(counts, { gwMajor: 144, gwBasic: 160, beckerhagens: 180, gwMinor: 240 });
  const byRank = [...CLASSES].sort((a, b) => b.rank - a.rank).map((c) => counts[c.id]);
  assert.deepEqual(byRank, [...byRank].sort((a, b) => a - b), "higher rank must mean fewer lines");
});

test("the network has 724 lines and 128 nodes", () => {
  const { lines, nodes } = network();
  assert.equal(lines.length, 724);
  assert.equal(nodes.length, 128);
});

test("orientation puts the +x vertex on the requested lat/lon and keeps unit length", () => {
  const [v] = orient([[1, 0, 0]], 31.72, 31.2, 0);
  const ll = vecToLatLon(v);
  assert.ok(Math.abs(ll.lat - 31.72) < 1e-9 && Math.abs(ll.lon - 31.2) < 1e-9, JSON.stringify(ll));
  for (const p of orient(LEY_DATA.beckerhagens.points, 31.72, 31.2, 0)) assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-9);
});

test("great circles stay on the sphere and hit both ends", () => {
  const { lines } = network();
  const pts = greatCircle(lines[0].a, lines[0].b, 1);
  for (const p of pts) assert.ok(Math.abs(Math.hypot(...p) - 1) < 1e-9);
  assert.deepEqual(pts[0], lines[0].a);
  assert.ok(pts.at(-1).every((c, i) => Math.abs(c - lines[0].b[i]) < 1e-12));
});

test("nearest node to a node is itself", () => {
  const n = network().nodes[5];
  const { node, meters } = nearestNode(n.lat, n.lon);
  assert.equal(node, n);
  assert.ok(meters < 1);
});
