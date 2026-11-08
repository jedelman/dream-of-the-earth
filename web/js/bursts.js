// Little bursts of things in the world: leaves and seeds falling from a shaken
// tree, sparkles from a squeak. Points with their own colours, a few hundred at
// most, moved on the CPU.
import * as THREE from "three";
import { curved } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";
import { mulberry32 } from "./rng.js";

const MAX = 400;
const rand = mulberry32(4242); // decoration only, but no Math.random anywhere

export function buildBursts(scene) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, curved(new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }), "-burst"));
  points.frustumCulled = false;
  scene.add(points);
  layerTransparent(points);
  const live = []; // { p: Vector3, v: Vector3, c: Color, life, age, fall, sway }

  return {
    /**
     * at: Vector3; colors: [Color]; n: how many; spread: metres sideways; up: initial rise (m/s);
     * fall: terminal speed (m/s, small for leaves and fluff); life: seconds.
     */
    emit({ at, colors, n = 20, spread = 4, up = 1, fall = 1.5, life = 4, ground = -Infinity }) {
      for (let k = 0; k < n && live.length < MAX; k++) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread;
        live.push({
          p: new THREE.Vector3(at.x + Math.cos(a) * r, at.y + (rand() - 0.3) * spread * 0.5, at.z + Math.sin(a) * r),
          v: new THREE.Vector3(Math.cos(a) * 1.5, up * (0.5 + rand()), Math.sin(a) * 1.5),
          c: colors[k % colors.length], life: life * (0.6 + 0.4 * rand()), age: 0, fall, sway: rand() * 6, ground,
        });
      }
    },
    update(dt) {
      for (let k = live.length - 1; k >= 0; k--) {
        const q = live[k];
        q.age += dt;
        if (q.age > q.life) { live.splice(k, 1); continue; }
        q.v.y = Math.max(-q.fall, q.v.y - 9.8 * dt);
        q.v.x *= 1 - dt; q.v.z *= 1 - dt;
        q.p.addScaledVector(q.v, dt);
        q.p.x += Math.sin(q.age * 3 + q.sway) * dt * q.fall * 0.6; // flutter
        if (q.p.y < q.ground) { q.p.y = q.ground; q.v.set(0, 0, 0); }
      }
      live.forEach((q, k) => {
        pos.set([q.p.x, q.p.y, q.p.z], k * 3);
        const f = Math.min(1, (q.life - q.age) / 0.8); // fade out at the end
        col.set([q.c.r * f, q.c.g * f, q.c.b * f], k * 3);
      });
      geo.setDrawRange(0, live.length);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      points.visible = live.length > 0;
    },
  };
}
