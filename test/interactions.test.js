import test from "node:test";
import assert from "node:assert/strict";
import { treeLine, butterflyLine, beingLine, selfLine, highwayLine, creatureName, TREE_NAMES, TREE_LINES, RANGE } from "../web/js/interactions.js";
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
