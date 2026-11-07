// The ley lines as golden glowing sky highways of light. Additive ribbons hung
// along great circles, gold pulsing in each line's direction, drawn without fog
// so they stay visible to the horizon.
import * as THREE from "three";
import { network, greatCircle, rankScale } from "./ley.js";
import { latLonToVec, vecToLatLon, DEG } from "./geo.js";

const RADIUS = 140000; // draw highways within 140 km
const BASE_WIDTH = 22; // half-width in metres for the commonest class (×2 per rank)
const MIN_ALT = 900; // metres above sea level
const CLEAR = 300; // metres above terrain where the land is higher

const vertexShader = /* glsl */ `
  attribute float u;
  attribute float side;
  varying float vU;
  varying float vSide;
  void main() {
    vU = u; vSide = side;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const fragmentShader = /* glsl */ `
  uniform float time;
  uniform float speed;
  uniform vec3 gold;
  varying float vU;
  varying float vSide;
  void main() {
    float edge = abs(vSide);                    // 0 at the centre, 1 at the edge
    float core = smoothstep(0.3, 0.0, edge);    // the bright line
    float glow = smoothstep(1.0, 0.0, edge) * 0.22;
    float pulse = 0.55 + 0.45 * sin(vU * 0.004 - time * speed);
    vec3 c = gold * (core * 0.75 + glow) * pulse + vec3(1.0, 0.9, 0.6) * core * 0.12;
    gl_FragColor = vec4(c, clamp((core + glow) * pulse, 0.0, 1.0));
  }`;

/** Builds the highways near the frame origin. Returns { group, update(t) }. */
export function buildHighways(frame, heightAt) {
  const group = new THREE.Group();
  const origin = latLonToVec(frame.lat0, frame.lon0);
  const maxAngle = RADIUS / 6371008.8;
  const materials = [];
  const altAt = (x, z) => Math.max(MIN_ALT, heightAt(x, z) + CLEAR);

  const byClass = new Map();
  for (const line of network().lines) {
    // Coarse pass to find stretches near us, then a fine pass over them.
    const coarse = greatCircle(line.a, line.b, 0.25);
    for (let i = 0; i < coarse.length - 1; i++) {
      const p = coarse[i], q = coarse[i + 1];
      const near = (v) => Math.acos(Math.min(1, v[0] * origin[0] + v[1] * origin[1] + v[2] * origin[2])) < maxAngle + 0.25 * DEG;
      if (!near(p) && !near(q)) continue;
      const fine = greatCircle(p, q, 0.01).map((v) => {
        const ll = vecToLatLon(v);
        const l = frame.toLocal(ll.lat, ll.lon);
        return { x: l.x, z: l.z, y: altAt(l.x, l.z) };
      });
      if (!byClass.has(line.cls.id)) byClass.set(line.cls.id, { cls: line.cls, strips: [] });
      byClass.get(line.cls.id).strips.push(fine);
    }
  }

  for (const { cls, strips } of byClass.values()) {
    const w = BASE_WIDTH * rankScale(cls.rank);
    const pos = [], us = [], sides = [];
    for (const pts of strips) {
      let u = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len, nz = dx / len; // horizontal normal
        const u2 = u + len;
        // Horizontal ribbon and vertical ribbon: a cross, readable from any angle.
        const quads = [
          [[a.x + nx * w, a.y, a.z + nz * w], [a.x - nx * w, a.y, a.z - nz * w], [b.x + nx * w, b.y, b.z + nz * w], [b.x - nx * w, b.y, b.z - nz * w]],
          [[a.x, a.y + w, a.z], [a.x, a.y - w, a.z], [b.x, b.y + w, b.z], [b.x, b.y - w, b.z]],
        ];
        for (const [p0, p1, p2, p3] of quads) {
          pos.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2);
          us.push(u, u, u2, u, u2, u2);
          sides.push(1, -1, 1, -1, -1, 1);
        }
        u = u2;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("u", new THREE.Float32BufferAttribute(us, 1));
    geo.setAttribute("side", new THREE.Float32BufferAttribute(sides, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, speed: { value: 1.5 * rankScale(cls.rank) }, gold: { value: new THREE.Color(0xffb52e) } },
      vertexShader, fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // Nodes: rings of light where lines meet.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  for (const node of network().nodes) {
    const v = node.vec;
    if (Math.acos(Math.min(1, v[0] * origin[0] + v[1] * origin[1] + v[2] * origin[2])) > maxAngle) continue;
    const l = frame.toLocal(node.lat, node.lon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 3, 10), ringMat);
    ring.position.set(l.x, altAt(l.x, l.z), l.z);
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 2;
    group.add(ring);
  }

  // By day, additive gold over a bright sky burns to white, so the highways
  // blend normally; at night they glow.
  let lastBlend = null;
  return {
    group,
    update(t, day) {
      const blend = day > 0.5 ? THREE.NormalBlending : THREE.AdditiveBlending;
      for (const m of materials) {
        m.uniforms.time.value = t;
        if (blend !== lastBlend) m.blending = blend;
      }
      if (blend !== lastBlend) ringMat.blending = blend;
      lastBlend = blend;
    },
  };
}
