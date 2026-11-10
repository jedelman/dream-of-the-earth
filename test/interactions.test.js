import test from "node:test";
import assert from "node:assert/strict";
import { treeLine, butterflyLine, beingLine, selfLine, highwayLine, creatureName, TREE_NAMES, TREE_LINES, RANGE, promptFor, focusScore, chooseFocus, glinting, cairnLine, ago } from "../web/js/interactions.js";
import { fireflyLine } from "../web/js/interactions.js";
import { fireflyAt } from "../web/js/insecthomes.js";
import { SPECIES_NAMES } from "../web/js/plantforms.js";

test("every species has a name and something to say when shaken", () => {
  for (const sp of SPECIES_NAMES) {
    assert.ok(TREE_NAMES[sp] && TREE_LINES[sp]?.length, sp);
    const line = treeLine(sp, 12345);
    assert.ok(line.length > 10 && !line.includes("undefined"), line);
  }
  assert.ok(treeLine("cocos", 1).startsWith("You shake the coconut palm."));
  assert.ok(treeLine("quercus", 9, true).includes("Petals"));
  assert.ok(!treeLine("carnegiea", 9, true).includes("Petals"), "a saguaro still doesn't shake");
});

test("the same tree answers the same way; shaking again can say something new", () => {
  assert.equal(treeLine("ficus", 777), treeLine("ficus", 777));
  const lines = new Set([0, 1, 2, 3, 4, 5].map((n) => treeLine("ficus", 777, false, n)));
  assert.ok(lines.size > 1);
});

test("creatures have names; everything else has a line", () => {
  assert.equal(creatureName(7), creatureName(7));
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) assert.match(creatureName(s), /^[A-Z][a-z]{2,}$/); // Ulo, Shinyfa, Pompipom…
  assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(creatureName)).size >= 6);
  assert.ok(selfLine("Mibbo").includes("Mibbo"));
  assert.match(butterflyLine(0.9, 3), /pink butterfly/);
  assert.ok(beingLine(5).length > 10);
  assert.equal(highwayLine("Becker-Hagens", 1234.4), "You step onto the Becker-Hagens highway. 1,234 km to the next node.");
  assert.ok(RANGE.highway >= 150 && RANGE.tree > 10);
});

test("every thing in reach has words for the prompt", () => {
  for (const sp of SPECIES_NAMES) {
    const words = promptFor({ kind: "tree", species: sp });
    assert.match(words, /^[A-Z][a-z]+ the [a-z ]+$/, sp);
  }
  assert.equal(promptFor({ kind: "tree", species: "adansonia" }), "Shake the baobab");
  assert.equal(promptFor({ kind: "tree", species: "carnegiea" }), "Hug the saguaro");
  assert.equal(promptFor({ kind: "butterfly", hue: 0.9 }), "Greet the pink butterfly");
  assert.equal(promptFor({ kind: "being" }), "Hum to the sky being");
  assert.equal(promptFor({ kind: "highway" }), "Board the highway");
  assert.equal(promptFor({ kind: "ride" }), "Step off");
});

test("the prompt goes to what's close and in front, and small things beat big ones", () => {
  const ahead = { key: "a", kind: "tree", species: "quercus", d: 12, range: 28, facing: 1 };
  const behind = { key: "b", kind: "tree", species: "quercus", d: 8, range: 28, facing: -1 };
  assert.equal(chooseFocus([behind, ahead]), ahead, "facing counts for more than a few metres");
  const being = { key: "s", kind: "being", d: 400, range: 3000, facing: 1 };
  const highway = { key: "h", kind: "highway", d: 60, range: 320, facing: 1 };
  assert.equal(chooseFocus([being, highway, ahead]), ahead, "the tree beside you, not the highway overhead");
  assert.equal(chooseFocus([being, highway]), highway);
  assert.equal(chooseFocus([]), null);
  const shrub = { key: "r", kind: "tree", species: "shrub", d: 10, range: 21, facing: 1 };
  assert.ok(focusScore(shrub) > focusScore({ ...shrub, species: "picea" }), "a shrub gives way to a tree");
});

test("the prompt holds steady between two near-equal things", () => {
  const a = { key: "a", kind: "tree", species: "picea", d: 10, range: 30, facing: 0.9 };
  const b = { key: "b", kind: "tree", species: "picea", d: 9, range: 30, facing: 0.95 };
  assert.equal(chooseFocus([a, b]), b);
  assert.equal(chooseFocus([a, b], "a"), a, "a slightly better tree doesn't steal the prompt");
  const c = { ...b, key: "c", d: 2 };
  assert.equal(chooseFocus([a, c], "a"), c, "a clearly better one does");
  assert.equal(chooseFocus([b], "gone"), b, "the old focus left reach");
});

test("a few things glint, the focus first", () => {
  const cands = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ key: String(k), kind: "tree", species: "picea", d: 2 + k * 3, range: 30, facing: 1 }));
  const g = glinting(cands, cands[5], 5);
  assert.equal(g.length, 5);
  assert.equal(g[0], cands[5]);
  assert.deepEqual(g.slice(1).map((c) => c.key), ["0", "1", "2", "3"]);
  assert.equal(glinting([], null).length, 0);
});

test("cairns: the prompt, and the line when you read one", () => {
  assert.equal(promptFor({ kind: "artifact", handle: "nyo.bsky.social" }), "Read @nyo.bsky.social's cairn");
  assert.equal(promptFor({ kind: "artifact", own: true }), "Tend your cairn");
  assert.equal(promptFor({ kind: "artifact" }), "Read the cairn");
  assert.equal(ago(0, 3600), "today");
  assert.equal(ago(0, 86400 * 1.5), "yesterday");
  assert.equal(ago(0, 86400 * 4.2), "4 days ago");
  assert.equal(cairnLine({ handle: "a.b", note: "hello", since: 0 }, 10), "\u201chello\u201d \u2014 @a.b, today.");
  assert.equal(cairnLine({ handle: null, note: "", since: 0 }, 10, 0.5), "someone left a cairn here today. It's fading with the moon.");
  const cairn = { key: "a", kind: "artifact", d: 10, range: 25, facing: 1 }, tree = { key: "t", kind: "tree", species: "quercus", d: 10, range: 28, facing: 1 };
  assert.equal(chooseFocus([tree, cairn]), cairn, "a cairn beside a tree gets the prompt");
});

test("fireflies: a prompt, a line that varies, and a drift that stays within a few metres of home", () => {
  assert.equal(promptFor({ kind: "firefly" }), "Cup the firefly");
  assert.ok(RANGE.firefly > 5 && RANGE.firefly < RANGE.butterfly);
  assert.equal(fireflyLine(5, 0), fireflyLine(5, 0));
  assert.ok(new Set([0, 1, 2, 3, 4, 5].map((n) => fireflyLine(9, n))).size > 1);
  const home = { x: 10, y: 4, z: -7, seed: 0.37 };
  for (const t of [0, 13, 999, 86400]) {
    const q = fireflyAt(home, t);
    assert.ok(Math.abs(q.x - home.x) <= 3 && Math.abs(q.y - home.y) <= 0.8 && Math.abs(q.z - home.z) <= 3);
  }
  assert.notDeepEqual(fireflyAt(home, 0), fireflyAt(home, 5));
});
