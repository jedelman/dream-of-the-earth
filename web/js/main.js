// Dream of the Earth, single-player: a low-poly piece of the real Earth near a
// ley node, its real sun, the golden highways you can ride, and one creature.
import * as THREE from "three";
import { makeFrame, offset, vecToLatLon } from "./geo.js";
import { network, nearestNode, CLASSES } from "./ley.js";
import { sunPosition, sunDirection } from "./sun.js";
import { mulberry32, hashString } from "./rng.js";
import { generateCreature } from "./creature-graph.js";
import { buildCreature } from "./creature.js";
import { buildTerrain } from "./terrain.js";
import { buildSea } from "./water.js";
import { buildGlobe } from "./globe.js";
import { buildHighways } from "./highways.js";
import { buildRideFx, LEY_ALT } from "./ridefx.js";
import { chooseCapture, startRide, advance, rideLatLon, remainingMeters, hop, crossings, tangentEN, highwayAltitude, captureRadius, lineAt, lineCount, linesNear } from "./ride.js";
import { buildSkyShader, skyColors, layerTransparent, TRANSPARENT_LAYER } from "./skyshader.js";
import { curveUniform, curved, TWO_R } from "./curvature.js";
import { planPath } from "./pathfind.js";
import { RANGE, treeLine, butterflyLine, beingLine, selfLine, highwayLine, creatureName, promptFor, chooseFocus, glinting, cairnLine, ago } from "./interactions.js";
import { buildGlints } from "./glints.js";
import { buildCairns } from "./cairns.js";
import { discover, discoverWorld, didOf, handlesOf, getRecord, currentIntents, visibleAmong, setMuted } from "./atproto.js";
import { makeIntent, parseIntent, driftOf, whereAt, INTENT_NSID, HEARTBEAT_S, STALE_S } from "./intents.js";
import { listen } from "./presence.js";
import { buildFlock } from "./flock.js";
import { makeCairn, parseArtifact, renew, fadeOf, MOON_S, cairnForm, byDistance, metresBetween, distanceText, NSID as ARTIFACT_NSID } from "./artifacts.js";
import { account, isReturning, takeReturn } from "./account.js";
import { buildMaker } from "./maker.js";
import { sound } from "./sound.js";
import { logLine } from "./eventlog.js";
import { buildBursts } from "./bursts.js";
import { buildDirector, squeakShot, treeShot, butterflyShot, beingShot, arriveShot, boardShot, cairnShot } from "./director.js";
import { buildSkyBeings } from "./skybeings.js";
import { randomStats, parseStats, speeds, STATS, MAX } from "./stats.js";
import { biomeFor, koppenCode } from "./biome.js";
import { koppenAt } from "./koppen.js";
import { buildPlants } from "./plants.js";
import { buildInsects } from "./insects.js";
import { LANDMARKS, landmarkQuery } from "./landmarks.js";
import { governDetail, median, DETAIL_MIN, DETAIL_MAX } from "./detail.js";

// ---- Who and where (URL params make any spawn reproducible) ----
const params = new URLSearchParams(location.search);
// Back from signing in with Bluesky: the page reloaded at its bare address, so put back where you were.
if (isReturning()) { const back = takeReturn(); if (back) for (const [k, v] of new URLSearchParams(back)) params.set(k, v); }
const seedParam = params.get("seed");
const seed = seedParam ? (/^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : hashString(seedParam)) : (Math.random() * 2 ** 32) >>> 0;
// Separate streams, so choosing your stats doesn't move your spawn.
const spawnRand = mulberry32(hashString(`spawn:${seed}`));
const stats = parseStats(params.get("stats")) || randomStats(mulberry32(hashString(`stats:${seed}`)));
const sp = speeds(stats);
// The clock: the real one, or from ?t= (or a landmark) onward. Sun, clouds and sky beings all follow it.
const clock = { base: params.get("t") ? Date.parse(params.get("t")) / 1000 : Date.now() / 1000, at: 0 };
const unixAt = (sessionSeconds) => clock.base + (sessionSeconds - clock.at);

let spawn;
if (params.get("lat") && params.get("lon")) {
  spawn = { lat: Number(params.get("lat")), lon: Number(params.get("lon")) };
} else {
  // Map tiles stop near ±85° latitude, so polar nodes (two gravity-wells nodes sit
  // on the poles) aren't spawn points until there's polar ground data.
  const nodes = network().nodes.filter((n) => Math.abs(n.lat) <= 80);
  const node = nodes[Math.floor(spawnRand() * nodes.length)];
  spawn = offset(node.lat, node.lon, spawnRand() * 360, 2000 + spawnRand() * 3000);
}

// ---- Renderer: a small internal picture, scaled up with hard pixels ----
const canvas = document.getElementById("view");
// Logarithmic depth: the scene runs from a creature a few metres away to land
// hundreds of kilometres off at the horizon.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power", logarithmicDepthBuffer: true });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xff9ec7, 2500, 22000);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 1500000);
function resize() {
  const H = 224, W = Math.max(160, Math.round((H * innerWidth) / innerHeight));
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const hemi = new THREE.HemisphereLight(0xb9a8ff, 0x3a2a55, 1.2);
const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
scene.add(hemi, sunLight, sunLight.target);
// Lit things that fade (cairns) draw in the transparent pass, after the sky, so the light reaches there too.
for (const l of [hemi, sunLight]) l.layers.enable(TRANSPARENT_LAYER);
// The sky and its clouds are one shader pass over the opaque world (skyshader.js).
const skyPass = buildSkyShader();
const sea = buildSea(); // rings around the camera, out past the horizon
scene.add(sea.mesh);
layerTransparent(sea.mesh);
// A sparkle on you, for when the camera is far away.
const markerGeo = new THREE.BufferGeometry();
markerGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
const marker = new THREE.Points(markerGeo, new THREE.PointsMaterial({ color: 0xfff3b0, size: 6, sizeAttenuation: false, depthTest: false, transparent: true, fog: false }));
marker.renderOrder = 10;
marker.frustumCulled = false;
scene.add(marker);
layerTransparent(marker);
const rideFx = buildRideFx();
rideFx.group.visible = false;
scene.add(rideFx.group);
layerTransparent(rideFx.group);

// ---- The creature ----
const graph = generateCreature(seed);
const creature = buildCreature(graph, stats);
// Where it looks from: just in front of its eyes (or its head, or the front of its body), in its own units.
const eyeLocal = (() => {
  const eyes = graph.parts.filter((p) => p.kind === "eye"), heads = graph.parts.filter((p) => p.kind === "head");
  const src = eyes.length ? eyes : heads;
  if (!src.length) { const b = graph.parts.find((p) => p.kind === "body"); return new THREE.Vector3(0, (b?.size[1] ?? 3) * 0.4, -(b?.size[2] ?? 5) * 0.6 - 0.5); }
  const avg = (k) => src.reduce((n, p) => n + p.pos[k], 0) / src.length;
  return new THREE.Vector3(avg(0), avg(1) + 0.2, Math.min(...src.map((p) => p.pos[2] - (p.size?.[2] ?? 1))) - 0.6);
})();
/** How see-through the creature is (1 = solid). Translucent, it draws after the sky, or the sky pass would paint over it. */
let creatureOpacity = 1;
function fadeCreature(o) {
  if (Math.abs(o - creatureOpacity) < 0.004) return;
  const was = creatureOpacity < 1, now = o < 0.999;
  creatureOpacity = now ? o : 1;
  creature.group.traverse((m) => {
    if (m.isPoints) m.visible = creatureOpacity > 0.5; // its gleam sparkles: from inside its head they'd fill the view
    if (!m.isMesh) return;
    if (was !== now) { m.material.transparent = now; m.material.depthWrite = !now; m.material.needsUpdate = true; m.layers.set(now ? TRANSPARENT_LAYER : 0); }
    m.material.opacity = creatureOpacity;
  });
}
scene.add(creature.group);
layerTransparent(creature.group);
// The camera is run by a director (director.js): framing by what you're doing, and shots for what happens.
const director = buildDirector(camera);
let sunInfo = { dir: null, gold: 0 };
const establishing = () => director.play("arrive", simT, arriveShot(state.heading, cameraRig(), 3.5), { dur: 3.5, blendIn: 0, blendOut: 1.4, start: true });
// ?heading= (degrees clockwise from north) and ?alt= (metres above the ground
// or sea) make a view reproducible.
const headingParam = params.get("heading"), altParam = params.get("alt");
const state = { pos: new THREE.Vector3(), heading: headingParam !== null ? (-Number(headingParam) * Math.PI) / 180 : spawnRand() * Math.PI * 2, speed: 0, vy: 0, mode: "air", ride: null, captureCooldown: 0, hopCooldown: 0 };

// ---- The world around us (rebuilt as we travel) ----
// Only the newest request may swap in, so a slow regrow can't land after a
// newer one (say, after a ride).
let world = null, rebuilding = false, worldToken = 0;
async function buildWorld(lat, lon) {
  const frame = makeFrame(lat, lon);
  const terrain = await buildTerrain(frame, lat, lon);
  const highways = buildHighways(frame, terrain.heightAt);
  const beings = buildSkyBeings(frame, terrain.heightAt);
  const plants = buildPlants(frame, terrain);
  const insects = buildInsects(frame, terrain);
  const group = new THREE.Group();
  group.add(terrain.mesh, highways.group, beings.group, plants.group, insects.group);
  layerTransparent(group); // glows, sparkles and fireflies draw after the sky
  return { frame, terrain, highways, beings, plants, insects, group };
}
function swapWorld(next, place) {
  if (place) {
    const p = next.frame.toLocal(place.lat, place.lon);
    state.pos.set(p.x, place.y, p.z);
  } else if (world) {
    const ll = world.frame.toLatLon(state.pos.x, state.pos.z);
    const p = next.frame.toLocal(ll.lat, ll.lon);
    state.pos.x = p.x; state.pos.z = p.z;
  }
  if (world) {
    scene.remove(world.group);
    // Plant shapes are shared between worlds; only their instance buffers go.
    world.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (!o.userData.sharedGeometry) o.geometry?.dispose();
    });
  }
  world = next;
  scene.add(world.group);
  skyPass.setWorld(world.terrain); // the land the clouds ride over
}
function regrow(lat, lon, onReady) {
  const token = ++worldToken;
  rebuilding = true;
  return buildWorld(lat, lon)
    .then((w) => { if (token === worldToken) onReady(w); })
    .catch((e) => { setStatus(`the dream couldn't regrow here: ${e.message}`); console.error(e); })
    .finally(() => { if (token === worldToken) rebuilding = false; });
}

// ---- Detail: how far forests reach, found per device (or pinned with ?detail=) ----
const detailParam = params.get("detail");
const detail = { scale: detailParam ? Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Number(detailParam))) : DETAIL_MAX, pinned: !!detailParam, times: [], since: 0, fps: 0 };
function meterFrame(dtMs, t, governing) {
  detail.times.push(dtMs);
  if (t - detail.since < 1.5) return;
  const m = median(detail.times);
  detail.fps = Math.round(1000 / Math.max(1, m));
  if (governing && !detail.pinned) detail.scale = governDetail(detail.scale, m);
  detail.times = [];
  detail.since = t;
}

// ---- Zoom: from just behind you out to the whole planet ----
// Below GLOBE_AT the camera orbits in the world; beyond it, the globe.
const ZOOM_MIN = 15, ZOOM_MAX = 4e7, GLOBE_AT = 400000;
let zoom = params.get("zoom") ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(params.get("zoom")))) : 85;
const zoomBy = (factor) => { zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor)); };
canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0018)); }, { passive: false });
const globe = buildGlobe();

// ---- Input: keyboard, plus a touch stick and up/down buttons ----
const keys = new Set();
const typing = (e) => e.target instanceof Element && e.target.closest("input, textarea");
addEventListener("keydown", (e) => {
  if (typing(e)) return; // writing a note, not flying
  keys.add(e.code);
  sound.unlock();
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyM" && !e.repeat) logLine(sound.toggle() ? "Sound off." : "Sound on.", "note");
  if (e.code === "KeyE" && !e.repeat) interact();
});
addEventListener("keyup", (e) => keys.delete(e.code));
const touch = { turn: 0, thrust: 0, up: 0, id: null, x: 0, y: 0 };
// Two fingers pinch to zoom; one finger steers.
const pointers = new Map();
let pinchFrom = 0;
const pinchDistance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
// A quick tap (or click) that doesn't drag: go there.
let tapStart = null;
canvas.addEventListener("pointerdown", (e) => {
  sound.unlock();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  tapStart = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
  if (pointers.size === 2) { pinchFrom = pinchDistance(); touch.id = null; touch.turn = touch.thrust = 0; return; }
  touch.id = e.pointerId; touch.x = e.clientX; touch.y = e.clientY;
});
canvas.addEventListener("pointermove", (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const d = pinchDistance();
    if (pinchFrom > 0 && d > 0) zoomBy(Math.pow(pinchFrom / d, 1.6));
    pinchFrom = d;
    return;
  }
  if (e.pointerId !== touch.id) return;
  if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 12) tapStart = null;
  if (tapStart) return; // not steering until it's a drag
  touch.turn = Math.max(-1, Math.min(1, (e.clientX - touch.x) / 70));
  touch.thrust = Math.max(-1, Math.min(1, -(e.clientY - touch.y) / 70));
});
const endTouch = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchFrom = 0;
  if (e.pointerId === touch.id) { touch.id = null; touch.turn = touch.thrust = 0; }
};
canvas.addEventListener("pointerup", (e) => {
  const tap = tapStart && tapStart.id === e.pointerId && performance.now() - tapStart.t < 400;
  tapStart = null;
  endTouch(e);
  if (tap) onTap(e.clientX, e.clientY);
});
canvas.addEventListener("pointercancel", endTouch);
for (const [id, v] of [["up", 1], ["down", -1]]) {
  const b = document.getElementById(id);
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); touch.up = v; });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { if (touch.up === v) touch.up = 0; });
}
function input() {
  const k = (...c) => c.some((x) => keys.has(x));
  return {
    turn: (k("KeyD", "ArrowRight") ? 1 : 0) - (k("KeyA", "ArrowLeft") ? 1 : 0) || touch.turn,
    thrust: (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0) || touch.thrust,
    up: (k("Space") ? 1 : 0) - (k("ShiftLeft", "ShiftRight") ? 1 : 0) || touch.up,
  };
}

// ---- Movement: fly, run, swim; the stats set the numbers ----
const GRAVITY = 18;
function step(dt) {
  const manual = input();
  if (manual.turn || manual.thrust || manual.up) { director.input(simT); if (state.target) clearTarget(); } // your hands back on the controls
  const { turn, thrust, up } = (!manual.turn && !manual.thrust && !manual.up && autopilot()) || manual;
  const ground = world.terrain.heightAt(state.pos.x, state.pos.z);
  const p = state.pos;
  state.heading -= turn * 1.7 * dt;

  if (p.y <= 0 && ground < 0) state.mode = "water";
  else if (p.y <= ground + 0.3 && ground >= 0) state.mode = "ground";
  else state.mode = "air";

  const max = state.mode === "air" ? sp.fly : state.mode === "water" ? sp.swim : sp.run;
  let target = thrust > 0 ? max * thrust : thrust < 0 ? -0.3 * max : 0;
  if (state.mode === "air" && stats.fly === 0) target = Math.max(target, 0.6 * sp.fly); // a glide, not a hover
  state.speed += (target - state.speed) * Math.min(1, dt * 1.8);

  if (state.mode !== "air" || up !== 0) state.clear = null;
  if (state.mode === "air") {
    if (stats.fly > 0) {
      let vyTarget = up > 0 ? sp.climb : up < 0 ? -sp.climb * 1.6 : 0;
      if (up === 0) {
        // Hands off the climb: keep the clearance you let go at (4 to 30 m) over the land ahead,
        // so rising ground lifts you instead of landing you. Higher up, you keep your altitude.
        const hx = -Math.sin(state.heading), hz = -Math.cos(state.heading), look = Math.max(0, state.speed) * 1.2;
        const ahead = Math.max(0, ground, world.terrain.heightAt(p.x + hx * look * 0.5, p.z + hz * look * 0.5), world.terrain.heightAt(p.x + hx * look, p.z + hz * look));
        if (state.clear == null) state.clear = Math.min(30, Math.max(4, p.y - Math.max(0, ground)));
        const short = ahead + state.clear - p.y;
        if (short > 0) vyTarget = Math.min(sp.climb + 0.3 * Math.max(0, state.speed), short * 1.5);
      }
      state.vy += (vyTarget - state.vy) * Math.min(1, dt * 3);
    } else {
      state.vy = Math.max(state.vy - GRAVITY * dt, -sp.glideSink); // zero fly: glide down
    }
  } else if (state.mode === "ground") {
    state.vy = up > 0 ? sp.jump : 0;
  } else {
    const vyTarget = up > 0 ? sp.swim : up < 0 ? -sp.dive : 0.4;
    state.vy += (vyTarget - state.vy) * Math.min(1, dt * 3);
  }

  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  p.x += fx * state.speed * dt;
  p.z += fz * state.speed * dt;
  p.y += state.vy * dt;

  const g2 = world.terrain.heightAt(p.x, p.z);
  if (state.mode === "water") {
    if (p.y > -1.5 && !(up > 0 && stats.fly > 0)) { p.y = -1.5; state.vy = Math.min(state.vy, 0); } // float at the surface
    if (p.y < g2 + 2) p.y = g2 + 2;
  }
  // Land only on purpose: a flyer not heading down skims a slope too steep to climb, still flying.
  if (g2 >= 0 && p.y < g2) { p.y = state.mode === "air" && stats.fly > 0 && up >= 0 ? g2 + 0.5 : g2; state.vy = Math.max(0, state.vy); }
  if (g2 < 0 && p.y < g2 + 2) p.y = g2 + 2;

  // Pillars of light at the nodes lift any creature up to the ring, wings or not.
  for (const pl of world.highways.pillars) {
    if (Math.hypot(p.x - pl.x, p.z - pl.z) > 300) continue;
    if (p.y < pl.top) p.y = Math.min(pl.top, p.y + 160 * dt);
    else if (up <= 0) p.y = pl.top;
    state.vy = 0;
    state.mode = "air";
    break;
  }

  // Fly along a highway, inside its ribbon, and it takes you.
  state.captureCooldown -= dt;
  if (state.captureCooldown <= 0 && state.speed > 5 && !state.target) { // not on a trip you tapped for: a highway you cross shouldn't take you
    const ll = world.frame.toLatLon(p.x, p.z);
    const c = chooseCapture(ll.lat, ll.lon, { e: fx, n: -fz });
    if (c && Math.abs(p.y - highwayAltitude(world.terrain.heightAt(p.x, p.z))) < captureRadius(c.line.cls.rank)) boardRide(c);
  }

  // Travel far enough and the world is regrown around us.
  if (!rebuilding && !state.ride && Math.hypot(p.x, p.z) > 15000) {
    const ll = world.frame.toLatLon(p.x, p.z);
    setStatus("the dream shifts…");
    regrow(ll.lat, ll.lon, (w) => { swapWorld(w); setStatus(""); });
  }
}

// ---- Riding the highways (ley-space) ----
function boardRide(c) {
  clearTarget();
  state.ride = startRide(c);
  director.play("board", simT, boardShot(), { dur: 1.2, blendIn: 0.15, blendOut: 0.9 });
  sound.whoosh();
  logLine(highwayLine(c.line.cls.name, remainingMeters(state.ride) / 1000), "highway");
  state.hopCooldown = 0.8;
  world.group.visible = false;
  rideFx.group.visible = true;
  setStatus("");
}
function rideStep(dt) {
  const r = state.ride;
  if (r.leaving) return;
  const { turn, thrust, up } = input();
  state.hopCooldown -= dt;
  if ((up < 0 || thrust < 0) && r.age > 0.6) return leaveRide(false);
  if (turn !== 0 && state.hopCooldown <= 0) {
    const h = hop(r, turn);
    if (h) { state.ride = h; state.hopCooldown = 1.2; return; }
  }
  advance(r, dt);
  if (r.done) leaveRide(true);
}
function leaveRide(arrived) {
  const r = state.ride;
  r.leaving = true;
  r.speed = 0;
  const ll = rideLatLon(r);
  const tg = tangentEN(r.line, r.t, r.dir);
  setStatus(arrived ? "a node · the dream regrows…" : "the dream regrows…");
  regrow(ll.lat, ll.lon, (w) => {
    swapWorld(w, { lat: ll.lat, lon: ll.lon, y: highwayAltitude(w.terrain.heightAt(0, 0)) });
    state.ride = null;
    state.heading = Math.atan2(-tg.e, tg.n);
    state.speed = 0;
    state.vy = 0;
    state.captureCooldown = 3; // don't get snatched straight back onto the line
    world.group.visible = true;
    rideFx.group.visible = false;
    establishing();
    setStatus(arrived ? `you're at a node: ${nodeName(ll)}` : "");
    logLine(arrived ? `You arrive at a node: ${nodeName(ll)}.` : "You step off the highway.", "highway");
    if (arrived) setTimeout(() => setStatus(""), 4000);
  });
}
// ---- Landmarks: the HUD's menu carries you anywhere in the list ----
const places = document.getElementById("places");
for (const [i, l] of LANDMARKS.entries()) places.add(new Option(l.name, String(i)));
places.addEventListener("change", () => {
  const l = LANDMARKS[Number(places.value)];
  places.blur(); // give the keys back to flying
  if (l) teleport(l);
});
function teleport(l) {
  clearTarget();
  if (state.ride) { state.ride = null; rideFx.group.visible = false; if (world) world.group.visible = true; }
  if (l.t) { clock.base = Date.parse(l.t) / 1000; clock.at = (performance.now() - t0) / 1000; lastSun = -Infinity; }
  zoom = l.zoom ?? 85;
  if (l.heading !== undefined) state.heading = (-l.heading * Math.PI) / 180;
  state.speed = 0; state.vy = 0; state.captureCooldown = 3;
  setStatus(`the dream carries you to ${l.name.split(" · ")[0]}…`);
  logLine(`The dream carries you to ${l.name.split(" · ")[0]}.`, "note");
  regrow(l.lat, l.lon, (w) => {
    const p = w.frame.toLocal(l.lat, l.lon);
    swapWorld(w, { lat: l.lat, lon: l.lon, y: Math.max(0, w.terrain.heightAt(p.x, p.z)) + (l.alt ?? 350) });
    establishing();
    history.replaceState(null, "", `?${landmarkQuery(l, location.search)}`);
    setStatus("");
  });
}

function nodeName(ll) {
  const { node } = nearestNode(ll.lat, ll.lon);
  return CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
}

// ---- Tap to move and to touch things: find what's under a tap, go there, and when you're
// close enough it answers: trees shake, creatures squeak, sky beings hum, highways take you ----
const tapRay = new THREE.Raycaster();
const myName = creatureName(seed);
const bursts = buildBursts(scene);
let simT = 0, hopAt = -10, squeaks = 0, hums = 0, shareTickAt = 0;
const shaken = new Map(); // how often each tree's been shaken, so it can say something new
function aimTap(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  tapRay.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
  return r;
}
/** The ground (or sea surface) along the tap ray, on the curved Earth: { x, z, h, t } or null. */
function groundAt() {
  const o = tapRay.ray.origin, d = tapRay.ray.direction;
  // The surface as drawn: real height, dropped by d²/2R from the eye.
  const below = (t) => {
    const x = o.x + d.x * t, z = o.z + d.z * t, dx = x - camera.position.x, dz = z - camera.position.z;
    return o.y + d.y * t <= Math.max(0, world.terrain.heightAt(x, z)) - (dx * dx + dz * dz) / TWO_R;
  };
  let t0 = 0, t = 2;
  for (let i = 0; i < 600 && t < 60000; i++) {
    if (below(t)) {
      for (let k = 0; k < 12; k++) { const m = (t0 + t) / 2; if (below(m)) t = m; else t0 = m; }
      const x = o.x + d.x * t, z = o.z + d.z * t;
      return { x, z, h: world.terrain.heightAt(x, z), t };
    }
    t0 = t;
    t += Math.max(3, t * 0.02);
  }
  return null;
}
/** A highway glowing along the tap ray (before it reaches the ground): { t, x, z, alt, line } or null. */
function highwayAt() {
  const o = tapRay.ray.origin, d = tapRay.ray.direction;
  for (let t = 20, i = 0; i < 500 && t < 40000; i++, t += Math.max(10, t * 0.015)) {
    const x = o.x + d.x * t, z = o.z + d.z * t, dx = x - camera.position.x, dz = z - camera.position.z;
    const alt = o.y + d.y * t + (dx * dx + dz * dz) / TWO_R, ground = world.terrain.heightAt(x, z);
    if (alt < Math.max(0, ground)) return null; // the land came first
    const hAlt = highwayAltitude(ground);
    if (Math.abs(alt - hAlt) > 140) continue;
    const ll = world.frame.toLatLon(x, z);
    const near = linesNear(ll.lat, ll.lon, -60); // inside the glow, not just the capture zone
    if (near.length) return { t, x, z, alt: hAlt, line: near[0].line };
  }
  return null;
}
/** What a tap touched, nearest first: your creature, a butterfly, a sky being, a tree, a highway, or the ground. */
function pick(clientX, clientY) {
  const r = aimTap(clientX, clientY), found = [], v = new THREE.Vector3();
  const me = tapRay.intersectObject(creature.group, true)[0];
  if (me) found.push({ kind: "self", d: me.distance });
  for (const b of world.insects.butterflies()) {
    v.set(b.x, b.y, b.z);
    const d = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1) continue;
    if (Math.hypot(((v.x + 1) / 2) * r.width - (clientX - r.left), ((1 - v.y) / 2) * r.height - (clientY - r.top)) < 24) found.push({ kind: "butterfly", d, b });
  }
  const bh = tapRay.intersectObject(world.beings.group, true)[0];
  if (bh) { let o = bh.object; while (o && !o.userData.being) o = o.parent; if (o) found.push({ kind: "being", d: bh.distance, being: o.userData.being, obj: o }); }
  const ch = tapRay.intersectObject(cairns.group, true)[0], ce = ch && cairns.entryOf(ch.object);
  if (ce) found.push({ kind: "artifact", d: ch.distance, entry: ce });
  const tree = world.plants.pick(tapRay);
  if (tree) found.push({ kind: "tree", d: tree.distance, rec: tree.rec });
  const hw = highwayAt();
  if (hw) found.push({ kind: "highway", d: hw.t, ...hw });
  const g = groundAt();
  if (g) found.push({ kind: "ground", d: g.t, ...g });
  found.sort((a, b) => a.d - b.d);
  return found[0] || null;
}
function onTap(clientX, clientY) {
  if (zoom > GLOBE_AT && !state.ride && !rebuilding) {
    // The globe is a map: tap a cairn's dot to go there.
    const r = canvas.getBoundingClientRect(), hit = globe.pick(clientX - r.left, clientY - r.top, r.width, r.height);
    if (hit?.cairn) travelTo(hit.cairn);
    else if (hit?.mutual) travelToMutual(hit.mutual.did);
    return;
  }
  if (!world || state.ride || zoom > GLOBE_AT || rebuilding) return;
  director.input(simT);
  const hit = pick(clientX, clientY);
  if (!hit) return;
  const p = state.pos, flat = (x, z) => Math.hypot(x - p.x, z - p.z), v = new THREE.Vector3();
  if (hit.kind === "self") return squeak();
  if (hit.kind === "tree") {
    const reach = RANGE.tree + hit.rec.height * 0.4, act = () => shakeTree(hit.rec);
    return flat(hit.rec.x, hit.rec.z) < reach ? act() : moveTo({ x: hit.rec.x, z: hit.rec.z, h: hit.rec.y + hit.rec.height * 0.9 }, { range: reach * 0.8, act });
  }
  if (hit.kind === "butterfly") {
    const b = hit.b, act = () => chirp(hit.b.k);
    return Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z) < RANGE.butterfly ? act() : moveTo({ x: b.x, z: b.z, h: b.y }, { range: RANGE.butterfly * 0.6, act });
  }
  if (hit.kind === "being") {
    hit.obj.getWorldPosition(v);
    const seed = hit.being.seed, act = () => hum(hit.being, beingObj(seed) || hit.obj);
    if (v.distanceTo(p) < RANGE.being) return act();
    logLine("The sky being is too far off to hear you. You set off after it.", "sky");
    // Sky beings drift along their lines (25 m/s), so the trip follows the being, not the spot it was in.
    const follow = () => { const o = beingObj(seed); if (!o) return null; o.getWorldPosition(v); return { x: v.x, z: v.z, h: world.terrain.heightAt(v.x, v.z), alt: v.y - 400 }; };
    return moveTo({ x: v.x, z: v.z, h: world.terrain.heightAt(v.x, v.z) }, { range: RANGE.being * 0.5, act, alt: v.y - 400, follow });
  }
  if (hit.kind === "artifact") {
    const e = hit.entry, act = () => touchCairn(e);
    return flat(e.x, e.z) < RANGE.artifact ? act() : moveTo({ x: e.x, z: e.z, h: e.y }, { range: RANGE.artifact * 0.6, act });
  }
  if (hit.kind === "highway") {
    const act = () => boardTapped(hit.line);
    return flat(hit.x, hit.z) < RANGE.highway ? act() : moveTo({ x: hit.x, z: hit.z, h: hit.alt }, { range: RANGE.highway * 0.7, act, alt: hit.alt });
  }
  moveTo(hit);
}
/** The sky being with this seed in the current world (they're rebuilt when the world regrows), or null. */
function beingObj(seed) {
  for (const o of world.beings.group.children) if (o.userData.being?.seed === seed) return o;
  return null;
}
/**
 * Set off for a point. Anything with wings flies straight; the rest find a way on foot and by water.
 * follow: () => { x, z, h, alt } | null, for a goal that moves (a sky being): flyers steer for where it is now;
 * walkers who arrive and find it gone set off again.
 */
function moveTo(hit, { range, act, alt, follow } = {}) {
  const p = state.pos, fly = stats.fly > 0;
  const pts = fly ? [{ x: hit.x, z: hit.z }] : planPath({ x: p.x, z: p.z }, hit, world.terrain.heightAt, sp);
  if (!pts) { logLine("There's no way there on foot.", "note"); return; }
  state.target = { fly, ground: Math.max(0, hit.h ?? 0), range, act, alt, follow, pts: pts.map((q) => world.frame.toLatLon(q.x, q.z)), idx: 0 };
  routeDots.visible = true;
}
function clearTarget() { if (state.target) state.target = null; routeDots.visible = false; }
/** Steering toward the next waypoint, as if from the controls: { turn, thrust, up } or null. */
function autopilot() {
  const tg = state.target;
  if (!tg || !world) return null;
  const p = state.pos, last = tg.idx === tg.pts.length - 1;
  if (tg.follow && tg.fly) {
    const f = tg.follow(); // where it is now (null when it's out of the world's reach: keep the last sighting)
    if (f) { tg.pts[tg.pts.length - 1] = world.frame.toLatLon(f.x, f.z); tg.ground = Math.max(0, f.h); if (f.alt !== undefined) tg.alt = f.alt; }
  }
  const wp = world.frame.toLocal(tg.pts[tg.idx].lat, tg.pts[tg.idx].lon);
  const dx = wp.x - p.x, dz = wp.z - p.z, dist = Math.hypot(dx, dz);
  if (!last && dist < 18) { tg.idx++; return autopilot(); }
  if (last && tg.act && dist < tg.range) {
    const f = tg.follow && !tg.fly ? tg.follow() : null;
    if (f && Math.hypot(f.x - p.x, f.z - p.z) > tg.range) { moveTo(f, { range: tg.range, act: tg.act, alt: tg.alt, follow: tg.follow }); return null; } // it moved on
    const act = tg.act; clearTarget(); act(); return null;
  }
  if (last && dist < 6) {
    // There. A flyer settles all the way down onto it (or gives up after 6 s, say over a pillar of light that holds
    // it up); then the controls are yours again.
    tg.settling ??= simT;
    if (!tg.fly || state.mode !== "air" || simT - tg.settling > 6) { clearTarget(); return null; }
    return { turn: 0, thrust: 0, up: -1 };
  }
  let diff = Math.atan2(-dx, -dz) - state.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const turn = Math.max(-1, Math.min(1, -diff * 2.5));
  const thrust = Math.abs(diff) > 1.3 ? 0.15 : Math.min(1, Math.max(0.25, (last ? dist : 300) / 60));
  let up = 0;
  if (tg.fly) {
    const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
    const ahead = Math.max(0, world.terrain.heightAt(p.x, p.z), world.terrain.heightAt(p.x + fx * 120, p.z + fz * 120));
    const cruise = tg.alt !== undefined ? Math.max(tg.alt, ahead + 70) : last && dist < 220 ? tg.ground + 2 : Math.max(ahead + 70, Math.min(p.y, ahead + 400));
    up = Math.max(-1, Math.min(1, (cruise - p.y) / 25));
  }
  return { turn, thrust, up };
}

// ---- What things do when you reach them ----
function squeak() {
  sound.squeak(1.25 / graph.scale);
  hopAt = simT;
  director.play("squeak", simT, squeakShot(state.heading, graph.scale, zoom), { dur: 2.4, blendIn: 0.4, blendOut: 0.8 });
  const at = state.pos.clone();
  at.y += 4 * graph.scale;
  bursts.emit({ at, colors: [new THREE.Color(0xff9ec7), new THREE.Color(0xfff3b0)], n: 14, spread: 2.5, up: 4, fall: 2, life: 1.2 });
  logLine(selfLine(myName, squeaks++), "creature");
}
function shakeTree(rec) {
  const n = shaken.get(rec.seed) || 0;
  shaken.set(rec.seed, n + 1);
  world.plants.shake(rec, simT, rec.species === "sequoiadendron" ? 0.008 : rec.species === "carnegiea" ? 0 : 0.06);
  director.play("tree", simT, treeShot(state.pos.clone(), rec), { dur: 4, blendIn: 0.7, blendOut: 1.1 });
  logLine(treeLine(rec.species, rec.seed, rec.blossom, n), "tree");
  if (rec.species === "carnegiea") { sound.squeak(1.7); return; } // ouch
  sound.rustle();
  const crown = new THREE.Vector3(rec.x, rec.y + rec.height * 0.75, rec.z), leaf = new THREE.Color(...rec.c);
  const fluff = rec.species === "ceiba" && !rec.blossom;
  const colors = fluff ? [new THREE.Color(0xfffaf0), new THREE.Color(0xf3ecff)] : [leaf, leaf.clone().offsetHSL(0.03, 0, 0.12)];
  bursts.emit({ at: crown, colors, n: fluff ? 30 : 22, spread: Math.max(2, rec.height * 0.3), up: 0.5, fall: fluff ? 0.5 : 1.4, life: fluff ? 7 : 5, ground: rec.y });
  if (rec.species === "cocos" || rec.species === "picea" || rec.species === "quercus") {
    sound.thud();
    bursts.emit({ at: crown, colors: [new THREE.Color(0x7a4a2a)], n: rec.species === "cocos" ? 1 : 4, spread: 2, up: 0, fall: 14, life: 4, ground: rec.y });
  }
}
function chirp(k) {
  const b = world.insects.butterflies().find((q) => q.k === k);
  if (!b) return;
  sound.chirp();
  director.play("butterfly", simT, butterflyShot(state.pos.clone(), b), { dur: 2.6, blendIn: 0.5, blendOut: 0.9 });
  bursts.emit({ at: new THREE.Vector3(b.x, b.y, b.z), colors: [new THREE.Color().setHSL(b.hue, 0.95, 0.65), new THREE.Color(0xffffff)], n: 12, spread: 1.5, up: 2, fall: 0.8, life: 1.6 });
  logLine(butterflyLine(b.hue, Math.round(b.seed * 1e6), squeaks++), "creature");
}
function hum(being, obj) {
  director.play("being", simT, beingShot(state.pos.clone(), obj.getWorldPosition(new THREE.Vector3())), { dur: 4.5, blendIn: 0.9, blendOut: 1.2 });
  humWith(being);
}
function humWith(being) {
  sound.hum();
  const at = state.pos.clone();
  at.y += 6;
  bursts.emit({ at, colors: [new THREE.Color(0xc9b6ff), new THREE.Color(0x9ef0ff)], n: 18, spread: 6, up: 1, fall: 0.4, life: 3 });
  logLine(beingLine(being.seed, hums++), "sky");
}
function boardTapped(line) {
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z);
  const c = linesNear(ll.lat, ll.lon, 3000).find((q) => q.line.i === line.i);
  if (!c) { logLine("The highway is out of reach.", "note"); return; }
  const tg = tangentEN(line, c.t, 1), fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  boardRide({ line, t: c.t, dir: tg.e * fx - tg.n * fz >= 0 ? 1 : -1 });
}
// ---- What's in reach: a glint on each, and a prompt for the likeliest, "(E) Shake the baobab" ----
const glints = buildGlints(scene);
const actBtn = document.getElementById("act"), actWhat = actBtn.querySelector(".what");
actBtn.querySelector(".key").textContent = matchMedia("(hover: hover) and (pointer: fine)").matches ? "E" : "✦";
actBtn.addEventListener("pointerdown", (e) => e.preventDefault()); // don't take focus: Space is "up"
actBtn.addEventListener("click", () => { sound.unlock(); interact(); });
const REACH_ZOOM = 2500; // zoomed out farther than this, the glints and the prompt step aside
let reach = [], lit = [], focus = null, scanAt = 0, shownPrompt = "";
const glintAt = new THREE.Vector3();
/** Everything in reach of the creature, each { kind, key, d, range, facing, ... } (see chooseFocus). */
function inReach() {
  const p = state.pos, out = [], v = new THREE.Vector3();
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  const add = (c, x, z) => {
    const dx = x - p.x, dz = z - p.z, L = Math.hypot(dx, dz);
    c.facing = L > 0.5 ? (dx * fx + dz * fz) / L : 1;
    c.phase = (hashString(c.key) % 997) / 997;
    out.push(c);
  };
  for (const rec of world.plants.near(p.x, p.z, RANGE.tree + 40)) {
    const range = RANGE.tree + rec.height * 0.4, d = Math.hypot(rec.x - p.x, rec.z - p.z); // as a tap reaches
    if (d < range) add({ kind: "tree", key: `t${rec.seed}`, species: rec.species, d, range, rec }, rec.x, rec.z);
  }
  for (const b of world.insects.butterflies()) {
    const d = Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z);
    if (d < RANGE.butterfly) add({ kind: "butterfly", key: `b${b.seed}`, seed: b.seed, k: b.k, hue: b.hue, d, range: RANGE.butterfly }, b.x, b.z);
  }
  for (const o of world.beings.group.children) {
    const being = o.userData.being;
    if (!being) continue;
    const d = o.getWorldPosition(v).distanceTo(p);
    if (d < RANGE.being) add({ kind: "being", key: `s${being.seed}`, d, range: RANGE.being, being, obj: o }, v.x, v.z);
  }
  for (const m of flock.near(p.x, p.z, RANGE.artifact)) {
    add({ kind: "mutual", key: `m${m.did}`, d: Math.hypot(m.x - p.x, m.z - p.z), range: RANGE.artifact, handle: m.handle, m }, m.x, m.z);
  }
  for (const e of cairns.near(p.x, p.z, RANGE.artifact)) {
    add({ kind: "artifact", key: `a${e.a.uri}`, d: Math.hypot(e.x - p.x, e.z - p.z), range: RANGE.artifact, entry: e, handle: e.a.handle, own: e.a.own }, e.x, e.z);
  }
  const ll = world.frame.toLatLon(p.x, p.z);
  for (const c of linesNear(ll.lat, ll.lon, RANGE.highway)) {
    const q = vecToLatLon(c.at), l = world.frame.toLocal(q.lat, q.lon);
    // The glint sits a little way along the line, the way you're facing, so at a node they fan out along the roads.
    const tg = tangentEN(c.line, c.t, 1), dir = tg.e * fx - tg.n * fz >= 0 ? 30 : -30, gx = l.x + tg.e * dir, gz = l.z - tg.n * dir;
    add({ kind: "highway", key: `h${c.line.i}`, d: c.meters, range: captureRadius(c.line.cls.rank) + RANGE.highway, line: c.line, x: gx, z: gz, alt: highwayAltitude(world.terrain.heightAt(gx, gz)) }, l.x, l.z);
  }
  return out;
}
/** Where a thing's glint sits: on the near side of a crown, on a butterfly, a sky being, the line overhead. */
function glintSpot(c, v, bs) {
  if (c.kind === "tree") {
    const r = c.rec, cx = camera.position.x - r.x, cz = camera.position.z - r.z, L = Math.hypot(cx, cz) || 1;
    const off = Math.min(r.height * 0.25, 5, L * 0.5);
    return v.set(r.x + (cx / L) * off, r.y + Math.min(r.height * 0.55, 6 + r.height * 0.15), r.z + (cz / L) * off);
  }
  if (c.kind === "butterfly") { const b = bs.find((q) => q.seed === c.seed); return b ? v.set(b.x, b.y + 0.6, b.z) : null; }
  if (c.kind === "being") return c.obj.getWorldPosition(v);
  if (c.kind === "artifact") return v.set(c.entry.x, c.entry.root.position.y + c.entry.top + 0.6, c.entry.z);
  if (c.kind === "mutual") return v.set(c.m.x, c.m.y + 6 * c.m.entry.graph.scale, c.m.z);
  return v.set(c.x, c.alt, c.z);
}
function updateReach(t, dt) {
  const on = !!world && !rebuilding && !state.ride && zoom < REACH_ZOOM;
  if (!on) { reach = lit = []; focus = null; }
  else if (t >= scanAt) {
    scanAt = t + 0.15;
    reach = inReach();
    focus = chooseFocus(reach, focus?.key);
    lit = glinting(reach, focus, 5);
  }
  const r = state.ride, words = r ? (!r.leaving && r.age > 0.6 ? promptFor({ kind: "ride" }) : "") : focus ? promptFor(focus) : "";
  if (words !== shownPrompt) {
    shownPrompt = words;
    if (words) actWhat.textContent = words;
    actBtn.classList.toggle("on", !!words);
    actBtn.setAttribute("aria-hidden", words ? "false" : "true");
  }
  if (lit.length) {
    const bs = lit.some((c) => c.kind === "butterfly") ? world.insects.butterflies() : null, spots = [];
    for (const c of lit) {
      const s = glintSpot(c, glintAt, bs);
      if (s && !spots.some((o) => Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z) < 15)) spots.push({ x: s.x, y: s.y, z: s.z, focus: c === focus, phase: c.phase }); // one glint per spot
    }
    glints.set(spots);
  }
  glints.update(t, dt, lit.length > 0);
}
/** The interact button (E): touch what has the prompt; with nothing in reach, squeak. On a highway, step off. */
function interact() {
  const r = state.ride;
  if (r) { if (!r.leaving && r.age > 0.6) leaveRide(false); return; }
  if (!world || rebuilding || zoom > GLOBE_AT) return;
  director.input(simT);
  clearTarget();
  actBtn.classList.remove("hit");
  void actBtn.offsetWidth; // restart the press animation
  actBtn.classList.add("hit");
  const c = focus;
  if (!c) return squeak();
  scanAt = 0; // look again next frame: a highway takes you away, a butterfly moves on
  if (c.kind === "tree") return shakeTree(c.rec);
  if (c.kind === "butterfly") { const b = world.insects.butterflies().find((q) => q.seed === c.seed); return b ? chirp(b.k) : squeak(); }
  if (c.kind === "being") return hum(c.being, c.obj);
  if (c.kind === "highway") return boardTapped(c.line);
  if (c.kind === "artifact") return touchCairn(c.entry);
  if (c.kind === "mutual") return squeakAt(c.m);
}

// ---- Artifacts: what your mutuals left around here, and cairns of your own ----
// Records in players' own Bluesky repos, found through a backlink index (atproto.js), checked (artifacts.js),
// and shown only from mutuals. Nothing about them is stored by this game's server.
const cairns = buildCairns(scene);
const people = { viewer: null, handle: null }; // whose mutuals' cairns to show (a DID); signed in, or just looking
const mine = new Map(); // uri -> artifact you made or renewed this session (the index can lag a minute or two)
const gone = new Set(); // uris you took down this session
let artifacts = [], artifactsAt = -Infinity, discovering = false, cairnsWorld = null;
let everywhere = [], everywhereAt = -Infinity, listing = false; // every mutual's cairn, anywhere (the list and the globe)
const realNow = () => Date.now() / 1000; // artifacts fade on the real clock, whatever ?t= says
async function refreshArtifacts() {
  if (!people.viewer || !world || discovering) return;
  discovering = true;
  artifactsAt = simT;
  const w = world, viewer = people.viewer, o = w.frame.toLatLon(0, 0);
  try {
    const found = await discover({ viewer, lat: o.lat, lon: o.lon, radiusM: 16000 });
    if (w !== world || viewer !== people.viewer) return; // the world regrew, or someone else is looking: next time
    const byUri = new Map(found.filter((a) => !gone.has(a.uri)).map((a) => [a.uri, a]));
    for (const [uri, a] of mine) if (a.did === viewer && (!byUri.has(uri) || byUri.get(uri).since < a.since)) byUri.set(uri, a);
    for (const a of everywhere) if (!byUri.has(a.uri) && metresBetween(o.lat, o.lon, a.lat, a.lon) < 16000) byUri.set(a.uri, a); // the index may lag
    showArtifacts([...byUri.values()]);
  } catch (e) {
    console.warn("artifacts:", e.message);
  } finally {
    discovering = false;
  }
}
/** Every cairn your mutuals (and you) left anywhere: the CAIRNS list and the dots on the globe. */
async function refreshEverywhere() {
  if (!people.viewer || listing) return;
  listing = true;
  everywhereAt = simT;
  const viewer = people.viewer;
  try {
    const found = await discoverWorld({ viewer });
    if (viewer !== people.viewer) return;
    const byUri = new Map(found.filter((a) => !gone.has(a.uri)).map((a) => [a.uri, a]));
    for (const [uri, a] of mine) if (a.did === viewer && (!byUri.has(uri) || byUri.get(uri).since < a.since)) byUri.set(uri, a);
    setEverywhere([...byUri.values()]);
  } catch (e) {
    console.warn("cairns:", e.message);
  } finally {
    listing = false;
  }
}
function setEverywhere(list) {
  everywhere = list;
  globe.setMarks(everywhere);
  maker.setCount(everywhere.length, who.size);
}
/** Off to a cairn: arrive 30 m south and 20 m west of it, facing north, so it stands ahead and to the right. */
function travelTo(a) {
  const dLat = -30 / 111320, dLon = -20 / (111320 * Math.max(0.05, Math.cos((a.lat * Math.PI) / 180)));
  teleport({ name: a.own ? "your cairn" : a.handle ? `@${a.handle}'s cairn` : "a cairn", lat: a.lat + dLat, lon: a.lon + dLon, alt: 10, heading: 0, zoom: 85 });
}
function showArtifacts(list) {
  artifacts = list;
  cairns.set(artifacts, world);
  cairnsWorld = world;
  scanAt = 0;
}
function setViewer(did, handle) {
  if (did !== people.viewer) { artifacts = []; cairns.set([], world || { frame: null }); who.clear(); flock.set([]); setEverywhere([]); everywhereAt = -Infinity; intentsAt = -Infinity; }
  people.viewer = did;
  people.handle = handle;
  maker.setPerson({ did, handle, signedIn: !!did && account.did === did });
  artifactsAt = -Infinity;
  hearMutuals(!!did);
}
async function lookAs(handle, persist = true) {
  const did = await didOf(handle);
  if (!did) throw new Error("Couldn't find that handle on Bluesky.");
  const name = (await handlesOf([did])).get(did) || String(handle).replace(/^@/, "");
  if (persist) try { localStorage.setItem("dream.look", name); } catch { /* private mode */ }
  setViewer(did, name);
  logLine(`Looking for cairns left by @${name}'s mutuals.`, "note");
}
/** The game's URL parameters for right here, to come back to after signing in. */
function hereQuery() {
  const q = new URLSearchParams(location.search), ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
  q.set("seed", String(seed));
  q.set("stats", STATS.map((k) => stats[k]).join(","));
  q.set("lat", ll.lat.toFixed(6)); q.set("lon", ll.lon.toFixed(6));
  if (world) q.set("alt", String(Math.max(2, Math.round(state.pos.y - Math.max(0, world.terrain.heightAt(state.pos.x, state.pos.z))))));
  q.set("heading", String(Math.round((((-state.heading * 180) / Math.PI) % 360 + 360) % 360)));
  q.set("zoom", String(Math.round(zoom)));
  return q.toString();
}
/** Where a new cairn goes: 12 m ahead and to the left, where the camera behind you can see it (the sheet is on the right). */
function cairnSpot() {
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading), rx = Math.cos(state.heading), rz = -Math.sin(state.heading);
  const a = -0.7, d = 12;
  return { x: state.pos.x + (fx * Math.cos(a) + rx * Math.sin(a)) * d, z: state.pos.z + (fz * Math.cos(a) + rz * Math.sin(a)) * d };
}
const maker = buildMaker({
  cairns: () => {
    if (simT - everywhereAt > 30) refreshEverywhere(); // fresh enough; the sheet redraws when it lands
    const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn, nowS = realNow();
    return byDistance(everywhere, ll.lat, ll.lon).map((a) => ({ a, metres: a.metres, age: ago(a.since, nowS) }));
  },
  travel: (a) => travelTo(a),
  globe: () => { zoom = 16e6; logLine("The whole Earth. Tap a cairn's dot to go there.", "note"); },
  look: (handle) => lookAs(handle),
  signIn: (handle) => account.signIn(handle, hereQuery()),
  signOut: async () => { await stopSharing(); await account.signOut(); logLine("Signed out of Bluesky.", "note"); },
  toggleShare: async () => {
    share.on = !share.on;
    try { localStorage.setItem("dream.share", share.on ? "on" : "off"); } catch { /* */ }
    if (!share.on) await stopSharing();
    maker.setSharing({ on: share.on, can: share.can });
    logLine(share.on ? "Your mutuals can see your creature now." : "You're hidden from your mutuals now.", "note");
  },
  flock: () => {
    const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn, nowS = realNow();
    return [...who.values()].map((w) => {
      const at = whereAt(w.intent, nowS);
      const doing = w.intent.kind === "ride" ? "on a highway" : at.moving ? (at.mode === "air" ? "flying" : "on the move") : "resting";
      return { did: w.did, handle: w.handle, metres: metresBetween(ll.lat, ll.lon, at.lat, at.lon), doing };
    }).sort((a, b) => a.metres - b.metres);
  },
  travelToMutual: (did) => travelToMutual(did),
  stopLooking: () => { try { localStorage.removeItem("dream.look"); } catch { /* */ } setViewer(null, null); },
  preview: (spec) => {
    if (!world) return;
    if (!spec) { cairns.preview(null); if (director.shot === "cairn") director.release(simT); return; }
    const at = cairnSpot(), g = Math.max(0, world.terrain.heightAt(at.x, at.z));
    cairns.preview(spec, at, world);
    // Hold a low side angle on you and the cairn while you choose it (the follow camera would hide it behind you).
    if (director.shot !== "cairn") director.play("cairn", simT, cairnShot(state.pos.clone(), { x: at.x, y: g, z: at.z }, cairnForm(spec.seed).height), { dur: 600, blendIn: 0.8, blendOut: 1 });
  },
  leave: async ({ seed: cs, hue, note }) => {
    if (!world || !account.did) throw new Error("Sign in first.");
    const at = cairnSpot(), ll = world.frame.toLatLon(at.x, at.z);
    const record = makeCairn({ lat: ll.lat, lon: ll.lon, seed: cs, hue, note });
    const r = await account.create(record);
    const a = parseArtifact(record, realNow()), rkey = String(r.uri).split("/").pop();
    mine.set(r.uri, { ...a, did: account.did, rkey, uri: r.uri, handle: people.handle, own: true });
    showArtifacts([...artifacts.filter((x) => x.uri !== r.uri), mine.get(r.uri)]);
    setEverywhere([...everywhere.filter((x) => x.uri !== r.uri), mine.get(r.uri)]);
    sound.chime();
    logLine("You stack a cairn. It will stand here for a moon.", "artifact");
  },
  renew: async (e) => {
    const value = await getRecord(e.a.did, e.a.rkey);
    const next = renew(value);
    await account.put(e.a.rkey, next);
    const a = { ...e.a, ...parseArtifact(next, realNow()) };
    mine.set(a.uri, a);
    showArtifacts(artifacts.map((x) => (x.uri === a.uri ? a : x)));
    setEverywhere(everywhere.map((x) => (x.uri === a.uri ? a : x)));
    sound.chime();
    logLine("You restack your cairn. It will stand another moon.", "artifact");
  },
  takeDown: async (e) => {
    await account.remove(e.a.rkey);
    gone.add(e.a.uri);
    mine.delete(e.a.uri);
    showArtifacts(artifacts.filter((x) => x.uri !== e.a.uri));
    setEverywhere(everywhere.filter((x) => x.uri !== e.a.uri));
    logLine("You unstack your cairn, stone by stone.", "artifact");
  },
});
account.onChange(async (did) => {
  share.can = false;
  if (did) {
    const name = (await handlesOf([did])).get(did) || null;
    setViewer(did, name);
    share.can = await account.canShare();
    maker.setSharing({ on: share.on, can: share.can });
    account.mutes().then((m) => { setMuted(m); refreshIntents(); refreshEverywhere(); artifactsAt = -Infinity; });
  } else if (people.viewer && people.viewer === account.did) setViewer(null, null);
  else maker.setPerson({ did: people.viewer, handle: people.handle, signedIn: false });
});
// Pick up a session (or finish signing in), else keep looking as whoever you looked as last time.
account.resume().then((did) => {
  if (did) return;
  let look = null;
  try { look = localStorage.getItem("dream.look"); } catch { /* */ }
  if (look) lookAs(look, false).catch(() => {});
});
/** Reading someone's cairn, or tending your own. */
function touchCairn(e) {
  const a = e.a, nowS = realNow(), f = fadeOf(a.since, nowS);
  sound.chime();
  director.play("cairn", simT, cairnShot(state.pos.clone(), { x: e.x, y: e.y, z: e.z }, e.top), { dur: a.own ? 600 : 4.5, blendIn: 0.7, blendOut: 1.1 });
  bursts.emit({ at: new THREE.Vector3(e.x, e.root.position.y + e.top, e.z), colors: [e.crystal.material.color.clone(), new THREE.Color(0xffffff)], n: 16, spread: 1.5, up: 2, fall: 0.6, life: 2 });
  if (a.own) {
    const left = Math.max(0, Math.ceil((a.since + MOON_S - nowS) / 86400));
    maker.openTend(e, { note: a.note, age: ago(a.since, nowS), left: left <= 1 ? "It fades within a day." : `It fades in ${left} days.` });
    return;
  }
  logLine(cairnLine(a, nowS, f), "artifact");
}

// ---- Mutuals in the dream: intents (intents.js) ----
// Each player keeps one record, their current intent, overwritten when their plan changes; everyone else computes
// where their creature is from it. We only ever show mutuals (and not anyone blocked, hidden by Bluesky's moderation,
// deactivated, or muted by you).
const flock = buildFlock(scene, document.getElementById("whos"));
const who = new Map(); // did -> { did, handle, intent }
let intentsAt = -Infinity, hearing = null, fetchingIntents = false;
const share = { on: (() => { try { return localStorage.getItem("dream.share") !== "off"; } catch { return true; } })(), can: false, last: null, lastKind: "", lastKey: "", lastAt: -Infinity, writing: false };
function setWho() {
  flock.set([...who.values()]);
  maker.setCount(everywhere.length, who.size);
  globe.setFlock(flock.everyone(realNow()));
}
async function refreshIntents() {
  if (!people.viewer || fetchingIntents) return;
  fetchingIntents = true;
  intentsAt = simT;
  const viewer = people.viewer;
  try {
    const list = await currentIntents({ viewer });
    if (viewer !== people.viewer) return;
    for (const w of list) { const had = who.get(w.did); if (!had || had.intent.at <= w.intent.at) who.set(w.did, w); }
    setWho();
  } catch (e) {
    console.warn("mutuals:", e.message);
  } finally {
    fetchingIntents = false;
  }
}
/** One live connection for the game's records: mutuals' intents, and cairns as they're left (no index lag). */
function hearMutuals(on) {
  if (!on) { hearing?.close(); hearing = null; return; }
  if (hearing) return;
  hearing = listen({
    collections: [INTENT_NSID, ARTIFACT_NSID],
    onOpen: () => refreshIntents(),
    onCommit: async (e) => {
      const viewer = people.viewer, c = e.commit;
      if (!viewer || e.did === viewer && c.collection === INTENT_NSID) return; // your own creature is you
      if (c.operation === "delete") {
        if (c.collection === INTENT_NSID) { who.delete(e.did); setWho(); }
        else { const uri = `at://${e.did}/${ARTIFACT_NSID}/${c.rkey}`; showArtifacts(artifacts.filter((a) => a.uri !== uri)); setEverywhere(everywhere.filter((a) => a.uri !== uri)); }
        return;
      }
      if (!(await visibleAmong(viewer, [e.did])).has(e.did) || viewer !== people.viewer) return;
      const handle = (await handlesOf([e.did])).get(e.did) || null;
      if (c.collection === INTENT_NSID) {
        const intent = c.rkey === "self" ? parseIntent(c.record) : null;
        if (intent) { who.set(e.did, { did: e.did, handle, intent }); setWho(); }
        return;
      }
      const a = parseArtifact(c.record, realNow());
      if (!a || fadeOf(a.since, realNow()) <= 0) return;
      const art = { ...a, did: e.did, rkey: c.rkey, uri: `at://${e.did}/${ARTIFACT_NSID}/${c.rkey}`, handle, own: e.did === viewer };
      setEverywhere([...everywhere.filter((x) => x.uri !== art.uri), art]);
      if (world) { const o = world.frame.toLatLon(0, 0); if (metresBetween(o.lat, o.lon, a.lat, a.lon) < 16000) showArtifacts([...artifacts.filter((x) => x.uri !== art.uri), art]); }
    },
  });
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hearMutuals(false); stopSharing(); }
  else if (people.viewer) { hearMutuals(true); refreshIntents(); }
});
addEventListener("pagehide", () => { stopSharing(); });
/** Off to a mutual: arrive 40 m from where their creature is now. */
function travelToMutual(did) {
  const w = who.get(did);
  if (!w) return;
  const at = whereAt(w.intent, realNow()), dLat = -40 / 111320;
  teleport({ name: w.handle ? `@${w.handle}` : "a mutual", lat: at.lat + dLat, lon: at.lon, alt: 10, heading: 0, zoom: 85 });
}
function squeakAt(m) {
  sound.squeak(1.25 / m.entry.graph.scale);
  hopAt = simT;
  bursts.emit({ at: new THREE.Vector3(m.x, m.y + 4 * m.entry.graph.scale, m.z), colors: [new THREE.Color(0xff9ec7), new THREE.Color(0xfff3b0)], n: 14, spread: 2.5, up: 4, fall: 2, life: 1.2 });
  logLine(`You squeak at @${m.handle || "them"}.`, "creature");
}

// ---- Sharing your own intent (signed in, sharing on) ----
/** What I'm doing now, as an intent: a ride, a trip, steering, or resting. */
function myIntent() {
  const p = state.pos, ll = world.frame.toLatLon(p.x, p.z), base = { p: { lat: ll.lat, lon: ll.lon, alt: p.y }, creature: { seed, stats } };
  if (state.ride) {
    const r = state.ride, rl = rideLatLon(r);
    return { ...base, p: { lat: rl.lat, lon: rl.lon, alt: p.y }, kind: "ride", key: `ride:${r.line.i}:${r.dir}`, ride: { line: r.line.i, t: r.t, dir: r.dir } };
  }
  if (state.target) {
    const tg = state.target, pts = tg.pts.slice(tg.idx), end = pts[pts.length - 1];
    return { ...base, kind: "goto", key: `goto:${end.lat.toFixed(4)},${end.lon.toFixed(4)}`, goto: { pts, speed: tg.fly ? sp.fly : sp.run, fly: tg.fly, cruise: tg.alt ?? p.y } };
  }
  if (Math.abs(state.speed) > 1.5 || Math.abs(state.vy) > 1.5) return { ...base, kind: "steer", key: "steer", steer: { heading: -state.heading, speed: state.speed, climb: state.vy } };
  return { ...base, kind: "rest", key: "rest" };
}
/** Once a second: write a new intent if my plan changed, I've drifted from what mutuals compute, or it's heartbeat time. */
function shareTick() {
  if (!share.on || !share.can || !world || rebuilding || share.writing || people.viewer !== account.did || document.hidden) return;
  const nowS = realNow(), want = myIntent(), since = nowS - share.lastAt;
  const ll = want.p, drift = share.last ? driftOf(share.last, nowS, ll.lat, ll.lon) : Infinity;
  const changed = want.key !== share.lastKey;
  if (!((changed && since > 1.5) || (drift > 60 && since > 6) || since > HEARTBEAT_S)) return;
  const record = makeIntent({ ...want, now: new Date(nowS * 1000) });
  share.writing = true;
  account.putIntent(record).then(() => {
    share.last = parseIntent(record, nowS);
    share.lastKey = want.key;
    share.lastAt = nowS;
  }).catch((e) => {
    console.warn("intent:", e.message);
    share.lastAt = nowS; // don't hammer
    if (/scope|forbidden|403/i.test(e.message)) { share.can = false; maker.setSharing({ on: share.on, can: false }); }
  }).finally(() => { share.writing = false; });
}
async function stopSharing() {
  if (!share.last && share.lastAt === -Infinity) return;
  share.last = null; share.lastKey = ""; share.lastAt = -Infinity;
  await account.clearIntent();
}

// The way there, drawn as golden dots, and a ring where you're going.
const ROUTE_MAX = 64;
const routeGeo = new THREE.BufferGeometry();
routeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ROUTE_MAX * 3), 3));
const routeDots = new THREE.Points(routeGeo, curved(new THREE.PointsMaterial({ color: 0xffd34d, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }), "-route"));
routeDots.frustumCulled = false;
routeDots.visible = false;
scene.add(routeDots);
layerTransparent(routeDots);
function drawRoute(t) {
  const tg = state.target;
  if (!tg || !world) return;
  const pos = routeGeo.attributes.position.array, H = (x, z) => Math.max(0, world.terrain.heightAt(x, z)) + 1.5;
  const legs = [{ x: state.pos.x, z: state.pos.z }, ...tg.pts.slice(tg.idx).map((q) => world.frame.toLocal(q.lat, q.lon))];
  const end = legs[legs.length - 1];
  let n = 0;
  // A ring at the goal, turning slowly.
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + t * 0.8; pos.set([end.x + Math.cos(a) * 6, H(end.x, end.z), end.z + Math.sin(a) * 6], n++ * 3); }
  // Dots along the legs, spaced to fit.
  let total = 0;
  for (let k = 1; k < legs.length; k++) total += Math.hypot(legs[k].x - legs[k - 1].x, legs[k].z - legs[k - 1].z);
  const spacing = Math.max(15, total / (ROUTE_MAX - 17)), phase = (t * 12) % spacing;
  for (let k = 1; k < legs.length && n < ROUTE_MAX; k++) {
    const a = legs[k - 1], b = legs[k], L = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = k === 1 ? phase : 0; s < L && n < ROUTE_MAX; s += spacing) { const x = a.x + ((b.x - a.x) * s) / L, z = a.z + ((b.z - a.z) * s) / L; pos.set([x, H(x, z), z], n++ * 3); }
  }
  routeGeo.setDrawRange(0, n);
  routeGeo.attributes.position.needsUpdate = true;
}

// ---- HUD ----
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const setStatus = (s) => { statusEl.textContent = s; statusEl.hidden = !s; };
const bar = (n) => "■".repeat(n) + "□".repeat(MAX - n);
function updateHud() {
  if (state.ride) {
    const r = state.ride, ll = rideLatLon(r);
    const near = r.leaving ? [] : crossings(r);
    hud.textContent = [
      `RIDING  ${r.line.cls.name.toUpperCase()}  ${Math.round(r.speed / 1000)} KM/S`,
      `${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)}  ·  NEXT NODE ${Math.round(remainingMeters(r) / 1000).toLocaleString("en")} KM`,
      near.length ? `CROSSING ${near[0].line.cls.name.toUpperCase()} · A/D TO HOP` : "SHIFT OR S: STEP OFF",
      STATS.map((k) => `${k.toUpperCase()} ${bar(stats[k])}`).join("  "),
      zoomLine(),
    ].join("\n");
    return;
  }
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z);
  const ground = world.terrain.heightAt(state.pos.x, state.pos.z);
  const { node, meters } = nearestNode(ll.lat, ll.lon);
  const cls = CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
  const k = koppenAt(ll.lat, ll.lon);
  const biome = biomeFor(k, world.terrain.reliefAt(state.pos.x, state.pos.z), ll.lat, ground);
  const where = ground < 0 ? `sea, ${Math.round(-ground)} m deep` : `${biome.toUpperCase()}${k ? ` (${koppenCode(k)})` : ""}`;
  hud.textContent = [
    `${state.mode.toUpperCase()}  ${Math.round(state.pos.y)} M  ·  ${where}`,
    `${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)}  ·  ${detail.fps} FPS${detail.scale < DETAIL_MAX ? `  ·  FORESTS ${Math.round(detail.scale * 100)}%` : ""}`,
    `LEY NODE ${(meters / 1000).toFixed(1)} KM  ${cls}`,
    STATS.map((k) => `${k.toUpperCase()} ${bar(stats[k])}`).join("  "),
    zoomLine(),
    targetLine(),
  ].join("\n").replace(/\n+$/, "");
}
function targetLine() {
  if (!state.target || !world) return "";
  const last = state.target.pts[state.target.pts.length - 1], q = world.frame.toLocal(last.lat, last.lon);
  const m = Math.hypot(q.x - state.pos.x, q.z - state.pos.z);
  return `GOING THERE  ${m < 1000 ? `${Math.round(m)} M` : `${(m / 1000).toFixed(1)} KM`}${state.target.fly ? "  BY AIR" : ""}  ·  ANY KEY OR DRAG: TAKE OVER`;
}
function zoomLine() {
  if (zoom < 300) return "";
  const km = zoom / 1000;
  const d = km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en");
  return zoom > GLOBE_AT ? `ORBIT ${d} KM UP` : `CAMERA ${d} KM AWAY`;
}

// ---- Loop ----
let sunState = null, lastSun = -Infinity, lastHud = -Infinity;
const t0 = performance.now();
let last = t0;
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000), t = (nowMs - t0) / 1000;
  // Only frames that draw forests steer the governor.
  meterFrame(nowMs - last, t, !!world && !state.ride && zoom < 6000);
  last = nowMs;
  // +/- (or PageUp/PageDown) zoom smoothly while held.
  if (keys.has("Equal") || keys.has("NumpadAdd") || keys.has("PageUp")) zoomBy(Math.exp(-2.4 * dt));
  if (keys.has("Minus") || keys.has("NumpadSubtract") || keys.has("PageDown")) zoomBy(Math.exp(2.4 * dt));
  const view = state.ride ? rideView(dt, t) : worldView(dt, t);

  // The real sun for this place and moment (refreshed every 10 s).
  if (t - lastSun > 10 || !sunState) {
    sunState = sunPosition(new Date(unixAt(t) * 1000), view.ll.lat, view.ll.lon);
    lastSun = t;
  }
  const dir = sunDirection(sunState);
  sunInfo = { dir, gold: sunState.altitude > -2 ? 1 - Math.min(1, Math.max(0, (sunState.altitude - 2) / 14)) : 0 };
  const horizon = skyColors(sunState.altitude).horizon;
  const day = Math.max(0, Math.min(1, (sunState.altitude + 6) / 16));
  const p = view.pos;
  sunLight.position.set(p.x + dir.x * 10000, p.y + dir.y * 10000, p.z + dir.z * 10000);
  sunLight.target.position.copy(p);
  sunLight.intensity = 0.15 + 2.2 * day;
  hemi.intensity = 0.45 + 0.9 * day;

  // Under the sea: a murky blue world. The sky and the highways ignore fog by
  // design, so they're hidden down here, and the surface reads as a ceiling.
  const underwater = view.underwater;
  // Above water the fog is aerial perspective, not a wall: it thickens only
  // toward the real horizon, which recedes as you climb.
  if (underwater) { scene.fog.color.setHex(0x0b3b6e); scene.fog.near = 5; scene.fog.far = 700; }
  else {
    const h = Math.max(30, camera.position.y);
    const horizonM = Math.sqrt(2 * 6371008.8 * h + h * h);
    scene.fog.color.copy(horizon);
    // Capped inside the outer terrain ring, so from high up its edge melts into haze.
    scene.fog.far = Math.min(440000, Math.max(40000, horizonM * 1.2));
    scene.fog.near = scene.fog.far * 0.25;
  }
  if (world) world.highways.group.visible = !underwater;
  sea.underwater = underwater;
  scene.background = scene.fog.color;

  sea.mesh.position.set(camera.position.x, 0, camera.position.z); // its waves are keyed to world position
  sea.update(t, dir, day, horizon);
  // The shared clock: the real one, or ?t= when it's fixed. Sky beings and
  // clouds follow it, so every player sees the same sky.
  const unix = unixAt(t);
  if (world) world.highways.update(t);
  if (world) { window.__dream.beings = world.beings.update(unix, t); layerTransparent(world.beings.group); }
  // Plants and insects around you; too small to matter from far up.
  if (world && !state.ride) {
    const life = zoom < 6000;
    world.plants.group.visible = world.insects.group.visible = life;
    if (life) {
      window.__dream.plants = world.plants.update(state.pos.x, state.pos.z, t, camera.position, detail.scale);
      window.__dream.insects = world.insects.update(state.pos.x, state.pos.z, unix % 86400, sunState.altitude);
    }
  }
  if (t - lastHud > 0.25) { updateHud(); lastHud = t; }
  drawRoute(t);
  simT = t;
  bursts.update(dt);
  if (world && cairnsWorld !== world) { cairns.place(world); cairnsWorld = world; artifactsAt = -Infinity; } // regrown: re-place, then look again
  if (people.viewer && world && !rebuilding && simT - artifactsAt > 90) refreshArtifacts();
  if (people.viewer && simT - everywhereAt > 180) refreshEverywhere();
  cairns.update(t, realNow());
  if (world && !state.ride) flock.update(t, dt, realNow(), world, camera, canvas);
  if (t - shareTickAt > 1) {
    shareTickAt = t;
    shareTick();
    const nowS = realNow();
    let gone = false;
    for (const [did, w] of who) if (nowS - w.intent.at > STALE_S) { who.delete(did); gone = true; } // stale: they've left
    if (gone) setWho(); else if (who.size) globe.setFlock(flock.everyone(nowS));
  }
  if (people.viewer && simT - intentsAt > 180) refreshIntents();
  updateReach(t, dt);
  // From far away: a sparkle on you, and the highways as thin lines.
  marker.visible = zoom > 700;
  marker.position.copy(view.pos);
  marker.material.size = 5 + 2 * Math.sin(t * 3);
  if (world) world.highways.overview(camera.position.y > 6000);
  if (zoom > GLOBE_AT) {
    // The whole planet.
    const fxg = -Math.sin(state.heading), fzg = -Math.cos(state.heading);
    globe.update(view.ll, { e: fxg, n: -fzg }, zoom, new Date(unixAt(t) * 1000), camera.aspect, t);
    renderer.render(globe.scene, globe.camera);
  } else {
    curveUniform.value.copy(camera.position); // the Earth curves away from the eye
    skyPass.update({ frame: world ? world.frame : makeFrame(view.ll.lat, view.ll.lon), camera, unix, sun: { altitude: sunState.altitude, dir }, day, fog: scene.fog, clouds: !underwater && !state.ride && !!world, underwater, steps: 20 + 44 * detail.scale });
    skyPass.render(renderer, scene, camera);
  }
  window.__dream.frames++;
  requestAnimationFrame(frame);
}

/** Camera distance and pitch from the zoom: low and close behind you, then pulling back and tilting down. */
function cameraRig() {
  const k = THREE.MathUtils.smoothstep(Math.log(zoom), Math.log(85), Math.log(150000));
  const pitch = THREE.MathUtils.degToRad(18 + 52 * k);
  return { back: zoom * Math.cos(pitch), up: zoom * Math.sin(pitch), near: zoom < 400 };
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);
function worldView(dt, t) {
  step(dt);
  if (state.ride) return rideView(0, t); // boarded this frame
  const p = state.pos;
  const hopAge = t - hopAt, hopY = hopAge < 0.45 ? Math.sin((Math.PI * hopAge) / 0.45) * 3 * graph.scale : 0;
  creature.group.position.set(p.x, p.y + hopY + (state.mode === "water" ? Math.sin(t * 2) * 0.4 : 0), p.z);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / 60) });

  // The camera: the director frames what you're doing.
  let goal = null;
  if (state.target) { const g = state.target.pts[state.target.pts.length - 1], q = world.frame.toLocal(g.lat, g.lon); goal = new THREE.Vector3(q.x, state.target.ground, q.z); }
  // Zoomed all the way in, you look through its eyes, and it fades so you can see past it.
  const eyes = THREE.MathUtils.smoothstep(34 - zoom, 0, 17);
  fadeCreature(1 - 0.85 * eyes);
  const eye = eyeLocal.clone().multiplyScalar(graph.scale).applyAxisAngle(UP_AXIS, state.heading);
  director.update({ t, dt, subject: creature.group.position, heading: state.heading, mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / sp.fly), riding: false, rig: cameraRig(), heightAt: world.terrain.heightAt, goal, sunDir: sunInfo.dir, gold: sunInfo.gold, scale: graph.scale, eyes, eye });
  const underwater = camera.position.y < 0 && world.terrain.heightAt(camera.position.x, camera.position.z) < camera.position.y;
  return { ll: world.frame.toLatLon(p.x, p.z), pos: p, underwater };
}

// In ley-space the frame is centred on the rider every frame.
const rideOrigin = new THREE.Vector3(0, LEY_ALT, 0);
function rideView(dt, t) {
  fadeCreature(1); // solid again on a highway
  rideStep(dt);
  const r = state.ride;
  if (!r) return worldView(0, t);
  const ll = rideLatLon(r);
  const tg = tangentEN(r.line, r.t, r.dir);
  state.heading = Math.atan2(-tg.e, tg.n);
  creature.group.position.copy(rideOrigin);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: "air", speed01: r.leaving ? 0.2 : 1 });
  director.update({ t, dt, subject: rideOrigin, heading: state.heading, mode: "air", speed01: r.leaving ? 0.2 : 1, riding: true, rig: cameraRig(), heightAt: null, goal: null, sunDir: sunInfo.dir, gold: 0, scale: graph.scale });
  rideFx.update(r, makeFrame(ll.lat, ll.lon), t, state.heading, dt);
  return { ll, pos: rideOrigin, underwater: false };
}

// ---- Boot ----
window.__dream = { seed, stats, spawn, triangles: creature.triangles, ready: false, frames: 0, state, objects: { sea: sea.mesh }, world: () => world, detail, pickAt: (x, y) => pick(x, y)?.kind ?? null, viewAs: (handle) => lookAs(handle, false), cairns: () => cairns, maker: () => maker, artifacts: () => artifacts.map((a) => ({ uri: a.uri, handle: a.handle, note: a.note, own: a.own })), pickGlobe: (x, y) => { const r = canvas.getBoundingClientRect(), h = globe.pick(x - r.left, y - r.top, r.width, r.height); return h ? (h.cairn ? `cairn:${h.cairn.handle}` : `mutual:${h.mutual.handle}`) : null; }, flock: () => [...who.values()].map((w) => ({ handle: w.handle, kind: w.intent.kind })), sharing: () => ({ ...share, last: share.last && share.last.kind }), everywhere: () => everywhere.map((a) => ({ uri: a.uri, handle: a.handle, lat: a.lat, lon: a.lon })), reach: () => ({ n: reach.length, lit: lit.map((c) => c.kind), focus: focus && { kind: focus.kind, key: focus.key, d: Math.round(focus.d) }, prompt: shownPrompt }) };
setStatus("dreaming…");
regrow(spawn.lat, spawn.lon, (w) => {
  swapWorld(w);
  const ground = w.terrain.heightAt(0, 0);
  state.pos.set(0, Math.max(0, ground) + (altParam !== null ? Math.max(5, Number(altParam)) : 350), 0);
  establishing(); // the opening shot: a crane down onto you
  setStatus(w.terrain.failed ? `${w.terrain.failed} elevation tiles didn't load; that ground is drawn at sea level` : "");
  // ?ride=N starts on highway N, halfway along (a shortcut for trying the ride).
  if (params.get("ride") !== null) {
    const line = lineAt(Math.abs(Number(params.get("ride")) | 0) % lineCount());
    boardRide({ line, t: 0.5, dir: 1 });
  }
  window.__dream.ready = true;
  requestAnimationFrame(frame);
});
