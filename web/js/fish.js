// Life under the sea, drawn: shoals of little fish (a dozen triangles each, one instanced mesh) and kelp (one instanced
// mesh, swaying in the shader and leaning out of your way). Where they are comes from fishlife.js; what they do about
// you is decided here, on this phone only: rush through a shoal and it scatters, touch it gently and it swirls round you.
import * as THREE from "three";
import { SHOAL, KELP, shoalHomes, kelpHomes, fishAt, shoalAt, burstAt, swirlAt, BURST_S } from "./fishlife.js";
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
export function buildFish(frame, terrain) {
  const group = new THREE.Group();
  const F = fishMesh(), K = kelpMesh();
  group.add(F.m, K.m);
  const local = new Map(); // shoal key -> { burstAt, swirlAt }
  let centre = null, shoals = [], kelp = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), sc = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();

  const at = (c) => {
    const p = frame.toLocal(c.lat, c.lon), floor = terrain.heightAt(p.x, p.z);
    return floor < 0 ? { p: { x: p.x, z: p.z }, floor } : null;
  };
  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    shoals = shoalHomes(ll.lat, ll.lon, at);
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
    kelp = kelpHomes(ll.lat, ll.lon, at);
    kelp.forEach((k, j) => {
      e.set(0, k.seed * Math.PI * 2, 0);
      q.setFromEuler(e);
      K.m.setMatrixAt(j, m4.compose(p3.set(k.x, k.floor, k.z), q, sc.set(1, k.height, 1)));
      K.ph.setX(j, k.seed * 40);
      K.hh.setX(j, k.height);
    });
    K.m.count = kelp.length;
    K.m.instanceMatrix.needsUpdate = K.ph.needsUpdate = K.hh.needsUpdate = true;
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
    get counts() { return { shoals: shoals.length, fish: F.m.count, kelp: kelp.length }; },
  };
}
