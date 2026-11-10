// What you wear, on your creature (Jason, 11-09: "it'd be cool to alter the player's creature based on what's
// equipped"). Each thing is built here from its name, so a mutual's worn things come over the wire as a word or two
// (in their intent), never as geometry: nothing untrusted to cap. Small, a few dozen triangles at most, and placed
// on the body's own parts (a tuft of moss on each foot swings with the leg).
import * as THREE from "three";

const mat = (hex, glow = 0.35, extra = {}) => {
  const c = new THREE.Color(hex);
  return new THREE.MeshPhongMaterial({ color: c, emissive: c.clone().multiplyScalar(glow), flatShading: true, shininess: 40, ...extra });
};
const solid = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g; };

/** How high a part reaches above its pivot, roughly (in body units): a box's half-side is 0.8 of its size. */
const reach = (part) => (part.prim === "box" ? 0.8 : 1) * part.size[1];

const BUILD = {
  /** The prism: hung over your head (or your body, headless), turning, every colour in turn. */
  prism(parts, pivots, box, H) {
    const head = parts.findIndex((p) => p.kind === "head");
    const holder = head >= 0 ? pivots[head] : pivots[0];
    const over = head >= 0 ? reach(parts[head]) : box.max.y;
    const m = new THREE.Mesh(solid(new THREE.OctahedronGeometry(1, 0)), mat(0xffffff, 0.5, { shininess: 120 }));
    const s = Math.max(0.18, 0.13 * H);
    m.scale.set(s, s * 1.6, s);
    const y = over + s * 2.6;
    m.position.y = y;
    holder.add(m);
    return (t) => {
      m.rotation.y = t * 1.6;
      m.position.y = y + Math.sin(t * 2.1) * s * 0.3;
      const hue = (t * 0.12) % 1;
      m.material.color.setHSL(hue, 0.85, 0.7);
      m.material.emissive.setHSL((hue + 0.33) % 1, 0.9, 0.3);
    };
  },
  /** The tidefin: a tall fin of sea glass along your back, and two small ones behind, swaying. */
  tidefin(parts, pivots, box, H) {
    const b = parts[0], top = reach(b) * 0.8, len = Math.max(0.6, b.size[2]);
    const glass = mat(0x6ff7e0, 0.45, { side: THREE.DoubleSide, shininess: 90 });
    // A three-sided blade, leaning back: thick enough to read from behind, where the camera mostly is.
    const dorsal = new THREE.Mesh(solid(new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0)), glass);
    dorsal.scale.set(0.09 * H, 0.6 * H, 0.32 * len);
    dorsal.rotation.x = 0.5;
    dorsal.position.set(0, top * 0.9, 0.05 * len);
    pivots[0].add(dorsal);
    const sides = [-1, 1].map((side) => {
      const f = new THREE.Mesh(tri([[0, 0, 0], [side * 0.35 * H, -0.05 * H, 0.3 * len], [0, 0, 0.35 * len]]), glass);
      f.position.set(side * reach({ prim: b.prim, size: [b.size[0], b.size[0]] }) * 0.7, 0, 0.1 * len);
      pivots[0].add(f);
      return f;
    });
    return (t) => {
      dorsal.rotation.z = Math.sin(t * 1.8) * 0.12;
      sides.forEach((f, i) => { f.rotation.z = Math.sin(t * 2.4 + i * Math.PI) * 0.25; });
    };
  },
  /** The mossfoot: a tuft of moss on each foot (or under you, legless), each with a pink flower. */
  mossfoot(parts, pivots, box, H) {
    const s = Math.max(0.12, 0.08 * H);
    const moss = mat(0x7fcf4f, 0.25), petal = mat(0xff9ad5, 0.5);
    const spots = [];
    parts.forEach((p, i) => { if (p.kind === "leg") spots.push({ holder: pivots[i], y: -p.size[1] }); });
    if (!spots.length) for (const dx of [-0.5, 0, 0.5]) spots.push({ holder: pivots[0], y: box.min.y, x: dx * (box.max.x - box.min.x) * 0.6 });
    const flowers = [];
    for (const sp of spots) {
      const tuft = new THREE.Mesh(solid(new THREE.OctahedronGeometry(1, 0)), moss);
      tuft.scale.set(s * 1.4, s * 0.7, s * 1.4);
      tuft.position.set(sp.x ?? 0, sp.y + s * 0.3, 0);
      const flower = new THREE.Mesh(solid(new THREE.TetrahedronGeometry(1, 0)), petal);
      flower.scale.setScalar(s * 0.45);
      flower.position.set((sp.x ?? 0) + s * 0.5, sp.y + s * 0.9, 0);
      sp.holder.add(tuft, flower);
      flowers.push(flower);
    }
    return (t) => flowers.forEach((f, i) => { f.rotation.y = t * 1.2 + i; });
  },
  /** The river compass: a bronze disc hung at your front, its blue needle swimming. */
  rivercompass(parts, pivots, box, H) {
    const body = pivots[0], r = Math.max(0.16, 0.12 * H);
    const front = box.min.z * 0.92, y = box.max.y * 0.25;
    const disc = new THREE.Mesh(solid(new THREE.CylinderGeometry(1, 1, 0.3, 8)), mat(0xc08a3e, 0.35, { shininess: 80 }));
    disc.scale.setScalar(r);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, y, front);
    const needle = new THREE.Mesh(solid(new THREE.OctahedronGeometry(1, 0)), mat(0x6fd8ff, 0.8, { shininess: 120 }));
    needle.scale.set(r * 0.18, r * 0.8, r * 0.1);
    needle.position.set(0, y, front - r * 0.2);
    body.add(disc, needle);
    return (t) => { needle.rotation.z = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.1) * 0.12; };
  },
  /** The owl's eye: a great amber eye on your brow, and two feather tufts over it. */
  owleye(parts, pivots, box, H) {
    const head = parts.findIndex((p) => p.kind === "head");
    const holder = head >= 0 ? pivots[head] : pivots[0];
    const r = head >= 0 ? reach(parts[head]) : Math.max(0.5, 0.25 * H);
    const front = head >= 0 ? -r * 0.95 : box.min.z * 0.95, up = head >= 0 ? r * 0.35 : box.max.y * 0.5;
    const eye = new THREE.Mesh(solid(new THREE.IcosahedronGeometry(1, 0)), mat(0xffb534, 0.7, { shininess: 100 }));
    eye.scale.setScalar(r * 0.38);
    eye.position.set(0, up, front);
    const pupil = new THREE.Mesh(solid(new THREE.OctahedronGeometry(1, 0)), mat(0x140c05, 0));
    pupil.scale.set(r * 0.12, r * 0.2, r * 0.06);
    pupil.position.set(0, up, front - r * 0.36);
    const tufts = [-1, 1].map((side) => {
      const c = new THREE.Mesh(solid(new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0)), mat(0xb58a5a, 0.15));
      c.scale.set(r * 0.22, r * 0.75, r * 0.22);
      c.position.set(side * r * 0.5, head >= 0 ? r * 0.75 : box.max.y, head >= 0 ? 0 : box.min.z * 0.6);
      c.rotation.z = -side * 0.45;
      holder.add(c);
      return c;
    });
    holder.add(eye, pupil);
    return (t) => {
      const look = Math.sin(t * 0.7) * r * 0.08; // it looks about
      pupil.position.x = look;
      tufts.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.3 + i) * 0.08; });
    };
  },
  // Looks the rhizome gives (its woken links), shown the same way: built here from their names.
  /** A halo: a thin ring of light over your head, turning. */
  halo(parts, pivots, box, H) {
    const head = parts.findIndex((p) => p.kind === "head");
    const holder = head >= 0 ? pivots[head] : pivots[0], over = head >= 0 ? reach(parts[head]) : box.max.y;
    const r = Math.max(0.35, 0.22 * H);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.08, 3, 14), mat(0xfff1c4, 0.9, { shininess: 100 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = over + r * 0.6;
    holder.add(ring);
    return (t) => { ring.rotation.z = t * 0.6; ring.position.y = over + r * 0.6 + Math.sin(t * 1.7) * r * 0.08; };
  },
  /** Motes: five sparks of cyan circling you at the height of your body. */
  motes(parts, pivots, box, H) {
    const motes = [], R = Math.max(0.8, 0.45 * (box.max.x - box.min.x + box.max.z - box.min.z) / 2 + 0.3 * H);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(solid(new THREE.OctahedronGeometry(1, 0)), mat(0x7af0ff, 0.9));
      m.scale.setScalar(Math.max(0.08, 0.05 * H));
      pivots[0].add(m);
      motes.push(m);
    }
    const y0 = (box.max.y + box.min.y) / 2;
    return (t) => motes.forEach((m, k) => {
      const a = t * 0.9 + (k * Math.PI * 2) / 5;
      m.position.set(Math.cos(a) * R, y0 + Math.sin(t * 1.3 + k) * 0.25 * H, Math.sin(a) * R);
      m.rotation.y = t * 2;
    });
  },
  /** Sheen: a golden glow in your own colours, slowly breathing. */
  sheen(parts, pivots) {
    const gold = new THREE.Color(0xffc94d), mats = pivots.map((p) => p.children[0]?.material).filter((m) => m?.emissive);
    const base = mats.map((m) => m.emissive.clone());
    return (t) => {
      const k = 0.25 + 0.12 * Math.sin(t * 1.4);
      mats.forEach((m, i) => m.emissive.copy(base[i]).lerp(gold, k));
    };
  },
};

/** Things that have a look: what you can wear, and the rhizome's looks. */
export const LOOKS = Object.keys(BUILD);

/**
 * Put worn things on a creature being built. parts and pivots: the body's (pivots[i] holds parts[i]); box: the body's
 * bounds at scale 1. Returns update(t, motion) for whatever moves.
 */
export function wearOn(parts, pivots, box, worn = [], looks = []) {
  const H = Math.max(0.5, box.max.y - box.min.y);
  const movers = [];
  for (const kind of [...worn, ...looks]) if (BUILD[kind]) movers.push(BUILD[kind](parts, pivots, box, H));
  return (t, motion) => { for (const f of movers) f(t, motion); };
}
