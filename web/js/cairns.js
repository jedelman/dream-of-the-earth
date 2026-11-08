// Cairns: what a mutual left here. Stacked stones grown from a seed, a crystal in
// the maker's hue on top, and a small dot of that hue above it, a few pixels at any
// distance, so a cairn can be spotted from kilometres off. On the network a cairn is
// only a seed and a hue, so a stranger's record can't send geometry. Cairns thin
// out as they fade with the moon (artifacts.js).
import * as THREE from "three";
import { curved } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";
import { fadeOf, cairnForm } from "./artifacts.js";

const MAX = 64; // cairns in view at once


function stonesGeometry(form, hue) {
  const pos = [], col = [], c = new THREE.Color();
  for (const s of form.stones) {
    c.setHSL(hue / 360, 0.16, s.light);
    const ring = [];
    for (let k = 0; k < s.sides; k++) {
      const a = s.yaw + (k / s.sides) * Math.PI * 2, wob = 1 + 0.12 * Math.sin(k * 2.3 + s.yaw * 5);
      ring.push([s.dx + Math.cos(a) * s.r * wob, s.y - s.h * 0.08, s.dz + Math.sin(a) * s.r * wob]);
    }
    const top = [s.dx * 0.6, s.y + s.h * 0.5, s.dz * 0.6], bot = [s.dx, s.y - s.h * 0.5, s.dz];
    for (let k = 0; k < s.sides; k++) {
      const p = ring[k], q = ring[(k + 1) % s.sides];
      pos.push(...top, ...q, ...p, ...bot, ...p, ...q);
      const shade = 0.9 + 0.1 * Math.sin(k * 1.7);
      for (let v = 0; v < 6; v++) col.push(c.r * shade, c.g * shade, c.b * shade);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function crystalGeometry(form) {
  const { r, h } = form.crystal;
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, h / (2 * r), 1);
  return g;
}

export function buildCairns(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const live = new Map(); // uri -> { a, root, stones, crystal, x, y, z, top, sea }
  let preview = null;
  // The far dots: one point per cairn, in its hue.
  const dotPos = new Float32Array(MAX * 3), dotCol = new Float32Array(MAX * 3);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute("color", new THREE.BufferAttribute(dotCol, 3));
  const dots = new THREE.Points(dotGeo, curved(new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), "-cairndot"));
  dots.frustumCulled = false;
  dots.renderOrder = 5;
  scene.add(dots);
  layerTransparent(dots);

  function make(a) {
    const form = cairnForm(a.seed);
    const stones = new THREE.Mesh(stonesGeometry(form, a.hue), curved(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true }), "-cairn"));
    const crystal = new THREE.Mesh(crystalGeometry(form), curved(new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(a.hue / 360, 0.85, 0.62), transparent: true }), "-cairncrystal"));
    crystal.position.y = form.crystal.y;
    const root = new THREE.Group();
    root.userData.uri = a.uri;
    root.add(stones, crystal);
    for (const m of [stones, crystal]) m.frustumCulled = false; // curved after culling
    layerTransparent(root);
    group.add(root);
    return { a, root, stones, crystal, top: form.height, cy: form.crystal.y, x: 0, y: 0, z: 0, sea: false };
  }
  function dispose(e) {
    group.remove(e.root);
    for (const m of [e.stones, e.crystal]) { m.geometry.dispose(); m.material.dispose(); }
  }

  return {
    group,
    /** What's in view: artifacts from discover() (and your own, just made), placed in this world. */
    set(list, world) {
      const keep = new Set();
      for (const a of list.slice(0, MAX)) {
        if (a.kind !== "cairn") continue;
        keep.add(a.uri);
        const e = live.get(a.uri);
        if (e && e.a.seed === a.seed && e.a.hue === a.hue) { e.a = a; continue; }
        if (e) dispose(e);
        live.set(a.uri, make(a));
      }
      for (const [uri, e] of live) if (!keep.has(uri)) { dispose(e); live.delete(uri); }
      this.place(world);
    },
    /** Put every cairn where it stands in this world (after a regrow, the coordinates move). */
    place(world) {
      for (const e of live.values()) {
        const p = world.frame.toLocal(e.a.lat, e.a.lon), g = world.terrain.heightAt(p.x, p.z);
        e.x = p.x; e.z = p.z; e.sea = g < 0; e.y = e.sea ? 0 : g - 0.1;
        e.root.position.set(e.x, e.y, e.z);
      }
    },
    update(t, nowS) {
      let n = 0;
      for (const e of live.values()) {
        const f = fadeOf(e.a.since, nowS);
        e.root.visible = f > 0;
        const o = 0.12 + 0.88 * f;
        e.stones.material.opacity = o;
        e.crystal.material.opacity = o;
        e.crystal.rotation.y = t * 0.6 + (e.a.seed % 7);
        e.crystal.position.y = e.cy + Math.sin(t * 1.3 + e.a.seed) * 0.08;
        e.root.position.y = e.y + (e.sea ? Math.sin(t * 1.1 + e.a.seed) * 0.3 : 0);
        if (f > 0 && n < MAX) {
          dotPos.set([e.x, e.root.position.y + e.top + 2.5, e.z], n * 3);
          const c = e.crystal.material.color, tw = (0.7 + 0.3 * Math.sin(t * 1.7 + e.a.seed)) * f;
          dotCol.set([c.r * tw, c.g * tw, c.b * tw], n * 3);
          n++;
        }
      }
      dotGeo.setDrawRange(0, n);
      dotGeo.attributes.position.needsUpdate = dotGeo.attributes.color.needsUpdate = true;
      dots.visible = n > 0;
    },
    /** A ghost cairn while you choose one: spec { seed, hue } at (x, z) in this world, or null to clear it. */
    preview(spec, at, world) {
      if (preview && (!spec || preview.a.seed !== spec.seed || preview.a.hue !== spec.hue)) { dispose(preview); preview = null; }
      if (!spec) return;
      if (!preview) preview = make({ kind: "cairn", seed: spec.seed, hue: spec.hue, uri: "preview", since: Infinity });
      const g = world.terrain.heightAt(at.x, at.z);
      preview.x = at.x; preview.z = at.z; preview.sea = g < 0; preview.y = preview.sea ? 0 : g - 0.1;
      preview.root.position.set(at.x, preview.y, at.z);
      preview.stones.material.opacity = preview.crystal.material.opacity = 0.55;
    },
    /** The entry a raycast hit belongs to, or null. */
    entryOf(object) {
      for (let o = object; o; o = o.parent) if (o.userData.uri) return live.get(o.userData.uri) || null;
      return null;
    },
    /** Cairns within r metres of (x, z), as entries { a, x, y, z, top }. */
    near(x, z, r) {
      const out = [];
      for (const e of live.values()) if (e.root.visible && Math.hypot(e.x - x, e.z - z) < r) out.push(e);
      return out;
    },
    get count() { return live.size; },
  };
}
