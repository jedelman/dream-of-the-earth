// Gamepads (Jason, 11-09: "Then let's build in gamepad support."). The browser's Gamepad API, standard mapping (an Xbox,
// PlayStation or Switch Pro pad all read the same way): polled each frame, read here into what the game wants. Pure, so
// Node can test it; main.js does the polling and the acting.
//   left stick   move and turn (so does the D-pad, outside the menus: in a ley node's ring it picks the lane, up sets off)
//   right stick  turn (x); the camera nearer or farther (y)
//   A            jump; with Wings, take off and climb (and, held in a ley node's ring, set off)
//   B            crouch; flying, go down; on a highway, step off (in a ring, let go; in a menu, close it)
//   X            touch what glints (E)  Y             take a picture (P)
//   LB / RB      the camera farther / nearer
//   Start        into the menus (again to leave); in a menu the D-pad walks it, A presses, B closes
//   Back / Select  Escape (shake off spells, wake from a dream, close a menu)
// (11-10: the D-pad used to walk the menus even in the world, so "left" in a ring wandered onto the bar and the next A
// pressed a menu button, say ATLAS and its first Go, instead of setting off. Jason: "when I try to turn left at a ley
// node it either sends me to another one or reloads the current one".)

/** Stick travel below this reads as nothing (worn sticks rest a little off centre). */
export const DEAD = 0.18;
/** The standard mapping's buttons, by name. */
export const BUTTONS = ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "back", "start", "ls", "rs", "up", "down", "left", "right", "home"];

/** A stick axis past the dead zone, rescaled so it still runs 0 to 1. */
export function shape(v) {
  const a = Math.abs(v || 0);
  return a < DEAD ? 0 : (Math.sign(v) * (a - DEAD)) / (1 - DEAD);
}

/**
 * One pad, read: { turn, thrust, look, zoom, held: Set of button names down now, down: Set of those newly down since
 * prevHeld, active: anything moved or pressed }. pad: { axes, buttons: [{ pressed, value }] }; turn is -1 (left) to 1,
 * thrust 1 forward; look is the right stick's turn; zoom is >0 for farther, <0 for nearer.
 */
export function readPad(pad, prevHeld = new Set()) {
  const ax = (i) => shape(pad.axes?.[i] ?? 0);
  const held = new Set();
  BUTTONS.forEach((name, i) => { const b = pad.buttons?.[i]; if (b && (b.pressed || b.value > 0.5)) held.add(name); });
  const down = new Set([...held].filter((n) => !prevHeld.has(n)));
  const turn = ax(0), thrust = -ax(1), look = ax(2);
  const zoom = ax(3) + (held.has("lb") ? 1 : 0) - (held.has("rb") ? 1 : 0);
  return { turn, thrust, look, zoom, held, down, active: held.size > 0 || turn !== 0 || thrust !== 0 || look !== 0 || zoom !== 0 };
}

/** The D-pad as a stick (outside the menus): { turn, thrust } from the buttons held. */
export function dpadAxes(held) {
  return { turn: (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0), thrust: (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0) };
}

/** What Start does: "close" an open menu, "leave" the bar for the world, or "enter" the menus. */
export function startAction({ sheet, onBar }) {
  return sheet ? "close" : onBar ? "leave" : "enter";
}

/** The first pad that's connected and uses the standard mapping (or any, failing that), or null. */
export function firstPad(pads) {
  const list = [...(pads || [])].filter((p) => p && p.connected !== false);
  return list.find((p) => p.mapping === "standard") || list[0] || null;
}

/**
 * Which way the D-pad moves focus by where things are on screen (a menu's list, the rhizome's map): from item i, the
 * nearest one in the direction pressed, preferring those straight ahead; i itself if there's none that way. With nothing
 * focused yet (i < 0), the first in reading order. rects: [{ x, y, w, h }].
 */
export function stepFocusSpatial(rects, i, dir) {
  if (!rects.length) return -1;
  const mid = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  if (i < 0 || i >= rects.length) {
    let best = 0;
    rects.forEach((r, k) => { const a = mid(rects[best]), b = mid(r); if (b.y < a.y - 4 || (Math.abs(b.y - a.y) <= 4 && b.x < a.x)) best = k; });
    return best;
  }
  const [ux, uy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] ?? [0, 0];
  const c = mid(rects[i]);
  let best = i, bestS = Infinity;
  rects.forEach((r, k) => {
    if (k === i) return;
    const p = mid(r), dx = p.x - c.x, dy = p.y - c.y, along = dx * ux + dy * uy, across = Math.abs(dx * uy - dy * ux);
    if (along <= 2) return; // not that way
    const score = along + 2 * across;
    if (score < bestS) { bestS = score; best = k; }
  });
  return best;
}

/**
 * Which way the D-pad moves focus through a list of n things from index i (−1: nothing focused yet): left/up go back,
 * right/down forward, wrapping round.
 */
export function stepFocus(i, n, dir) {
  if (n <= 0) return -1;
  const d = dir === "left" || dir === "up" ? -1 : 1;
  if (i < 0) return d > 0 ? 0 : n - 1;
  return (i + d + n) % n;
}
