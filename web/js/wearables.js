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
};

/** Things you can wear that have a look. */
export const LOOKS = Object.keys(BUILD);

/**
 * Put worn things on a creature being built. parts and pivots: the body's (pivots[i] holds parts[i]); box: the body's
 * bounds at scale 1. Returns update(t, motion) for whatever moves.
 */
export function wearOn(parts, pivots, box, worn = []) {
  const H = Math.max(0.5, box.max.y - box.min.y);
  const movers = [];
  for (const kind of worn) if (BUILD[kind]) movers.push(BUILD[kind](parts, pivots, box, H));
  return (t, motion) => { for (const f of movers) f(t, motion); };
}
