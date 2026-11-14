// Small creatures, drawn: bunnies, frogs and little birds, a couple of dozen triangles each, one instanced mesh per
// kind. Where they are comes from critterlife.js (homes by biome, a day on the shared clock); what they do about you
// is decided here, on this phone only: rush at one and it runs, touch one gently and it answers.
import * as THREE from "three";
import { KINDS, critterHomes, idleAt, startledAt, RETURN_S } from "./critterlife.js";
import { biomeFor } from "./biome.js";
import { koppenAt } from "./koppen.js";
import { curved } from "./curvature.js";
import { BREATH } from "./breath.js";

const REGROW_M = 100;
const CALM_S = 20; // touched gently, it trusts you for a while
const TOUCH_S = 1.1;
const BODY = 0, ACCENT = 1, FIXED = 2;
const DARK = [0.06, 0.05, 0.08], PINK = [1, 0.62, 0.7], BEAK = [1, 0.62, 0.15];
const BREATH_RATE = { bunny: 5.5, frog: 2.6, bird: 7 }, BREATH_AMP = { bunny: 0.06, frog: 0.09, bird: 0.06 }; // radians a second; fraction

// ---- Shapes: forward is -z, feet at y = 0, about a metre long (scaled by each one's size) ----
function shape(kind) {
  const pos = [], part = [], col = [], wing = [];
  const tri = (a, b, c, p = BODY, colour = [1, 1, 1], w = 0) => { for (const v of [a, b, c]) { pos.push(...v); part.push(p); col.push(...colour); wing.push(w); } };
  // An octahedron from its six points; belly faces (those touching the bottom point) can take the accent.
  const octa = (front, back, top, bottom, left, right, bellyPart = BODY, p = BODY, colour) => {
    for (const [a, b] of [[front, left], [left, back], [back, right], [right, front]]) {
      tri(top, b, a, p, colour);
      tri(bottom, a, b, bellyPart === BODY ? p : bellyPart, colour);
    }
  };
  const tetra = (c, r, p, colour) => {
    const [x, y, z] = c, v = [[x, y + r, z], [x - r, y - r * 0.5, z + r * 0.6], [x + r, y - r * 0.5, z + r * 0.6], [x, y - r * 0.5, z - r]];
    tri(v[0], v[1], v[2], p, colour); tri(v[0], v[2], v[3], p, colour); tri(v[0], v[3], v[1], p, colour); tri(v[1], v[3], v[2], p, colour);
  };
  if (kind === "bunny") {
    // A loaf with high haunches, the head on its chest, leaf-shaped ears, a cotton tail.
    octa([0, 0.3, -0.36], [0, 0.3, 0.42], [0, 0.66, 0.12], [0, 0.02, 0.04], [-0.3, 0.26, 0.08], [0.3, 0.26, 0.08], ACCENT);
    octa([0, 0.44, -0.64], [0, 0.5, -0.2], [0, 0.68, -0.4], [0, 0.26, -0.4], [-0.17, 0.48, -0.4], [0.17, 0.48, -0.4]);
    tri([-0.165, 0.54, -0.5], [-0.165, 0.5, -0.44], [-0.17, 0.57, -0.44], FIXED, DARK); // eyes
    tri([0.165, 0.54, -0.5], [0.17, 0.57, -0.44], [0.165, 0.5, -0.44], FIXED, DARK);
    for (const sd of [-1, 1]) { // ears
      const bi = [0.04 * sd, 0.66, -0.38], bo = [0.14 * sd, 0.64, -0.34], to = [0.17 * sd, 0.96, -0.28], tip = [0.09 * sd, 1.14, -0.26];
      tri(bi, bo, to); tri(bi, to, tip);
    }
    tetra([0, 0.42, 0.46], 0.12, ACCENT); // a cotton tail
  } else if (kind === "frog") {
    octa([0, 0.22, -0.42], [0, 0.2, 0.32], [0, 0.44, -0.04], [0, 0.03, -0.04], [-0.34, 0.18, 0], [0.34, 0.18, 0], ACCENT);
    tetra([-0.15, 0.44, -0.24], 0.085, FIXED, DARK); // eyes
    tetra([0.15, 0.44, -0.24], 0.085, FIXED, DARK);
    tri([-0.3, 0.12, 0.08], [-0.48, 0.03, 0.32], [-0.22, 0.03, 0.34], BODY); // back legs
    tri([0.3, 0.12, 0.08], [0.22, 0.03, 0.34], [0.48, 0.03, 0.32], BODY);
    tri([-0.24, 0.12, -0.2], [-0.36, 0.01, -0.34], [-0.2, 0.01, -0.3], BODY); // front legs
    tri([0.24, 0.12, -0.2], [0.2, 0.01, -0.3], [0.36, 0.01, -0.34], BODY);
  } else {
    octa([0, 0.36, -0.26], [0, 0.4, 0.22], [0, 0.52, -0.04], [0, 0.18, 0], [-0.14, 0.36, -0.02], [0.14, 0.36, -0.02], ACCENT);
    tri([0, 0.39, -0.25], [-0.03, 0.36, -0.25], [0, 0.35, -0.38], FIXED, BEAK); // beak
    tri([0, 0.39, -0.25], [0, 0.35, -0.38], [0.03, 0.36, -0.25], FIXED, BEAK);
    tri([0, 0.42, 0.18], [-0.09, 0.45, 0.44], [0.09, 0.45, 0.44], BODY); // tail
    tri([-0.1, 0.44, -0.1], [-0.1, 0.44, 0.14], [-0.46, 0.47, 0.1], BODY, [1, 1, 1], 1); // wings (they flap)
    tri([0.1, 0.44, -0.1], [0.46, 0.47, 0.1], [0.1, 0.44, 0.14], BODY, [1, 1, 1], 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
  return g;
}

/** One kind's instanced mesh and its per-creature attributes (exported for previews). */
export function critterMesh(kind) { return mesh(kind); }
function mesh(kind) {
  const max = KINDS[kind].max, geo = shape(kind);
  const colA = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), colB = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), flap = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geo.setAttribute("aColA", colA);
  geo.setAttribute("aColB", colB);
  geo.setAttribute("aFlap", flap);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPart; attribute float aWing; attribute vec3 aColA; attribute vec3 aColB; attribute float aFlap;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        if (aWing > 0.5) {
          float fold = step(aFlap, -0.99), a = mix(aFlap, -0.35, fold); // folded: tucked along its back
          float px = sign(transformed.x) * 0.1, dx = (transformed.x - px) * mix(1.0, 0.28, fold);
          transformed.x = px + dx * cos(a); transformed.y += abs(dx) * sin(a) + 0.04 * fold; transformed.z += 0.12 * fold;
        }`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        if (aPart < 0.5) vColor.rgb = aColA; else if (aPart < 1.5) vColor.rgb = aColB;`);
  };
  curved(mat, `-critter-${kind}`);
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  return { m, colA, colB, flap };
}

/** plants: for perches (a bird may fly up into a tree); terrain: heights and relief. */
export function buildCritters(frame, terrain, plants) {
  const group = new THREE.Group();
  const meshes = Object.fromEntries(Object.keys(KINDS).map((k) => [k, mesh(k)]));
  for (const k of Object.keys(meshes)) group.add(meshes[k].m);
  const local = new Map(); // key -> { startle: { t0, from, away } | null, back: { t0, from } | null, calmUntil, touchAt }
  let centre = null, all = [], frameT = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();

  const at = (c) => {
    const p = frame.toLocal(c.lat, c.lon), h = terrain.heightAt(p.x, p.z);
    if (h < 3 || terrain.wet?.(p.x, p.z)) return null;
    return { p: { x: p.x, z: p.z }, h, biomeId: biomeFor(koppenAt(c.lat, c.lon), terrain.reliefAt(p.x, p.z), c.lat, h) };
  };
  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    all = Object.keys(KINDS).flatMap((k) => critterHomes(k, ll.lat, ll.lon, at));
    for (const k of Object.keys(meshes)) {
      const M = meshes[k], list = all.filter((c) => c.kind === k);
      list.forEach((c, i) => {
        c.i = i;
        M.colA.setXYZ(i, ...col.setHSL(...c.body).toArray());
        M.colB.setXYZ(i, ...col.setHSL(...c.accent).toArray());
      });
      M.m.count = list.length;
      M.colA.needsUpdate = M.colB.needsUpdate = true;
    }
    centre = { x, z };
  }
  // A bird's tree: the tallest plant within 30 m of home, its top a little above the crown. Plants load in as you
  // arrive, so this is looked at again and again, a few birds a frame (each look scans the plants nearby).
  let perchNext = 0;
  function findPerches(n) {
    const birds = all.filter((c) => c.kind === "bird");
    for (let i = 0; i < Math.min(n, birds.length); i++) {
      const c = birds[perchNext++ % birds.length];
      let best = null;
      for (const r of plants.near(c.x, c.z, 30)) if (!best || r.height > best.height) best = r;
      c.perch = best && best.height > 2 ? { x: best.x, z: best.z, y: best.height + 0.3 } : null;
    }
  }

  /** Where a small creature is now, on this phone: its day, or running from you, or coming back. */
  function placeOf(c, t) {
    const s = local.get(c.key);
    const idle = idleAt(c, t, c.perch);
    if (!s) return idle;
    if (s.startle) {
      const run = startledAt(c, s.startle.from, s.startle.away, t - s.startle.t0, t);
      if (run) return run;
      s.back = { t0: t, from: { ...(s.last || s.startle.from) } }; // from where the run ended, back to its day
      s.startle = null;
    }
    if (s.back) {
      const u = (t - s.back.t0) / RETURN_S;
      if (u >= 1) s.back = null;
      else {
        const k = u * u * (3 - 2 * u), f = s.back.from;
        return { ...idle, x: f.x + (idle.x - f.x) * k, z: f.z + (idle.z - f.z) * k, lift: (f.lift || 0) + (idle.lift - (f.lift || 0)) * k, moving: true, flying: c.kind === "bird" && (f.lift || 0) > 0.5 };
      }
    }
    return idle;
  }

  return {
    group,
    /**
     * Each frame. clock: the shared clock (s); sunAltitude in degrees; me: { x, y, z, speed, ground, target (a
     * critter key a trip is heading to, or null) }. Returns what happened: [{ c, what: "startled" }].
     */
    update(t, clock, sunAltitude, me) {
      frameT = clock;
      if (!centre || Math.hypot(me.x - centre.x, me.z - centre.z) > REGROW_M) settle(me.x, me.z);
      findPerches(3); // three birds a frame: every bird looks again about three times a second
      const birdsOut = sunAltitude > -4; // little birds roost at night
      meshes.bird.m.visible = birdsOut;
      const events = [];
      for (const c of all) {
        if (c.kind === "bird" && !birdsOut) continue;
        const M = meshes[c.kind];
        let s = local.get(c.key);
        // Rushed at, it runs (unless it's what you're walking up to, or it trusts you now).
        const now = placeOf(c, clock);
        const ground = Math.max(0, terrain.heightAt(now.x, now.z));
        const y = ground + now.lift;
        const dx = now.x - me.x, dz = now.z - me.z, flat = Math.hypot(dx, dz);
        const close = c.kind === "bird" ? Math.hypot(flat, y - me.y) < KINDS.bird.startle : flat < KINDS[c.kind].startle && me.y - me.ground < 30;
        if (close && me.speed > 10 && me.target !== c.key && !(s && (s.startle || s.calmUntil > t))) {
          if (!s) { s = { startle: null, back: null, calmUntil: 0, touchAt: -10 }; local.set(c.key, s); }
          const L = flat || 1;
          s.startle = { t0: clock, from: { x: now.x, z: now.z, lift: now.lift }, away: { x: dx / L, z: dz / L } };
          s.back = null;
          events.push({ c, what: "startled" });
        }
        if (s) s.last = now;
        // A touch: a bunny's binky (a twisting jump), a frog's puffed throat, a bird's flutter.
        let lift = 0, twist = 0, puff = 1, flap = now.flap;
        const age = s ? t - s.touchAt : 99;
        if (age < TOUCH_S) {
          const u = age / TOUCH_S, arc = Math.sin(Math.PI * u);
          if (c.kind === "bunny") { lift = arc * 1.6 * c.size; twist = Math.PI * 2 * u * u * (3 - 2 * u); }
          else if (c.kind === "frog") { puff = 1 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 2)); lift = Math.max(0, Math.sin(Math.PI * (u - 0.5) * 2)) * 0.6 * c.size; }
          else { flap = Math.sin(t * 50) * 0.9; lift = arc * 0.8 * c.size; }
        }
        e.set(-(now.pitch || 0), now.yaw + twist, 0);
        q.setFromEuler(e);
        // They breathe, small and quick: a bunny's flanks, a frog's whole body, a bird's puffed chest.
        const br = Math.sin(t * BREATH_RATE[c.kind] + c.seed * 40) * BREATH_AMP[c.kind] * BREATH.animal;
        const sq = now.squash * puff * (1 + br);
        sc.set(c.size / Math.sqrt(sq), c.size * sq, c.size / Math.sqrt(sq));
        p3.set(now.x, y + lift, now.z);
        M.m.setMatrixAt(c.i, m4.compose(p3, q, sc));
        M.flap.setX(c.i, c.kind === "bird" ? (now.flying || age < TOUCH_S ? flap : -1) : 0); // -1: wings folded
        c.now = { x: now.x, y: y + lift, z: now.z, moving: now.moving, flying: now.flying, startled: !!(s && s.startle) };
      }
      for (const k of Object.keys(meshes)) { meshes[k].m.instanceMatrix.needsUpdate = true; meshes[k].flap.needsUpdate = true; }
      return events;
    },
    /** Small creatures within r of (x, z), where they are now, not running from you: [{ key, kind, name, x, y, z, size }]. */
    near(x, z, r) {
      const out = [];
      for (const c of all) {
        if (!c.now || c.now.startled || (c.kind === "bird" && !meshes.bird.m.visible)) continue;
        if (Math.hypot(c.now.x - x, c.now.z - z) < r) out.push({ key: c.key, kind: c.kind, name: c.name, x: c.now.x, y: c.now.y, z: c.now.z, size: c.size });
      }
      return out;
    },
    /** All of them, for a tap to find one: [{ key, kind, name, x, y, z, size }]. */
    all() { return this.near(0, 0, Infinity); },
    /** Touched gently: it answers, and trusts you for a while. Returns it, or null if it's gone. */
    touch(key, t) {
      const c = all.find((q) => q.key === key);
      if (!c || !c.now) return null;
      let s = local.get(key);
      if (!s) { s = { startle: null, back: null, calmUntil: 0, touchAt: -10 }; local.set(key, s); }
      s.touchAt = t;
      s.calmUntil = t + CALM_S;
      return { key, kind: c.kind, name: c.name, x: c.now.x, y: c.now.y, z: c.now.z, size: c.size };
    },
    get counts() { return Object.fromEntries(Object.keys(meshes).map((k) => [k, meshes[k].m.count])); },
    get clock() { return frameT; },
  };
}
