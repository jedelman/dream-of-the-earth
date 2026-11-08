// Sky beings in the world: their meshes, their slow sway and travelling glow,
// their sparkles, and their drift along the ley lines near you.
import * as THREE from "three";
import { generateBeing, beingsOnLine } from "./beings.js";
import { lineAt, lineCount, pointOn, tangentEN, highwayAltitude } from "./ride.js";
import { latLonToVec, vecToLatLon, R_EARTH } from "./geo.js";
import { angle } from "./ley.js";
import { curved, CURVE_GLSL } from "./curvature.js";
import { hashString } from "./rng.js";

const RANGE = 220000; // metres: beings this close to the frame origin are drawn

const phaseOf = (seed, branch) => ((hashString(`${seed}:${branch}`) % 6283) / 1000);

/** Build one being's meshes from its generated shape. */
export function buildBeingMesh(being) {
  const pos = [], col = [], sway = [], phase = [];
  const c = new THREE.Color();
  const { hue, spread, eye } = being.palette;
  const reach = (p) => Math.min(1, Math.hypot(...p) / being.size);
  const push = (p, color, ph) => { pos.push(...p); col.push(color.r, color.g, color.b); sway.push(reach(p)); phase.push(ph); };

  // Orientation by body plan: spirals lie along the direction of travel.
  // Spirals lie along the direction of travel; lanterns hang, bulb on top and
  // fronds trailing below, like a jellyfish.
  const orient = being.orient === "side" ? (p) => [p[0], p[2], -p[1]] : being.orient === "hang" ? (p) => [p[0], -p[1], -p[2]] : (p) => p;
  // Recentre on the bounding box so it floats about its middle.
  const all = [...being.segments.flatMap((s) => [s.a, s.b]), ...being.bulbs.map((b) => b.p)].map(orient);
  const mid = [0, 1, 2].map((i) => (Math.min(...all.map((p) => p[i])) + Math.max(...all.map((p) => p[i]))) / 2);
  const place = (p) => { const q = orient(p); return [q[0] - mid[0], q[1] - mid[1], q[2] - mid[2]]; };

  for (const s of being.segments) {
    const a = place(s.a), b = place(s.b);
    const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...ax) || 1;
    const n = ax.map((x) => x / len);
    const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const ring = (p, r) => [0, 1, 2].map((k) => {
      const t = (k / 3) * Math.PI * 2;
      return [p[0] + r * (Math.cos(t) * u[0] + Math.sin(t) * v[0]), p[1] + r * (Math.cos(t) * u[1] + Math.sin(t) * v[1]), p[2] + r * (Math.cos(t) * u[2] + Math.sin(t) * v[2])];
    });
    // Chunky limbs, scaled to the body, so the silhouette reads from far off.
    const thick = being.size * 0.018;
    const ra = ring(a, Math.max(thick, s.r0 * 2.2)), rb = ring(b, Math.max(thick * 0.8, s.r1 * 2.2));
    const ph = phaseOf(being.seed, s.branch);
    c.setHSL((hue + spread * reach(a) + 1) % 1, 0.8, 0.5);
    for (let k = 0; k < 3; k++) {
      const k2 = (k + 1) % 3;
      for (const p of [ra[k], rb[k], ra[k2], ra[k2], rb[k], rb[k2]]) push(p, c, ph);
    }
  }
  const octa = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  for (const bl of being.bulbs) {
    const p = place(bl.p), r = Math.max(being.size * 0.045, bl.r * 1.6);
    const ph = phaseOf(being.seed, bl.branch);
    c.setHSL((eye + 0.1 * reach(p)) % 1, 0.95, 0.72);
    for (const f of faces) for (const i of f) push([p[0] + octa[i][0] * r, p[1] + octa[i][1] * r, p[2] + octa[i][2] * r], c, ph);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
  geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  geo.computeVertexNormals();

  const uniforms = { uTime: { value: 0 }, uSwayAmp: { value: being.sway * being.size } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;\nattribute float aPhase;\nuniform float uTime;\nuniform float uSwayAmp;\nvarying float vSway;\nvarying float vPhase;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vSway = aSway; vPhase = aPhase;
        // Slow, gentle sway: the further from the core, the more it drifts.
        transformed += vec3(sin(uTime * 0.31 + aPhase), 0.5 * sin(uTime * 0.23 + aPhase * 1.7), cos(uTime * 0.27 + aPhase * 1.3)) * aSway * aSway * uSwayAmp;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vSway;\nvarying float vPhase;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        // Glow pulses travel slowly outward along the limbs.
        totalEmissiveRadiance += diffuseColor.rgb * (0.22 + 0.9 * pow(0.5 + 0.5 * sin(vSway * 12.0 - uTime * 0.7 + vPhase), 8.0));`);
  };
  curved(mat, "-being");
  const body = new THREE.Mesh(geo, mat);
  body.frustumCulled = false;

  // Sparkles: points that twinkle around the bulbs and limb tips.
  const sp = [], spPhase = [], spSway = [];
  const tips = [...being.bulbs.map((b) => place(b.p)), ...being.segments.filter((s, i) => i % 5 === 0).map((s) => place(s.b))];
  for (let i = 0; i < Math.min(90, tips.length * 2); i++) {
    const p = tips[i % tips.length];
    const h = hashString(`${being.seed}:sp:${i}`);
    const o = [((h & 255) / 255 - 0.5), (((h >> 8) & 255) / 255 - 0.5), (((h >> 16) & 255) / 255 - 0.5)].map((x) => x * being.size * 0.12);
    const q = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    sp.push(...q); spPhase.push(((h >> 24) & 255) / 255); spSway.push(reach(q));
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  sgeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(spPhase, 1));
  sgeo.setAttribute("aSway", new THREE.Float32BufferAttribute(spSway, 1));
  const smat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColor: { value: new THREE.Color().setHSL(eye, 0.6, 0.85) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${CURVE_GLSL}
      attribute float aPhase;
      attribute float aSway;
      uniform float uTime;
      uniform float uSwayAmp;
      varying float vTw;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.31 + aPhase * 6.28), 0.5 * sin(uTime * 0.23 + aPhase * 10.0), cos(uTime * 0.27 + aPhase * 8.0)) * aSway * aSway * uSwayAmp;
        vec4 mv = viewMatrix * curveWorld(modelMatrix * vec4(p, 1.0));
        gl_Position = projectionMatrix * mv;
        vTw = pow(0.5 + 0.5 * sin(uTime * 1.3 + aPhase * 6.28), 6.0);
        gl_PointSize = clamp((0.6 + vTw) * 2600.0 / -mv.z, 1.0, 5.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      varying float vTw;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(uColor * (0.6 + vTw), 0.35 + 0.65 * vTw);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkles = new THREE.Points(sgeo, smat);
  sparkles.frustumCulled = false;

  const group = new THREE.Group();
  group.add(body, sparkles);
  return {
    group,
    update(t) { uniforms.uTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); sgeo.dispose(); smat.dispose(); },
  };
}

/**
 * The beings drifting along the ley lines near a frame. update(unixSeconds, t)
 * places each one where the clock says it is.
 */
export function buildSkyBeings(frame, heightAt) {
  const group = new THREE.Group();
  const origin = latLonToVec(frame.lat0, frame.lon0);
  const maxAngle = RANGE / R_EARTH;
  // For each line that passes near, the stretch of it (as fractions) within range.
  const near = [];
  for (let i = 0; i < lineCount(); i++) {
    const line = lineAt(i);
    const steps = Math.max(8, Math.ceil(line.arc / (0.25 * Math.PI / 180)));
    let tMin = Infinity, tMax = -Infinity;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (angle(pointOn(line, t), origin) < maxAngle) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
    }
    if (tMin <= tMax) near.push({ line, tMin: tMin - 1 / steps, tMax: tMax + 1 / steps, L: line.arc * R_EARTH });
  }
  const live = new Map(); // key -> { mesh, being }

  function update(unixSeconds, t) {
    const seen = new Set();
    for (const nl of near) {
      for (const b of beingsOnLine(nl.line.i, nl.L, unixSeconds)) {
        const tt = b.s / nl.L;
        if (tt < nl.tMin || tt > nl.tMax) continue;
        const v = pointOn(nl.line, tt);
        if (angle(v, origin) > maxAngle) continue;
        const key = `${nl.line.i}:${b.k}`;
        seen.add(key);
        let e = live.get(key);
        if (!e) {
          const being = generateBeing(b.seed);
          e = { being, mesh: buildBeingMesh(being) };
          live.set(key, e);
          group.add(e.mesh.group);
        }
        const ll = vecToLatLon(v);
        const l = frame.toLocal(ll.lat, ll.lon);
        const bob = Math.sin(t * 0.12 + (b.seed % 100)) * e.being.size * 0.04;
        e.mesh.group.position.set(l.x, highwayAltitude(heightAt(l.x, l.z)) + e.being.altitude + bob, l.z);
        const tg = tangentEN(nl.line, tt, b.dir);
        e.mesh.group.rotation.y = Math.atan2(-tg.e, tg.n) + Math.sin(t * 0.05 + b.k) * 0.3 + t * e.being.spin;
        e.mesh.update(t);
      }
    }
    for (const [key, e] of live) {
      if (seen.has(key)) continue;
      group.remove(e.mesh.group);
      e.mesh.dispose();
      live.delete(key);
    }
    return live.size;
  }
  return { group, update, near };
}
