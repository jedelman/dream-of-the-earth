// Life under the sea, drawn: shoals of little fish (a dozen triangles each, one instanced mesh) and kelp (one instanced
// mesh, swaying in the shader and leaning out of your way). Where they are comes from fishlife.js; what they do about
// you is decided here, on this phone only: rush through a shoal and it scatters, touch it gently and it swirls round you.
import * as THREE from "three";
import { SHOAL, KELP, REEF, CORAL_FORMS, shoalHomes, kelpHomes, coralHomes, fishAt, shoalAt, burstAt, swirlAt, BURST_S } from "./fishlife.js";
import { curved } from "./curvature.js";

const REGROW_M = 100;
const MAX_FISH = SHOAL.max * SHOAL.fish[1];
const BODY = 0, ACCENT = 1, FIXED = 2;
const DARK = [0.04, 0.04, 0.07];
const RUSH = 7; // m/s: faster than this through a shoal and it bursts

// ---- Shapes ----
// A fish: forward is -z, about a metre long, a lozenge body, a forked tail that wags (aTail), a fin on top, two eyes.
function fishShape() {
  const pos = [], part = [], col = [], tail = [];
  const tri = (a, b, c, p = BODY, colour = [1, 1, 1], w = 0) => { for (const v of [a, b, c]) { pos.push(...v); part.push(p); col.push(...colour); tail.push(w); } };
  const nose = [0, 0, -0.5], back = [0, 0, 0.3], top = [0, 0.2, -0.08], bot = [0, -0.17, -0.06], l = [-0.12, 0, -0.08], r = [0.12, 0, -0.08];
  for (const [a, b] of [[nose, l], [l, back], [back, r], [r, nose]]) { tri(top, b, a); tri(bot, a, b, ACCENT); }
  tri([0, 0, 0.26], [0, 0.18, 0.56], [0, 0.02, 0.44], ACCENT, [1, 1, 1], 1); // the tail, forked
  tri([0, 0, 0.26], [0, -0.02, 0.44], [0, -0.16, 0.56], ACCENT, [1, 1, 1], 1);
  tri([0, 0.17, -0.12], [0, 0.29, 0.08], [0, 0.13, 0.12], ACCENT); // a fin on top
  tri([-0.09, 0.05, -0.3], [-0.085, 0.09, -0.24], [-0.09, 0.02, -0.22], FIXED, DARK); // eyes
  tri([0.09, 0.05, -0.3], [0.09, 0.02, -0.22], [0.085, 0.09, -0.24], FIXED, DARK);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute("aTail", new THREE.Float32BufferAttribute(tail, 1));
  return g;
}

// Kelp: a stipe from the seabed (y = 0) to its tip (y = 1), blades along it on alternating sides, a float at each.
// The instance scales y by its height; x and z stay in metres.
function kelpShape() {
  const pos = [], col = [];
  const stem = [0.32, 0.27, 0.1], blade = [0.5, 0.42, 0.12], tip = [0.62, 0.55, 0.18];
  const tri = (a, b, c, colour) => { for (const v of [a, b, c]) { pos.push(...v); col.push(...colour); } };
  const SEG = 5, w = 0.24;
  for (let k = 0; k < SEG; k++) {
    const y0 = k / SEG, y1 = (k + 1) / SEG, t = k / (SEG - 1);
    tri([-w, y0, 0], [w, y0, 0], [w * 0.8, y1, 0], stem);
    tri([-w, y0, 0], [w * 0.8, y1, 0], [-w * 0.8, y1, 0], stem);
    // A blade, on the side this segment faces, long and narrow, rising.
    const sd = k % 2 ? 1 : -1, a = (k * 2.4) % (Math.PI * 2), cx = Math.cos(a) * sd, cz = Math.sin(a) * sd;
    const base = [0, y0 + 0.4 / SEG, 0], len = 1.6 + 0.6 * (1 - t);
    const end = [cx * len, y1 + 0.25 / SEG, cz * len], side = [-cz * 0.6, 0, cx * 0.6];
    const mid = [cx * len * 0.5, (base[1] + end[1]) / 2, cz * len * 0.5];
    tri(base, [mid[0] + side[0], mid[1], mid[2] + side[2]], end, k === SEG - 1 ? tip : blade);
    tri(base, end, [mid[0] - side[0], mid[1], mid[2] - side[2]], k === SEG - 1 ? tip : blade);
  }
  tri([-0.5, 1, 0], [0.5, 1, 0.3], [0, 1.04, -0.5], tip); // a frond lying at the top
  tri([0.4, 1, -0.4], [-0.3, 1.02, 0.5], [0, 1, 0.6], tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Coral: four forms, each about a metre across at size 1, standing on y = 0. aSway: how much a vertex sways (sea fans).
function coralShape(form) {
  const pos = [], sway = [];
  const tri = (a, b, c, s = [0, 0, 0]) => { pos.push(...a, ...b, ...c); sway.push(...s); };
  if (form === "brain") {
    // A lumpy dome: a ring of six round a top, and a skirt to the seabed.
    const top = [0, 0.62, 0], ring = [], foot = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, r = 0.42 + 0.06 * Math.sin(k * 2.3); ring.push([Math.cos(a) * r, 0.42 + 0.05 * Math.cos(k * 1.7), Math.sin(a) * r]); foot.push([Math.cos(a + 0.5) * 0.55, 0, Math.sin(a + 0.5) * 0.55]); }
    for (let k = 0; k < 6; k++) { const n = (k + 1) % 6; tri(top, ring[n], ring[k]); tri(ring[k], ring[n], foot[k]); tri(ring[n], foot[n], foot[k]); }
  } else if (form === "staghorn") {
    // Five branches, each a thin three-sided spike leaning out from the middle.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4, lean = 0.25 + 0.12 * (k % 2), h = 0.75 + 0.2 * ((k * 7) % 3) / 2;
      const tip = [Math.cos(a) * lean * 1.6, h, Math.sin(a) * lean * 1.6], b = [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08];
      const w = 0.07, p1 = [b[0] + w, 0, b[2]], p2 = [b[0] - w * 0.5, 0, b[2] + w], p3 = [b[0] - w * 0.5, 0, b[2] - w];
      tri(p1, p2, tip); tri(p2, p3, tip); tri(p3, p1, tip);
      const fork = [tip[0] * 0.55 + Math.cos(a + 1.2) * 0.25, h * 0.75, tip[2] * 0.55 + Math.sin(a + 1.2) * 0.25], m = [tip[0] * 0.5, h * 0.5, tip[2] * 0.5];
      tri([m[0] + 0.05, m[1], m[2]], [m[0] - 0.05, m[1], m[2]], fork);
    }
  } else if (form === "table") {
    // A plate on a short stalk.
    const st = [[0.1, 0, 0], [-0.05, 0, 0.09], [-0.05, 0, -0.09]], y = 0.42;
    for (let k = 0; k < 3; k++) { const a = st[k], b = st[(k + 1) % 3]; tri(a, b, [b[0] * 0.6, y, b[2] * 0.6]); tri(a, [b[0] * 0.6, y, b[2] * 0.6], [a[0] * 0.6, y, a[2] * 0.6]); }
    const rim = [];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, r = 0.55 + 0.08 * Math.sin(k * 3.1); rim.push([Math.cos(a) * r, y + 0.04 * Math.cos(k * 2), Math.sin(a) * r]); }
    for (let k = 0; k < 7; k++) { const n = (k + 1) % 7; tri([0, y + 0.06, 0], rim[n], rim[k]); tri([0, y - 0.03, 0], rim[k], rim[n]); }
  } else {
    // A sea fan: a flat lace of triangles in one plane, fanning up from a short stem; the top sways.
    const base = [0, 0.08, 0];
    tri([-0.03, 0, 0], [0.03, 0, 0], base);
    for (let k = 0; k < 6; k++) {
      const a0 = -1.1 + (k / 6) * 2.2, a1 = -1.1 + ((k + 1) / 6) * 2.2, r = 0.95;
      const p0 = [Math.sin(a0) * r * 0.7, 0.08 + Math.cos(a0) * r, 0], p1 = [Math.sin(a1) * r * 0.7, 0.08 + Math.cos(a1) * r, 0];
      tri(base, p0, p1, [0, 1, 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
  return g;
}
const coralUniforms = { uCoralT: { value: 0 } };
function coralMesh(form) {
  const geo = coralShape(form), max = REEF.max;
  const colA = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3), glow = new THREE.InstancedBufferAttribute(new Float32Array(max), 1), ph = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geo.setAttribute("aCol", colA);
  geo.setAttribute("aGlow", glow);
  geo.setAttribute("aPh", ph);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, side: THREE.DoubleSide, vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCoralT = coralUniforms.uCoralT;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aCol; attribute float aGlow; attribute float aPh; attribute float aSway; uniform float uCoralT; varying float vGlow;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.z += aSway * 0.12 * sin(uCoralT * 0.8 + aPh); // a sea fan rocks in the swell`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        vColor.rgb = aCol * (1.0 + 0.6 * aGlow); vGlow = aGlow;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * 0.7 * vGlow;");
  };
  // vertexColors needs a colour attribute on the geometry: white, tinted per instance in the shader.
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  curved(mat, `-coral-${form}`);
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  return { m, colA, glow, ph };
}

function fishMesh() {
  const geo = fishShape();
  const colA = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3), colB = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH * 3), 3), wag = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FISH), 1);
  geo.setAttribute("aColA", colA);
  geo.setAttribute("aColB", colB);
  geo.setAttribute("aWag", wag);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPart; attribute float aTail; attribute vec3 aColA; attribute vec3 aColB; attribute float aWag;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float bendT = max(0.0, transformed.z + 0.05); // the back half swings, the tail most
        transformed.x += sin(aWag) * (0.22 * bendT + 0.16 * aTail * (transformed.z - 0.2));`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        if (aPart < 0.5) vColor.rgb = aColA; else if (aPart < 1.5) vColor.rgb = aColB;`);
  };
  curved(mat, "-fish");
  const m = new THREE.InstancedMesh(geo, mat, MAX_FISH);
  m.count = 0;
  m.frustumCulled = false;
  return { m, colA, colB, wag };
}

const kelpUniforms = { uKelpT: { value: 0 }, uKelpMe: { value: new THREE.Vector3(0, 1e6, 0) } };
function kelpMesh() {
  const geo = kelpShape();
  const ph = new THREE.InstancedBufferAttribute(new Float32Array(KELP.max), 1), hh = new THREE.InstancedBufferAttribute(new Float32Array(KELP.max), 1);
  geo.setAttribute("aPh", ph);
  geo.setAttribute("aH", hh);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uKelpT = kelpUniforms.uKelpT;
    shader.uniforms.uKelpMe = kelpUniforms.uKelpMe;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aPh; attribute float aH; uniform float uKelpT; uniform vec3 uKelpMe;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        // The swell rocks it, more towards the tip, a wave running up the stipe.
        float yy = position.y, bend = pow(yy, 1.4) * (0.6 + 0.09 * aH);
        transformed.x += bend * (sin(uKelpT * 0.55 + aPh - yy * 2.2) + 0.3 * sin(uKelpT * 1.3 + aPh * 2.0));
        transformed.z += bend * 0.6 * cos(uKelpT * 0.47 + aPh * 1.7 - yy * 1.8);
        #ifdef USE_INSTANCING
          // Leaning out of the way of someone swimming through.
          vec3 baseK = instanceMatrix[3].xyz;
          vec2 awayK = baseK.xz - uKelpMe.xz;
          float dK = length(awayK), hK = abs(uKelpMe.y - (baseK.y + yy * aH));
          float pushK = smoothstep(7.0, 1.5, dK) * smoothstep(7.0, 2.0, hK) * smoothstep(0.0, 0.5, yy);
          vec2 pK = normalize(awayK + vec2(0.001)) * pushK * 3.5; // in the world; into the kelp's own turn:
          transformed.x += dot(instanceMatrix[0].xz, pK);
          transformed.z += dot(instanceMatrix[2].xz, pK);
        #endif`);
  };
  curved(mat, "-kelp");
  const m = new THREE.InstancedMesh(geo, mat, KELP.max);
  m.count = 0;
  m.frustumCulled = false;
  return { m, ph, hh };
}

/** terrain: heights. Returns { group, update(t, clock, me), near, all, touch, counts }. */
export function buildFish(frame, terrain, warmth = () => null) {
  const group = new THREE.Group();
  const F = fishMesh(), K = kelpMesh(), C = Object.fromEntries(CORAL_FORMS.map((f) => [f, coralMesh(f)]));
  group.add(F.m, K.m, ...Object.values(C).map((c) => c.m));
  let corals = [];
  const glowing = new Map(); // coral key -> when it was touched (this phone's clock)
  const local = new Map(); // shoal key -> { burstAt, swirlAt }
  let centre = null, shoals = [], kelp = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();

  const at = (c) => {
    const p = frame.toLocal(c.lat, c.lon), floor = terrain.heightAt(p.x, p.z);
    return floor < 0 ? { p: { x: p.x, z: p.z }, floor } : null;
  };
  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    shoals = shoalHomes(ll.lat, ll.lon, at, warmth);
    let i = 0;
    for (const s of shoals) {
      s.i0 = i;
      for (let k = 0; k < s.n; k++, i++) {
        F.colA.setXYZ(i, ...col.setHSL(...s.body).toArray());
        F.colB.setXYZ(i, ...col.setHSL(...s.accent).toArray());
      }
    }
    F.m.count = i;
    F.colA.needsUpdate = F.colB.needsUpdate = true;
    kelp = kelpHomes(ll.lat, ll.lon, at, warmth);
    kelp.forEach((k, j) => {
      e.set(0, k.seed * Math.PI * 2, 0);
      q.setFromEuler(e);
      K.m.setMatrixAt(j, m4.compose(p3.set(k.x, k.floor, k.z), q, sc.set(1, k.height, 1)));
      K.ph.setX(j, k.seed * 40);
      K.hh.setX(j, k.height);
    });
    K.m.count = kelp.length;
    K.m.instanceMatrix.needsUpdate = K.ph.needsUpdate = K.hh.needsUpdate = true;
    corals = coralHomes(ll.lat, ll.lon, at, warmth);
    const n = Object.fromEntries(CORAL_FORMS.map((f) => [f, 0]));
    for (const c of corals) {
      const M = C[c.form], i = (c.i = n[c.form]++);
      e.set(0, c.yaw, 0);
      q.setFromEuler(e);
      M.m.setMatrixAt(i, m4.compose(p3.set(c.x, c.floor - 0.1, c.z), q, sc.setScalar(c.size)));
      M.colA.setXYZ(i, ...col.setHSL(...c.hsl).toArray());
      M.glow.setX(i, 0);
      M.ph.setX(i, c.seed * 40);
    }
    for (const f of CORAL_FORMS) { const M = C[f]; M.m.count = n[f]; M.m.instanceMatrix.needsUpdate = M.colA.needsUpdate = M.glow.needsUpdate = M.ph.needsUpdate = true; }
    centre = { x, z };
  }

  return {
    group,
    /**
     * Each frame. t: this phone's clock (s); clock: the shared clock (s); me: { x, y, z, speed, target (a shoal key a
     * trip is heading to, or null) }. Returns what happened: [{ s, what: "scattered" }].
     */
    update(t, clock, me) {
      if (!centre || Math.hypot(me.x - centre.x, me.z - centre.z) > REGROW_M) settle(me.x, me.z);
      kelpUniforms.uKelpT.value = clock % 10000;
      kelpUniforms.uKelpMe.value.set(me.x, me.y, me.z);
      coralUniforms.uCoralT.value = clock % 10000;
      // A brushed coral glows, and fades over three seconds.
      for (const [key, at0] of glowing) {
        const c = corals.find((x) => x.key === key), age = t - at0;
        if (!c || age > 3) { if (c) { C[c.form].glow.setX(c.i, 0); C[c.form].glow.needsUpdate = true; } glowing.delete(key); continue; }
        C[c.form].glow.setX(c.i, Math.sin(Math.PI * Math.min(1, age / 3)) * (age < 0.3 ? age / 0.3 : 1));
        C[c.form].glow.needsUpdate = true;
      }
      const events = [];
      for (const s of shoals) {
        let st = local.get(s.key);
        const mid = shoalAt(s, clock);
        const near = Math.hypot(mid.x - me.x, mid.y - me.y, mid.z - me.z) < 8 + s.size * 3;
        if (near && me.speed > RUSH && me.target !== s.key && !(st && (t - st.burstAt < BURST_S || swirlAt(t - st.swirlAt) !== null))) {
          if (!st) { st = { burstAt: -99, swirlAt: -99 }; local.set(s.key, st); }
          st.burstAt = t;
          events.push({ s, what: "scattered" });
        }
        const burst = st ? burstAt(t - st.burstAt) : 0, swirl = st ? swirlAt(t - st.swirlAt) ?? 0 : 0;
        for (let k = 0; k < s.n; k++) {
          const f = fishAt(s, k, clock, burst, swirl, me);
          const floor = terrain.heightAt(f.x, f.z);
          e.set(-f.pitch, f.yaw, 0);
          q.setFromEuler(e);
          p3.set(f.x, Math.max(f.y, floor + s.size * 0.4), f.z);
          F.m.setMatrixAt(s.i0 + k, m4.compose(p3, q, sc.setScalar(s.size)));
          F.wag.setX(s.i0 + k, f.wag);
        }
        s.now = { x: mid.x, y: mid.y, z: mid.z };
      }
      F.m.instanceMatrix.needsUpdate = F.wag.needsUpdate = true;
      return events;
    },
    /** Shoals whose middle is within r of (x, y, z): [{ key, name, x, y, z, size }]. */
    near(x, y, z, r) {
      const out = [];
      for (const s of shoals) if (s.now && Math.hypot(s.now.x - x, s.now.y - y, s.now.z - z) < r) out.push({ key: s.key, name: s.name, x: s.now.x, y: s.now.y, z: s.now.z, size: s.size });
      return out;
    },
    /** All of them, for a tap to find one. */
    all() { return this.near(0, 0, 0, Infinity); },
    /** Touched gently: it swirls round you. Returns it, or null if it's gone. */
    touch(key, t) {
      const s = shoals.find((q2) => q2.key === key);
      if (!s || !s.now) return null;
      let st = local.get(key);
      if (!st) { st = { burstAt: -99, swirlAt: -99 }; local.set(key, st); }
      st.swirlAt = t;
      st.burstAt = -99;
      return { key, name: s.name, x: s.now.x, y: s.now.y, z: s.now.z, size: s.size };
    },
    /** Coral within r of (x, y, z): [{ key, name, form, x, y, z, size }]. */
    corals(x, y, z, r) {
      const out = [];
      for (const c of corals) { const cy = c.floor + c.size * 0.4; if (Math.hypot(c.x - x, cy - y, c.z - z) < r) out.push({ key: c.key, name: c.name, form: c.form, x: c.x, y: cy, z: c.z, size: c.size, seed: c.seed }); }
      return out;
    },
    /** Brushed gently: it glows. Returns it, or null. */
    touchCoral(key, t) {
      const c = corals.find((x) => x.key === key);
      if (!c) return null;
      glowing.set(key, t);
      return { key, name: c.name, x: c.x, y: c.floor + c.size * 0.4, z: c.z, seed: c.seed };
    },
    get counts() { return { shoals: shoals.length, fish: F.m.count, kelp: kelp.length, coral: corals.length }; },
  };
}
