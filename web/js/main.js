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
import { buildClouds } from "./clouds.js";
import { buildHighways } from "./highways.js";
import { buildRideFx, LEY_ALT } from "./ridefx.js";
import { chooseCapture, startRide, advance, rideLatLon, remainingMeters, hop, crossings, tangentEN, highwayAltitude, captureRadius, lineAt, lineCount } from "./ride.js";
import { buildSky } from "./sky.js";
import { curveUniform } from "./curvature.js";
import { buildSkyBeings } from "./skybeings.js";
import { randomStats, parseStats, speeds, STATS, MAX } from "./stats.js";
import { interimTemperature, biomeFor } from "./geo.js";

// ---- Who and where (URL params make any spawn reproducible) ----
const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seed = seedParam ? (/^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : hashString(seedParam)) : (Math.random() * 2 ** 32) >>> 0;
// Separate streams, so choosing your stats doesn't move your spawn.
const spawnRand = mulberry32(hashString(`spawn:${seed}`));
const stats = parseStats(params.get("stats")) || randomStats(mulberry32(hashString(`stats:${seed}`)));
const sp = speeds(stats);
const fixedTime = params.get("t") ? new Date(params.get("t")) : null;
const now = () => fixedTime || new Date();

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
const sky = buildSky();
scene.add(sky.group);
const sea = buildSea(); // rings around the camera, out past the horizon
scene.add(sea.mesh);
const clouds = buildClouds();
scene.add(clouds.group);
const rideFx = buildRideFx();
rideFx.group.visible = false;
scene.add(rideFx.group);

// ---- The creature ----
const graph = generateCreature(seed);
const creature = buildCreature(graph, stats);
scene.add(creature.group);
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
  const group = new THREE.Group();
  group.add(terrain.mesh, highways.group, beings.group);
  return { frame, terrain, highways, beings, group };
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
    world.group.traverse((o) => { o.geometry?.dispose(); });
  }
  world = next;
  scene.add(world.group);
}
function regrow(lat, lon, onReady) {
  const token = ++worldToken;
  rebuilding = true;
  return buildWorld(lat, lon)
    .then((w) => { if (token === worldToken) onReady(w); })
    .catch((e) => { setStatus(`the dream couldn't regrow here: ${e.message}`); console.error(e); })
    .finally(() => { if (token === worldToken) rebuilding = false; });
}

// ---- Input: keyboard, plus a touch stick and up/down buttons ----
const keys = new Set();
addEventListener("keydown", (e) => { keys.add(e.code); if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); });
addEventListener("keyup", (e) => keys.delete(e.code));
const touch = { turn: 0, thrust: 0, up: 0, id: null, x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => { touch.id = e.pointerId; touch.x = e.clientX; touch.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== touch.id) return;
  touch.turn = Math.max(-1, Math.min(1, (e.clientX - touch.x) / 70));
  touch.thrust = Math.max(-1, Math.min(1, -(e.clientY - touch.y) / 70));
});
const endTouch = (e) => { if (e.pointerId === touch.id) { touch.id = null; touch.turn = touch.thrust = 0; } };
canvas.addEventListener("pointerup", endTouch);
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
  const { turn, thrust, up } = input();
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
function nodeName(ll) {
  const { node } = nearestNode(ll.lat, ll.lon);
  return CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
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
    ].join("\n");
    return;
  }
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z);
  const ground = world.terrain.heightAt(state.pos.x, state.pos.z);
  const { node, meters } = nearestNode(ll.lat, ll.lon);
  const cls = CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
  const where = ground < 0 ? `sea, ${Math.round(-ground)} m deep` : `${biomeFor(interimTemperature(ll.lat, ground))} (interim)`;
  hud.textContent = [
    `${state.mode.toUpperCase()}  ${Math.round(state.pos.y)} M  ·  ${where}`,
    `${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)}`,
    `LEY NODE ${(meters / 1000).toFixed(1)} KM  ${cls}`,
    STATS.map((k) => `${k.toUpperCase()} ${bar(stats[k])}`).join("  "),
  ].join("\n");
}

// ---- Loop ----
let sunState = null, lastSun = -Infinity, lastHud = -Infinity;
const t0 = performance.now();
const t0Unix = Date.now() / 1000;
let last = t0;
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000), t = (nowMs - t0) / 1000;
  last = nowMs;
  const view = state.ride ? rideView(dt, t) : worldView(dt, t);

  // The real sun for this place and moment (refreshed every 10 s).
  if (t - lastSun > 10 || !sunState) {
    sunState = sunPosition(now(), view.ll.lat, view.ll.lon);
    lastSun = t;
  }
  const dir = sunDirection(sunState);
  const horizon = sky.update(sunState.altitude, dir, camera);
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
    scene.fog.far = Math.min(700000, Math.max(40000, horizonM * 1.2));
    scene.fog.near = scene.fog.far * 0.25;
  }
  sky.group.visible = !underwater;
  if (world) world.highways.group.visible = !underwater;
  sea.underwater = underwater;
  scene.background = scene.fog.color;

  sea.mesh.position.set(camera.position.x, 0, camera.position.z); // its waves are keyed to world position
  sea.update(t, dir, day, horizon);
  // The shared clock: the real one, or ?t= when it's fixed. Sky beings and
  // clouds follow it, so every player sees the same sky.
  const unix = (fixedTime ? fixedTime.getTime() / 1000 : t0Unix) + t;
  if (world) world.highways.update(t);
  if (world) window.__dream.beings = world.beings.update(unix, t);
  clouds.group.visible = !underwater && !state.ride && !!world;
  if (clouds.group.visible) window.__dream.puffs = clouds.update(world.frame, view.ll, camera, unix, sunState.altitude, day, horizon, world.terrain.heightAt);
  if (t - lastHud > 0.25) { updateHud(); lastHud = t; }
  curveUniform.value.copy(camera.position); // the Earth curves away from the eye
  renderer.render(scene, camera);
  window.__dream.frames++;
  requestAnimationFrame(frame);
}

function worldView(dt, t) {
  step(dt);
  if (state.ride) return rideView(0, t); // boarded this frame
  const p = state.pos;
  creature.group.position.set(p.x, p.y + (state.mode === "water" ? Math.sin(t * 2) * 0.4 : 0), p.z);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / 60) });

  // Camera: behind and above, lower under water.
  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  const back = state.mode === "water" ? 45 : 85, upOff = state.mode === "water" ? 10 : 28;
  const want = new THREE.Vector3(p.x - fx * back, p.y + upOff, p.z - fz * back);
  const camGround = world.terrain.heightAt(want.x, want.z);
  if (camGround >= 0) want.y = Math.max(want.y, camGround + 6);
  camera.position.lerp(want, Math.min(1, dt * 4));
  camera.lookAt(p.x + fx * 20, p.y + 6, p.z + fz * 20);
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
  camera.position.set(-fx * 140, LEY_ALT + 45, -fz * 140);
  camera.lookAt(fx * 40, LEY_ALT + 8, fz * 40);
  rideFx.update(r, makeFrame(ll.lat, ll.lon), t, state.heading, dt);
  return { ll, pos: rideOrigin, underwater: false };
}

// ---- Boot ----
window.__dream = { seed, stats, spawn, triangles: creature.triangles, ready: false, frames: 0, state, objects: { sea: sea.mesh, clouds: clouds.group, sky: sky.group } };
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
