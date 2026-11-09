// Dream of the Earth, single-player: a low-poly piece of the real Earth near a
// ley node, its real sun, the golden highways you can ride, and one creature.
import * as THREE from "three";
import { makeFrame, offset, vecToLatLon } from "./geo.js";
import { network, nearestNode, CLASSES } from "./ley.js";
import { sunPosition, sunDirection } from "./sun.js";
import { mulberry32, hashString } from "./rng.js";
import { generateCreature, parseGenes, sizeOf } from "./creature-graph.js";
import { breathUniforms } from "./breath.js";
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
import { RANGE, critterLine, fledLine, treeLine, butterflyLine, beingLine, selfLine, highwayLine, creatureName, promptFor, chooseFocus, glinting, cairnLine, ago } from "./interactions.js";
import { buildGlints } from "./glints.js";
import { buildCairns } from "./cairns.js";
import { discover, discoverWorld, didOf, handlesOf, getRecord, currentIntents, visibleAmong, setMuted, isBot, pigeonsFor } from "./atproto.js";
import { PIGEON_NSID, makePigeon, parsePigeon, arrivalOf, flownOff } from "./pigeons.js";
import { buildPigeonFx } from "./pigeonfx.js";
import { realmLayout, floorAt, lowest, REALMS, GATHER_M, REALM_ALT, TURN } from "./realm.js";
import { buildRealmFx, FOG as REALM_FOG } from "./realmfx.js";
import { rhizomeOf, viewOf, canSlot, canUnslot, effectsOf, cleanFilled, POWERS, GEM_OF as GEM_OF_COLOUR } from "./rhizome.js";
import { buildRhizomeView, effectsWords } from "./rhizomeview.js";
import { spotUrl, defaultText, makeShotPost, postWebUrl, IMAGE_MAX_BYTES } from "./share.js";
import { buildShareSheet } from "./sharesheet.js";
import { makeIntent, parseIntent, driftOf, whereAt, fresh, INTENT_NSID, HEARTBEAT_S, STALE_S, MOMENT_S } from "./intents.js";
import { listen } from "./presence.js";
import { buildFlock } from "./flock.js";
import { makeCairn, parseArtifact, renew, fadeOf, MOON_S, cairnForm, byDistance, metresBetween, distanceText, NSID as ARTIFACT_NSID } from "./artifacts.js";
import { account, isReturning, takeReturn } from "./account.js";
import { buildMaker, h } from "./maker.js";
import { buildEditor } from "./editor.js";
import { buildBag } from "./bag.js";
import { makeAtlasRecord, parseAtlasRecord, mergeAtlas, mergeBeen, atlasKey } from "./atlas-record.js";
import { BORN, ASLEEP, WAKER, bornOf, asleep, effective, bornStats, maxDepth, spawnAround } from "./birth.js";
import { buildFinds, FIND_COLOUR } from "./finds.js";
import { ensureKoppen, koppenAt } from "./koppen.js";
import { buildAtlas } from "./atlas.js";
import { firstInventory, moonseedFor, spend, refund, countOf, makeInventoryRecord, parseInventoryRecord, reconcileInventory, nextSeedAt, kitUp, wornOf, wearing, wear, takeOff, ITEMS, WORN_MAX, boostsOf, take, tookHere, receive, hadPigeon, slotGem, unslotGem, portalFor, nextPortalAt } from "./inventory.js";
import { whenText, lunationOf } from "./moon.js";
import { buildShrines } from "./shrines.js";
import { zoomReach, zoomStep, ZOOM_REACH, FEATHER_S, LIFT_TO } from "./zoomreach.js";
import { SPELLS, SPELL_S, EASE_S, KIND_COLOUR, spellWeight, shapeOf, sunAhead, turnOf, WAKES, skyState, wokeAt } from "./shrinelore.js";
import { buildWorldview } from "./worldview.js";
import { skyClock, horizontal, zodiac, PLANETS, GLYPH, moonEcliptic, planetEcliptic, sunLongitude } from "./astro.js";
import { makeCreatureRecord, parseCreatureRecord, reconcile } from "./creature-record.js";
import { sound } from "./sound.js";
import { logLine } from "./eventlog.js";
import { buildBursts } from "./bursts.js";
import { buildDirector, squeakShot, treeShot, butterflyShot, beingShot, arriveShot, boardShot, cairnShot, portraitShot, portraitAngle, portraitDistance } from "./director.js";
import { buildSkyBeings } from "./skybeings.js";
import { randomStats, parseStats, speeds, STATS, MAX, TYPICAL_SCALE, statsList, sightOf, SEE_BEINGS, JUMP_G } from "./stats.js";
import { biomeFor, koppenCode } from "./biome.js";
import { buildPlants } from "./plants.js";
import { buildInsects } from "./insects.js";
import { buildCritters } from "./critters.js";
import { LANDMARKS, landmarkQuery } from "./landmarks.js";
import { governDetail, median, DETAIL_MIN, DETAIL_MAX } from "./detail.js";

// ---- Who and where (URL params make any spawn reproducible) ----
const params = new URLSearchParams(location.search);
// Back from signing in with Bluesky: the page reloaded at its bare address, so put back where you were.
if (isReturning()) { const back = takeReturn(); if (back) for (const [k, v] of new URLSearchParams(back)) params.set(k, v); }
// Your creature is yours: kept on this device (seed, genes, stats), made in the editor, and (signed in) in your repo
// so it follows you to any device. A ?seed in the URL shows that creature instead (with your changes, if it's yours).
const CREATURE_KEY = "dream.creature";
/** { seed, genes, stats, at (ms, when you last changed it), chosen (false: one you only happened to meet) } or null. */
function keptCreature() {
  try {
    const v = JSON.parse(localStorage.getItem(CREATURE_KEY) || "null");
    if (!v || !Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff) return null;
    const stats = Array.isArray(v.stats) ? parseStats(v.stats.join(",")) : null;
    return { seed: v.seed, genes: parseGenes(v.genes), stats, born: BORN.includes(v.born) ? v.born : null, at: Number.isFinite(v.at) ? v.at : 0, chosen: v.chosen !== false };
  } catch { return null; }
}
const kept = keptCreature();
const seedParam = params.get("seed");
const urlSeed = seedParam ? (/^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : hashString(seedParam)) : null;
const yours = urlSeed === null || urlSeed === kept?.seed ? kept : null;
let seed = urlSeed ?? yours?.seed ?? (Math.random() * 2 ** 32) >>> 0;
let genes = yours?.genes ?? null;
let stats = parseStats(params.get("stats")) || yours?.stats || randomStats(mulberry32(hashString(`stats:${seed}`)));
// Born of land or sea (birth.js): chosen on your first visit; a creature from before (or from a link) leans where its stats do.
let born = bornOf(stats, BORN.includes(params.get("born")) ? params.get("born") : yours?.born);
const newcomer = !kept && urlSeed === null && !params.get("born"); // asked where they were born, before they wake
let sp = speeds(stats);
let showingMine = yours !== null || urlSeed === null; // the creature on screen is the one you keep
function keepCreature(at = Date.now(), chosen = true) {
  showingMine = true;
  try { localStorage.setItem(CREATURE_KEY, JSON.stringify({ seed, genes, stats: STATS.map((k) => stats[k]), born, at, chosen })); } catch { /* private mode */ }
}
if (!kept && urlSeed === null && !newcomer) keepCreature(0, false); // the first creature you meet is yours (until you choose another)
// ---- What you carry (inventory.js): kept on this device and, signed in, in your repo ----
const INVENTORY_KEY = "dream.inventory";
/** { items, lunation, at (ms, when it last changed here), changed (false: a pouch this device only started) } */
function keptInventory() {
  try {
    const v = JSON.parse(localStorage.getItem(INVENTORY_KEY) || "null");
    if (!v) return null;
    const p = parseInventoryRecord({ items: v.items, worn: v.worn, kit: v.kit, lunation: v.lunation, portalMoon: v.portalMoon, took: v.took, got: v.got, rhizome: v.rhizome });
    return p && { items: p.items, worn: p.worn, kit: p.kit, lunation: p.lunation, portalMoon: p.portalMoon, took: p.took, got: p.got, rhizome: p.rhizome, at: Number.isFinite(v.at) ? v.at : 0, changed: !!v.changed };
  } catch { return null; }
}
let inv = keptInventory() || { ...firstInventory(Date.now() / 1000), at: 0, changed: false }; // a moonseed and a prism to begin with
inv = { ...kitUp(inv), at: inv.at, changed: inv.changed }; // a pouch from before the prism is given one
let invAt = -Infinity; // when it last changed (s), so your repo gets it once things settle
let bagView = null;
function keepInventory(next, { changed = true, at = Date.now() } = {}) {
  const wasWorn = `${wornOf(inv).join(",")}|${inv.rhizome ? [...rhiz().fx.looks].join(",") : ""}`;
  next = kitUp(next);
  // Your rhizome's seed, set once (from your creature's, the first time), so it stays yours whatever creature you become.
  if (next.rhizome?.seed == null) next = { ...next, rhizome: { seed: hashString(`rhizome:${seed}`) >>> 0, slots: next.rhizome?.slots ?? {} } };
  inv = { items: next.items, worn: wornOf(next), kit: next.kit, lunation: next.lunation, portalMoon: next.portalMoon ?? -1, took: next.took ?? { lunation: -1, keys: [] }, got: next.got ?? [], rhizome: next.rhizome, at, changed };
  invAt = Date.now() / 1000;
  try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)); } catch { /* private mode */ }
  bagView?.refresh(); // the BAG button, once it exists
  if (`${wornOf(inv).join(",")}|${[...rhiz().fx.looks].join(",")}` !== wasWorn) wornChanged?.();
  rhizomeChanged?.();
}
let wornChanged = null; // set once the creature exists: what you wear shows on it
let rhizomeChanged = null; // set once the rhizome's view exists
// ---- Your rhizome (rhizome.js): grown from your own seed; the gems you've set wake what lies between them ----
let rz = { key: "", R: null, filled: {}, fx: { boosts: {}, ceilings: {}, powers: new Set(), deeper: new Set(), looks: new Set() } };
function rhiz() {
  const r = inv?.rhizome;
  if (!r || r.seed == null) return rz;
  const key = `${r.seed}:${JSON.stringify(r.slots)}`;
  if (rz.key !== key) {
    const R = rz.R && rz.R.seed === r.seed ? rz.R : rhizomeOf(r.seed), filled = cleanFilled(R, r.slots);
    rz = { key, R, filled, fx: effectsOf(R, filled) };
  }
  return rz;
}
const hasPower = (p) => rhiz().fx.powers.has(p);
keepInventory(inv, { changed: inv.changed, at: inv.at });
// Separate streams, so choosing your stats doesn't move your spawn. A creature named in the URL lands where its
// seed says, so any spawn is reproducible; your own lands somewhere new each visit.
const spawnRand = mulberry32(hashString(`spawn:${urlSeed ?? (Math.random() * 2 ** 32) >>> 0}`));
// The clock: the real one, or from ?t= (or a landmark) onward. Sun, clouds and sky beings all follow it.
// The clock is the real one, always (Jason, 11-09: "pin to actual clock time so we can use an astrological clock for the
// game"); no ?t= any more, so the sun, the Moon, the planets and everything keyed to them are where they really are.
const clock = { base: Date.now() / 1000, at: 0 };
const unixAt = (sessionSeconds) => clock.base + (sessionSeconds - clock.at);

let spawn; // where you wake: provisional here, settled by birth at boot (wakePlace)
const spawnFixed = !!(params.get("lat") && params.get("lon"));
if (spawnFixed) {
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
let graph = generateCreature(seed, genes);
let creature = buildCreature(graph, stats, wornOf(inv), [...rhiz().fx.looks]);
// Where it looks from: just in front of its eyes (or its head, or the front of its body), in its own units.
function eyeOf(graph) {
  const eyes = graph.parts.filter((p) => p.kind === "eye"), heads = graph.parts.filter((p) => p.kind === "head");
  const src = eyes.length ? eyes : heads;
  if (!src.length) { const b = graph.parts.find((p) => p.kind === "body"); return new THREE.Vector3(0, (b?.size[1] ?? 3) * 0.4, -(b?.size[2] ?? 5) * 0.6 - 0.5); }
  const avg = (k) => src.reduce((n, p) => n + p.pos[k], 0) / src.length;
  return new THREE.Vector3(avg(0), avg(1) + 0.2, Math.min(...src.map((p) => p.pos[2] - (p.size?.[2] ?? 1))) - 0.6);
}
let eyeLocal = eyeOf(graph);
/** How see-through the creature is (1 = solid). Translucent, it draws after the sky, or the sky pass would paint over it. */
let creatureOpacity = 1, footLift = 0;
let editing = false; // the creature editor is open: the camera looks at it, not through it
/** The stat your wings run on: climb, until the dream quest gives flight its own (Jason, 11-09). */
const wings = () => body().fly; // 0 until the rhizome's Wings wake (then the fly stat, from the same twelve points)
/** Perception 3 and up sees the sky beings. */
/**
 * The stats your body uses now: the one your birth put to sleep counts as nothing until you wear what wakes it, and
 * what you wear adds (the owl's eye: perception).
 */
const body = () => {
  const fx = rhiz().fx, boosts = { ...boostsOf(inv) };
  for (const [k, n] of Object.entries(fx.boosts)) boosts[k] = (boosts[k] ?? 0) + n;
  return effective(stats, born, wornOf(inv), { boosts, ceilings: fx.ceilings, wings: fx.powers.has("wings") });
};
/** The most a stat can hold now: six, and one more for each of the rhizome's raises (nine at most). */
const ceilingOf = (k) => Math.min(9, MAX + (rhiz().fx.ceilings[k] ?? 0));
const seesBeings = () => body().perception >= SEE_BEINGS;
/** The ley lines (the highways) show, and carry you, only while you wear a prism (Jason, 11-09: "ley lines are invisible without the correct item"). */
const seesLey = () => wearing(inv, "prism") || hasPower("leysight");
/** The HUD's stats, on two lines: as your body has them (a sleeping stat says so; one your worn things lift shows +). */
const statsLines = () => {
  const b = body();
  const one = (k) => k === "fly" && !hasPower("wings") ? "FLY · NO WINGS" : asleep(k, born, wornOf(inv)) ? `${k.toUpperCase()} ASLEEP (${ITEMS[WAKER[born]].name.toUpperCase()})` : `${k.toUpperCase()} ${bar(b[k], ceilingOf(k))}${b[k] > stats[k] ? "+" : ""}`;
  return [STATS.slice(0, 3), STATS.slice(3)].map((ks) => ks.map(one).join("  ")).join("\n");
};
let steepAt = -Infinity, deepAt = -Infinity;
/** Diving past your depth: said once in a while. */
function tooDeep() {
  if (simT - deepAt < 20) return;
  deepAt = simT;
  const m = Math.round(maxDepth(body().swim));
  logLine(asleep("swim", born, wornOf(inv)) ? `${myName}'s swim sleeps: born on land, it can only duck under. A tidefin would wake it.` : `Too deep for ${myName}: ${m} m is as far down as it can go. More swim would take it deeper.`, "note");
}
/** Walking into a slope too steep for you: said once in a while. */
function tooSteep() {
  if (simT - steepAt < 20) return;
  steepAt = simT;
  logLine(`Too steep for ${myName}. More climb would do it, or another way round.`, "note");
}
// Shrines' spells (shrinelore.js): a minute of another shape, another camera, another world. Each { id, t0, endAt }.
const spells = { shape: null, camera: null, world: null };
let spellZoom = 1, spellLegs = 1, masks = 0, shrineTickAt = -Infinity;
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
/** Your creature as it is: { seed, genes, stats }, and a key that changes when its look does. */
const myCreature = () => ({ seed, genes, stats, born });
const keyOf = (c) => `${c.seed}:${STATS.map((k) => c.stats[k]).join(",")}:${JSON.stringify(parseGenes(c.genes))}:${bornOf(c.stats, c.born)}`;
const lookKey = () => keyOf(myCreature());
/** What mutuals see of you: your look and what you wear. */
const shownKey = () => `${lookKey()}:${wornOf(inv).join(",")}:${[...rhiz().fx.looks].join(",")}`;
let lookAt = -Infinity; // when the look last changed (real seconds), so mutuals get it once you've settled
/** A new look (from the editor, or your repo): regrow the creature where it stands, keep it, and tell mutuals once you've settled. */
/** Swap the body on screen for one grown from g (your own, or a shrine's mask), where it stands. */
function swapBody(g) {
  const was = creature;
  graph = g;
  creature = buildCreature(graph, stats, wornOf(inv), [...rhiz().fx.looks]);
  creature.group.position.copy(was.group.position);
  creature.group.rotation.copy(was.group.rotation);
  scene.remove(was.group);
  was.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  scene.add(creature.group);
  layerTransparent(creature.group);
  const o = creatureOpacity; // translucent (looking through its eyes) stays translucent
  creatureOpacity = 1;
  fadeCreature(o);
  eyeLocal = eyeOf(graph);
}
function setCreature(next, at = Date.now()) {
  if (spells.shape?.id === "mask") spells.shape = null; // a new look takes the mask off
  seed = next.seed >>> 0;
  genes = parseGenes(next.genes);
  stats = next.stats;
  born = bornOf(stats, next.born);
  swapBody(generateCreature(seed, genes));
  sp = speeds(body(), graph.scale / TYPICAL_SCALE);
  myName = creatureName(seed);
  keepCreature(at);
  lookAt = realNow();
  // A URL that names a creature keeps naming this one.
  if (params.has("seed")) {
    const q = new URLSearchParams(location.search);
    q.set("seed", String(seed));
    q.set("stats", statsList(stats).join(","));
    history.replaceState(null, "", `?${q}`);
  }
  Object.assign(window.__dream, { seed, stats, genes, triangles: creature.triangles });
}
// The camera is run by a director (director.js): framing by what you're doing, and shots for what happens.
const director = buildDirector(camera);
const worldview = buildWorldview(); // the full-screen pass a world spell (or the fisheye) draws through

/** How a spell of this kind holds now: { id, age, w (its strength, eased), fade (1, falling once you end it) }. */
function spellNow(kind) {
  const s = spells[kind], none = { id: null, age: 0, w: 0, fade: 0 };
  if (!s) return none;
  const age = simT - s.t0, f = s.endAt === null ? 1 : Math.max(0, 1 - (simT - s.endAt) / EASE_S), fade = f * f * (3 - 2 * f);
  if (age >= SPELL_S || f <= 0) { endSpell(kind); return none; }
  return { id: s.id, age, w: spellWeight(age) * fade, fade };
}
const LIFTED = { shape: "You're yourself again.", camera: "The view settles.", world: "The world comes back to itself." };
function endSpell(kind, quiet = false) {
  const s = spells[kind];
  if (!s) return;
  spells[kind] = null;
  if (s.id === "mask") swapBody(generateCreature(seed, genes));
  if (kind === "world" && s.id === "days") lastSun = -Infinity; // the sun comes straight back to now
  if (!quiet && s.endAt === null) logLine(LIFTED[kind], "shrine"); // ended by you, it was already said
}
/** A shrine touched: its spell takes you (the same again renews it; another of its kind replaces it). */
// ---- The shrines keep the astrological clock (shrinelore.js): asleep, awake, or resting for you ----
const SHRINES_KEY = "dream.shrines";
/** When you last took each shrine's gift (s), on this device; forgotten after two moons. */
const shrineUsed = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(SHRINES_KEY) || "{}") || {}, old = Date.now() / 1000 - 60 * 86400;
    for (const k of Object.keys(v)) if (!(v[k] > old)) delete v[k];
    return v;
  } catch { return {}; }
})();
const shrineSky = (ll) => ({
  moonLon: (t) => moonEcliptic(t).lon, sunLon: sunLongitude, mercuryLon: (t) => planetEcliptic("mercury", t).lon,
  moonAlt: (t) => horizontal(moonEcliptic(t), t, ll.lat, ll.lon).altitude, sunAlt: (t) => sunPosition(new Date(t * 1000), ll.lat, ll.lon).altitude,
});
let shrineClock = { t: 0, sky: null, state: null };
const wokeCache = {}; // spell -> { woke (s), until (s) }: when its present waking began, worked out at most every 10 minutes
function shrineStateOf(home) {
  if (!shrineClock.state || home.key === "test") return "awake";
  if (!WAKES[home.spell].test(shrineClock.state)) { delete wokeCache[home.spell]; return "asleep"; }
  const used = shrineUsed[home.key];
  if (used == null) return "awake";
  let c = wokeCache[home.spell];
  if (!c || c.until < shrineClock.t) c = wokeCache[home.spell] = { woke: wokeAt(home.spell, shrineClock.t, shrineClock.sky) ?? Infinity, until: shrineClock.t + 600 };
  return used >= c.woke ? "resting" : "awake";
}
// The rhizome's shrine waking: a sleeping shrine wakes for you when you touch it, once a moon each.
const WOKEN_KEY = "dream.woken";
const shrineWoken = (() => { try { return JSON.parse(localStorage.getItem(WOKEN_KEY) || "{}") || {}; } catch { return {}; } })();
const canWake = (home) => hasPower("shrinewake") && home.key !== "test" && shrineWoken[home.key] !== lunationOf(realNow());
/** Every few seconds: the sky where you are, and every shrine around shown asleep, awake or resting. */
function shrineTick() {
  if (!world) return;
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z), sky = shrineSky(ll), t = realNow();
  shrineClock = { t, sky, state: skyState(t, sky) };
  world.shrines.setStates(shrineStateOf);
}
const capital = (s) => s[0].toUpperCase() + s.slice(1);
// ---- Your atlas: shrines you've found, to travel back to (11-09). Kept on the device and, signed in, in your repo
// (Jason: "I'm okay with publishing the atlas to the repo!"), so it follows you. ----
const ATLAS_KEY = "dream.atlas";
const atlasStored = (() => { try { const v = JSON.parse(localStorage.getItem(ATLAS_KEY) || "{}") || {}; return parseAtlasRecord(makeAtlasRecord(v.shrines || {}, 0, { nodes: v.nodes || {}, marks: v.marks || {} })); } catch { return { shrines: {}, nodes: {}, marks: {} }; } })();
const found = atlasStored.shrines;
/** The ley nodes (by index) and landmarks (by name) you've been to, with when you first were (s). */
const been = { nodes: atlasStored.nodes, marks: atlasStored.marks };
const placesFound = () => Object.keys(found).length + Object.keys(been.nodes).length + Object.keys(been.marks).length;
function keepAtlas() {
  try { localStorage.setItem(ATLAS_KEY, JSON.stringify({ shrines: found, nodes: been.nodes, marks: been.marks })); } catch { /* private mode */ }
  atlasView?.refresh(placesFound());
  globe.setShrines(foundList());
}
const NODE_REACH_M = 2000, MARK_REACH_M = 3000;
/** Being near a ley node or a landmark puts it in your atlas (checked every few seconds). */
function discoverPlaces() {
  if (!world || state.realm) return;
  const ll = state.ride ? rideLatLon(state.ride) : world.frame.toLatLon(state.pos.x, state.pos.z), now = Math.round(realNow());
  let added = false;
  const { node, meters } = nearestNode(ll.lat, ll.lon), i = network().nodes.indexOf(node);
  if (!state.ride && meters < NODE_REACH_M && i >= 0 && been.nodes[i] == null) {
    been.nodes[i] = now; added = true;
    logLine(`This ley node (${nodeName(ll)}) is in your atlas now: you can travel back to it.`, "highway");
  }
  for (const l of LANDMARKS) {
    if (been.marks[l.name] != null || metresBetween(ll.lat, ll.lon, l.lat, l.lon) > MARK_REACH_M) continue;
    been.marks[l.name] = now; added = true;
    logLine(`You've been to ${l.name}. It's in your atlas.`, "note");
  }
  if (added) keepAtlas();
}
/** Walking up to a shrine puts it in your atlas. */
function discoverShrines() {
  if (!world) return;
  for (const s of world.shrines.near(state.pos.x, state.pos.z, RANGE.shrine + 6)) {
    if (found[s.key]) continue;
    found[s.key] = { lat: s.lat, lon: s.lon, spell: s.spell, at: Math.round(realNow()) };
    keepAtlas();
    logLine(`You've found ${SPELLS[s.spell].name}. You can travel back to it from your atlas.`, "shrine");
  }
}
const foundList = () => [
  ...Object.entries(found).filter(([, f]) => SPELLS[f.spell]).map(([key, f]) => ({ key, ...f, colour: KIND_COLOUR[SPELLS[f.spell].kind] })),
  ...Object.keys(been.nodes).map((i) => { const n = network().nodes[i]; return n && { key: `node${i}`, lat: n.lat, lon: n.lon, colour: 0xffe9a8 }; }).filter(Boolean),
  ...LANDMARKS.filter((l) => been.marks[l.name] != null).map((l) => ({ key: `mark:${l.name}`, lat: l.lat, lon: l.lon, colour: 0xb9f0ff })),
];
/** Off to a place in your atlas: a shrine (22 m south of it, facing it), a ley node, or a landmark you've been to. */
function travelToShrine(key) {
  if (key.startsWith("node")) {
    const i = Number(key.slice(4)), n = network().nodes[i];
    if (n && been.nodes[i] != null) teleport({ name: `a ley node (${nodeName(n)})`, lat: n.lat, lon: n.lon, alt: 30, heading: 0, zoom: 120 });
    return;
  }
  if (key.startsWith("mark:")) {
    const l = LANDMARKS.find((q) => q.name === key.slice(5));
    if (l && been.marks[l.name] != null) teleport(l);
    return;
  }
  const f = found[key];
  if (!f) return;
  teleport({ name: SPELLS[f.spell].name, lat: f.lat - 22 / 111320, lon: f.lon, alt: 2, heading: 0, zoom: ZOOM_HOME });
}
let atlasView = null;
function castSpell(sh) {
  const def = SPELLS[sh.spell], cur = spells[def.kind];
  // Asleep, it does nothing; resting, it has given you its gift this waking.
  const st = shrineStateOf(sh);
  if (st === "asleep" && canWake(sh)) { // the rhizome's shrine waking: it wakes for you, once a moon
    shrineWoken[sh.key] = lunationOf(realNow());
    try { localStorage.setItem(WOKEN_KEY, JSON.stringify(shrineWoken)); } catch { /* private mode */ }
    logLine(`${capital(def.name)} wakes for you.`, "shrine");
  } else if (st === "asleep") { logLine(`${capital(def.name)} sleeps. It wakes ${WAKES[sh.spell].when}.${hasPower("shrinewake") ? " (You've woken it once this moon.)" : ""}`, "shrine"); return; }
  if (st === "resting") { logLine(`${capital(def.name)} rests: it has given you its gift this waking. It wakes again ${WAKES[sh.spell].when}.`, "shrine"); return; }
  if (sh.key !== "test") {
    shrineUsed[sh.key] = realNow();
    try { localStorage.setItem(SHRINES_KEY, JSON.stringify(shrineUsed)); } catch { /* private mode */ }
    if (world) world.shrines.setStates(shrineStateOf);
  }
  if (cur && cur.id === sh.spell && cur.endAt === null) {
    if (sh.spell !== "turning" && sh.spell !== "days") cur.t0 = Math.max(cur.t0, simT - EASE_S); // another minute, at full strength
    cur.key = sh.key;
  } else {
    if (cur) endSpell(def.kind, true);
    spells[def.kind] = { id: sh.spell, t0: simT, endAt: null, key: sh.key };
    if (sh.spell === "mask") swapBody(generateCreature(hashString(`${sh.key}:${masks++}`))); // the same masks, in the same order, for everyone
  }
  if (sh.spell === "soaring") zoomGoal = LIFT_TO.soaring; // up, and up, to the whole Earth
  sound.shrine(def.kind);
  bursts.emit({ at: new THREE.Vector3(sh.x, sh.y, sh.z), colors: [new THREE.Color(KIND_COLOUR[def.kind]), new THREE.Color(0xffffff)], n: 26, spread: 2.5, up: 3, fall: 0.5, life: 2.2 });
  logLine(def.line, "shrine");
  if (sh.key !== "test" && !dreamtNow(sh)) logLine("Its dream is open while the spell holds: touch the shrine again to go in.", "shrine");
}
/** Escape: every spell eases off. */
function endSpells() {
  let any = false;
  for (const k of Object.keys(spells)) if (spells[k] && spells[k].endAt === null) { spells[k].endAt = simT; any = true; }
  return any;
}
/** After the director has placed the camera: the upturned sky, the slow turning, the fisheye's wide eye. */
function cameraSpell() {
  const c = spellNow("camera");
  if (c.id === "upturned") camera.rotateZ(Math.PI * c.w);
  else if (c.id === "turning") camera.rotateZ(turnOf(c.age) * c.fade);
  else if (c.id === "fisheye") { camera.fov += (118 - camera.fov) * c.w; camera.updateProjectionMatrix(); }
}
/** What the full-screen pass does this frame. */
function worldSpell() {
  const w = spellNow("world"), c = spells.camera?.id === "fisheye" ? spellNow("camera") : null;
  worldview.uniforms.uHue.value = w.id === "colours" ? w.w : 0;
  worldview.uniforms.uKaleido.value = w.id === "kaleido" ? w.w : 0;
  worldview.uniforms.uMelt.value = w.id === "melt" ? w.w : 0;
  worldview.uniforms.uBarrel.value = c ? c.w * 0.8 : 0;
}
// ---- The astrological clock (astro.js): the Moon and the planets where they really are ----
let skyCache = null;
/** Directions to the Moon and the planets from here, at time t (unix s), refreshed once a second (or every frame while
 * the spinning days race the whole sky). { moon, planets: [8], clock } in the local frame. */
function skyNow(t, ll, simTime) {
  if (skyCache && Math.abs(t - skyCache.t) < 1 && Math.abs(ll.lat - skyCache.lat) < 0.05 && Math.abs(ll.lon - skyCache.lon) < 0.05) return skyCache;
  const clockNow = skyClock(t), dir = (b) => sunDirection(horizontal(b, t, ll.lat, ll.lon));
  const by = Object.fromEntries(clockNow.bodies.map((b) => [b.body, b]));
  skyCache = { t, lat: ll.lat, lon: ll.lon, clock: clockNow, moon: dir(by.moon), planets: PLANETS.map((p) => dir(by[p])) };
  return skyCache;
}
/** "☉♏17 ☽♏19 ☿♏6℞ …": where each body is in the tropical zodiac, ℞ when it's retrograde. */
/** U+FE0E after a symbol asks for its text form: ♏ as a glyph, not a purple emoji tile (Windows draws those). */
const TEXT = "\uFE0E";
function clockLine() {
  if (!skyCache) return "";
  const c = skyCache.clock, phase = c.moonLit < 0.03 ? "NEW MOON" : c.moonLit > 0.97 ? "FULL MOON" : `MOON ${Math.round(c.moonLit * 100)}% ${c.waxing ? "WAXING" : "WANING"}`;
  return `${c.bodies.map((b) => { const z = zodiac(b.lon); return `${b.glyph}${TEXT}${z.glyph}${TEXT}${Math.floor(z.deg)}${b.retro ? "℞" : ""}`; }).join(" ")}  ·  ${phase}`;
}
// Small glyphs under the Moon and each planet when they're up and on screen.
const skyLabels = Object.fromEntries(["moon", ...PLANETS].map((b) => {
  const el = document.createElement("div");
  el.className = "skyglyph";
  el.textContent = GLYPH[b] + TEXT;
  el.hidden = true;
  document.getElementById("whos").append(el);
  return [b, el];
}));
function placeSkyLabels(day) {
  const r = canvas.getBoundingClientRect(), v = new THREE.Vector3();
  const show = (el, d, below) => {
    if (!d || d.y < 0.02 || zoom > GLOBE_AT) { el.hidden = true; return; }
    v.set(d.x, d.y - below, d.z).multiplyScalar(1e5).add(camera.position).project(camera);
    el.hidden = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
    if (!el.hidden) { el.style.transform = `translate(${((v.x + 1) / 2) * r.width + r.left}px, ${((1 - v.y) / 2) * r.height + r.top}px) translate(-50%, 0)`; el.style.opacity = String(0.45 + 0.55 * (1 - day)); }
  };
  if (!skyCache) return;
  show(skyLabels.moon, skyCache.moon, 0.08);
  PLANETS.forEach((p, i) => show(skyLabels[p], skyCache.planets[i], 0.05));
}
/** The HUD's line for spells in force: "GIANT 42 S · TURNING 12 S". */
function spellsLine() {
  const out = Object.values(spells).filter(Boolean).map((s) => `${SPELLS[s.id].short} ${Math.max(0, Math.ceil(SPELL_S - (simT - s.t0)))} S`);
  const f = Math.ceil(featherLeft());
  if (f > 0) out.push(`FAR FEATHER ${Math.floor(f / 60)}:${String(f % 60).padStart(2, "0")}`);
  return out.join("  ·  ");
}
// Escape lifts the spells, unless it's closing a sheet or the say box (those listeners run after this one).
addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !document.getElementById("sheet").hidden || !document.getElementById("sayform").hidden) return;
  if (state.realm) { logLine("You wake before the dream is done. It stays open while the shrine is awake.", "shrine"); exitDream(); return; }
  if (endSpells()) logLine("You shake off the spells.", "shrine");
}, { capture: true });
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
  const critters = buildCritters(frame, terrain, plants);
  const shrines = buildShrines(frame, terrain);
  const finds = buildFinds(frame, terrain);
  finds.setTaken((f) => tookHere(inv, f.key, realNow())); // one you've had this moon isn't there for you
  const group = new THREE.Group();
  group.add(terrain.mesh, highways.group, beings.group, plants.group, insects.group, critters.group, shrines.group, finds.group);
  layerTransparent(group); // glows, sparkles and fireflies draw after the sky
  return { frame, terrain, highways, beings, plants, insects, critters, shrines, finds, group };
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
// The camera scales with the creature (CREATURE_M): close and low behind a creature now about 5 m long.
const ZOOM_MIN = 6, GLOBE_AT = 400000, ZOOM_HOME = 34;
// How far back your eye goes (zoomreach.js): about 500 m, unless a far feather or a shrine of the soaring eye lifts it
// for a while, or the rhizome's high view for good. A boost carries the eye up by itself (zoomGoal); ended, it sinks home.
const FEATHER_KEY = "dream.feather";
let featherUntil = 0; // when your far feather's lift ends (real seconds); kept on this device, so a reload keeps it
try { featherUntil = Number(localStorage.getItem(FEATHER_KEY)) || 0; } catch { /* private mode */ }
const featherLeft = () => (featherUntil > 0 ? featherUntil - realNow() : 0);
const soaringNow = () => { const c = spellNow("camera"); return c.id === "soaring" ? c.w : 0; };
const zoomMax = () => zoomReach({ highview: hasPower("highview"), soaring: soaringNow(), feather: featherLeft() });
// (realNow isn't set up yet here, so a zoom in the address is held to the plain reach, or the high view's.)
let zoom = params.get("zoom") ? Math.min(zoomReach({ highview: hasPower("highview") }), Math.max(ZOOM_MIN, Number(params.get("zoom")))) : ZOOM_HOME;
let zoomGoal = null, capSaidAt = -Infinity;
const zoomBy = (factor) => {
  const max = zoomMax();
  zoomGoal = null; // you have the camera now
  if (factor > 1 && zoom * factor > max && zoom >= max * 0.98 && simT - capSaidAt > 45) {
    capSaidAt = simT;
    logLine(max >= GLOBE_AT ? "This is as far as the eye goes." : max > ZOOM_REACH ? "Your eye is as high as the feather lifts it." : "This is as far back as your eye goes. A far feather, or a shrine of the soaring eye, lifts it higher for a while.", "note");
  }
  // Sinking back after a boost, you can come in faster, but not go out.
  zoom = factor > 1 ? Math.min(Math.max(max, zoom), zoom * factor) : Math.max(ZOOM_MIN, zoom * factor);
};
/** The whole Earth, while the soaring eye holds you (or with the high view). */
function toGlobe(words) {
  if (zoomMax() < GLOBE_AT) { logLine("The whole Earth is the soaring eye's: a shrine of it lifts you there for a minute (the high view, a power in your rhizome, for good). Your atlas lists what you've found.", "note"); return; }
  zoom = 16e6; zoomGoal = null;
  logLine(words, "note");
}
/** Holding up a far feather: your eye's reach is 60 km for three minutes (more, if one is already lifting you). */
function holdFeather() {
  const next = spend(inv, "farfeather");
  if (!next) return;
  keepInventory(next);
  featherUntil = Math.max(realNow(), featherUntil) + FEATHER_S;
  try { localStorage.setItem(FEATHER_KEY, String(Math.round(featherUntil))); } catch { /* private mode */ }
  if (zoom < LIFT_TO.feather) zoomGoal = LIFT_TO.feather;
  sound.chime();
  logLine(`You hold up the far feather, and your eye goes up with it: ${Math.round(featherLeft() / 60)} minutes of seeing far (${countOf(next, "farfeather")} left).`, "shrine");
}
/** Each frame: a feather that's run out lets go; the eye rises to a boost's height or sinks back home. */
function zoomTick(dt) {
  if (featherUntil > 0 && featherLeft() <= 0) {
    featherUntil = 0;
    try { localStorage.removeItem(FEATHER_KEY); } catch { /* private mode */ }
    logLine("The far feather's lift is spent. Your eye sinks back to you.", "note");
  }
  ({ zoom, goal: zoomGoal } = zoomStep(zoom, zoomGoal, zoomMax(), dt));
}
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
  if (e.code === "KeyP" && !e.repeat) takePicture();
  if (e.code === "KeyI" && !e.repeat) toggleHud();
  if ((e.key === "?" || e.code === "KeyH") && !e.repeat) openHelp();
  if ((e.code === "Enter" || e.code === "NumpadEnter") && !e.repeat && document.activeElement?.tagName !== "BUTTON" && document.activeElement?.tagName !== "SELECT") { e.preventDefault(); openSay(); }
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

// ---- Dreams (realm.js): behind an awake shrine, while its spell holds; gather three lights for a gem ----
/** The floor under (x, z): the land, or in a dream its islands and bridges (no higher than a small step over y). */
function floorUnder(x, z, y = Infinity) {
  const r = state.realm;
  if (!r) return world.terrain.heightAt(x, z);
  const f = floorAt(r.L, x - r.anchor.x, z - r.anchor.z, y - r.anchor.y, simT - r.t0);
  return f === -Infinity ? -Infinity : r.anchor.y + f;
}
const DREAMS_KEY = "dream.dreams";
/** When you last finished each shrine's dream (s), on this device; forgotten after two moons. */
const dreamt = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(DREAMS_KEY) || "{}") || {}, old = Date.now() / 1000 - 60 * 86400;
    for (const k of Object.keys(v)) if (!(v[k] > old)) delete v[k];
    return v;
  } catch { return {}; }
})();
/** Whether you've had this shrine's dream in its present waking. */
function dreamtNow(home) {
  const done = dreamt[home.key];
  if (done == null || !shrineClock.state) return false;
  let c = wokeCache[home.spell];
  if (!c || c.until < shrineClock.t) c = wokeCache[home.spell] = { woke: wokeAt(home.spell, shrineClock.t, shrineClock.sky) ?? Infinity, until: shrineClock.t + 600 };
  return done >= c.woke;
}
/** Its dream is open while its spell holds, once a waking. */
function canDream(home) {
  const s = spells[SPELLS[home.spell].kind];
  return !!s && s.key === home.key && s.endAt === null && home.key !== "test" && !state.realm && !dreamtNow(home);
}
let realmFx = null;
const COLOUR_OF_KIND = { shape: "rose", camera: "cyan", world: "gold" };
function enterDream(sh) {
  const kind = SPELLS[sh.spell].kind, deep = rhiz().fx.deeper.has(COLOUR_OF_KIND[kind]);
  const L = realmLayout(sh.key, kind, realNow(), deep ? 2 : 1); // the rhizome's deeper dreams: bigger, more lights, two gems
  endSpells(); // the spell becomes the dream
  clearTarget();
  const anchor = new THREE.Vector3(sh.x, REALM_ALT, sh.z);
  state.realm = { L, anchor, shrine: sh, kind, t0: simT, got: new Set(), gemOut: false, woke: null };
  realmFx = buildRealmFx(L, anchor);
  scene.add(realmFx.group);
  state.pos.set(anchor.x, anchor.y + L.islands[0].y + 0.5, anchor.z);
  state.vy = 0; state.speed = 0;
  world.group.visible = false;
  sound.shrine(kind);
  establishing();
  logLine(`You step into ${deep ? "the depths of " : ""}${REALMS[kind].name}. ${L.lights.length} lights are hidden on its far islands.`, "shrine");
}
/** Out of the dream, back at the shrine (with the gem, or without: Escape wakes you). */
function exitDream() {
  const r = state.realm;
  if (!r) return;
  state.realm = null;
  scene.remove(realmFx.group);
  realmFx.dispose();
  realmFx = null;
  world.group.visible = true;
  const sh = r.shrine;
  state.pos.set(sh.x, world.terrain.heightAt(sh.x, sh.z - 22) + 1, sh.z - 22);
  state.heading = Math.PI; // facing the shrine (it's to the south... of where you stand, so look back at it)
  state.vy = 0; state.speed = 0;
  establishing();
  setStatus("");
}
/** Each frame in a dream: gather lights by walking into them, then the gem; fall too far and you're back at the heart. */
function realmTick() {
  const r = state.realm;
  if (!r || r.woke) return;
  const t = simT - r.t0, here = state.pos.clone().sub(r.anchor);
  if (state.pos.y < r.anchor.y + lowest(r.L) - 40) {
    state.pos.set(r.anchor.x, r.anchor.y + r.L.islands[0].y + 4, r.anchor.z);
    state.vy = 0; state.speed = 0;
    logLine("You fall, and fall, and land back on the heart of the dream.", "note");
  }
  r.L.lights.forEach((_, k) => {
    if (r.got.has(k) || realmFx.lightAt(k, t).distanceTo(here) > GATHER_M) return;
    r.got.add(k);
    sound.chime();
    bursts.emit({ at: realmFx.lightAt(k, t).add(r.anchor), colors: [new THREE.Color(REALM_FOG[r.kind]), new THREE.Color(0xffffff)], n: 22, spread: 2, up: 3, fall: 0.5, life: 1.6 });
    logLine(r.got.size < r.L.lights.length ? `A light (${r.got.size} of ${r.L.lights.length}).` : "The last light. Something waits at the heart of the dream.", "shrine");
  });
  if (!r.gemOut && r.got.size >= r.L.lights.length) r.gemOut = true;
  if (r.gemOut && realmFx.gemAt(t).distanceTo(here) < GATHER_M) {
    const kind = REALMS[r.kind].gem, n = countOf(inv, kind), gain = r.L.tier >= 2 ? 2 : 1;
    if (n < ITEMS[kind].max) keepInventory({ ...inv, items: { ...inv.items, [kind]: Math.min(ITEMS[kind].max, n + gain) } });
    dreamt[r.shrine.key] = realNow();
    try { localStorage.setItem(DREAMS_KEY, JSON.stringify(dreamt)); } catch { /* private mode */ }
    sound.shrine(r.kind);
    bursts.emit({ at: realmFx.gemAt(t).add(r.anchor), colors: [new THREE.Color(REALM_FOG[r.kind]), new THREE.Color(0xffffff)], n: 40, spread: 3, up: 4, fall: 0.4, life: 2.2 });
    logLine(n < ITEMS[kind].max ? `You take ${gain > 1 ? `two ${ITEMS[kind].plural}` : `the ${ITEMS[kind].name}`}. The dream lets you go.` : `Your pouch holds no more ${ITEMS[kind].plural}. The dream lets you go.`, "shrine");
    r.woke = simT;
    setTimeout(exitDream, 1800);
  }
  setStatus(r.woke ? "waking…" : `dreaming · ${r.got.size} of ${r.L.lights.length} lights${r.gemOut ? " · the gem waits at the heart" : ""} · Esc wakes you`);
}

/** How far the ground can fall away under you in a frame and still be followed (m): a step, more at speed. */
const groundStick = () => 0.8 + Math.abs(state.speed) * 0.05;
/** The fastest a crouch goes (m/s): slow enough that small creatures don't start (they start at 10). */
const CROUCH_PACE = 5;
/** The fastest anything runs in a dream (m/s): the islands are small, and dreams are slow. */
const DREAM_PACE = 9;
// ---- Movement: fly, run, swim; the stats set the numbers ----
const GRAVITY = JUMP_G; // the same as a jump assumes, so it lands where it should
function step(dt) {
  // Speeds from your stats, and your legs: your body's scale, and any shape spell's (a giant strides, a tiny thing patters).
  sp = speeds(body(), (graph.scale / TYPICAL_SCALE) * spellLegs);
  if (state.realm) sp.run = Math.min(sp.run, DREAM_PACE); // in a dream you move as in a dream: no faster than a trot
  const manual = input();
  if (manual.turn || manual.thrust || manual.up) { director.input(simT); if (state.target) clearTarget(); } // your hands back on the controls
  const { turn, thrust, up } = (!manual.turn && !manual.thrust && !manual.up && autopilot()) || manual;
  const ground = floorUnder(state.pos.x, state.pos.z, state.pos.y);
  const p = state.pos;
  state.heading -= turn * 1.7 * dt;

  // Pinned to the ground (Jason, 11-09: "pin state to running unless they explicitly take off"): once on the ground you
  // stay on it, following it over bumps and down slopes, until you jump or take off (Space) or walk off a real drop.
  const pressed = up > 0 && !state.upWas;
  state.upWas = up > 0;
  const wasGround = state.mode === "ground";
  if (p.y <= 0 && ground < 0) state.mode = "water";
  else if (ground >= 0 && state.vy <= 0 && (p.y <= ground + 0.3 || (wasGround && p.y - ground < groundStick()))) { state.mode = "ground"; p.y = ground; }
  else state.mode = "air";
  state.airT = state.mode === "air" ? (state.airT ?? 0) + dt : 0;
  // Shift (or ▼) on the ground: a crouch, slow and low (slow enough that small creatures don't start).
  state.crouch = state.mode === "ground" && up < 0;

  const max = state.mode === "air" ? sp.fly : state.mode === "water" ? sp.swim : state.crouch ? Math.min(0.3 * sp.run, CROUCH_PACE) : sp.run;
  let target = thrust > 0 ? max * thrust : thrust < 0 ? -0.3 * max : 0;
  // Without wings you don't glide: a jump or a fall keeps the speed it left with.
  if (state.mode === "air" && wings() === 0) target = state.speed;
  state.speed += (target - state.speed) * Math.min(1, dt * (state.crouch ? 4 : 1.8));

  if (state.mode !== "air" || up !== 0) state.clear = null;
  if (state.mode === "air") {
    if (wings() > 0) {
      let vyTarget = up > 0 ? sp.climb : up < 0 ? -sp.climb * 1.6 : 0;
      if (up === 0) {
        // Hands off the climb: keep the clearance you let go at (4 to 30 m) over the land ahead,
        // so rising ground lifts you instead of landing you. Higher up, you keep your altitude.
        const hx = -Math.sin(state.heading), hz = -Math.cos(state.heading), look = Math.max(0, state.speed) * 1.2;
        const ahead = Math.max(0, ground, floorUnder(p.x + hx * look * 0.5, p.z + hz * look * 0.5, p.y + 3), floorUnder(p.x + hx * look, p.z + hz * look, p.y + 3));
        if (state.clear == null) state.clear = Math.min(30, Math.max(4, p.y - Math.max(0, ground)));
        const short = ahead + state.clear - p.y;
        if (short > 0) vyTarget = Math.min(sp.climb + 0.3 * Math.max(0, state.speed), short * 1.5);
      }
      state.vy += (vyTarget - state.vy) * Math.min(1, dt * 3);
    } else {
      state.vy = Math.max(state.vy - GRAVITY * dt, -sp.glideSink); // zero fly: glide down
    }
  } else if (state.mode === "ground") {
    // Space: with wings, take off (hold it to climb); without, a jump (one each press).
    if (up > 0 && wings() > 0) { state.vy = sp.climb; state.mode = "air"; state.clear = null; }
    else if (pressed && wings() === 0) { state.vy = Math.max(sp.jump, 2); state.mode = "air"; state.airT = 0; }
    else state.vy = 0;
  } else {
    const vyTarget = up > 0 ? sp.swim : up < 0 ? -sp.dive : 0.4;
    state.vy += (vyTarget - state.vy) * Math.min(1, dt * 3);
  }

  const fx = -Math.sin(state.heading), fz = -Math.cos(state.heading);
  // On foot, a slope steeper than your climb stops you, and near your limit you slow; downhill is always fine.
  let stride = 1;
  if (state.mode === "ground" && Math.abs(state.speed) > 0.1) {
    const dir = Math.sign(state.speed), d = 3;
    const rise = (floorUnder(p.x + fx * d * dir, p.z + fz * d * dir, p.y + 2) - Math.max(0, ground)) / d;
    if (rise > 0) {
      const k = rise / sp.maxSlope;
      if (k >= 1) { stride = 0; state.speed *= 0.5; tooSteep(); }
      else stride = 1 - 0.6 * k * k;
    }
  }
  p.x += fx * state.speed * dt * stride;
  p.z += fz * state.speed * dt * stride;
  p.y += state.vy * dt;

  const g2 = floorUnder(p.x, p.z, p.y);
  // The gold dream turns like a clock, and carries you round with it while you stand on it.
  if (state.realm && REALMS[state.realm.L.kind].twist === "turn" && state.mode === "ground") {
    const a = TURN * dt, c = Math.cos(a), sn = Math.sin(a), ax = state.realm.anchor.x, az = state.realm.anchor.z;
    const x = p.x - ax, z = p.z - az;
    p.x = ax + x * c - z * sn; p.z = az + x * sn + z * c;
    state.heading -= a;
  }
  if (state.mode === "water") {
    if (p.y > -1.5 && !(up > 0 && wings() > 0)) { p.y = -1.5; state.vy = Math.min(state.vy, 0); } // float at the surface
    if (p.y < g2 + 2) p.y = g2 + 2;
    // Dive depth is the sea's gate (Jason, 11-09: "Oceans gate by being large - dive depth is the unlock").
    const deepest = -1.5 - maxDepth(body().swim);
    if (p.y < deepest) { p.y = deepest; state.vy = Math.max(0, state.vy); if (up < 0) tooDeep(); }
  }
  // Land only on purpose: a flyer not heading down skims a slope too steep to climb, still flying.
  if (g2 >= 0 && p.y < g2) { p.y = state.mode === "air" && wings() > 0 && up >= 0 ? g2 + 0.5 : g2; state.vy = Math.max(0, state.vy); }
  // On the ground and not jumping: follow it down (a slope, a bump), unless it falls away further than a stride can step.
  if (state.mode === "ground" && state.vy <= 0 && g2 >= 0 && p.y > g2 && p.y - g2 < groundStick()) p.y = g2;
  if (g2 < 0 && p.y < g2 + 2) p.y = g2 + 2;

  // Pillars of light at the nodes lift any creature up to the ring, wings or not.
  for (const pl of seesLey() && !state.realm ? world.highways.pillars : []) {
    if (Math.hypot(p.x - pl.x, p.z - pl.z) > 300) continue;
    if (p.y < pl.top) p.y = Math.min(pl.top, p.y + 160 * dt);
    else if (up <= 0) p.y = pl.top;
    state.vy = 0;
    state.mode = "air";
    break;
  }

  // Fly along a highway, inside its ribbon, and it takes you.
  state.captureCooldown -= dt;
  if (state.captureCooldown <= 0 && state.speed > 5 && !state.target && seesLey() && !state.realm) { // not on a trip you tapped for: a highway you cross shouldn't take you
    const ll = world.frame.toLatLon(p.x, p.z);
    const c = chooseCapture(ll.lat, ll.lon, { e: fx, n: -fz });
    if (c && Math.abs(p.y - highwayAltitude(world.terrain.heightAt(p.x, p.z))) < captureRadius(c.line.cls.rank)) boardRide(c);
  }

  // Travel far enough and the world is regrown around us.
  if (!rebuilding && !state.ride && !state.realm && Math.hypot(p.x, p.z) > 15000) {
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
    // Off the highway: a flyer at its height; anything without wings set down near the ground, not left to glide a minute.
    swapWorld(w, { lat: ll.lat, lon: ll.lon, y: wings() > 0 ? highwayAltitude(w.terrain.heightAt(0, 0)) : Math.max(0, w.terrain.heightAt(0, 0)) + 20 });
    state.ride = null;
    state.heading = Math.atan2(-tg.e, tg.n);
    state.speed = 0;
    state.vy = 0;
    state.captureCooldown = 3; // don't get snatched straight back onto the line
    world.group.visible = true;
    rideFx.group.visible = false;
    establishing();
    setStatus(arrived ? `you're at a node: ${nodeName(ll)}` : "");
    if (arrived) { const { node } = nearestNode(ll.lat, ll.lon), i = network().nodes.indexOf(node); if (i >= 0 && been.nodes[i] == null) { been.nodes[i] = Math.round(realNow()); keepAtlas(); } }
    logLine(arrived ? `You arrive at a node: ${nodeName(ll)}.` : "You step off the highway.", "highway");
    if (arrived) setTimeout(() => setStatus(""), 4000);
  });
}
// ---- Landmarks: the HUD's menu carries you anywhere in the list ----
// The landmarks are in the atlas now (11-09), to travel back to once you've been (the menu that went anywhere is gone).
function teleport(l) {
  clearTarget();
  if (state.ride) { state.ride = null; rideFx.group.visible = false; if (world) world.group.visible = true; }
  zoom = Math.min(zoomMax(), l.zoom ?? ZOOM_HOME);
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
let myName = creatureName(seed);
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
  if (!seesLey()) return null; // without a prism there's nothing there to tap
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
  for (const c of world.critters.all()) {
    v.set(c.x, c.y + 0.4 * c.size, c.z);
    const d = v.distanceTo(camera.position);
    v.project(camera);
    if (v.z > 1) continue;
    if (Math.hypot(((v.x + 1) / 2) * r.width - (clientX - r.left), ((1 - v.y) / 2) * r.height - (clientY - r.top)) < 24) found.push({ kind: "critter", d, c });
  }
  const bh = seesBeings() ? tapRay.intersectObject(world.beings.group, true)[0] : null;
  if (bh) { let o = bh.object; while (o && !o.userData.being) o = o.parent; if (o) found.push({ kind: "being", d: bh.distance, being: o.userData.being, obj: o }); }
  const fh = tapRay.intersectObjects(world.finds.pickables(), true)[0], fe = fh && world.finds.entryOf(fh.object);
  if (fe) found.push({ kind: "find", d: fh.distance, f: fe });
  const sh = tapRay.intersectObjects(world.shrines.pickables(), true)[0], se = sh && world.shrines.entryOf(sh.object);
  if (se) found.push({ kind: "shrine", d: sh.distance, s: se });
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
  if (state.realm) { logLine("In a dream there's no going by taps: walk (W A S D, or drag) to the lights.", "note"); return; }
  if (zoom > GLOBE_AT && !state.ride && !rebuilding) {
    // The globe is a map: tap a cairn's dot to go there.
    const r = canvas.getBoundingClientRect(), hit = globe.pick(clientX - r.left, clientY - r.top, r.width, r.height);
    if (hit?.cairn) travelTo(hit.cairn);
    else if (hit?.mutual) travelToMutual(hit.mutual.did);
    else if (hit?.shrine) travelToShrine(hit.shrine.key);
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
  if (hit.kind === "find") {
    const f = hit.f, act = () => pickUp(f);
    return flat(f.x, f.z) < RANGE.find ? act() : moveTo({ x: f.x, z: f.z, h: Math.max(f.y, world.terrain.heightAt(f.x, f.z)) }, { range: RANGE.find * 0.6, act });
  }
  if (hit.kind === "shrine") {
    const s = hit.s, act = () => (canDream(s) ? enterDream(s) : castSpell(s));
    return flat(s.x, s.z) < RANGE.shrine ? act() : moveTo({ x: s.x, z: s.z, h: world.terrain.heightAt(s.x, s.z) }, { range: RANGE.shrine * 0.6, act });
  }
  if (hit.kind === "critter") {
    // Walking up to it, it doesn't run (others on the way might).
    const c = hit.c, act = () => touchCritter(c.key);
    return flat(c.x, c.z) < RANGE.critter ? act() : moveTo({ x: c.x, z: c.z, h: c.y }, { range: RANGE.critter * 0.6, act, critter: c.key });
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
function moveTo(hit, { range, act, alt, follow, critter = null } = {}) {
  const p = state.pos, fly = wings() > 0;
  const pts = fly ? [{ x: hit.x, z: hit.z }] : planPath({ x: p.x, z: p.z }, hit, world.terrain.heightAt, sp);
  if (!pts) { logLine("There's no way there on foot.", "note"); return; }
  state.target = { fly, ground: Math.max(0, hit.h ?? 0), range, act, alt, follow, critter, pts: pts.map((q) => world.frame.toLatLon(q.x, q.z)), idx: 0 };
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
  if (canSpeak()) { share.act = { kind: "squeak", at: realNow() }; share.force = true; } // mutuals nearby hear it too
  sound.squeak(1.25 / graph.scale);
  hopAt = simT;
  director.play("squeak", simT, squeakShot(state.heading, creature.size, zoom), { dur: 2.4, blendIn: 0.4, blendOut: 0.8 });
  const at = state.pos.clone();
  at.y += 4 * creature.size;
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
/** What the small creatures did this frame (ran from you), and now and then a croak or a song from nearby. */
let fledAt = -10, fledEver = false, chorusAt = 0;
function critterNews(events, t, sunAltitude) {
  for (const ev of events) {
    if (ev.c.kind === "bird") sound.flutter();
    if (t - fledAt > 6) { logLine(fledLine(ev.c.kind, ev.c.name, !fledEver), "creature"); fledAt = t; fledEver = true; }
  }
  if (t < chorusAt) return;
  chorusAt = t + 2.5 + ((hashString(String(Math.floor(t))) % 100) / 100) * 4; // every few seconds, irregularly
  const p = state.pos, near = world.critters.near(p.x, p.z, 70);
  const frogs = near.filter((c) => c.kind === "frog"), birds = near.filter((c) => c.kind === "bird");
  if (sunAltitude < 3 && frogs.length) sound.croak(1.2 / frogs[0].size, true); // frogs sing at dusk and through the night
  else if (sunAltitude > 0 && birds.length) sound.song(Math.floor(t), true);
}
/** A small creature, touched gently: it answers, and trusts you for a while. */
let critterTouches = 0;
function touchCritter(key) {
  const c = world.critters.touch(key, simT);
  if (!c) return squeak();
  if (c.kind === "bunny") sound.sniff();
  else if (c.kind === "frog") sound.croak(1.2 / c.size);
  else sound.song(critterTouches);
  const at = new THREE.Vector3(c.x, c.y + c.size, c.z);
  director.play("butterfly", simT, butterflyShot(state.pos.clone(), at), { dur: 2.6, blendIn: 0.5, blendOut: 0.9 });
  bursts.emit({ at, colors: [new THREE.Color(0xffb8de), new THREE.Color(0xffffff)], n: 8, spread: 0.8, up: 1.6, fall: 0.6, life: 1.2 });
  logLine(critterLine(c.kind, c.name, myName, hashString(key), critterTouches++), "creature");
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
  for (const f of world.finds.near(p.x, p.z, RANGE.find)) {
    const d = Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z); // in three dimensions: one on the seabed is down there
    if (d < RANGE.find) add({ kind: "find", key: f.key, name: ITEMS[f.holds].name, d, range: RANGE.find, f }, f.x, f.z);
  }
  for (const s of world.shrines.near(p.x, p.z, RANGE.shrine)) {
    add({ kind: "shrine", key: s.key, name: SPELLS[s.spell].name, state: s.state, dream: canDream(s), wake: s.state === "asleep" && canWake(s), d: Math.hypot(s.x - p.x, s.z - p.z), range: RANGE.shrine, s }, s.x, s.z);
  }
  for (const c of world.critters.near(p.x, p.z, RANGE.critter + 4)) {
    const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
    if (d < RANGE.critter) add({ kind: "critter", key: c.key, species: c.kind, name: c.name, d, range: RANGE.critter, c }, c.x, c.z);
  }
  for (const o of seesBeings() ? world.beings.group.children : []) {
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
  for (const c of seesLey() ? linesNear(ll.lat, ll.lon, RANGE.highway) : []) {
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
  if (c.kind === "find") return v.set(c.f.x, c.f.y + 0.7, c.f.z);
  if (c.kind === "shrine") return v.set(c.s.x, c.s.y + 2.4, c.s.z);
  if (c.kind === "critter") { const q = world.critters.near(c.c.x, c.c.z, 40).find((x) => x.key === c.key); return q ? v.set(q.x, q.y + q.size * 1.3, q.z) : null; }
  if (c.kind === "being") return c.obj.getWorldPosition(v);
  if (c.kind === "artifact") return v.set(c.entry.x, c.entry.root.position.y + c.entry.top + 0.6, c.entry.z);
  if (c.kind === "mutual") return v.set(c.m.x, c.m.y + 6 * c.m.entry.body.size, c.m.z);
  return v.set(c.x, c.alt, c.z);
}
function updateReach(t, dt) {
  const on = !!world && !rebuilding && !state.ride && !state.realm && zoom < REACH_ZOOM && !editing; // in the editor, nothing else asks for you
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
  if (c.kind === "find") return pickUp(c.f);
  if (c.kind === "shrine") return canDream(c.s) ? enterDream(c.s) : castSpell(c.s);
  if (c.kind === "critter") return touchCritter(c.key);
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
const realNow = () => (film?.manual ? film.base + film.ms : Date.now()) / 1000; // the real clock (film mode steps it exactly)
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
  if (!a.own && !usePortal(a.handle ? `@${a.handle}'s cairn` : "a mutual's cairn")) return;
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
  sayBtn.hidden = !(did && account.did === did);
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
  q.set("stats", statsList(stats).join(","));
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
  globe: () => toGlobe("The whole Earth. Tap a cairn's dot to go there."),
  look: (handle) => lookAs(handle),
  signIn: (handle) => account.signIn(handle, hereQuery()),
  signOut: async () => { await stopSharing(); await account.signOut(); logLine("Signed out of Bluesky.", "note"); },
  toggleShare: async () => {
    share.on = !share.on;
    try { localStorage.setItem("dream.share", share.on ? "on" : "off"); } catch { /* */ }
    if (!share.on) await stopSharing();
    maker.setSharing({ on: share.on, can: share.can, keep: keep.can && carry.can && mapping.can });
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
// Your creature's editor, under its name in the top-right stack. While it's open the camera turns to face the creature.
/** The creature's radius in metres, for framing it. */
const reachOf = (g) => sizeOf(g) * Math.max(...g.parts.map((p) => Math.hypot(...p.pos) + Math.max(...p.size)));
const editor = buildEditor({
  maker,
  button: document.getElementById("mine"),
  hooks: {
    get: myCreature,
    set: (next) => {
      const newName = next.seed >>> 0 !== seed;
      setCreature(next);
      editor.setName(myName);
      // A puff of its own colours, and a squeak in its new voice (smaller creatures squeak higher).
      const at = state.pos.clone();
      at.y += 3 * creature.size;
      bursts.emit({ at, colors: graph.palette.map((c) => new THREE.Color().setHSL(c.h, c.s, c.l)), n: 18, spread: 3 * creature.size, up: 3, fall: 2, life: 1.1 });
      sound.squeak(1.25 / graph.scale);
      if (newName) logLine(`Meet ${myName}.`, "creature");
    },
    name: creatureName,
    isMine: () => showingMine,
    ceiling: (k) => ceilingOf(k),
    wings: () => hasPower("wings"),
    birth: (c) => { const b = bornOf(c.stats, c.born); return { asleep: ASLEEP[b], waker: WAKER[b], wakerName: `a ${ITEMS[WAKER[b]].name}`, awake: !asleep(ASLEEP[b], b, wornOf(inv)) }; },
    respec: () => ({ open: respec.open, free: respec.free, seeds: countOf(inv, "moonseed"), next: nextSeedAt(inv, realNow()) - realNow() }),
    eatMoonseed,
    settle: () => {
      if (!respec.open) return;
      respec.open = false;
      if (respec.free) { respec.free = false; logLine("Your stats settle in.", "shrine"); return; }
      if (`${statsList(stats).join(",")}:${born}` === respec.before) { keepInventory(refund(inv, "moonseed")); logLine("Nothing changed, so the moonseed is still yours.", "note"); }
      else logLine("Your new stats settle in.", "shrine");
    },
    portrait: (on) => {
      editing = on;
      if (!on) { if (director.shot === "portrait") director.release(simT); return; }
      // Stand where no tree is in the way (a rainforest has plenty).
      const r = reachOf(graph), p = creature.group.position;
      const angle = world ? portraitAngle(p, state.heading, r, world.plants.near(p.x, p.z, portraitDistance(r) + 25)) : 0.55;
      director.play("portrait", simT, portraitShot(() => reachOf(graph), matchMedia("(max-width: 640px)").matches, angle), { dur: 1e9, blendIn: 0.9, blendOut: 1 });
    },
  },
});
editor.setName(myName);
// Respecs are moonseeds (11-09): eat one and your stats loosen until you close the editor.
const respec = { open: false, before: "", free: false };
function eatMoonseed() {
  const next = spend(inv, "moonseed");
  if (!next) return false;
  keepInventory(next);
  respec.open = true;
  respec.before = `${statsList(stats).join(",")}:${born}`;
  sound.chime();
  logLine("You eat a moonseed. Your points loosen: move them, then close the editor.", "shrine");
  return true;
}
const bag = buildBag({
  maker,
  button: document.getElementById("bag"),
  hooks: {
    inventory: () => inv,
    use: (kind) => { if (kind === "moonseed" && (respec.open || eatMoonseed())) editor.open(); else if (kind === "farfeather") holdFeather(); },
    nextSeed: () => whenText(nextSeedAt(inv, realNow()), realNow()),
    wear: (kind) => changeWorn(kind, true),
    takeOff: (kind) => changeWorn(kind, false),
    whyNot: () => wornLock(),
    canSend: () => !!account.did && flying.can && people.viewer === account.did,
    send: (kind, handle, note) => sendPigeon(kind, handle, note),
    mutuals: () => [...new Set([...who.values()].map((w) => w.handle).concat(everywhere.filter((a) => !a.own).map((a) => a.handle)).filter(Boolean))].sort(),
    incoming: () => {
      const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn, now = realNow();
      return flying.list.filter((p) => !hadPigeon(inv, p.uri)).map((p) => ({ handle: p.handle, kind: p.kind, count: p.count, eta: arrivalOf(p, ll.lat, ll.lon) <= now ? "here soon" : `in ${whenWords(arrivalOf(p, ll.lat, ll.lon) - now)}` }));
    },
  },
});
bagView = bag;
bag.refresh();
// What you wear (Jason, 11-09: "limited equip slots too so we have to choose between abilities"): two things at once,
// changed on the ground or in the water, not in the air or on a highway, so you choose before you set off.
wornChanged = () => { swapBody(graph); lookAt = realNow(); };
// ---- The rhizome's sheet, and setting gems ----
const rhizomeView = buildRhizomeView({
  maker,
  button: document.getElementById("rhizome"),
  hooks: {
    rhizome: () => rhiz().R,
    filled: () => rhiz().filled,
    view: () => viewOf(rhiz().R, rhiz().filled),
    effects: () => rhiz().fx,
    gems: () => inv.items,
    slot: (i) => setGem(i),
    unslot: (i) => takeGem(i),
    canUnslot: (i) => canUnslot(rhiz().R, rhiz().filled, i),
    respecOpen: () => respec.open,
  },
});
rhizomeChanged = () => rhizomeView.refresh();
/** A gem from your pouch into slot i: words if it can't, else null. Waking Wings opens your stats, free, once. */
function setGem(i) {
  const z = rhiz(), s = z.R.slots[i], gem = s && GEM_OF_COLOUR[s.colour];
  if (!s || !canSlot(z.R, z.filled, i, gem)) return "That slot can't take a gem now.";
  const before = new Set(z.fx.powers), words = new Set(effectsWords(z.fx));
  const next = slotGem({ ...inv, rhizome: { ...inv.rhizome, slots: z.filled } }, i, gem);
  if (!next) return `You have no ${ITEMS[gem].plural}.`;
  keepInventory(next);
  sound.chime();
  const fx = rhiz().fx, woke = effectsWords(fx).filter((w) => !words.has(w));
  logLine(woke.length ? `The ${ITEMS[gem].name} wakes: ${woke.join(", ")}.` : `You set the ${ITEMS[gem].name}. It waits for a neighbour.`, "shrine");
  for (const p of fx.powers) if (!before.has(p)) logLine(`${POWERS[p].name}: ${POWERS[p].about}`, "shrine");
  if (fx.powers.has("wings") && !before.has("wings")) {
    // Flight comes back as its own stat: open your points, free this once, so some can go into it.
    respec.open = true; respec.free = true; respec.before = `${statsList(stats).join(",")}:${born}`;
    logLine("Your points loosen (free, this once): open your creature's sheet and move some into fly.", "shrine");
  }
  return null;
}
/** Slot i's gem back to your pouch (with a moonseed working): words if it can't, else null. */
function takeGem(i) {
  const z = rhiz();
  if (!respec.open) return "Gems move only with a moonseed working.";
  if (!canUnslot(z.R, z.filled, i)) return "Others hang from this one: take theirs out first.";
  const next = unslotGem({ ...inv, rhizome: { ...inv.rhizome, slots: z.filled } }, i);
  if (!next) return "Your pouch has no room for it.";
  keepInventory(next);
  logLine("You take the gem out. What it woke sleeps again.", "note");
  return null;
}
function wornLock() {
  if (state.ride) return "Not while you're riding a highway.";
  if (state.mode === "air") return "Not in the air: land (or float) first.";
  return null;
}
// ---- Finds (findlore.js): each spot gives you its thing once a moon ----
function pickUp(f) {
  const p = state.pos, below = p.y - f.y;
  if (below > RANGE.find) { logLine(`The ${ITEMS[f.holds].name} lies ${Math.round(below)} m down. Dive (Shift or ▼) to reach it.`, "note"); return; }
  const r = take(inv, f, realNow());
  const name = ITEMS[f.holds].name;
  if (!r.ok) { logLine(r.why === "full" ? `Your pouch holds no more ${ITEMS[f.holds].plural} (${ITEMS[f.holds].max}).` : `You've had this moon's ${name} here.`, "note"); return; }
  keepInventory(r.inv);
  sound.chime();
  const at = new THREE.Vector3(f.x, f.y + 0.5, f.z);
  bursts.emit({ at, colors: [new THREE.Color(FIND_COLOUR[f.holds]), new THREE.Color(0xffffff)], n: 14, spread: 1.2, up: 2, fall: 1, life: 1 });
  const wakes = WAKER[born] === f.holds && asleep(ASLEEP[born], born, wornOf(inv));
  const where = { shore: "washed up here", seabed: "on the seabed", meadow: "in the grass", summit: "on the summit" }[f.place];
  logLine(`You pick up a ${name}, ${where}.${wakes ? ` Wear it (BAG ▾) and your ${ASLEEP[born]} wakes.` : ""}`, "shrine");
}
function changeWorn(kind, on) {
  const why = wornLock();
  if (why) { logLine(why, "note"); return false; }
  const next = on ? wear(inv, kind) : takeOff(inv, kind);
  if (!next) { if (on && wornOf(inv).length >= WORN_MAX) logLine(`You can wear ${WORN_MAX} things at once. Take one off first.`, "note"); return false; }
  keepInventory(next);
  sound.chime();
  logLine(on ? ITEMS[kind].on ?? `You put on the ${ITEMS[kind].name}.` : ITEMS[kind].off ?? `You take off the ${ITEMS[kind].name}.`, "shrine");
  const at = state.pos.clone();
  at.y += 4 * creature.size;
  bursts.emit({ at, colors: [new THREE.Color().setHSL(simT % 1, 0.9, 0.7), new THREE.Color(0xffffff)], n: 12, spread: 2 * creature.size, up: 2, fall: 1.5, life: 0.9 });
  return true;
}
atlasView = buildAtlas({
  maker,
  button: document.getElementById("atlas"),
  hooks: {
    shrines: () => {
      const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
      return foundList().filter((f) => f.spell).map((f) => {
        const st = shrineClock.state ? (WAKES[f.spell].test(shrineClock.state) ? (shrineUsed[f.key] != null && shrineStateOf({ key: f.key, spell: f.spell }) === "resting" ? "resting" : "awake") : `asleep, wakes ${WAKES[f.spell].when}`) : "";
        return { key: f.key, name: capital(SPELLS[f.spell].name), colour: `#${new THREE.Color(f.colour).getHexString()}`, state: st, metres: metresBetween(ll.lat, ll.lon, f.lat, f.lon) };
      }).sort((a, b) => a.metres - b.metres);
    },
    nodes: () => {
      const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
      return Object.keys(been.nodes).map((i) => { const n = network().nodes[i]; return n && { key: `node${i}`, name: capital(nodeName(n)), metres: metresBetween(ll.lat, ll.lon, n.lat, n.lon) }; }).filter(Boolean).sort((a, b) => a.metres - b.metres);
    },
    landmarks: () => {
      const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
      return LANDMARKS.map((l) => ({ key: `mark:${l.name}`, name: l.name, been: been.marks[l.name] != null, metres: metresBetween(ll.lat, ll.lon, l.lat, l.lon) }));
    },
    travel: travelToShrine,
    globe: () => toGlobe("The whole Earth. Tap a dot to go there."),
  },
});
atlasView.refresh(placesFound());
globe.setShrines(foundList());
// A moonseed falls for you at each new moon, once (checked once a second).
/** A portal used up to reach a mutual (Jason: "portal items (everyone starts with one) to travel to friends"). */
function usePortal(to) {
  const next = spend(inv, "portal");
  if (!next) {
    logLine(`You have no portal. One opens for you at each full moon (the next ${whenText(nextPortalAt(inv, realNow()), realNow())}), and a friend can send you one by pigeon.`, "note");
    return false;
  }
  keepInventory(next);
  sound.whoosh();
  logLine(`You step through a portal to ${to}. It closes behind you (${countOf(next, "portal")} left).`, "highway");
  return true;
}
function portalTick() {
  const r = portalFor(inv, realNow());
  if (!r.fell) return;
  keepInventory(r.inv);
  sound.chime();
  logLine("The full moon opens a portal for you. (BAG \u25be)", "shrine");
}
function seedTick() {
  const r = moonseedFor(inv, realNow());
  if (!r.fell) return;
  keepInventory(r.inv);
  sound.chime();
  logLine("The new moon leaves a moonseed for you. (BAG \u25be)", "shrine");
}
// Your pouch in your repo, like your creature: brought into step on sign-in and when you come back; written once things settle.
const carry = { can: false, synced: "", busy: false };
const invKey = () => JSON.stringify([inv.items, wornOf(inv), inv.kit, inv.lunation, inv.portalMoon, inv.took, inv.got, inv.rhizome]);
async function syncInventory() {
  if (!account.did || !carry.can || carry.busy) return;
  carry.busy = true;
  try {
    const remote = parseInventoryRecord(await account.getInventory());
    const which = reconcileInventory(inv, remote);
    if (which === "remote") keepInventory(remote, { changed: true, at: remote.at });
    else if (which === "local") await account.putInventory(makeInventoryRecord(inv, inv.changed ? inv.at || Date.now() : Date.now()));
    carry.synced = invKey();
  } catch (e) { console.warn("inventory:", e.message); }
  finally { carry.busy = false; }
}
function carryTick() {
  if (!account.did || !carry.can || carry.busy || people.viewer !== account.did) return;
  const k = invKey();
  if (k === carry.synced || Date.now() / 1000 - invAt < 2) return;
  carry.busy = true;
  account.putInventory(makeInventoryRecord(inv, inv.at || Date.now())).then(() => { carry.synced = k; })
    .catch((e) => console.warn("inventory:", e.message)).finally(() => { carry.busy = false; });
}
// Your atlas in your repo: merged on sign-in and when you come back (a place found on any device is found), written
// when you find somewhere new.
const mapping = { can: false, synced: "", busy: false };
async function syncAtlas() {
  if (!account.did || !mapping.can || mapping.busy) return;
  mapping.busy = true;
  try {
    const remote = parseAtlasRecord(await account.getAtlas());
    const merged = mergeAtlas(found, remote?.shrines), mergedBeen = { nodes: mergeBeen(been.nodes, remote?.nodes), marks: mergeBeen(been.marks, remote?.marks) };
    if (atlasKey(merged, mergedBeen) !== atlasKey(found, been)) { Object.assign(found, merged); Object.assign(been.nodes, mergedBeen.nodes); Object.assign(been.marks, mergedBeen.marks); keepAtlas(); }
    if (!remote || atlasKey(found, been) !== atlasKey(remote.shrines, remote)) await account.putAtlas(makeAtlasRecord(found, Date.now(), been));
    mapping.synced = atlasKey(found, been);
  } catch (e) { console.warn("atlas:", e.message); }
  finally { mapping.busy = false; }
}
function atlasTick() {
  if (!account.did || !mapping.can || mapping.busy || people.viewer !== account.did) return;
  const k = atlasKey(found, been);
  if (k === mapping.synced) return;
  mapping.busy = true;
  account.putAtlas(makeAtlasRecord(found, Date.now(), been)).then(() => { mapping.synced = k; })
    .catch((e) => console.warn("atlas:", e.message)).finally(() => { mapping.busy = false; });
}
// ---- Pigeons (pigeons.js): things carried between mutuals. Yours fly from your repo; theirs are found by the backlink
// index, only from mutuals, and arrive when a pigeon flying 1,000 km/h would have got here. ----
const flying = { can: false, list: [], polledAt: -Infinity, landing: false, busy: false };
const pigeonFx = buildPigeonFx(scene);
const whenWords = (s) => (s < 90 ? "a minute" : s < 5400 ? `${Math.round(s / 60)} minutes` : s < 129600 ? `${Math.round(s / 3600)} hours` : `${Math.round(s / 86400)} days`);
async function pollPigeons() {
  if (!account.did || people.viewer !== account.did || flying.busy) return;
  flying.busy = true;
  flying.polledAt = realNow();
  try { flying.list = await pigeonsFor({ viewer: account.did }); bagView?.refresh(); }
  catch (e) { console.warn("pigeons:", e.message); }
  finally { flying.busy = false; }
}
/** Your own pigeons that have flown off (a moon on), cleared from your repo. */
async function clearFlownPigeons() {
  try {
    for (const p of await account.ownPigeons()) {
      const at = typeof p.value?.sentAt === "string" ? Date.parse(p.value.sentAt) / 1000 : NaN;
      if (Number.isFinite(at) && flownOff(at, realNow())) await account.clearPigeon(p.rkey);
    }
  } catch (e) { console.warn("pigeons:", e.message); }
}
async function sendPigeon(kind, handle, note) {
  if (!account.did || !flying.can) throw new Error("Sign in (BLUESKY ▾) to send pigeons.");
  const name = String(handle || "").trim().replace(/^@/, "");
  if (!name) throw new Error("Who's it for? Type their handle.");
  const did = await didOf(name);
  if (!did) throw new Error(`Couldn't find @${name}.`);
  if (did === account.did) throw new Error("A pigeon won't fly to you from you.");
  if (!(await visibleAmong(account.did, [did])).has(did)) throw new Error(`Pigeons fly only to mutuals, and @${name} isn't one (or can't be seen).`);
  if (countOf(inv, kind) <= 0) throw new Error(`You have no ${ITEMS[kind].plural} to send.`);
  const ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
  await account.sendPigeon(makePigeon({ to: did, kind, count: 1, from: ll, note }));
  const next = spend(inv, kind);
  if (next) keepInventory(next);
  const there = who.get(did)?.intent, toward = there && world ? world.frame.toLocal(there.lat, there.lon) : null;
  const from = state.pos.clone();
  from.y += 2 * creature.size;
  pigeonFx.depart(from, toward && new THREE.Vector3(toward.x, 0, toward.z), creature.size * 3);
  sound.flutter();
  logLine(`A pigeon takes the ${ITEMS[kind].name} and flies off to @${name}.`, "creature");
}
/** Once a second: a pigeon whose flight is done comes down to you with its gift (one at a time). */
function pigeonTick() {
  if (!world || state.ride || state.realm || flying.landing || !account.did || people.viewer !== account.did) return;
  if (realNow() - flying.polledAt > 180) pollPigeons();
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z), now = realNow();
  const p = flying.list.find((q) => !hadPigeon(inv, q.uri) && !(q.waitUntil > now) && arrivalOf(q, ll.lat, ll.lon) <= now);
  if (p) landPigeon(p);
}
/** A pigeon comes down to you with its gift. */
function landPigeon(p) {
  flying.landing = true;
  // It comes down out of the sky ahead of the camera and hovers beside you and a little above, side on, where the
  // camera can see it (just beyond you, your own body hid it).
  const ahead = new THREE.Vector3(); camera.getWorldDirection(ahead);
  ahead.setY(0).normalize();
  const right = new THREE.Vector3(-ahead.z, 0, ahead.x);
  const to = state.pos.clone().addScaledVector(right, 2.6 * creature.size);
  to.y += 4.5 * creature.size;
  pigeonFx.arrive(to, to.clone().addScaledVector(ahead, 60).addScaledVector(right, 30), creature.size * 3.5, () => {
    flying.landing = false;
    const r = receive(inv, p.uri, p.kind, p.count), what = p.count > 1 ? `${p.count} ${ITEMS[p.kind].plural}` : `a ${ITEMS[p.kind].name}`, who2 = p.handle ? `@${p.handle}` : "a mutual";
    if (!r.ok) {
      if (r.why === "full") { p.waitUntil = realNow() + 600; logLine(`A pigeon from ${who2} brings ${what}, but your pouch is full of them. It waits nearby.`, "note"); }
      return;
    }
    keepInventory(r.inv);
    sound.chime();
    bursts.emit({ at: to.clone(), colors: [new THREE.Color(0xc9cfdc), new THREE.Color(0x6fd6a8)], n: 16, spread: 1.5 * creature.size, up: 2, fall: 1, life: 1 });
    logLine(`A pigeon from ${who2} brings you ${what}${p.note ? `: “${p.note}”` : "."}`, "creature");
  }, Math.atan2(-right.x, -right.z));
}
account.onChange(async (did) => {
  flying.can = false;
  flying.list = [];
  share.can = false;
  keep.can = false;
  keep.synced = "";
  carry.can = false;
  carry.synced = "";
  mapping.can = false;
  mapping.synced = "";
  if (did) {
    const name = (await handlesOf([did])).get(did) || null;
    setViewer(did, name);
    [share.can, keep.can, carry.can, mapping.can, flying.can, posting.can] = await Promise.all([account.canShare(), account.canKeep(), account.canCarry(), account.canMap(), account.canFly(), account.canPost()]);
    maker.setSharing({ on: share.on, can: share.can, keep: keep.can && carry.can && mapping.can });
    syncCreature();
    syncInventory();
    syncAtlas();
    if (flying.can) clearFlownPigeons();
    flying.polledAt = -Infinity; // look for pigeons on the next tick
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
const share = { on: (() => { try { return localStorage.getItem("dream.share") !== "off"; } catch { return true; } })(), can: false, last: null, lastKind: "", lastKey: "", lastLook: "", lastAt: -Infinity, writing: false, say: null, act: null, force: false, carried: false };
function setWho() {
  flock.set([...who.values()].map((w) => ({ ...w, bot: isBot(w.did) })));
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
    collections: [INTENT_NSID, ARTIFACT_NSID, PIGEON_NSID],
    onOpen: () => refreshIntents(),
    onCommit: async (e) => {
      const viewer = people.viewer, c = e.commit;
      if (!viewer || e.did === viewer && c.collection === INTENT_NSID) return; // your own creature is you
      if (c.collection === PIGEON_NSID) { // one setting off for you: look properly (only mutuals' count, as always)
        if (c.operation !== "delete" && viewer === account.did && parsePigeon(c.record, realNow())?.to === viewer) flying.polledAt = -Infinity;
        return;
      }
      if (c.operation === "delete") {
        if (c.collection === INTENT_NSID) { who.delete(e.did); setWho(); }
        else { const uri = `at://${e.did}/${ARTIFACT_NSID}/${c.rkey}`; showArtifacts(artifacts.filter((a) => a.uri !== uri)); setEverywhere(everywhere.filter((a) => a.uri !== uri)); }
        return;
      }
      if (!(await visibleAmong(viewer, [e.did])).has(e.did) || viewer !== people.viewer) return;
      const handle = (await handlesOf([e.did])).get(e.did) || null;
      if (c.collection === INTENT_NSID) {
        const intent = c.rkey === "self" ? parseIntent(c.record) : null;
        if (!intent) return;
        const prev = who.get(e.did)?.intent;
        who.set(e.did, { did: e.did, handle, intent });
        setWho();
        heard(e.did, handle, intent, prev);
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
  if (!document.hidden && realNow() - keep.checkedAt > 20) { syncCreature(); syncInventory(); syncAtlas(); } // changed on another device meanwhile?
});
addEventListener("pagehide", () => { stopSharing(); });
/** Off to a mutual: arrive 40 m from where their creature is now. */
function travelToMutual(did) {
  const w = who.get(did);
  if (!w) return;
  if (!usePortal(w.handle ? `@${w.handle}` : "a mutual")) return;
  const at = whereAt(w.intent, realNow()), dLat = -40 / 111320;
  teleport({ name: w.handle ? `@${w.handle}` : "a mutual", lat: at.lat + dLat, lon: at.lon, alt: 10, heading: 0, zoom: 85 });
}
function squeakAt(m) {
  sound.squeak(1.25 / m.entry.graph.scale);
  hopAt = simT;
  bursts.emit({ at: new THREE.Vector3(m.x, m.y + 4 * m.entry.body.size, m.z), colors: [new THREE.Color(0xff9ec7), new THREE.Color(0xfff3b0)], n: 14, spread: 2.5, up: 4, fall: 2, life: 1.2 });
  logLine(`You squeak at @${m.handle || "them"}.`, "creature");
}

/** Something a mutual said or did just now: a line in the log if they're within 2 km, a squeak if within 600 m. */
function heard(did, handle, it, prev) {
  if (!world) return;
  const nowS = realNow(), at = whereAt(it, nowS), me = world.frame.toLatLon(state.pos.x, state.pos.z);
  const metres = metresBetween(me.lat, me.lon, at.lat, at.lon), name = handle ? `@${handle}` : "a mutual";
  if (fresh(it.say, nowS) && it.say.at !== prev?.say?.at && metres < 2000) logLine(`${name}: ${it.say.text}`, "say");
  if (fresh(it.act, nowS) && it.act.at !== prev?.act?.at && it.act.kind === "squeak") {
    const h = flock.hop(did, simT);
    if (h && h.pos.distanceTo(camera.position) < 600) {
      sound.squeak(1.25 / h.scale);
      bursts.emit({ at: h.pos.clone().add(new THREE.Vector3(0, 4 * h.size, 0)), colors: [new THREE.Color(0xff9ec7), new THREE.Color(0xfff3b0)], n: 14, spread: 2.5, up: 4, fall: 2, life: 1.2 });
      if (metres < 2000) logLine(`${name} squeaks!`, "creature");
    }
  }
}
// ---- Speaking: a line of up to 80 characters, carried on your intent for a few seconds ----
const sayForm = document.getElementById("sayform"), sayText = document.getElementById("saytext"), sayBtn = document.getElementById("saybtn"), myBubble = document.getElementById("mybubble");
const canSpeak = () => share.on && share.can && !!account.did && people.viewer === account.did;
function openSay() {
  if (!canSpeak()) { logLine(account.did ? "Show yourself to your mutuals first (Bluesky ▾), then you can speak." : "Sign in with Bluesky to speak to your mutuals.", "note"); return; }
  sayForm.hidden = false;
  sayText.value = "";
  sayText.focus();
}
function closeSay() { sayForm.hidden = true; sayText.blur(); }
sayForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = sayText.value.trim();
  closeSay();
  if (!text || !canSpeak()) return;
  share.say = { text: text.slice(0, 200), at: realNow() };
  share.force = true;
  shareTick();
  logLine(`You: ${makeIntent({ kind: "rest", p: { lat: 0, lon: 0 }, creature: { seed, stats }, say: share.say }).say?.text ?? ""}`, "say");
});
sayText.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeSay(); } });
sayBtn.addEventListener("click", () => (sayForm.hidden ? openSay() : closeSay()));
/** Your own bubble, over your creature, while it's fresh. */
function placeMyBubble() {
  const say = share.say;
  const show = !!say && fresh(say, realNow()) && !!world && !state.ride;
  myBubble.hidden = !show;
  if (!show) return;
  const r = canvas.getBoundingClientRect(), v = creature.group.position.clone().add(new THREE.Vector3(0, 7 * creature.size, 0)).project(camera);
  if (v.z > 1) { myBubble.hidden = true; return; }
  if (myBubble.textContent !== say.text) myBubble.textContent = makeIntent({ kind: "rest", p: { lat: 0, lon: 0 }, creature: { seed, stats }, say }).say?.text ?? say.text;
  myBubble.style.transform = `translate(${((v.x + 1) / 2) * r.width + r.left}px, ${((1 - v.y) / 2) * r.height + r.top}px) translate(-50%, -100%)`;
}
// ---- Sharing your own intent (signed in, sharing on) ----
/** What I'm doing now, as an intent: a ride, a trip, steering, or resting. */
function myIntent() {
  const p = state.pos, ll = world.frame.toLatLon(p.x, p.z), nowS = realNow();
  const base = { p: { lat: ll.lat, lon: ll.lon, alt: state.realm ? state.realm.shrine.y : p.y }, creature: { ...myCreature(), worn: wornOf(inv), looks: [...rhiz().fx.looks] }, say: fresh(share.say, nowS) ? share.say : null, act: fresh(share.act, nowS) ? share.act : null };
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
  const changed = want.key !== share.lastKey, look = shownKey();
  const restyled = look !== share.lastLook && nowS - lookAt > 3 && since > 3; // a new look, once you've stopped fiddling
  const moment = !!(want.say || want.act), clearMoment = share.carried && !moment; // words leave your record once they've been heard
  if (!(share.force || clearMoment || restyled || (changed && since > 1.5) || (drift > 60 && since > 6) || since > HEARTBEAT_S)) return;
  const record = makeIntent({ ...want, now: new Date(nowS * 1000) });
  share.force = false;
  share.carried = moment;
  share.writing = true;
  account.putIntent(record).then(() => {
    share.last = parseIntent(record, nowS);
    share.lastKey = want.key;
    share.lastLook = look;
    share.lastAt = nowS;
  }).catch((e) => {
    console.warn("intent:", e.message);
    share.lastAt = nowS; // don't hammer
    if (/scope|forbidden|403/i.test(e.message)) { share.can = false; maker.setSharing({ on: share.on, can: false, keep: keep.can && carry.can && mapping.can }); }
  }).finally(() => { share.writing = false; });
}
// ---- Your creature in your repo, so it follows you (signed in, with a sign-in that covers it) ----
const keep = { can: false, synced: "", busy: false, checkedAt: -Infinity };
/** Bring this device and your repo into step: adopt the creature there, or put this one there. */
async function syncCreature() {
  if (!account.did || !keep.can || keep.busy) return;
  keep.busy = true;
  keep.checkedAt = realNow();
  try {
    const remote = parseCreatureRecord(await account.getCreature());
    const local = keptCreature();
    const which = reconcile(local, remote);
    if (which === "remote") {
      if (showingMine) {
        const was = keyOf(myCreature());
        setCreature(remote, remote.at);
        editor.setName(myName);
        if (keyOf(remote) !== was) logLine(`${myName} found you here.`, "creature");
      } else {
        try { localStorage.setItem(CREATURE_KEY, JSON.stringify({ seed: remote.seed, genes: remote.genes, stats: STATS.map((k) => remote.stats[k]), at: remote.at, chosen: true })); } catch { /* */ }
      }
      keep.synced = keyOf(remote);
    } else if (which === "local") {
      await account.putCreature(makeCreatureRecord(local, local.chosen ? local.at || Date.now() : Date.now()));
      keep.synced = keyOf(local);
    } else keep.synced = keyOf(remote);
  } catch (e) { console.warn("creature:", e.message); }
  finally { keep.busy = false; }
}
/** Once a second: after you've changed your creature here and settled, put it in your repo. */
function keepTick() {
  if (!account.did || !keep.can || keep.busy || !showingMine || people.viewer !== account.did) return;
  const look = lookKey();
  if (look === keep.synced || realNow() - lookAt < 3) return;
  keep.busy = true;
  account.putCreature(makeCreatureRecord(myCreature())).then(() => { keep.synced = look; })
    .catch((e) => { console.warn("creature:", e.message); if (/scope|forbidden|403/i.test(e.message)) { keep.can = false; maker.setSharing({ on: share.on, can: share.can, keep: false }); } })
    .finally(() => { keep.busy = false; });
}
async function stopSharing() {
  if (!share.last && share.lastAt === -Infinity) return;
  share.last = null; share.lastKey = ""; share.lastLook = ""; share.lastAt = -Infinity;
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
const bar = (n, max = MAX) => "■".repeat(Math.max(0, n)) + "□".repeat(Math.max(0, max - n));
/** The HUD: two quiet lines (where you are; the sky), and what's happening (a trip, a spell, the camera far off); tap it,
 * or press I, for the rest (where exactly, frames, the nearest node, your stats). */
let hudMore = (() => { try { return localStorage.getItem("dream.hud") === "more"; } catch { return false; } })();
function toggleHud() {
  hudMore = !hudMore;
  try { localStorage.setItem("dream.hud", hudMore ? "more" : "less"); } catch { /* private mode */ }
  lastHud = -Infinity;
}
hud.addEventListener("click", toggleHud);
function updateHud() {
  const fold = hudMore ? " ▴" : " ▾", lines = [];
  if (state.ride) {
    const r = state.ride, ll = rideLatLon(r), near = r.leaving ? [] : crossings(r);
    lines.push(`RIDING ${r.line.cls.name.toUpperCase()} · ${Math.round(r.speed / 1000)} KM/S${fold}`, clockLine(),
      near.length ? `CROSSING ${near[0].line.cls.name.toUpperCase()} · A/D TO HOP` : "SHIFT OR S: STEP OFF");
    if (hudMore) lines.push(`${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)} · NEXT NODE ${Math.round(remainingMeters(r) / 1000).toLocaleString("en")} KM`, statsLines());
  } else {
    const ll = world.frame.toLatLon(state.pos.x, state.pos.z), ground = world.terrain.heightAt(state.pos.x, state.pos.z);
    const k = koppenAt(ll.lat, ll.lon), biome = biomeFor(k, world.terrain.reliefAt(state.pos.x, state.pos.z), ll.lat, ground);
    const where = state.realm ? REALMS[state.realm.kind].name.toUpperCase() : ground < 0 ? `THE SEA · ${Math.round(-ground)} M DEEP` : biome.toUpperCase();
    const height = state.realm ? "DREAMING" : state.mode === "water" ? (state.pos.y < -3 ? `${Math.round(-state.pos.y)} M DOWN` : "AFLOAT") : state.mode === "air" ? `${Math.round(state.pos.y - Math.max(0, ground))} M UP` : "ON THE GROUND";
    lines.push(`${where} · ${height}${fold}`, clockLine(), targetLine(), spellsLine(), zoomLine());
    if (hudMore) {
      const { node, meters } = nearestNode(ll.lat, ll.lon), cls = CLASSES.filter((c) => node.classes.has(c.id)).map((c) => c.name).join(" + ");
      lines.push(`${ll.lat.toFixed(3)}, ${ll.lon.toFixed(3)} · ${Math.round(state.pos.y)} M · ${k ? koppenCode(k) : "—"}`,
        `${detail.fps} FPS${detail.scale < DETAIL_MAX ? ` · FORESTS ${Math.round(detail.scale * 100)}%` : ""} · LEY NODE ${(meters / 1000).toFixed(1)} KM (${cls})`, statsLines());
    }
  }
  hud.textContent = lines.filter(Boolean).join("\n");
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

// ---- Sharing a picture to Bluesky (Jason, 11-09: "Can we add a 'share screenshot to bluesky' button?") ----
let snapWanted = null;
const posting = { can: false };
/** The frame just drawn, made four times bigger with hard pixels (the dream's own 224 lines, sharp). */
function grabPicture() {
  const k = 4, c = document.createElement("canvas");
  c.width = canvas.width * k; c.height = canvas.height * k;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}
/** A picture as a file Bluesky will take (about a megabyte at most): PNG if it fits, else JPEG. */
async function pictureFile(c) {
  const as = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  let blob = await as("image/png");
  for (const q of [0.92, 0.85, 0.75]) { if (blob.size <= IMAGE_MAX_BYTES) break; blob = await as("image/jpeg", q); }
  return { blob, width: c.width, height: c.height };
}
/** Where you are, in a few words, for the caption and the description. */
function hereWords() {
  if (state.realm) return `in ${REALMS[state.realm.kind].name}`;
  if (state.ride) return "riding a ley line";
  if (!world) return "somewhere on the Earth";
  const ll = world.frame.toLatLon(state.pos.x, state.pos.z), ground = world.terrain.heightAt(state.pos.x, state.pos.z);
  if (ground < 0) return state.pos.y < -3 ? `under the sea, ${Math.round(-state.pos.y)} m down` : state.mode === "air" ? "over the sea" : "at sea";
  const biome = biomeFor(koppenAt(ll.lat, ll.lon), world.terrain.reliefAt(state.pos.x, state.pos.z), ll.lat, ground).toLowerCase();
  return state.mode === "air" ? `over the ${biome}` : `in the ${biome}`;
}
/** When it is, by the sun where you are. */
function sunWords() {
  const a = sunState?.altitude ?? 30, ll = world ? world.frame.toLatLon(state.pos.x, state.pos.z) : spawn;
  const solar = ((new Date(realNow() * 1000).getUTCHours() + new Date(realNow() * 1000).getUTCMinutes() / 60 + ll.lon / 15) % 24 + 24) % 24;
  if (a < -6) return "at night";
  if (a < 6) return solar < 12 ? "at dawn" : "at dusk";
  if (a < 30) return solar < 12 ? "in the morning" : "in the afternoon";
  return "in the full day";
}
/** The spot the picture was taken at, as a link that opens the game there. */
function hereUrl() {
  const sh = state.realm?.shrine;
  const p = sh ? { x: sh.x, z: sh.z - 22 } : state.pos, ll = world ? world.frame.toLatLon(p.x, p.z) : spawn;
  const ground = world ? Math.max(0, world.terrain.heightAt(p.x, p.z)) : 0;
  return spotUrl({ lat: ll.lat, lon: ll.lon, heading: ((((-state.heading * 180) / Math.PI) % 360) + 360) % 360, alt: sh ? 2 : state.pos.y - ground, zoom: Math.min(zoom, zoomMax()) });
}
const shareSheet = buildShareSheet({
  maker,
  button: document.getElementById("share"),
  hooks: {
    canPost: () => (!account.did ? "signin" : posting.can ? "yes" : "again"),
    signIn: () => maker.openSignIn(),
    post: async ({ blob, text, alt, width, height }) => {
      const ref = await account.uploadImage(blob);
      const r = await account.post(makeShotPost({ text, alt, url: hereUrl(), blob: ref, width, height }));
      logLine("Posted to Bluesky.", "note");
      return postWebUrl(r.uri, people.handle || account.did);
    },
  },
});
/** Take a picture of this moment and open the SHARE sheet with it. */
function takePicture() {
  if (maker.open === "share") { maker.close(); return; }
  snapWanted = async (c) => {
    const shot = await pictureFile(c), where = hereWords(), when = sunWords();
    sound.chime();
    shareSheet.open(shot, defaultText({ name: myName, where, when }), `A pixel-art picture from Dream of the Earth, an open world on the real Earth: ${myName}, a small creature, ${where}, ${when}.`);
  };
}
document.getElementById("share").addEventListener("click", takePicture);

// ---- Help: everything the corner hint leaves out ----
const helpBtn = document.getElementById("helpbtn"), helpHint = document.getElementById("help");
function openHelp() {
  if (maker.open === "help") { maker.close(); return; }
  const group = (title, rows) => [h("h3", {}, title), h("dl", {}, rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]))];
  maker.custom("help", [
    h("h2", {}, "How to play"),
    ...group("Moving", [["WASD · arrows", "move and turn (on a phone, drag)"], ["Space", "jump; with Wings, take off and climb (▲)"], ["Shift", "crouch, slow and quiet (small creatures don't start); flying, go down (▼)"], ["Tap anything", "go to it; close enough, it answers"], ["Wheel · + − · pinch", "the camera nearer or farther (about 500 m back; a far feather, or a shrine of the soaring eye, lifts it higher)"]]),
    ...group("Touching", [["E", "touch what glints (the bottom-right prompt)"], ["Enter", "say something to mutuals nearby"], ["P", "a picture of this moment, to share"], ["Esc", "lift a spell, or wake from a dream"], ["I", "more on the HUD (top left; or tap it)"], ["M", "sound on or off"]]),
    ...group("The dream", [["Shrines", "columns of light: touch one awake for a minute's spell, and again while it holds to enter its dream"], ["Dreams", "gather three lights for a gem"], ["RHIZOME ▾", "set gems; linked ones wake boosts and powers (Wings: flight)"], ["BAG ▾", "what you carry and wear (the prism shows the gold highways: fly along one to ride it)"], ["ATLAS ▾", "places you've found, to travel back to"], ["Your creature's name ▾", "change how it looks (its stats, with a moonseed)"], ["BLUESKY ▾", "sign in: your mutuals, their cairns, pigeons"]]),
  ], { trigger: helpBtn, classes: ["help"] });
}
helpBtn.addEventListener("click", openHelp);
// The hint at the bottom fades once you've moved or after half a minute; ? HELP keeps the rest.
setTimeout(() => helpHint.classList.add("gone"), 30000);
function movedOnce(e) {
  if (!["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) return;
  removeEventListener("keydown", movedOnce);
  setTimeout(() => helpHint.classList.add("gone"), 6000);
}
addEventListener("keydown", movedOnce);

// ---- Loop ----
let sunState = null, lastSun = -Infinity, lastHud = -Infinity, sunAheadWas = false;
const t0 = performance.now();
let last = t0;
// ?film: for recording. After __dream.filmStart(), the loop stops and __dream.filmStep(n) renders n frames exactly
// 1/fps apart in game time (and on the real clock that intents and cairns use), however slowly they render.
const film = params.get("film") !== null ? { fps: Number(params.get("film")) || 30, manual: false, ms: 0, base: 0 } : null;
function frame() {
  const nowMs = film?.manual ? film.ms : performance.now();
  const dt = Math.min(0.05, (nowMs - last) / 1000), t = (nowMs - t0) / 1000;
  // Only frames that draw forests steer the governor.
  meterFrame(nowMs - last, t, !!world && !state.ride && zoom < 6000);
  last = nowMs;
  // +/- (or PageUp/PageDown) zoom smoothly while held.
  if (keys.has("Equal") || keys.has("NumpadAdd") || keys.has("PageUp")) zoomBy(Math.exp(-2.4 * dt));
  if (keys.has("Minus") || keys.has("NumpadSubtract") || keys.has("PageDown")) zoomBy(Math.exp(2.4 * dt));
  zoomTick(dt);
  const view = state.ride ? rideView(dt, t) : worldView(dt, t);

  // The real sun for this place and moment (refreshed every 10 s).
  const days = spells.world?.id === "days" ? spellNow("world") : null;
  if (t - lastSun > 10 || !sunState || days || sunAheadWas) {
    const ahead = days ? sunAhead(days.age) * days.fade : 0; // a whole day in a minute, then back to now
    sunState = sunPosition(new Date((unixAt(t) + ahead) * 1000), view.ll.lat, view.ll.lon);
    lastSun = t;
    sunAheadWas = !!days;
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
  else if (state.realm) { // a dream's own air: the cyan dream is lost in mist, the others hazy at their edges
    scene.fog.color.setHex(REALM_FOG[state.realm.kind]);
    scene.fog.far = (REALMS[state.realm.kind].twist === "mist" ? 70 : 420) * sightOf(body().perception);
    scene.fog.near = scene.fog.far * 0.2;
  } else {
    const h = Math.max(30, camera.position.y);
    const horizonM = Math.sqrt(2 * 6371008.8 * h + h * h);
    scene.fog.color.copy(horizon);
    // Capped inside the outer terrain ring, so from high up its edge melts into haze.
    scene.fog.far = Math.min(440000, Math.max(40000, horizonM * 1.2)) * sightOf(body().perception); // perception: how far you see
    scene.fog.near = scene.fog.far * 0.25;
  }
  if (world) world.highways.group.visible = !underwater && seesLey();
  sea.underwater = underwater;
  scene.background = scene.fog.color;

  sea.mesh.visible = !state.realm; // a dream hangs over no sea
  sea.mesh.position.set(camera.position.x, 0, camera.position.z); // its waves are keyed to world position
  sea.update(t, dir, day, horizon);
  // The shared clock: the real one, or ?t= when it's fixed. Sky beings and
  // clouds follow it, so every player sees the same sky.
  const unix = unixAt(t);
  if (world) world.highways.update(t);
  if (world) { window.__dream.beings = world.beings.update(unix, t); layerTransparent(world.beings.group); world.beings.group.visible = seesBeings(); }
  // Plants and insects around you; too small to matter from far up.
  if (world && !state.ride) {
    world.shrines.update(state.pos.x, state.pos.z, t);
    discoverShrines();
    world.finds.update(state.pos.x, state.pos.z, t);
    world.finds.group.visible = zoom < 6000;
    if (t - shrineTickAt > 5) { shrineTickAt = t; shrineTick(); }
    world.shrines.group.visible = zoom < 120000; // seen from as high as a far feather lifts you
    const life = zoom < 6000;
    world.plants.group.visible = world.insects.group.visible = world.critters.group.visible = life;
    if (life) {
      window.__dream.plants = world.plants.update(state.pos.x, state.pos.z, t, camera.position, detail.scale);
      window.__dream.insects = world.insects.update(state.pos.x, state.pos.z, unix % 86400, sunState.altitude);
      const me = { x: state.pos.x, y: state.pos.y, z: state.pos.z, speed: Math.hypot(state.speed, state.vy), ground: Math.max(0, world.terrain.heightAt(state.pos.x, state.pos.z)), target: state.target?.critter ?? null };
      critterNews(world.critters.update(t, unix, sunState.altitude, me), t, sunState.altitude);
      window.__dream.critters = world.critters.counts;
    }
  }
  if (t - lastHud > 0.25) { updateHud(); lastHud = t; }
  drawRoute(t);
  simT = t;
  bursts.update(dt);
  pigeonFx.update(dt, t);
  if (world && cairnsWorld !== world) { cairns.place(world); cairnsWorld = world; artifactsAt = -Infinity; } // regrown: re-place, then look again
  if (people.viewer && world && !rebuilding && simT - artifactsAt > 90) refreshArtifacts();
  if (people.viewer && simT - everywhereAt > 180) refreshEverywhere();
  cairns.update(t, realNow());
  if (world && !state.ride) flock.update(t, dt, realNow(), world, camera, canvas);
  placeMyBubble();
  if (t - shareTickAt > 1) {
    shareTickAt = t;
    shareTick();
    keepTick();
    seedTick();
    portalTick();
    if (Math.floor(simT) % 3 === 0) discoverPlaces();
    carryTick();
    atlasTick();
    pigeonTick();
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
    globe.showLey(seesLey());
    globe.update(view.ll, { e: fxg, n: -fzg }, zoom, new Date(unixAt(t) * 1000), camera.aspect, t);
    renderer.render(globe.scene, globe.camera);
  } else {
    curveUniform.value.copy(camera.position); // the Earth curves away from the eye
    skyPass.update({ frame: world ? world.frame : makeFrame(view.ll.lat, view.ll.lon), camera, unix, sun: { altitude: sunState.altitude, dir }, day, fog: scene.fog, clouds: !underwater && !state.ride && !state.realm && !!world, underwater: underwater || !!state.realm, steps: 20 + 44 * detail.scale, sky: skyNow(unix + (days ? sunAhead(days.age) * days.fade : 0), view.ll, t) });
    placeSkyLabels(day);
    worldSpell();
    if (worldview.active) { skyPass.render(renderer, scene, camera, worldview.target(renderer)); worldview.render(renderer, t); }
    else skyPass.render(renderer, scene, camera);
  }
  // A picture asked for: taken now, before the frame is shown and its buffer cleared.
  if (snapWanted) { const f = snapWanted; snapWanted = null; f(grabPicture()); }
  window.__dream.frames++;
  if (!film?.manual) requestAnimationFrame(frame);
}

/** Camera distance and pitch from the zoom: low and close behind you, then pulling back and tilting down. */
function cameraRig() {
  const k = THREE.MathUtils.smoothstep(Math.log(zoom), Math.log(ZOOM_HOME), Math.log(150000));
  const pitch = THREE.MathUtils.degToRad(18 + 52 * k);
  const z = zoom * spellZoom; // a giant needs the camera farther off, a tiny creature nearer
  return { back: z * Math.cos(pitch), up: z * Math.sin(pitch), near: z < 400 };
}

const UP_AXIS = new THREE.Vector3(0, 1, 0);
function worldView(dt, t) {
  step(dt);
  if (state.realm) { realmFx.update(simT - state.realm.t0, state.realm.got, state.realm.gemOut); realmTick(); }
  breathUniforms.uBreathT.value = t; // the land's swell rolls out from you
  breathUniforms.uBreathCentre.value.x = state.pos.x;
  breathUniforms.uBreathCentre.value.y = state.pos.z;
  if (state.ride) return rideView(0, t); // boarded this frame
  const p = state.pos;
  const hopAge = t - hopAt, hopY = hopAge < 0.45 ? Math.sin((Math.PI * hopAge) / 0.45) * 3 * creature.size : 0;
  // On its feet on land and in the air; in the water it floats, half in.
  footLift += ((state.mode === "water" ? 0 : creature.foot) - footLift) * Math.min(1, dt * 6);
  creature.group.position.set(p.x, p.y + footLift + hopY + (state.mode === "water" ? Math.sin(t * 2) * 0.4 : 0), p.z);
  creature.group.rotation.y = state.heading;
  creature.update(t, { mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / (state.mode === "air" ? sp.fly : state.mode === "water" ? sp.swim : sp.run)) });
  // A shape spell: giant, tiny, stretched. It scales the body after it breathes, lifts it to its new feet, and moves the camera to suit.
  const sh = shapeOf(spells.shape?.id, spellNow("shape").w);
  creature.group.scale.multiply(sh);
  creature.group.position.y += footLift * (sh.y - 1);
  // Crouched: low and wide, feet still on the ground.
  state.crouchK = (state.crouchK ?? 0) + ((state.crouch ? 1 : 0) - (state.crouchK ?? 0)) * Math.min(1, dt * 10);
  if (state.crouchK > 0.01) {
    const k = state.crouchK, sy = 1 - 0.38 * k;
    creature.group.scale.y *= sy;
    creature.group.scale.x *= 1 + 0.12 * k; creature.group.scale.z *= 1 + 0.12 * k;
    creature.group.position.y += footLift * sh.y * (sy - 1);
  }
  spellZoom = sh.zoom;
  spellLegs = sh.y;

  // The camera: the director frames what you're doing.
  let goal = null;
  if (state.target) { const g = state.target.pts[state.target.pts.length - 1], q = world.frame.toLocal(g.lat, g.lon); goal = new THREE.Vector3(q.x, state.target.ground, q.z); }
  // Zoomed all the way in, you look through its eyes, and it fades so you can see past it.
  const eyes = editing ? 0 : THREE.MathUtils.smoothstep(14 - zoom, 0, 7); // in the editor you look at it, not through it
  fadeCreature(1 - 0.85 * eyes);
  const eye = eyeLocal.clone().multiplyScalar(creature.size).multiply(sh).applyAxisAngle(UP_AXIS, state.heading);
  director.update({ t, dt, subject: creature.group.position, heading: state.heading, mode: state.mode, speed01: Math.min(1, Math.abs(state.speed) / sp.fly), riding: false, rig: cameraRig(), heightAt: world.terrain.heightAt, goal, sunDir: sunInfo.dir, gold: sunInfo.gold, scale: creature.size * sh.y, eyes, eye });
  cameraSpell();
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
  director.update({ t, dt, subject: rideOrigin, heading: state.heading, mode: "air", speed01: r.leaving ? 0.2 : 1, riding: true, rig: cameraRig(), heightAt: null, goal: null, sunDir: sunInfo.dir, gold: 0, scale: creature.size });
  rideFx.update(r, makeFrame(ll.lat, ll.lon), t, state.heading, dt);
  return { ll, pos: rideOrigin, underwater: false };
}

// ---- Boot ----
window.__dream = { seed, stats, genes, spawn, inv: () => inv, been: () => been, travelTo: (a) => travelTo(a), travelToPlace: (k) => travelToShrine(k), takePicture: () => takePicture(), hereUrl: () => hereUrl(), rhizome: () => { const z = rhiz(); return { R: z.R, filled: z.filled, fx: { ...z.fx, powers: [...z.fx.powers], deeper: [...z.fx.deeper], looks: [...z.fx.looks] }, view: z.R && (() => { const v = viewOf(z.R, z.filled); return { visible: [...v.visible], fillable: [...v.fillable], woken: [...v.woken] }; })() }; }, setGem: (i) => setGem(i), zoomNow: () => zoom, zoomBy: (f) => zoomBy(f), realm: () => state.realm && { kind: state.realm.kind, got: state.realm.got.size, lights: state.realm.L.lights.length, gemOut: state.realm.gemOut, L: state.realm.L, anchor: state.realm.anchor, t: simT - state.realm.t0 }, enterDream: (key) => { const s = world.shrines.all().find((q) => q.key === key); if (s) enterDream(s); }, canDream: (key) => { const s = world.shrines.all().find((q) => q.key === key); return !!s && canDream(s); }, landPigeon: (p) => landPigeon(p), pigeonOnScreen: () => pigeonFx.positions().map((v) => { const q = v.clone().project(camera); return [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100, Math.round(v.distanceTo(camera.position))]; }), pigeonsAround: () => flying.list.length, born: () => born, body: () => body(), finds: () => world.finds.all(), pickUp: (key) => pickUp(world.finds.all().find((f) => f.key === key)), wearIt: (k, on = true) => changeWorn(k, on), seesLey: () => seesLey(), triangles: creature.triangles, editor: () => editor, editing: () => editing, shrines: () => world.shrines.all(), atlas: () => ({ ...found }), spells: () => Object.fromEntries(Object.entries(spells).map(([k, v]) => [k, v && v.id])), testSpell: (id) => castSpell({ key: "test", spell: id, x: state.pos.x, y: state.pos.y + 3, z: state.pos.z }), endSpells, ready: false, frames: 0, state, objects: { sea: sea.mesh }, world: () => world, detail, pickAt: (x, y) => pick(x, y)?.kind ?? null, viewAs: (handle) => lookAs(handle, false), cairns: () => cairns, maker: () => maker, artifacts: () => artifacts.map((a) => ({ uri: a.uri, handle: a.handle, note: a.note, own: a.own })), pickGlobe: (x, y) => { const r = canvas.getBoundingClientRect(), h = globe.pick(x - r.left, y - r.top, r.width, r.height); return h ? (h.cairn ? `cairn:${h.cairn.handle}` : `mutual:${h.mutual.handle}`) : null; }, flock: () => [...who.values()].map((w) => ({ handle: w.handle, kind: w.intent.kind, genes: w.intent.creature.genes })), sharing: () => ({ ...share, last: share.last && share.last.kind }), everywhere: () => everywhere.map((a) => ({ uri: a.uri, handle: a.handle, lat: a.lat, lon: a.lon })), reach: () => ({ n: reach.length, lit: lit.map((c) => c.kind), focus: focus && { kind: focus.kind, key: focus.key, d: Math.round(focus.d) }, prompt: shownPrompt }) };
if (film) {
  window.__dream.filmStart = () => { film.ms = performance.now(); film.base = Date.now() - film.ms; film.manual = true; };
  window.__dream.filmStep = (n = 1) => { for (let k = 0; k < n; k++) { film.ms += 1000 / film.fps; frame(); } };
}
setStatus("dreaming…");
// ---- Waking: born of land or sea (birth.js), and somewhere that fits ----
/** A newcomer is asked where they were born, before they wake. Closing the question is "on land". */
function chooseBirth() {
  return new Promise((resolve) => {
    let done = false;
    const pick = (b) => { if (done) return; done = true; maker.close(); resolve(b); };
    const choice = (b, title, words) => h("button", { class: `go born-${b}`, onclick: () => pick(b) }, h("b", {}, title), h("span", {}, words));
    maker.custom("birth", [
      h("h2", {}, "Where were you born?"),
      h("p", {}, "You're about to wake on the Earth, near one of its ley nodes."),
      h("div", { class: "births" },
        choice("land", "On land", "You run, and wake on land. Your swim sleeps until you wear a tidefin."),
        choice("sea", "In the sea", "You swim and dive, and wake in coastal water. Your run sleeps until you wear a mossfoot.")),
      h("p", { class: "small" }, "Tidefins lie on the seabed, mossfeet in meadows inland, and now and then the tide leaves one on a beach. Eat a moonseed to be born again."),
    ], { classes: ["birth"], onClose: () => pick("land") });
  });
}
/** Near a random ley node, where your birth belongs: land well inland, or coastal water (the Köppen map's land mask). */
async function wakePlace(tried = new Set()) {
  if (spawnFixed) return spawn;
  const nodes = network().nodes.filter((n) => Math.abs(n.lat) <= 80 && !tried.has(n)).map((n) => ({ n, k: spawnRand() })).sort((a, b) => a.k - b.k).map((o) => o.n);
  for (let i = 0; i < 48; i += 6) {
    const batch = nodes.slice(i, i + 6);
    await Promise.all(batch.map((n) => ensureKoppen(n.lat, n.lon, 1)));
    const p = spawnAround(born, batch, (la, lo) => koppenAt(la, lo) > 0, spawnRand);
    if (p) return p;
  }
  return spawn; // nothing found (offline tiles?): near a node, as before
}
/**
 * The last few hundred metres, on the terrain itself: a land-born creature on ground, a sea-born one in water. False if
 * there's none within 12 km (the land mask was wrong here).
 */
function settleWaking(w) {
  if (spawnFixed) return true;
  // Born in the sea, over the shelf if there's one near (a seabed in reach, and the shore), else any water.
  const tests = born === "land" ? [(hh) => hh >= 3] : [(hh) => hh <= -6 && hh >= -200, (hh) => hh <= -6];
  for (const ok of tests) {
    if (ok(w.terrain.heightAt(0, 0))) return true;
    for (let r = 150; r <= 12000; r += 150) {
      for (let b = 0; b < 24; b++) {
        const a = (b / 24) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (ok(w.terrain.heightAt(x, z))) { state.pos.x = x; state.pos.z = z; return true; }
      }
    }
  }
  return false;
}
(async () => {
  if (newcomer) {
    setStatus("");
    born = await chooseBirth();
    stats = bornStats(stats, born);
    keepCreature(0, false); // the first creature you meet is yours (until you choose another)
    swapBody(graph);
    logLine(born === "land" ? `${myName} was born on land.` : `${myName} was born in the sea.`, "creature");
  }
  setStatus("waking…");
  spawn = await wakePlace();
  window.__dream.spawn = spawn;
  regrow(spawn.lat, spawn.lon, boot);
})();
const wakeTries = new Set();
function boot(w) {
  swapWorld(w);
  state.pos.set(0, 0, 0);
  // The land mask is coarse: if the terrain here disagrees with your birth, try another node (twice, then wake anyway).
  if (!settleWaking(w) && spawn.node && wakeTries.size < 2) {
    wakeTries.add(spawn.node);
    wakePlace(wakeTries).then((p) => { spawn = p; window.__dream.spawn = p; regrow(p.lat, p.lon, boot); });
    return;
  }
  const ground = w.terrain.heightAt(state.pos.x, state.pos.z);
  // In the air over land (the opening shot cranes down onto you); afloat, born in the sea.
  state.pos.y = !spawnFixed && born === "sea" && ground < 0 ? -1.5 : Math.max(0, ground) + (altParam !== null ? Math.max(5, Number(altParam)) : wings() > 0 ? 350 : 40);
  establishing(); // the opening shot: a crane down onto you
  setStatus(w.terrain.failed ? `${w.terrain.failed} elevation tiles didn't load; that ground is drawn at sea level` : "");
  // ?ride=N starts on highway N, halfway along (a shortcut for trying the ride).
  if (params.get("ride") !== null) {
    const line = lineAt(Math.abs(Number(params.get("ride")) | 0) % lineCount());
    boardRide({ line, t: 0.5, dir: 1 });
  }
  window.__dream.ready = true;
  requestAnimationFrame(frame);
}
