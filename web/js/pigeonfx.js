// A pigeon you can see: a little grey bird that flies in to you with a gift, or off from you with one. Only yours:
// a pigeon's whole flight is a record and some arithmetic (pigeons.js); this is the last few seconds of it.
import * as THREE from "three";

const GREY = 0xd6dbe6, NECK = 0x5fe0b0; // a pale dream pigeon with a green-glass neck: it has to read against grass
function bird() {
  const g = new THREE.Group();
  const m = (hex, glow = 0.15) => { const c = new THREE.Color(hex); return new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(glow), flatShading: true, side: THREE.DoubleSide }); };
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m(GREY));
  body.scale.set(0.16, 0.14, 0.3);
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m(NECK, 0.3));
  head.scale.setScalar(0.09);
  head.position.set(0, 0.1, -0.28);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.12, 0.45, 0, 0.02, 0, 0, 0.16], 3));
  wingGeo.computeVertexNormals();
  const wings = [-1, 1].map((side) => {
    const w = new THREE.Mesh(wingGeo, m(0xc9cfdc));
    w.scale.x = side;
    g.add(w);
    return w;
  });
  // A few pixels of glint on it, at any distance, so it can be seen coming from far off.
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.25, 0], 3));
  const glint = new THREE.Points(glintGeo, new THREE.PointsMaterial({ color: 0xe8fff4, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  glint.frustumCulled = false;
  g.add(body, head, glint);
  g.userData.wings = wings;
  return g;
}

/** scene: where to fly. Returns { arrive(to, from, onLand), depart(from, toward), update(dt, t), busy }. */
export function buildPigeonFx(scene) {
  const flights = [];
  function fly(a, b, dur, scale, onDone, hold = 0) {
    const g = bird();
    g.scale.setScalar(scale);
    scene.add(g);
    flights.push({ g, a: a.clone(), b: b.clone(), age: 0, dur, hold, onDone });
  }
  return {
    /**
     * A pigeon flying in to `to` (a point by your creature) from `from` (a point far off along the way you're looking,
     * so you see it come): down out of the sky over a few seconds, a moment hovering, then onLand().
     */
    arrive(to, from, scale, onLand, side) {
      const dir = from ? new THREE.Vector3(from.x - to.x, 0, from.z - to.z) : new THREE.Vector3(1, 0, 0);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      dir.normalize().multiplyScalar(18 * scale);
      fly(to.clone().add(dir).add(new THREE.Vector3(0, 8 * scale, 0)), to, 4, scale, onLand, 1.8);
      flights[flights.length - 1].side = side;
    },
    /** A pigeon leaving from `from`, up and away (toward `toward`, if known). */
    depart(from, toward, scale) {
      const dir = toward ? new THREE.Vector3(toward.x - from.x, 0, toward.z - from.z) : new THREE.Vector3(0, 0, -1);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      dir.normalize().multiplyScalar(120 * scale);
      fly(from, from.clone().add(dir).add(new THREE.Vector3(0, 60 * scale, 0)), 5, scale, null);
    },
    update(dt, t) {
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.age += dt;
        const u = Math.min(1, f.age / f.dur), e = u * u * (3 - 2 * u);
        if (u >= 1 && f.age < f.dur + f.hold) { // hovering by you, side on, wings beating
          f.g.position.copy(f.b);
          if (f.side !== undefined) f.g.rotation.y = f.side;
          f.g.position.y += Math.sin(t * 6) * 0.08 * f.g.scale.x;
          f.g.userData.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * Math.sin(t * 26) * 0.8; });
          continue;
        }
        f.g.position.lerpVectors(f.a, f.b, e);
        f.g.position.y += Math.sin(u * Math.PI) * 3 * f.g.scale.x; // a little loft on the way
        const look = f.b.clone().sub(f.a); // its beak along its way (the bird's front is -z)
        f.g.rotation.y = Math.atan2(-look.x, -look.z);
        const flap = Math.sin(t * 22) * (u < 0.95 ? 0.9 : 0.2);
        f.g.userData.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * flap; });
        if (u >= 1 && f.age >= f.dur + f.hold) {
          scene.remove(f.g);
          f.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
          flights.splice(i, 1);
          f.onDone?.();
        }
      }
    },
    get busy() { return flights.length > 0; },
    /** Where the pigeons are (for a test to look). */
    positions() { return flights.map((f) => f.g.position.clone()); },
  };
}
