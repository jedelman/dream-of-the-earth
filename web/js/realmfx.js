// A dream, drawn (realm.js says its shape): stone islands hanging in the sky with roots of rock beneath, plank-thin
// bridges between them, three lights turning over the far islands, and, once they're gathered, a gem at the heart.
import * as THREE from "three";
import { islandAt, turned, lift } from "./realm.js";

const PALETTE = {
  shape: { stone: 0xe7a6c4, under: 0x8a4f78, bridge: 0xf6d2e2, light: 0xff7ad9, fog: 0xf3c4dc },
  camera: { stone: 0x9fb8d6, under: 0x40597e, bridge: 0xcfe0f2, light: 0x7af0ff, fog: 0xa9bfd8 },
  world: { stone: 0xe0c27e, under: 0x7e5e2a, bridge: 0xf2e1b0, light: 0xffd34d, fog: 0xead6a2 },
};
export const FOG = Object.fromEntries(Object.entries(PALETTE).map(([k, p]) => [k, p.fog]));
export const GEM_COLOUR = { shape: 0xff7ad9, camera: 0x7af0ff, world: 0xffd34d };

const lit = (hex, glow = 0.12) => { const c = new THREE.Color(hex); return new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(glow), flatShading: true }); };

/** L: the layout; anchor: where the dream's heart is in the scene. Returns { group, update(t, got, gemOut), lightAt(i, t), gemAt(t), dispose() }. */
export function buildRealmFx(L, anchor) {
  const P = PALETTE[L.kind];
  const group = new THREE.Group();
  group.position.copy(anchor);
  const spin = new THREE.Group(); // the gold dream turns: everything of the dream hangs from this
  group.add(spin);
  const stone = lit(P.stone, 0.18), under = lit(P.under, 0.05), plank = lit(P.bridge, 0.2);
  const isles = L.islands.map((q, i) => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(q.r, q.r * 0.92, 0.9, 9).translate(0, -0.45, 0), stone);
    const root = new THREE.Mesh(new THREE.ConeGeometry(q.r * 0.9, q.r * 1.5, 9).rotateX(Math.PI).translate(0, -0.9 - q.r * 0.75, 0), under);
    g.add(top, root);
    g.position.set(q.x, q.y, q.z);
    g.rotation.y = q.phase;
    spin.add(g);
    return g;
  });
  // Bridges: level across each island's rim, then a ramp (the same shape the floor has).
  const bridges = L.bridges.map((b) => {
    const A = L.islands[b.a], B = L.islands[b.b], d = Math.hypot(B.x - A.x, B.z - A.z);
    const ux = (B.x - A.x) / d, uz = (B.z - A.z) / d, span = d - A.r - B.r;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 1).translate(0, -0.125, 0.5), plank);
    spin.add(m);
    return { m, b, A, B, ux, uz, span };
  });
  // Lights: a turning crystal over each far island, and a few pixels of glint so they show across the dream.
  const lights = L.lights.map(() => {
    const c = new THREE.Color(P.light);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.8), flatShading: true }));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const glint = new THREE.Points(gg, new THREE.PointsMaterial({ color: c, size: 7, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glint.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(m, glint);
    group.add(holder);
    return { holder, m };
  });
  // The gem: hidden until the lights are gathered.
  const gemC = new THREE.Color(GEM_COLOUR[L.kind]);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshPhongMaterial({ color: gemC, emissive: gemC.clone().multiplyScalar(0.6), flatShading: true, shininess: 120 }));
  gem.scale.set(1, 1.5, 1);
  gem.visible = false;
  group.add(gem);

  const lightAt = (k, t) => { const p = islandAt(L, L.lights[k], t); return new THREE.Vector3(p.x, p.y + 1.6 + Math.sin(t * 1.4 + k) * 0.25, p.z); };
  const gemAt = (t) => { const p = islandAt(L, L.heart, t); return new THREE.Vector3(p.x, p.y + 1.4 + Math.sin(t * 1.1) * 0.2, p.z); };
  return {
    group,
    lightAt, gemAt,
    /** got: which lights are gathered; gemOut: the gem is showing. Positions are in the dream's local frame. */
    update(t, got, gemOut) {
      spin.rotation.y = -turned(L, t); // three's rotation about y turns the other way from realm.js's frame
      isles.forEach((g, i) => { g.position.y = L.islands[i].y + lift(L, i, t); });
      for (const br of bridges) {
        const ha = br.A.y + lift(L, br.b.a, t), hb = br.B.y + lift(L, br.b.b, t);
        const sx = br.A.x + br.ux * br.A.r, sz = br.A.z + br.uz * br.A.r;
        const run = br.span, rise = hb - ha;
        br.m.position.set(sx, ha, sz);
        br.m.scale.set(1, 1, Math.hypot(run, rise));
        br.m.rotation.set(-Math.atan2(rise, run), Math.atan2(br.ux, br.uz), 0, "YXZ");
      }
      lights.forEach((l, k) => {
        l.holder.visible = !got.has(k);
        l.holder.position.copy(lightAt(k, t));
        l.m.rotation.y = t * 1.5 + k;
      });
      gem.visible = gemOut;
      if (gemOut) { gem.position.copy(gemAt(t)); gem.rotation.y = t * 1.2; }
    },
    dispose() { group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); },
  };
}
