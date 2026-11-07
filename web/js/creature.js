// Builds a creature's meshes from its body graph and animates it from the body
// and the motion. Nothing here is sent over a network: only position is.
import * as THREE from "three";
import { TRIANGLE_CAP } from "./creature-graph.js";

function geometryFor(part) {
  switch (part.prim) {
    case "ico": return new THREE.IcosahedronGeometry(1, 0);
    case "octa": return new THREE.OctahedronGeometry(1, 0);
    case "tetra": return new THREE.TetrahedronGeometry(1, 0);
    case "box": return new THREE.BoxGeometry(1.6, 1.6, 1.6);
    case "cone3": return new THREE.ConeGeometry(1, 1, 3).translate(0, 0.5, 0);
    case "cone4": return new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
    case "wing1": case "wing2": {
      // A flat wing in the x/z plane, rooted at x = 0, spanning +x.
      const g = new THREE.BufferGeometry();
      const v = part.prim === "wing1"
        ? [0, 0, -0.5, 1, 0, 0.3, 0, 0, 0.5]
        : [0, 0, -0.5, 1, 0, -0.1, 0.8, 0, 0.6, 0, 0, -0.5, 0.8, 0, 0.6, 0, 0, 0.5];
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      return g;
    }
  }
  throw new Error(`unknown primitive ${part.prim}`);
}

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Returns { group, update(t, motion), triangles }. */
export function buildCreature(graph, stats) {
  const group = new THREE.Group();
  const gleam = stats.gleam / 6;
  const animated = [];
  let triangles = 0;

  for (const part of graph.parts) {
    const raw = geometryFor(part);
    const geo = raw.index ? raw.toNonIndexed() : raw;
    triangles += triCount(geo);
    geo.computeVertexNormals();
    const c = new THREE.Color().setHSL(part.color.h, part.color.s, part.color.l);
    const mat = new THREE.MeshPhongMaterial({
      color: c,
      flatShading: true,
      side: part.kind === "wing" ? THREE.DoubleSide : THREE.FrontSide,
      shininess: 4 + gleam * 140,
      specular: new THREE.Color().setHSL(part.color.h, 0.6, 0.15 + gleam * 0.7),
      emissive: c.clone().multiplyScalar(0.08 + gleam * 0.25),
    });
    const mesh = new THREE.Mesh(geo, mat);
    const pivot = new THREE.Group();
    pivot.position.set(...part.pos);
    if (part.kind === "wing") {
      mesh.scale.set(part.size[0] * part.side, 1, part.size[1]);
    } else {
      mesh.scale.set(...part.size);
      mesh.rotation.set(...part.rot);
    }
    pivot.add(mesh);
    group.add(pivot);
    if (["wing", "leg", "tail"].includes(part.kind)) animated.push({ part, pivot, mat });
    if (gleam > 0) animated.push({ part, pivot, mat, gleamOnly: true, base: c });
  }
  if (triangles > TRIANGLE_CAP) throw new Error(`creature has ${triangles} triangles, over the ${TRIANGLE_CAP} cap`);

  // Gleam: a few sparkles that orbit the creature. Points, not triangles.
  let sparkles = null;
  if (gleam > 0) {
    const n = Math.round(6 + gleam * 30);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos.set([Math.cos(a) * 9, Math.sin(a * 3) * 4, Math.sin(a) * 9], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    sparkles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff3b0, size: 0.6 + gleam * 0.9, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(sparkles);
  }

  group.scale.setScalar(graph.scale);

  function update(t, motion) {
    // motion: { mode: "air" | "ground" | "water", speed01 }
    const s = motion.speed01;
    for (const a of animated) {
      const { part, pivot } = a;
      if (a.gleamOnly) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + part.pos[2]);
        a.mat.emissive.copy(a.base).multiplyScalar(0.08 + gleam * (0.15 + 0.35 * pulse));
        continue;
      }
      if (part.kind === "wing") {
        const amp = motion.mode === "air" ? 0.6 + 0.3 * s : motion.mode === "water" ? 0.35 : 0.08;
        const rate = motion.mode === "air" ? 7 : motion.mode === "water" ? 2.5 : 1.5;
        pivot.rotation.z = part.side * (Math.sin(t * rate + (part.phase || 0)) * amp + (motion.mode === "ground" ? 0.9 : 0));
      } else if (part.kind === "leg") {
        const amp = motion.mode === "ground" ? 0.7 * s : motion.mode === "water" ? 0.4 : 0.1;
        pivot.rotation.x = Math.sin(t * (4 + 6 * s) + part.phase) * amp;
      } else if (part.kind === "tail") {
        pivot.rotation.y = Math.sin(t * 2.2 + part.phase) * (0.25 + 0.2 * s);
      }
    }
    if (sparkles) sparkles.rotation.y = t * 0.8;
  }

  return { group, update, triangles };
}
