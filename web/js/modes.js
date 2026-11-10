// The creature's modes, made explicit (11-10: Jason, after a search for implicit state machines: "Let's do it!").
// What the creature is doing used to live in separate fields: a ride, a ring, a dream, a trip, a regrow. Every feature
// checked its own subset of them, and two transitions nobody designed got through (travelling while dreaming kept the
// dream; a ride boarded from a ring "arrived" at once). Here is the one table: the travel states, the events that move
// between them, and what each state allows. main.js keeps each state's data (the ride, the ring, the dream) and asks
// this module before it changes state. Pure, so Node can test it, properties and all.
//
// Two more regions run alongside travel, independently: what's over the world (nothing, a menu, the creature editor)
// and how far the camera is (near, far, the globe). A statechart, not one flat list: a menu can be open on a ride.

/** Where the creature is, what it's doing: walking the world, on a trip you tapped for, held in a ley node's ring,
 *  riding a highway, in a dream, or travelling (the world regrowing round you after a ride or a jump). */
export const TRAVEL = ["world", "trip", "ring", "ride", "dream", "travelling"];

/** Each state's events and where they lead. An event missing from a state is refused. */
export const TRANSITIONS = {
  world: { trip: "trip", enterStones: "ring", board: "ride", dream: "dream", travel: "travelling" },
  trip: { arrive: "world", cancel: "world", trip: "trip", enterStones: "ring", board: "ride", dream: "dream", travel: "travelling" },
  // The ring is left only by a lane, letting go, or a jump elsewhere: no tapping onto a highway from inside it.
  ring: { takeLane: "ride", letGo: "world", travel: "travelling" },
  ride: { hop: "ride", leave: "travelling", travel: "travelling" },
  // Travelling from a dream wakes you first (main.js does the waking).
  dream: { wake: "world", travel: "travelling" },
  // A regrow ends on the ground, or held in the ring of the node you arrived at.
  travelling: { land: "world", holdInRing: "ring", travel: "travelling" },
};

/** Where an event leads from a state, or null if it's refused there. */
export const next = (state, event) => TRANSITIONS[state]?.[event] ?? null;

/**
 * The travel state the data describes: { state, conflict }. data: { ride (with .leaving), gate, realm, target,
 * travelling }. conflict lists the states when more than one is set (it should never be; main.js counts it).
 */
export function travelOf({ ride = null, gate = null, realm = null, target = null, travelling = null } = {}) {
  const on = [];
  if (realm) on.push("dream");
  if (gate) on.push("ring");
  if (ride && !ride.leaving) on.push("ride");
  if ((ride && ride.leaving) || travelling) on.push("travelling");
  if (!on.length) return { state: target ? "trip" : "world", conflict: null };
  return { state: on[0], conflict: on.length > 1 ? on : null };
}

/** The camera's region: near enough to touch things, far, or out at the globe. */
export const viewOf = (zoom, reachZoom, globeAt) => (zoom > globeAt ? "globe" : zoom >= reachZoom ? "far" : "near");

const IN = (...s) => new Set(s);
/** Which travel states allow each thing. */
export const ALLOW = {
  reach: IN("world", "trip"), // the glints, the prompt, E touching what glints
  tap: IN("world", "trip"), // tap to go, tap to touch (a dream says to walk instead)
  globeTap: IN("world", "trip", "ring"), // a dot on the globe: travel there
  capture: IN("world"), // flying along a highway takes you (not on a trip you tapped for, or anywhere else)
  regrowFar: IN("world", "trip"), // walking far regrows the world round you
  pigeon: IN("world", "trip"), // a pigeon may land by you
  travel: IN("world", "trip", "ring", "ride", "dream"), // the atlas, a portal, a cairn, the globe
};

/**
 * Whether a thing is allowed now. snap: { travel, overlay ("none" | "sheet" | "editor"), view ("near" | "far" |
 * "globe"), ready (a world is built and not regrowing) }.
 */
export function can(snap, what) {
  if (!ALLOW[what]?.has(snap.travel)) return false;
  if (!snap.ready && what !== "travel") return false;
  if (what === "reach") return snap.view === "near" && snap.overlay !== "editor";
  if (what === "tap") return snap.view !== "globe";
  if (what === "globeTap") return snap.view === "globe";
  return true;
}

/** The states reachable from a state (for tests: every state must have a way back to the world). */
export function reachable(from) {
  const seen = new Set([from]), todo = [from];
  while (todo.length) for (const to of Object.values(TRANSITIONS[todo.pop()])) if (!seen.has(to)) { seen.add(to); todo.push(to); }
  return seen;
}
