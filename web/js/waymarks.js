// The river quests, drawn (quests.js says where they stand and what they say; main.js reads and follows them). A
// waymark is a cairn of river stones on the bank, a band of water-light round its middle and a pale blue column to
// find it by, kilometres off; brighter until you've read it. The spring at a river's source, its headwaters shrine, is
// a ring of standing stones round a pool of light with a spout of it rising, built only once it's woken for you (the
// last waymark read). About 60 triangles each, and a beam.
import * as THREE from "three";
import { curved } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";
import { lightMaterial } from "./doors.js";

const STONE = 0x8fa0b6, WATER = 0x6fd8ff, SPRING = 0x7fffe0;
/** A waymark or a spring is built into a world when it's this close to the world's middle. */
export const WAYMARK_REACH_M = 25000;

const rock = (r, sy, x, y, z, rot) => { const g = new THREE.DodecahedronGeometry(r, 0); g.scale(1, sy, 1); g.rotateY(rot); g.translate(x, y, z); return g; };

function beamOf(colour, radius) {
  const mat = lightMaterial(colour, /* glsl */ `gl_FragColor = vec4(uColour, (1.0 - vUv.y) * (1.0 - vUv.y) * 0.5 * uPulse);`);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 380, 6, 1, true).translate(0, 190 + 1, 0), mat);
  beam.frustumCulled = false;
  return { beam, mat };
}
function starOf(colour, y) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, y, 0], 3));
  const star = new THREE.Points(g, curved(new THREE.PointsMaterial({ color: colour, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), "-way-star"));
  star.frustumCulled = false;
  return star;
}

/** A waymark: four stacked river stones, a band of light, a beam. */
function wayMesh() {
  const group = new THREE.Group(), glow = new THREE.Color(WATER);
  const stone = curved(new THREE.MeshLambertMaterial({ color: STONE, emissive: glow, emissiveIntensity: 0.08, flatShading: true }), "-way-stone");
  const solid = [rock(1.6, 0.55, 0, 0.7, 0, 0.2), rock(1.25, 0.6, 0.15, 1.95, -0.1, 1.1), rock(0.95, 0.65, -0.1, 2.95, 0.1, 0.5), rock(0.6, 0.8, 0.05, 3.8, 0, 1.7)].map((g) => new THREE.Mesh(g, stone));
  group.add(...solid);
  const bandMat = lightMaterial(glow, /* glsl */ `gl_FragColor = vec4(uColour, (0.35 + 0.45 * step(0.5, fract(vUv.x * 8.0 + uTime * 0.4))) * uPulse);`);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.35, 10, 1, true).translate(0, 2.4, 0), bandMat);
  group.add(band);
  const { beam, mat } = beamOf(glow, 1.4);
  group.add(beam);
  const star = starOf(glow, 10);
  group.add(star);
  return { group, solid, bandMat, beamMat: mat, star };
}

/** A spring: seven standing stones round a pool of light, a spout of it rising, a wide beam. */
function springMesh() {
  const group = new THREE.Group(), glow = new THREE.Color(SPRING);
  const stone = curved(new THREE.MeshLambertMaterial({ color: STONE, emissive: glow, emissiveIntensity: 0.12, flatShading: true }), "-spring-stone");
  const solid = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, tall = 2.6 + (k % 3) * 0.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, tall, 0.7).translate(0, tall / 2 - 0.2, 0), stone);
    m.position.set(Math.cos(a) * 6, 0, Math.sin(a) * 6);
    m.rotation.set(0.05 * ((k % 2) * 2 - 1), -a, 0);
    solid.push(m);
  }
  group.add(...solid);
  const poolMat = lightMaterial(glow, /* glsl */ `float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(uColour, (0.75 - 0.5 * r + 0.15 * sin(r * 18.0 - uTime * 2.4)) * uPulse);`);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.4, 16).rotateX(-Math.PI / 2).translate(0, 0.15, 0), poolMat);
  group.add(pool);
  solid.push(pool); // a tap on the pool touches the spring
  const spoutMat = lightMaterial(glow, /* glsl */ `gl_FragColor = vec4(uColour, (1.0 - vUv.y) * 0.8 * uPulse * (0.7 + 0.3 * step(0.5, fract(vUv.y * 5.0 - uTime * 0.9))));`);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 8, 1, true).translate(0, 3.5, 0), spoutMat);
  group.add(spout);
  const { beam, mat } = beamOf(glow, 3);
  group.add(beam);
  const star = starOf(glow, 12);
  group.add(star);
  return { group, solid, bandMat: poolMat, spoutMat, beamMat: mat, star };
}

/**
 * terrain: heights. Returns { group, set(items), update(x, z, t), near(x, z, r), all(), entryOf(object), pickables() }.
 * items: [{ key, kind ("way" | "spring"), quest, i, lat, lon, read, done }], those to build (main.js picks them).
 */
export function buildWaymarks(frame, terrain) {
  const group = new THREE.Group();
  let live = [];
  /** Dry ground for it, within 1.5 km (a waymark set on a big river's line would stand in the water). */
  function footing(x, z) {
    if (terrain.heightAt(x, z) > 0.5) return { x, z };
    for (let r = 60; r <= 1500; r += 60) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (terrain.heightAt(px, pz) > 0.5) return { x: px, z: pz };
    }
    return { x, z };
  }
  const entry = (e) => ({ ...e.item, x: e.x, y: e.y, z: e.z });
  return {
    group,
    set(items) {
      for (const e of live) group.remove(e.mesh.group);
      live = [];
      for (const it of items) {
        const l = frame.toLocal(it.lat, it.lon);
        if (Math.hypot(l.x, l.z) > WAYMARK_REACH_M) continue;
        const f = footing(l.x, l.z), m = it.kind === "spring" ? springMesh() : wayMesh();
        const y = Math.min(...[[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]].map(([dx, dz]) => terrain.heightAt(f.x + dx, f.z + dz))) - 0.2;
        m.group.position.set(f.x, Math.max(y, 0), f.z);
        m.group.userData.waymark = it.key;
        layerTransparent(m.group);
        group.add(m.group);
        live.push({ item: it, mesh: m, x: f.x, y: Math.max(y, 0), z: f.z });
      }
    },
    update(x, z, t) {
      for (const { item, mesh, x: wx, z: wz } of live) {
        const calm = item.kind === "way" ? item.read : item.done; // read, or drunk from: quieter
        mesh.bandMat.uniforms.uTime.value = t;
        mesh.bandMat.uniforms.uPulse.value = calm ? 0.55 : 0.8 + 0.2 * Math.sin(t * 2.2);
        if (mesh.spoutMat) { mesh.spoutMat.uniforms.uTime.value = t; mesh.spoutMat.uniforms.uPulse.value = calm ? 0.5 : 1; }
        mesh.beamMat.uniforms.uPulse.value = (calm ? 0.45 : 0.8) + 0.2 * Math.sin(t * 1.5);
        const d = Math.hypot(wx - x, wz - z);
        mesh.star.visible = d > 900;
        mesh.star.material.opacity = Math.min(1, (d - 900) / 600);
      }
    },
    /** Waymarks and springs within r of (x, z): the items given, with where they stand (x, y, z). */
    near(x, z, r) { return live.filter((e) => Math.hypot(e.x - x, e.z - z) < r).map(entry); },
    all() { return live.map(entry); },
    /** The waymark or spring a tapped mesh belongs to, or null. */
    entryOf(object) {
      for (let o = object; o; o = o.parent) if (o.userData?.waymark) { const e = live.find((q) => q.item.key === o.userData.waymark); return e ? entry(e) : null; }
      return null;
    },
    pickables() { return live.flatMap(({ mesh }) => mesh.solid); },
  };
}
