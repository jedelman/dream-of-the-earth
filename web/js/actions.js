// One input layer (issue #58): keys, the touch stick and ▲▼, tilt and a gamepad, turned into the same per-frame actions.
// Pure, so Node can test it; main.js feeds it raw events and samples, and reads actions back once a frame.
//
// Before this, edges were found in four places (the jump's upWas, the ring's held flags, the pad's held set, ▲▼'s latch)
// plus a keydown handler beside the ring's per-frame logic, and three bugs in one week came from it: a key tap shorter
// than a frame was missed in the ring, a ▲▼ tap was missed on a ride, and the D-pad meant "menus" even in the world.
//
// Every action is { value, held, pressed, released }:
//   held      down now
//   pressed   went down since the last frame; a press that starts and ends between two frames still shows (latched)
//   released  came up since the last frame
// Actions are routed by where you are:
//   world  the stick, D-pad, WASD and touch drag move; Space/▲/A up (jump, climb); Shift/▼/B down (crouch, descend)
//   ring   (held in a ley node's light) left/right choose a lane; forward, W or A goes; Space, Shift, ▲▼ or B lets go
//   ride   (on a highway) left/right hop at crossings; Shift, S, ▼, a stick pulled back, or B steps off (letGo)
//   menu   (a menu has the pad's focus) the D-pad walks focus (nav); A presses (go); B closes (letGo); nothing moves
// Everywhere: E/X touches what glints, P/Y takes a picture, Start is the menus, Back is Escape, +/− and the shoulders zoom.

import { dpadAxes as dpad } from "./gamepad.js";

/** The keyboard, by KeyboardEvent.code. */
export const KEYS = {
  KeyW: "fwd", ArrowUp: "fwd", KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  Space: "up", ShiftLeft: "down", ShiftRight: "down",
  KeyE: "touch", KeyP: "picture",
  Equal: "nearer", NumpadAdd: "nearer", PageUp: "nearer", Minus: "farther", NumpadSubtract: "farther", PageDown: "farther",
};
/** The pad's buttons as controls, outside a menu (the D-pad comes in as a stick instead). */
const PAD_WORLD = { a: "up", b: "down", x: "touch", y: "picture", start: "menus", back: "escape" };
/** The pad's buttons in a ley node's ring: A sets off, B lets go. */
const PAD_RING = { a: "go", b: "letGo", x: "touch", y: "picture", start: "menus", back: "escape" };
/** The pad's buttons inside a menu. */
const PAD_MENU = { a: "go", b: "letGo", start: "menus", back: "escape", up: "navUp", down: "navDown", left: "navLeft", right: "navRight" };
/** Every action main.js may read. */
export const ACTIONS = ["turn", "thrust", "up", "down", "go", "letGo", "touch", "picture", "zoom", "menus", "escape", "navUp", "navDown", "navLeft", "navRight"];

/** Where actions go, from modes.js's snapshot and whether a menu has the pad's focus. */
export function routeOf(snap, menu = false) {
  if (menu) return "menu";
  if (snap?.travel === "ring") return "ring";
  if (snap?.travel === "ride") return "ride";
  return "world";
}

/**
 * The stick's intent, so a push that drifts doesn't mean two things (11-10, #54: a stick pushed left drifts a little
 * forward, and that used to set off along the lane you were leaving): forward only when clearly more than sideways,
 * sideways only when at least as much as forward. Pulled back (any amount) is "back".
 */
export function intent(turn, thrust) {
  return {
    forward: thrust > 0.6 && thrust > 1.5 * Math.abs(turn),
    side: Math.abs(turn) > 0.5 && Math.abs(turn) >= Math.abs(thrust) ? Math.sign(turn) : 0,
    back: thrust < 0,
  };
}

const act = (value = 0, held = false, pressed = false, released = false) => ({ value, held, pressed, released });

/**
 * An input layer. press(control, source) and release(control, source) as events arrive (source tells a key from a touch
 * button, so letting go of one doesn't let go of another holding the same control); frame(sample) once a frame:
 *   sample: { route, pad: { turn, thrust, look, zoom, held: Set } | null, touch: { turn, thrust }, tilt: { turn, thrust } }
 * returns { route, [action]: { value, held, pressed, released } }.
 */
export function createInput() {
  const holding = new Map(); // `${source}|${control}` → control
  const pending = { pressed: new Set(), released: new Set() };
  let padPrev = new Set(), padRoute = null, was = { forward: false, side: 0, back: false };
  const heldBy = (c) => { for (const v of holding.values()) if (v === c) return true; return false; };

  function press(control, source = "key") {
    if (!control) return;
    const id = `${source}|${control}`;
    if (holding.has(id)) return; // a key's auto-repeat
    if (!heldBy(control)) pending.pressed.add(control);
    holding.set(id, control);
  }
  function release(control, source = "key") {
    const id = `${source}|${control}`;
    if (!holding.delete(id)) return;
    if (!heldBy(control)) pending.released.add(control);
  }
  /** Everything up (the window lost focus, so its keyups will never come). */
  function releaseAll() {
    for (const c of new Set(holding.values())) pending.released.add(c);
    holding.clear();
  }

  function frame({ route = "world", pad = null, touch = null, tilt = null } = {}) {
    // The pad's buttons become controls by route; its edges are against the last frame read under the same route, so a
    // button held while a menu closes doesn't press again in the world.
    const map = route === "menu" ? PAD_MENU : route === "ring" ? PAD_RING : PAD_WORLD;
    const now = pad?.held ?? new Set();
    const prev = padRoute === route ? padPrev : now;
    const padHeld = new Set(), padPressed = new Set(), padReleased = new Set();
    for (const [b, c] of Object.entries(map)) {
      if (now.has(b)) padHeld.add(c);
      if (now.has(b) && !prev.has(b)) padPressed.add(c);
      if (!now.has(b) && prev.has(b)) padReleased.add(c);
    }
    padPrev = now; padRoute = route;

    const ctl = (c) => {
      const held = heldBy(c) || padHeld.has(c);
      return act(0, held, pending.pressed.has(c) || padPressed.has(c), !held && (pending.released.has(c) || padReleased.has(c)));
    };
    // "On" for a frame: held, or tapped since the last frame.
    const on = (c) => { const a = ctl(c); return a.held || a.pressed; };

    // Axes: keys first, then the touch stick, the pad, and tilt.
    const keyTurn = (on("right") ? 1 : 0) - (on("left") ? 1 : 0), keyThrust = (on("fwd") ? 1 : 0) - (on("back") ? 1 : 0);
    const d = route === "menu" ? { turn: 0, thrust: 0 } : dpad(now);
    const padTurn = route === "menu" ? 0 : (pad?.turn || pad?.look || d.turn || 0);
    const padThrust = route === "menu" ? 0 : (pad?.thrust || d.thrust || 0);
    const turn = keyTurn || touch?.turn || padTurn || tilt?.turn || 0;
    const thrust = keyThrust || touch?.thrust || padThrust || tilt?.thrust || 0;
    const zoom = (route === "menu" ? 0 : pad?.zoom || 0) + (on("farther") ? 1 : 0) - (on("nearer") ? 1 : 0);

    const it = intent(turn, thrust);
    const edges = { forward: it.forward && !was.forward, side: it.side !== 0 && it.side !== was.side, back: it.back && !was.back };
    const gone = { side: it.side === 0 && was.side !== 0 };
    was = it;

    const up = ctl("up"), down = ctl("down");
    const out = { route };
    for (const a of ACTIONS) out[a] = act();
    out.touch = ctl("touch");
    out.picture = ctl("picture");
    out.menus = ctl("menus");
    out.escape = ctl("escape");
    out.zoom = act(zoom, zoom !== 0);

    if (route === "menu") {
      for (const n of ["navUp", "navDown", "navLeft", "navRight"]) out[n] = ctl(n);
      out.go = ctl("go");
      out.letGo = ctl("letGo");
    } else if (route === "ring") {
      // Choosing a lane: the stick's sideways intent, or a key (a tap shorter than a frame still picks).
      out.turn = act(it.side, it.side !== 0, edges.side, gone.side);
      const goB = ctl("go"), offB = ctl("letGo");
      out.go = act(it.forward || goB.held ? 1 : 0, it.forward || goB.held, edges.forward || goB.pressed);
      const letGo = up.pressed || down.pressed || offB.pressed;
      out.letGo = act(letGo ? 1 : 0, up.held || down.held || offB.held, letGo);
    } else if (route === "ride") {
      out.turn = act(turn, turn !== 0);
      out.thrust = act(thrust, thrust !== 0);
      out.letGo = act(down.held || it.back ? 1 : 0, down.held || it.back, down.pressed || edges.back);
    } else {
      out.turn = act(turn, turn !== 0);
      out.thrust = act(thrust, thrust !== 0);
      out.up = { ...up, value: up.held || up.pressed ? 1 : 0 };
      out.down = { ...down, value: down.held || down.pressed ? 1 : 0 };
    }
    pending.pressed.clear();
    pending.released.clear();
    return out;
  }

  return { press, release, releaseAll, frame, held: () => [...new Set(holding.values())] };
}
