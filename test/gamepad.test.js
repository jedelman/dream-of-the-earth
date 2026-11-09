import test from "node:test";
import assert from "node:assert/strict";
import { shape, readPad, firstPad, stepFocus, DEAD, BUTTONS } from "../web/js/gamepad.js";

const pad = (axes = [0, 0, 0, 0], pressed = []) => ({ mapping: "standard", connected: true, axes, buttons: BUTTONS.map((n) => ({ pressed: pressed.includes(n), value: pressed.includes(n) ? 1 : 0 })) });

test("a stick reads nothing inside the dead zone, then runs smoothly from 0 to 1", () => {
  assert.equal(shape(0), 0);
  assert.equal(shape(DEAD * 0.9), 0);
  assert.equal(shape(-DEAD * 0.9), 0);
  assert.ok(shape(DEAD + 0.01) > 0 && shape(DEAD + 0.01) < 0.03, "no jump at the edge");
  assert.equal(shape(1), 1);
  assert.equal(shape(-1), -1);
  assert.equal(shape(undefined), 0);
});

test("the left stick moves (up is forward), the right turns and zooms, the shoulders zoom", () => {
  const r = readPad(pad([0.5, -1, 0, 0]));
  assert.ok(r.turn > 0.3 && r.thrust === 1 && r.look === 0 && r.zoom === 0 && r.active);
  assert.equal(readPad(pad([0, 0, -1, 0])).look, -1);
  assert.equal(readPad(pad([0, 0, 0, 1])).zoom, 1, "right stick down: farther");
  assert.equal(readPad(pad([0, 0, 0, 0], ["lb"])).zoom, 1);
  assert.equal(readPad(pad([0, 0, 0, 0], ["rb"])).zoom, -1);
  assert.equal(readPad(pad()).active, false, "a pad at rest is quiet");
});

test("buttons: held now, and down only on the frame they're pressed", () => {
  const a = readPad(pad([0, 0, 0, 0], ["a", "x"]));
  assert.deepEqual([...a.held].sort(), ["a", "x"]);
  assert.deepEqual([...a.down].sort(), ["a", "x"]);
  const b = readPad(pad([0, 0, 0, 0], ["a", "x", "up"]), a.held);
  assert.deepEqual([...b.down], ["up"], "a held button isn't pressed again");
  // An analogue trigger counts once it's past half way.
  const t = pad(); t.buttons[7] = { pressed: false, value: 0.7 };
  assert.ok(readPad(t).held.has("rt"));
});

test("the first standard pad is the one read; an empty slot or a gone pad is skipped", () => {
  const odd = { ...pad(), mapping: "" }, std = pad(), gone = { ...pad(), connected: false };
  assert.equal(firstPad([null, odd, std]), std);
  assert.equal(firstPad([null, odd]), odd);
  assert.equal(firstPad([gone, null]), null);
  assert.equal(firstPad(undefined), null);
});

test("the D-pad steps through a menu, wrapping round", () => {
  assert.equal(stepFocus(-1, 5, "right"), 0);
  assert.equal(stepFocus(-1, 5, "left"), 4);
  assert.equal(stepFocus(4, 5, "down"), 0);
  assert.equal(stepFocus(0, 5, "up"), 4);
  assert.equal(stepFocus(2, 0, "right"), -1);
});
