// The ley lines as golden glowing sky highways of light. Additive ribbons hung
// along great circles, gold pulsing in each line's direction, drawn without fog
// so they stay visible to the horizon.
import * as THREE from "three";
import { network, greatCircle, rankScale } from "./ley.js";
import { latLonToVec, vecToLatLon, DEG } from "./geo.js";
import { halfWidth, highwayAltitude } from "./ride.js";
import { curveUniform, curved, CURVE_GLSL } from "./curvature.js";

const RADIUS = 320000; // draw highways within 320 km: past the horizon from 3 km up

const vertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  ${CURVE_GLSL}
  attribute float u;
  attribute float side;
  varying float vU;
  varying float vSide;
  varying float vDepth;
  void main() {
    vU = u; vSide = side;
    vec4 mv = viewMatrix * curveWorld(modelMatrix * vec4(position, 1.0));
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const fragmentShader = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform float time;
  uniform float speed;
  uniform vec3 gold;
  uniform vec2 nearFade;
  uniform float pulseDepth;
  varying float vU;
  varying float vSide;
  varying float vDepth;
  void main() {
    #include <logdepthbuf_fragment>
    // Fade light that's right on top of the camera, so a highway you're inside
    // (or a node where many meet) reads as light ahead, not a wall of white.
    float near = smoothstep(nearFade.x, nearFade.y, vDepth);
    float edge = abs(vSide);                    // 0 at the centre, 1 at the edge
    float core = smoothstep(0.3, 0.0, edge);    // the bright line
    float glow = smoothstep(1.0, 0.0, edge) * 0.22;
    float pulse = 1.0 - pulseDepth + pulseDepth * sin(vU * 0.004 - time * speed);
    vec3 c = gold * (core * 0.75 + glow) * pulse + vec3(1.0, 0.9, 0.6) * core * 0.12;
    gl_FragColor = vec4(c * near, clamp((core + glow) * pulse * near, 0.0, 1.0));
  }`;

/**
 * The highway shader material for a rarity rank (shared with the ride ribbon).
 * pulseDepth: how far the gold pulses dim (0.45 in the world; small while
 * riding, so the beam under you doesn't flash). speed: how fast pulses travel
 * along the line (negative streams them back toward you).
 */
export function highwayMaterial(rank, { nearFade = [60, 700], pulseDepth = 0.45, speed = 1.5 * rankScale(rank) } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, speed: { value: speed }, pulseDepth: { value: pulseDepth }, gold: { value: new THREE.Color(0xffb52e) }, nearFade: { value: new THREE.Vector2(...nearFade) }, uCurve: curveUniform },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}

/** Builds the highways near the frame origin. Returns { group, update(t), pillars }. */
export function buildHighways(frame, heightAt) {
  const group = new THREE.Group();
  const origin = latLonToVec(frame.lat0, frame.lon0);
  const maxAngle = RADIUS / 6371008.8;
  const materials = [];
  const altAt = (x, z) => highwayAltitude(heightAt(x, z));

  const byClass = new Map();
  for (const line of network().lines) {
    // Coarse pass to find stretches near us, then a fine pass over them.
    const coarse = greatCircle(line.a, line.b, 0.25);
    for (let i = 0; i < coarse.length - 1; i++) {
      const p = coarse[i], q = coarse[i + 1];
      const near = (v) => Math.acos(Math.min(1, v[0] * origin[0] + v[1] * origin[1] + v[2] * origin[2])) < maxAngle + 0.25 * DEG;
      if (!near(p) && !near(q)) continue;
      const fine = greatCircle(p, q, 0.02).map((v) => {
        const ll = vecToLatLon(v);
        const l = frame.toLocal(ll.lat, ll.lon);
        return { x: l.x, z: l.z, y: altAt(l.x, l.z) };
      });
      if (!byClass.has(line.cls.id)) byClass.set(line.cls.id, { cls: line.cls, strips: [] });
      byClass.get(line.cls.id).strips.push(fine);
    }
  }

  for (const { cls, strips } of byClass.values()) {
    const w = halfWidth(cls.rank);
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
    const mat = highwayMaterial(cls.rank);
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  // Nodes: rings of light where lines meet, and a pillar of light from the
  // ground (or the sea) up to the ring, which lifts any creature onto the
  // network, wings or not.
  const pillars = [];
  const pillarMat = curved(new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), "-pillar");
  const ringMat = curved(new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), "-ring");
  for (const node of network().nodes) {
    const v = node.vec;
    if (Math.acos(Math.min(1, v[0] * origin[0] + v[1] * origin[1] + v[2] * origin[2])) > maxAngle) continue;
    const l = frame.toLocal(node.lat, node.lon);
    const top = altAt(l.x, l.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(600, 40, 3, 10).rotateX(Math.PI / 2), ringMat);
    ring.position.set(l.x, top, l.z);
    ring.frustumCulled = false;
    ring.renderOrder = 2;
    group.add(ring);
    const ground = heightAt(l.x, l.z);
    const bottom = ground >= 0 ? ground : -200; // from the land, or from just under the sea
    const h = top + 250 - bottom;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, h, 6, 1, true), pillarMat);
    pillar.position.set(l.x, bottom + h / 2, l.z);
    pillar.frustumCulled = false;
    pillar.renderOrder = 2;
    group.add(pillar);
    pillars.push({ x: l.x, z: l.z, top, node });
  }

  // Always additive: light adds to light. Over a bright sky the gold can burn to
  // white, and that's fine (Jason, 11-07: "Blowout is okay, it's retro").
  return {
    group,
    pillars,
    update(t) { for (const m of materials) m.uniforms.time.value = t; },
  };
}
