import test from "node:test";
import assert from "node:assert/strict";
import { createInput, routeOf, intent, KEYS, ACTIONS } from "../web/js/actions.js";

const padOf = (held = [], axes = {}) => ({ turn: 0, thrust: 0, look: 0, zoom: 0, ...axes, held: new Set(held) });

test("every action reads { value, held, pressed, released } on every route", () => {
  const inp = createInput();
  for (const route of ["world", "ring", "ride", "menu"]) {
    const a = inp.frame({ route });
    assert.equal(a.route, route);
    for (const n of ACTIONS) assert.deepEqual(Object.keys(a[n]).sort(), ["held", "pressed", "released", "value"], `${route}.${n}`);
  }
});

test("routing follows modes.js and the pad's menu focus", () => {
  for (const t of ["world", "trip", "dream", "travelling"]) assert.equal(routeOf({ travel: t }), "world", t);
  assert.equal(routeOf({ travel: "ring" }), "ring");
  assert.equal(routeOf({ travel: "ride" }), "ride");
  assert.equal(routeOf({ travel: "ring" }, true), "menu", "a menu with the pad's focus wins");
  assert.equal(routeOf(null), "world");
});

test("a key: pressed on the first frame, held after, released once", () => {
  const inp = createInput();
  inp.press(KEYS.Space, "Space");
  let a = inp.frame();
  assert.ok(a.up.pressed && a.up.held && a.up.value === 1);
  inp.press(KEYS.Space, "Space"); // auto-repeat
  a = inp.frame();
  assert.ok(!a.up.pressed && a.up.held, "auto-repeat is not another press");
  inp.release(KEYS.Space, "Space");
  a = inp.frame();
  assert.ok(a.up.released && !a.up.held && a.up.value === 0);
  a = inp.frame();
  assert.ok(!a.up.released, "released only once");
});

test("latching: a press and release between two frames still shows as pressed on the next", () => {
  const inp = createInput();
  inp.press("up", "touch");
  inp.release("up", "touch");
  const a = inp.frame();
  assert.ok(a.up.pressed && a.up.released && !a.up.held);
  assert.equal(a.up.value, 1, "for that one frame it lifts, so a jump happens");
  assert.equal(inp.frame().up.pressed, false, "and only for one frame");
});

test("a tap shorter than a frame picks a lane in the ring, and W sets off", () => {
  const inp = createInput();
  inp.frame({ route: "ring" });
  inp.press(KEYS.KeyA, "KeyA"); inp.release(KEYS.KeyA, "KeyA");
  let a = inp.frame({ route: "ring" });
  assert.ok(a.turn.pressed && a.turn.value === -1);
  a = inp.frame({ route: "ring" });
  assert.ok(!a.turn.pressed && !a.turn.held);
  inp.press(KEYS.KeyW, "KeyW"); inp.release(KEYS.KeyW, "KeyW");
  a = inp.frame({ route: "ring" });
  assert.ok(a.go.pressed, "a quick W goes");
});

test("in the ring, keys held from before do nothing until let go", () => {
  const inp = createInput();
  inp.press(KEYS.KeyW, "KeyW"); inp.press(KEYS.Space, "Space");
  inp.frame({ route: "world" }); // walking in, jumping
  const a = inp.frame({ route: "ring" });
  assert.ok(!a.go.pressed && !a.letGo.pressed);
  inp.release(KEYS.Space, "Space");
  inp.frame({ route: "ring" });
  inp.press(KEYS.Space, "Space");
  assert.ok(inp.frame({ route: "ring" }).letGo.pressed, "a fresh Space lets go");
});

test("ring: Space, Shift, ▲, ▼ and the pad's B let go; the pad's A goes and doesn't let go", () => {
  for (const [c, src] of [["up", "Space"], ["down", "ShiftLeft"], ["up", "touch"], ["down", "touch"]]) {
    const inp = createInput();
    inp.frame({ route: "ring" });
    inp.press(c, src);
    const a = inp.frame({ route: "ring" });
    assert.ok(a.letGo.pressed && !a.go.pressed, `${c} from ${src}`);
    assert.equal(a.up.value - a.down.value, 0, "nothing climbs or crouches in the ring");
  }
  const inp = createInput();
  inp.frame({ route: "ring", pad: padOf() });
  let a = inp.frame({ route: "ring", pad: padOf(["a"]) });
  assert.ok(a.go.pressed && !a.letGo.pressed, "A goes");
  a = inp.frame({ route: "ring", pad: padOf(["a"]) });
  assert.ok(!a.go.pressed, "held, it doesn't go again");
  a = inp.frame({ route: "ring", pad: padOf(["b"]) });
  assert.ok(a.letGo.pressed, "B lets go");
});

test("the stick's intent: forward only when clearly forward, sideways only when at least as sideways (#54)", () => {
  assert.deepEqual(intent(0, 1), { forward: true, side: 0, back: false });
  assert.equal(intent(-0.8, 0.3).forward, false, "pushed left, drifting forward: not off along the lane");
  assert.equal(intent(-0.8, 0.3).side, -1);
  assert.equal(intent(0.5, 0.7).forward, false, "diagonal: neither");
  assert.equal(intent(0.5, 0.7).side, 0);
  assert.equal(intent(0, -0.3).back, true);
  const inp = createInput();
  inp.frame({ route: "ring", pad: padOf() });
  let a = inp.frame({ route: "ring", pad: padOf([], { turn: -0.9, thrust: 0.35 }) });
  assert.ok(a.turn.pressed && a.turn.value === -1 && !a.go.pressed, "a drifting left push chooses, never sets off");
  a = inp.frame({ route: "ring", pad: padOf([], { turn: 0, thrust: 0.9 }) });
  assert.ok(a.go.pressed && a.turn.released);
});

test("a stick held forward through the ring's start doesn't set off; pushed again, it does", () => {
  const inp = createInput();
  inp.frame({ route: "world", pad: padOf([], { thrust: 1 }) });
  assert.equal(inp.frame({ route: "ring", pad: padOf([], { thrust: 1 }) }).go.pressed, false);
  inp.frame({ route: "ring", pad: padOf() });
  assert.equal(inp.frame({ route: "ring", pad: padOf([], { thrust: 1 }) }).go.pressed, true);
});

test("the D-pad: moves in the world, chooses in the ring, walks focus only in a menu", () => {
  const inp = createInput();
  inp.frame({ route: "world", pad: padOf() });
  let a = inp.frame({ route: "world", pad: padOf(["left"]) });
  assert.equal(a.turn.value, -1);
  assert.ok(!a.navLeft.pressed, "not a menu step in the world");
  inp.frame({ route: "ring", pad: padOf() });
  a = inp.frame({ route: "ring", pad: padOf(["right"]) });
  assert.ok(a.turn.pressed && a.turn.value === 1);
  inp.frame({ route: "menu", pad: padOf() });
  a = inp.frame({ route: "menu", pad: padOf(["left"]) });
  assert.ok(a.navLeft.pressed && a.turn.value === 0, "in a menu it walks focus and nothing moves");
});

test("a menu: A presses, B closes, the sticks don't move you; a button held across a route change doesn't press", () => {
  const inp = createInput();
  inp.frame({ route: "menu", pad: padOf() });
  let a = inp.frame({ route: "menu", pad: padOf(["a"], { thrust: 1 }) });
  assert.ok(a.go.pressed && !a.up.held && a.thrust.value === 0);
  a = inp.frame({ route: "menu", pad: padOf(["b"]) });
  assert.ok(a.letGo.pressed);
  a = inp.frame({ route: "world", pad: padOf(["b"]) }); // B closed the menu; still held
  assert.ok(a.down.held && !a.down.pressed, "held, but not pressed again in the world");
});

test("ride: Shift, ▼, B, S or a stick pulled back step off (letGo), latched; turn hops", () => {
  for (const [c, src] of [["down", "ShiftLeft"], ["down", "touch"], ["back", "KeyS"]]) {
    const inp = createInput();
    inp.frame({ route: "ride" });
    inp.press(c, src); inp.release(c, src);
    assert.ok(inp.frame({ route: "ride" }).letGo.pressed, `${c} from ${src}, tapped`);
  }
  const inp = createInput();
  inp.frame({ route: "ride", pad: padOf() });
  assert.ok(inp.frame({ route: "ride", pad: padOf(["b"]) }).letGo.pressed);
  inp.frame({ route: "ride", pad: padOf() });
  assert.ok(inp.frame({ route: "ride", pad: padOf([], { thrust: -0.4 }) }).letGo.pressed);
  assert.ok(!inp.frame({ route: "ride", pad: padOf([], { thrust: -0.4 }) }).letGo.pressed, "held back is one press");
  inp.press(KEYS.KeyD, "KeyD");
  assert.equal(inp.frame({ route: "ride" }).turn.value, 1);
});

test("two sources on one control: letting go of one leaves it held", () => {
  const inp = createInput();
  inp.press("up", "Space"); inp.press("up", "touch");
  inp.frame();
  inp.release("up", "touch");
  const a = inp.frame();
  assert.ok(a.up.held && !a.up.released);
  inp.releaseAll();
  assert.ok(inp.frame().up.released);
});

test("world: keys first, then touch, pad and tilt; the pad's X, Y, Start and Back; zoom from keys and shoulders", () => {
  const inp = createInput();
  let a = inp.frame({ touch: { turn: 0.4, thrust: 0 }, tilt: { turn: -1, thrust: 0.5 } });
  assert.equal(a.turn.value, 0.4);
  assert.equal(a.thrust.value, 0.5, "tilt fills in what nothing else says");
  inp.press(KEYS.KeyA, "KeyA");
  assert.equal(inp.frame({ touch: { turn: 0.4, thrust: 0 } }).turn.value, -1);
  inp.frame({ pad: padOf() });
  a = inp.frame({ pad: padOf(["x", "y", "start", "back"], { zoom: 1 }) });
  assert.ok(a.touch.pressed && a.picture.pressed && a.menus.pressed && a.escape.pressed);
  assert.equal(a.zoom.value, 1);
  inp.press(KEYS.Equal, "Equal");
  assert.equal(inp.frame().zoom.value, -1, "+ comes nearer");
  inp.press(KEYS.KeyE, "KeyE");
  assert.ok(inp.frame().touch.pressed, "E touches");
});
