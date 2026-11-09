// Shrines, drawn: a stepped plinth, an arch you can walk under, a crystal turning inside it in the colour of its
// spell (pink: your shape, cyan: the camera, gold: the world), and a column of light you can see from kilometres
// off. Where they stand and what they do come from shrinelore.js.
import * as THREE from "three";
import { shrineHomes, SPELLS, KIND_COLOUR, SHRINE } from "./shrinelore.js";
import { curved, CURVE_GLSL, curveUniform } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";

const REGROW_M = 1500;
const STONE = 0xb7a6d6;
export const SHRINE_TRIANGLES = 12 * 5 + 8;

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** One shrine's meshes (about 70 triangles and a beam). */
function shrineMesh(colour) {
  const group = new THREE.Group();
  const stone = curved(new THREE.MeshLambertMaterial({ color: STONE, flatShading: true }), "-shrine-stone");
  // Plinth (two steps), two pillars, a lintel: an arch about 9 m tall, nearly twice your height.
  for (const g of [box(9, 0.8, 9, 0, 0.4, 0), box(6.5, 0.8, 6.5, 0, 1.2, 0), box(1.1, 7, 1.1, -2.4, 5.1, 0), box(1.1, 7, 1.1, 2.4, 5.1, 0), box(6.6, 1, 1.5, 0, 9.1, 0)]) {
    const m = new THREE.Mesh(g, stone);
    group.add(m);
  }
  const glow = new THREE.Color(colour);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), curved(new THREE.MeshLambertMaterial({ color: glow, emissive: glow.clone().multiplyScalar(0.7), flatShading: true }), "-shrine-crystal"));
  crystal.position.y = 5;
  crystal.scale.set(1, 1.6, 1);
  group.add(crystal);
  // The beam: an open column of light, brightest at the bottom, fading up into the sky.
  const beamGeo = new THREE.CylinderGeometry(2.4, 2.4, 420, 6, 1, true).translate(0, 210 + 1.6, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: glow }, uPulse: { value: 1 }, uCurve: curveUniform },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${CURVE_GLSL}
      varying float vUp;
      void main() {
        vUp = (position.y - 1.6) / 420.0;
        gl_Position = projectionMatrix * viewMatrix * curveWorld(modelMatrix * vec4(position, 1.0));
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColour; uniform float uPulse;
      varying float vUp;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(uColour, (1.0 - vUp) * (1.0 - vUp) * 0.55 * uPulse);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  group.add(beam);
  // Far off, a star where it stands: a few pixels at any distance, so a shrine kilometres away still shows.
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 14, 0], 3));
  const star = new THREE.Points(starGeo, curved(new THREE.PointsMaterial({ color: glow, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), "-shrine-star"));
  star.frustumCulled = false;
  group.add(star);
  layerTransparent(group);
  return { group, crystal, beam, beamMat, stone, glow, star, state: "awake" };
}
/** How a shrine looks: awake (its colour, glowing), resting (dim: you've had its gift this waking), asleep (dark). */
function showState(m, state) {
  if (m.state === state) return;
  m.state = state;
  const mat = m.crystal.material, grey = new THREE.Color(0x4a4360);
  if (state === "asleep") { mat.color.copy(grey); mat.emissive.setRGB(0.02, 0.02, 0.04); }
  else if (state === "resting") { mat.color.copy(m.glow).lerp(grey, 0.5); mat.emissive.copy(m.glow).multiplyScalar(0.18); }
  else { mat.color.copy(m.glow); mat.emissive.copy(m.glow).multiplyScalar(0.7); }
}
const BEAM = { awake: 1, resting: 0.5, asleep: 0.3 }; // asleep it's dim, but you can still find it from afar

/** terrain: heights. Returns { group, update(x, z, t), near(x, z, r), all(), entryOf(object) }. */
export function buildShrines(frame, terrain) {
  const group = new THREE.Group();
  const live = new Map(); // key -> { home, mesh }
  let centre = null;
  const at = (c) => {
    const p = frame.toLocal(c.lat, c.lon), h = terrain.heightAt(p.x, p.z);
    return h < 2 ? null : { p: { x: p.x, z: p.z }, h };
  };
  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    const homes = shrineHomes(ll.lat, ll.lon, at), keep = new Set();
    for (const s of homes) {
      keep.add(s.key);
      if (live.has(s.key)) continue;
      const m = shrineMesh(KIND_COLOUR[SPELLS[s.spell].kind]);
      // Level the plinth on the ground: sit it on the lowest of its corners and let it sink in at the high ones.
      const lo = Math.min(...[[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]].map(([dx, dz]) => terrain.heightAt(s.x + dx, s.z + dz)));
      m.group.position.set(s.x, lo - 0.3, s.z);
      m.group.rotation.y = s.seed * Math.PI * 2;
      m.group.userData.shrine = s;
      group.add(m.group);
      live.set(s.key, { home: s, mesh: m });
    }
    for (const [key, e] of live) {
      if (keep.has(key)) continue;
      group.remove(e.mesh.group);
      e.mesh.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      live.delete(key);
    }
    centre = { x, z };
  }
  return {
    group,
    update(x, z, t) {
      if (!centre || Math.hypot(x - centre.x, z - centre.z) > REGROW_M) settle(x, z);
      for (const { home, mesh } of live.values()) {
        const awake = mesh.state !== "asleep";
        mesh.crystal.rotation.y = awake ? t * 0.9 + home.seed * 6 : home.seed * 6; // asleep, it's still
        mesh.crystal.position.y = 5 + (awake ? Math.sin(t * 1.3 + home.seed * 9) * 0.35 : -0.6);
        mesh.beamMat.uniforms.uPulse.value = (0.75 + 0.25 * Math.sin(t * 1.7 + home.seed * 11)) * BEAM[mesh.state];
        // The star only far off (up close the shrine speaks for itself); dimmer while it sleeps.
        const d = Math.hypot(home.x - x, home.z - z);
        mesh.star.visible = d > 900;
        mesh.star.material.opacity = (mesh.state === "asleep" ? 0.6 : 1) * Math.min(1, (d - 900) / 600);
      }
    },
    /** Shrines within r of (x, z): [{ key, spell, state, x, y, z, lat, lon }] (y: the crystal). */
    near(x, z, r) {
      const out = [];
      for (const { home, mesh } of live.values()) {
        if (Math.hypot(home.x - x, home.z - z) < r) out.push({ key: home.key, spell: home.spell, state: mesh.state, x: home.x, y: mesh.group.position.y + mesh.crystal.position.y, z: home.z, lat: home.lat, lon: home.lon });
      }
      return out;
    },
    /** stateOf(home) -> "awake" | "resting" | "asleep", for every shrine standing (main.js keeps the clock). */
    setStates(stateOf) { for (const { home, mesh } of live.values()) showState(mesh, stateOf(home)); },
    all() { return this.near(0, 0, Infinity); },
    /** The shrine a tapped mesh belongs to, or null. */
    entryOf(object) {
      for (let o = object; o; o = o.parent) if (o.userData?.shrine) { const s = o.userData.shrine; return this.near(s.x, s.z, 1).find((q) => q.key === s.key) || null; }
      return null;
    },
    /** The stone parts, for a tap to hit (not the beam, which would catch every tap along the column). */
    pickables() { return [...live.values()].flatMap(({ mesh }) => mesh.group.children.filter((c) => c !== mesh.beam && c !== mesh.star)); },
    get count() { return live.size; },
    radius: SHRINE.radius,
  };
}
