// Dream of the Earth, single-player: a low-poly piece of the real Earth near a
// ley node, its real sun, the golden highways you can ride, and one creature.
import * as THREE from "three";
import { makeFrame, offset } from "./geo.js";
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
import { chooseCapture, startRide, advance, rideLatLon, remainingMeters, hop, crossings, tangentEN, highwayAltitude, captureRadius, lineAt, lineCount } from "./ride.js";
import { buildSkyShader, skyColors, layerTransparent } from "./skyshader.js";
import { curveUniform, curved, TWO_R } from "./curvature.js";
import { planPath } from "./pathfind.js";
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
scene.add(creature.group);
layerTransparent(creature.group);
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
addEventListener("keydown", (e) => { keys.add(e.code); if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); });
addEventListener("keyup", (e) => keys.delete(e.code));
const touch = { turn: 0, thrust: 0, up: 0, id: null, x: 0, y: 0 };
// Two fingers pinch to zoom; one finger steers.
const pointers = new Map();
let pinchFrom = 0;
const pinchDistance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
// A quick tap (or click) that doesn't drag: go there.
let tapStart = null;
canvas.addEventListener("pointerdown", (e) => {
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
  if (tap) goTo(e.clientX, e.clientY);
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
  if ((manual.turn || manual.thrust || manual.up) && state.target) clearTarget(); // your hands back on the controls
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

  if (state.mode === "air") {
    if (stats.fly > 0) {
      const vyTarget = up > 0 ? sp.climb : up < 0 ? -sp.climb * 1.6 : 0;
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
  if (g2 >= 0 && p.y < g2) { p.y = g2; state.vy = Math.max(0, state.vy); }
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
  if (state.captureCooldown <= 0 && state.speed > 5) {
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
    camera.position.set(state.pos.x - -Math.sin(state.heading) * 85, state.pos.y + 28, state.pos.z - -Math.cos(state.heading) * 85);
    setStatus(arrived ? `you're at a node: ${nodeName(ll)}` : "");
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
  regrow(l.lat, l.lon, (w) => {
    const p = w.frame.toLocal(l.lat, l.lon);
    swapWorld(w, { lat: l.lat, lon: l.lon, y: Math.max(0, w.terrain.heightAt(p.x, p.z)) + (l.alt ?? 350) });
    camera.position.set(state.pos.x + Math.sin(state.heading) * 85, state.pos.y + 28, state.pos.z + Math.cos(state.heading) * 85);
    history.replaceState(null, "", `?${landmarkQuery(l, location.search)}`);
    setStatus("");
  });
}

function nodeName(ll) {
  const { node } = nearestNode(ll.lat, ll.lon);
  return CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
}

// ---- Tap to move: find the ground under a tap, plan a way there, and steer ----
const tapRay = new THREE.Raycaster();
/** The ground (or sea surface) under a screen point, on the curved Earth: { x, z, h } or null. */
function groundAt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  tapRay.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
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
      return { x, z, h: world.terrain.heightAt(x, z) };
    }
    t0 = t;
    t += Math.max(3, t * 0.02);
  }
  return null;
}
function goTo(clientX, clientY) {
  if (!world || state.ride || zoom > GLOBE_AT || rebuilding) return;
  const hit = groundAt(clientX, clientY);
  if (!hit) return;
  const p = state.pos;
  // Anything with wings flies straight there; the rest find a way on foot and by water.
  const fly = stats.fly > 0;
  const pts = fly ? [{ x: hit.x, z: hit.z }] : planPath({ x: p.x, z: p.z }, hit, world.terrain.heightAt, sp);
  if (!pts) { setStatus("no way there on foot"); setTimeout(() => setStatus(""), 2500); return; }
  state.target = { fly, ground: Math.max(0, hit.h), pts: pts.map((q) => world.frame.toLatLon(q.x, q.z)), idx: 0 };
  routeDots.visible = true;
}
function clearTarget() { state.target = null; routeDots.visible = false; }
/** Steering toward the next waypoint, as if from the controls: { turn, thrust, up } or null. */
function autopilot() {
  const tg = state.target;
  if (!tg || !world) return null;
  const p = state.pos, last = tg.idx === tg.pts.length - 1;
  const wp = world.frame.toLocal(tg.pts[tg.idx].lat, tg.pts[tg.idx].lon);
  const dx = wp.x - p.x, dz = wp.z - p.z, dist = Math.hypot(dx, dz);
  if (!last && dist < 18) { tg.idx++; return autopilot(); }
  if (last && dist < 6) {
    // There. A flyer settles down onto it; then the controls are yours again.
    if (!tg.fly || p.y - tg.ground < 3 || state.mode !== "air") { clearTarget(); return null; }
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
    const cruise = last && dist < 220 ? tg.ground + 2 : Math.max(ahead + 70, Math.min(p.y, ahead + 400));
    up = Math.max(-1, Math.min(1, (cruise - p.y) / 25));
  }
  return { turn, thrust, up };
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

function worldView(dt, t) {
  step(dt);
  if (state.ride) return rideView(0, t); // boarded this frame
  const p = state.pos;
  creature.group.position.set(p.x, p.y + (state.mode === "water" ? Math.sin(t * 2) * 0.4 : 0), p.z);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / 60) });

  // Camera: behind and above you, by the zoom (closer and lower under water).
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  const rig = cameraRig();
  const back = state.mode === "water" && zoom <= 85 ? 45 : rig.back, upOff = state.mode === "water" && zoom <= 85 ? 10 : rig.up;
  const want = new THREE.Vector3(p.x - fx * back, p.y + upOff, p.z - fz * back);
  const camGround = world.terrain.heightAt(want.x, want.z);
  if (camGround >= 0) want.y = Math.max(want.y, camGround + 6);
  camera.position.lerp(want, Math.min(1, dt * (rig.near ? 4 : 8)));
  const ahead = rig.near ? 20 : 0;
  camera.lookAt(p.x + fx * ahead, p.y + (rig.near ? 6 : 0), p.z + fz * ahead);
  const underwater = camera.position.y < 0 && world.terrain.heightAt(camera.position.x, camera.position.z) < camera.position.y;
  return { ll: world.frame.toLatLon(p.x, p.z), pos: p, underwater };
}

// In ley-space the frame is centred on the rider every frame.
const rideOrigin = new THREE.Vector3(0, LEY_ALT, 0);
function rideView(dt, t) {
  rideStep(dt);
  const r = state.ride;
  if (!r) return worldView(0, t);
  const ll = rideLatLon(r);
  const tg = tangentEN(r.line, r.t, r.dir);
  state.heading = Math.atan2(-tg.e, tg.n);
  creature.group.position.copy(rideOrigin);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: "air", speed01: r.leaving ? 0.2 : 1 });
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  const rig = cameraRig();
  const back = Math.max(140, rig.back), upOff = Math.max(45, rig.up);
  camera.position.set(-fx * back, LEY_ALT + upOff, -fz * back);
  camera.lookAt(fx * (rig.near ? 40 : 0), LEY_ALT + (rig.near ? 8 : 0), fz * (rig.near ? 40 : 0));
  rideFx.update(r, makeFrame(ll.lat, ll.lon), t, state.heading, dt);
  return { ll, pos: rideOrigin, underwater: false };
}

// ---- Boot ----
window.__dream = { seed, stats, spawn, triangles: creature.triangles, ready: false, frames: 0, state, objects: { sea: sea.mesh }, world: () => world, detail };
setStatus("dreaming…");
regrow(spawn.lat, spawn.lon, (w) => {
  swapWorld(w);
  const ground = w.terrain.heightAt(0, 0);
  state.pos.set(0, Math.max(0, ground) + (altParam !== null ? Math.max(5, Number(altParam)) : 350), 0);
  camera.position.set(0, state.pos.y + 40, 120);
  setStatus(w.terrain.failed ? `${w.terrain.failed} elevation tiles didn't load; that ground is drawn at sea level` : "");
  // ?ride=N starts on highway N, halfway along (a shortcut for trying the ride).
  if (params.get("ride") !== null) {
    const line = lineAt(Math.abs(Number(params.get("ride")) | 0) % lineCount());
    boardRide({ line, t: 0.5, dir: 1 });
  }
  window.__dream.ready = true;
  requestAnimationFrame(frame);
});
