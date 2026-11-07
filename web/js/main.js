// Dream of the Earth, single-player, step 0: a low-poly piece of the real
// Earth near a ley node, its real sun, the golden highways, and one creature.
import * as THREE from "three";
import { makeFrame, offset } from "./geo.js";
import { network, nearestNode, CLASSES } from "./ley.js";
import { sunPosition, sunDirection } from "./sun.js";
import { mulberry32, hashString } from "./rng.js";
import { generateCreature } from "./creature-graph.js";
import { buildCreature } from "./creature.js";
import { buildTerrain, buildSea } from "./terrain.js";
import { buildHighways } from "./highways.js";
import { buildSky } from "./sky.js";
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xff9ec7, 2500, 22000);
const camera = new THREE.PerspectiveCamera(62, 1, 1, 400000);
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
const sea = buildSea(160000);
scene.add(sea.mesh);

// ---- The creature ----
const graph = generateCreature(seed);
const creature = buildCreature(graph, stats);
scene.add(creature.group);
const state = { pos: new THREE.Vector3(), heading: spawnRand() * Math.PI * 2, speed: 0, vy: 0, mode: "air" };

// ---- The world around us (rebuilt as we travel) ----
let world = null, rebuilding = false;
async function buildWorld(lat, lon) {
  const frame = makeFrame(lat, lon);
  const terrain = await buildTerrain(frame, lat, lon);
  const highways = buildHighways(frame, terrain.heightAt);
  const group = new THREE.Group();
  group.add(terrain.mesh, highways.group);
  return { frame, terrain, highways, group };
}
function swapWorld(next) {
  if (world) {
    const ll = world.frame.toLatLon(state.pos.x, state.pos.z);
    const p = next.frame.toLocal(ll.lat, ll.lon);
    state.pos.x = p.x; state.pos.z = p.z;
    scene.remove(world.group);
    world.group.traverse((o) => { o.geometry?.dispose(); });
  }
  world = next;
  scene.add(world.group);
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

  // Travel far enough and the world is regrown around us.
  if (!rebuilding && Math.hypot(p.x, p.z) > 15000) {
    rebuilding = true;
    const ll = world.frame.toLatLon(p.x, p.z);
    setStatus("the dream shifts…");
    buildWorld(ll.lat, ll.lon).then((w) => { swapWorld(w); setStatus(""); }).finally(() => { rebuilding = false; });
  }
}

// ---- HUD ----
const hud = document.getElementById("hud");
const statusEl = document.getElementById("status");
const setStatus = (s) => { statusEl.textContent = s; statusEl.hidden = !s; };
const bar = (n) => "■".repeat(n) + "□".repeat(MAX - n);
function updateHud() {
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
let last = t0;
function frame() {
  const nowMs = performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000), t = (nowMs - t0) / 1000;
  last = nowMs;
  step(dt);
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

  // The real sun for this place and moment (refreshed every 10 s).
  if (t - lastSun > 10 || !sunState) {
    const ll = world.frame.toLatLon(p.x, p.z);
    sunState = sunPosition(now(), ll.lat, ll.lon);
    lastSun = t;
  }
  const dir = sunDirection(sunState);
  const horizon = sky.update(sunState.altitude, dir, camera);
  const day = Math.max(0, Math.min(1, (sunState.altitude + 6) / 16));
  sunLight.position.set(p.x + dir.x * 10000, p.y + dir.y * 10000, p.z + dir.z * 10000);
  sunLight.target.position.copy(p);
  sunLight.intensity = 0.15 + 2.2 * day;
  hemi.intensity = 0.45 + 0.9 * day;

  // Under the sea: a murky blue world. The sky and the highways ignore fog by
  // design, so they're hidden down here, and the surface reads as a ceiling.
  const underwater = camera.position.y < 0 && world.terrain.heightAt(camera.position.x, camera.position.z) < camera.position.y;
  if (underwater) { scene.fog.color.setHex(0x0b3b6e); scene.fog.near = 5; scene.fog.far = 700; }
  else { scene.fog.color.copy(horizon); scene.fog.near = 2500; scene.fog.far = 22000; }
  sky.group.visible = !underwater;
  world.highways.group.visible = !underwater;
  sea.mesh.material.opacity = underwater ? 0.92 : 0.55;
  scene.background = scene.fog.color;

  sea.mesh.position.set(Math.round(p.x / 4000) * 4000, 0, Math.round(p.z / 4000) * 4000);
  sea.update(t);
  world.highways.update(t);
  if (t - lastHud > 0.25) { updateHud(); lastHud = t; }
  renderer.render(scene, camera);
  window.__dream.frames++;
  requestAnimationFrame(frame);
}

// ---- Boot ----
window.__dream = { seed, stats, spawn, triangles: creature.triangles, ready: false, frames: 0, state };
setStatus("dreaming…");
buildWorld(spawn.lat, spawn.lon).then((w) => {
  swapWorld(w);
  const ground = w.terrain.heightAt(0, 0);
  state.pos.set(0, Math.max(0, ground) + 350, 0);
  camera.position.set(0, state.pos.y + 40, 120);
  setStatus(w.terrain.failed ? `${w.terrain.failed} elevation tiles didn't load; that ground is drawn at sea level` : "");
  window.__dream.ready = true;
  requestAnimationFrame(frame);
}).catch((e) => { setStatus(`the dream failed to start: ${e.message}`); console.error(e); });
