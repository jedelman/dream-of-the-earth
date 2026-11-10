import test from "node:test";
import assert from "node:assert/strict";
import { NODE_NAMES, placeOfNode, nodeKey } from "../web/js/nodenames.js";
import { network } from "../web/js/ley.js";
import { lanesAt } from "../web/js/ride.js";

test("every ley node has a name, short enough for the HUD", () => {
  const nodes = network().nodes;
  assert.equal(Object.keys(NODE_NAMES).length, nodes.length);
  for (const n of nodes) {
    const name = placeOfNode(n);
    assert.ok(name && name.length >= 4 && name.length <= 48, `${nodeKey(n)}: ${name}`);
    assert.ok(!/undefined|null|\\x00|  /.test(name), name);
  }
});

test("names tell nodes apart (only the two pairs at the poles share one)", () => {
  const seen = new Map();
  for (const n of network().nodes) { const k = placeOfNode(n); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const shared = [...seen].filter(([, c]) => c > 1).map(([k]) => k).sort();
  assert.deepEqual(shared, ["the North Pole", "the South Pole"]);
});

test("a few names are where they should be", () => {
  const at = (lat, lon) => placeOfNode(network().nodes.reduce((b, n) => (Math.hypot(n.lat - lat, n.lon - lon) < Math.hypot(b.lat - lat, b.lon - lon) ? n : b)));
  assert.equal(at(45, 0), "Bordeaux, France");
  assert.equal(at(0, 0), "Null Island (0° 0°)");
  assert.match(at(58.28, -4.8), /Inverness, Scotland/);
  assert.match(at(22.5, -90), /Gulf of Mexico/);
});

test("every lane names the node it goes to", () => {
  for (const n of network().nodes) for (const l of lanesAt(n)) assert.ok(placeOfNode(l.far), `${nodeKey(n)} → ?`);
});
