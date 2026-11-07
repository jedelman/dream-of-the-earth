// Ley-space: what you see while riding a highway. At hundreds of kilometres a
// second the ground can't stream, so it falls away: there's only the line of
// light you're on, streaks of speed, the sky, and the sea far below.
import * as THREE from "three";
import { highwayMaterial } from "./highways.js";
import { pointOn, halfWidth } from "./ride.js";
import { vecToLatLon, R_EARTH } from "./geo.js";

export const LEY_ALT = 1500; // metres: the height of ley-space
const SAMPLES = 90;
const BACK = 20000, AHEAD = 700000; // metres of line drawn behind and ahead

export function buildRideFx() {
  const group = new THREE.Group();
  const segs = SAMPLES - 1;
  const pos = new Float32Array(segs * 12 * 3), us = new Float32Array(segs * 12), sides = new Float32Array(segs * 12);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("u", new THREE.BufferAttribute(us, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("side", new THREE.BufferAttribute(sides, 1));
  for (let i = 0; i < segs * 2; i++) sides.set([1, -1, 1, -1, -1, 1], i * 6);
  const mats = [0, 1, 2, 3].map((r) => highwayMaterial(r, [0, 1])); // no near fade: the beam under you is the point
  const ribbon = new THREE.Mesh(geo, mats[0]);
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 2;
  group.add(ribbon);

  // Streaks: points around the creature that rush past.
  const N = 420, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 600, (Math.random() - 0.5) * 8000], i * 3);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
  const streaks = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffe9a8, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  streaks.frustumCulled = false;
  const streakHolder = new THREE.Group();
  streakHolder.add(streaks);
  group.add(streakHolder);

  /** ride: the current ride; frame: a local frame centred on the rider; heading: yaw. */
  function update(ride, frame, t, heading, dt) {
    const rank = ride.line.cls.rank;
    ribbon.material = mats[rank];
    mats[rank].uniforms.time.value = t;
    const L = ride.line.arc * R_EARTH;
    const w = halfWidth(rank) * 3;
    const pts = [];
    for (let i = 0; i < SAMPLES; i++) {
      const f = i / (SAMPLES - 1);
      const d = -BACK + (AHEAD + BACK) * f * f; // dense near the rider
      const tt = Math.min(1, Math.max(0, ride.t + (ride.dir * d) / L));
      const ll = vecToLatLon(pointOn(ride.line, tt));
      const l = frame.toLocal(ll.lat, ll.lon);
      pts.push({ x: l.x, z: l.z, d });
    }
    let k = 0;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * w, nz = (dx / len) * w, y = LEY_ALT - 6;
      const quads = [
        [[a.x + nx, y, a.z + nz], [a.x - nx, y, a.z - nz], [b.x + nx, y, b.z + nz], [b.x - nx, y, b.z - nz]],
        [[a.x, y + w, a.z], [a.x, y - w, a.z], [b.x, y + w, b.z], [b.x, y - w, b.z]],
      ];
      for (const [p0, p1, p2, p3] of quads) {
        for (const v of [p0, p1, p2, p1, p3, p2]) { pos[k * 3] = v[0]; pos[k * 3 + 1] = v[1]; pos[k * 3 + 2] = v[2]; k++; }
        us.set([a.d, a.d, b.d, a.d, b.d, b.d], k - 6);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.u.needsUpdate = true;

    // Streaks rush backward (toward +z in the rider's frame), capped so they
    // read as motion rather than strobing.
    streakHolder.position.set(0, LEY_ALT, 0);
    streakHolder.rotation.y = heading;
    const shift = Math.min(ride.speed, 9000) * dt * 0.9;
    const a = sgeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      a[i * 3 + 2] += shift;
      if (a[i * 3 + 2] > 4000) a[i * 3 + 2] -= 8000;
    }
    sgeo.attributes.position.needsUpdate = true;
  }

  return { group, update };
}
