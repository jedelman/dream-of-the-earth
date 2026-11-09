// Finds, drawn: small things lying about (findlore.js says where and what), each with a few pixels of sparkle over it
// so you can spot one from a little way off. One you've taken this moon isn't there for you until the next.
import * as THREE from "three";
import { findsAround } from "./findlore.js";
import { curved } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";

const REGROW_M = 600;
const SPARKLE_M = 260; // how far off a find's sparkle shows
export const FIND_COLOUR = { tidefin: 0x6ff7e0, mossfoot: 0x8be05a, owleye: 0xffb534, farfeather: 0xcfeeff };

const lit = (hex, glow) => { const c = new THREE.Color(hex); return curved(new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(glow), flatShading: true }), `-find-${glow}`); };
const SHAPES = {
  // A fin of sea glass, standing up out of the sand.
  tidefin: () => {
    const g = new THREE.Group();
    const fin = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0), lit(FIND_COLOUR.tidefin, 0.55));
    fin.scale.set(0.09, 0.5, 0.28);
    fin.rotation.z = 0.25;
    g.add(fin);
    return g;
  },
  // A tuft of moss with a small pink flower in it.
  mossfoot: () => {
    const g = new THREE.Group();
    const tuft = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), lit(FIND_COLOUR.mossfoot, 0.3));
    tuft.scale.set(0.26, 0.13, 0.22);
    tuft.position.y = 0.08;
    const flower = new THREE.Mesh(new THREE.TetrahedronGeometry(1, 0), lit(0xff9ad5, 0.6));
    flower.scale.setScalar(0.07);
    flower.position.set(0.06, 0.22, 0);
    g.add(tuft, flower);
    return g;
  },
  // An amber eye on a little cairn of stone.
  owleye: () => {
    const g = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.3), lit(0x8e8798, 0.05));
    stone.position.y = 0.11;
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), lit(FIND_COLOUR.owleye, 0.7));
    eye.scale.setScalar(0.13);
    eye.position.y = 0.34;
    const pupil = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), lit(0x140c05, 0));
    pupil.scale.set(0.05, 0.08, 0.02);
    pupil.position.set(0, 0.34, -0.12);
    g.add(stone, eye, pupil);
    return g;
  },
  // A long pale feather, its quill stuck in the ground, leaning in a wind from very high up.
  farfeather: () => {
    const g = new THREE.Group();
    const vane = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), lit(FIND_COLOUR.farfeather, 0.6));
    vane.scale.set(0.08, 0.34, 0.02);
    vane.position.y = 0.3;
    const tip = new THREE.Mesh(new THREE.TetrahedronGeometry(1, 0), lit(0x7ac8ff, 0.7));
    tip.scale.setScalar(0.05);
    tip.position.y = 0.6;
    g.add(vane, tip);
    g.rotation.z = 0.35;
    return g;
  },
};

/** frame, terrain: the world's. Returns { group, update(x, z, t), near(x, z, r), setTaken(fn), pickables(), entryOf(o) }. */
export function buildFinds(frame, terrain) {
  const group = new THREE.Group();
  const live = new Map(); // key -> { f, mesh }
  let centre = null, taken = () => false;
  const sparkGeo = new THREE.BufferGeometry();
  const sparks = new THREE.Points(sparkGeo, curved(new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), "-find-spark"));
  sparks.frustumCulled = false;
  group.add(sparks);
  let order = [];

  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    const finds = findsAround(ll.lat, ll.lon, { toLocal: (la, lo) => frame.toLocal(la, lo), height: terrain.heightAt });
    const keep = new Set();
    for (const f of finds) {
      keep.add(f.key);
      if (live.has(f.key)) continue;
      const mesh = SHAPES[f.holds]();
      mesh.position.set(f.x, f.y, f.z);
      mesh.rotation.y = f.seed * Math.PI * 2;
      mesh.userData.find = f;
      group.add(mesh);
      live.set(f.key, { f, mesh });
    }
    for (const [key, e] of live) {
      if (keep.has(key)) continue;
      group.remove(e.mesh);
      e.mesh.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      live.delete(key);
    }
    order = [...live.values()];
    sparkGeo.setAttribute("position", new THREE.Float32BufferAttribute(order.flatMap(({ f }) => [f.x, f.y + 0.75, f.z]), 3));
    sparkGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(order.length * 3), 3));
    centre = { x, z };
  }
  layerTransparent(sparks);

  return {
    group,
    update(x, z, t) {
      if (!centre || Math.hypot(x - centre.x, z - centre.z) > REGROW_M) settle(x, z);
      const col = sparkGeo.attributes.color;
      if (!col) return;
      const c = new THREE.Color();
      order.forEach(({ f, mesh }, k) => {
        const gone = taken(f);
        mesh.visible = !gone;
        const d = Math.hypot(f.x - x, f.z - z);
        const a = gone ? 0 : Math.max(0, 1 - d / SPARKLE_M) * (0.55 + 0.45 * Math.sin(t * 3.1 + f.seed * 20));
        c.setHex(FIND_COLOUR[f.holds]).multiplyScalar(a);
        col.setXYZ(k, c.r, c.g, c.b);
        mesh.children[mesh.children.length - 1].rotation.y = t * 0.8; // the flower turns, the eye looks about
      });
      col.needsUpdate = true;
    },
    /** Finds within r of (x, z) that you haven't taken this moon: [{ key, place, holds, x, y, z }]. */
    near(x, z, r) {
      const out = [];
      for (const { f } of live.values()) if (!taken(f) && Math.hypot(f.x - x, f.z - z) < r) out.push(f);
      return out;
    },
    all() { return [...live.values()].map(({ f }) => ({ ...f, taken: taken(f) })); },
    /** taken(find) -> true if you've had its thing this moon. */
    setTaken(fn) { taken = fn; },
    pickables() { return [...live.values()].filter(({ f }) => !taken(f)).map(({ mesh }) => mesh); },
    entryOf(object) {
      for (let o = object; o; o = o.parent) if (o.userData?.find) return o.userData.find;
      return null;
    },
  };
}
