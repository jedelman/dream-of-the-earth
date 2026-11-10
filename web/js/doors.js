// The doors to other games, drawn (doorways.js says where they stand; main.js opens them). A gate in the shrines' stone:
// a stepped plinth, two posts, a tie beam and a wider top beam, with a doorway of green light between the posts, bands
// of it sliding down and in. Like a shrine, a column of light to find it by from kilometres off and, far off, a star.
// About 80 triangles and a beam.
import * as THREE from "three";
import { doorwaysIn } from "./doorways.js";
import { curved, CURVE_GLSL, curveUniform } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";

const STONE = 0xb7a6d6, GLOW = 0x5dffa0;
const PANE_W = 4.3, PANE_H = 6.4, PANE_Y = 1.6;

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A light shader on the curved Earth: vUv from the geometry, alpha from body (GLSL using vUv, uColour, uTime, uPulse). */
function lightMaterial(colour, body) {
  return new THREE.ShaderMaterial({
    uniforms: { uColour: { value: colour }, uTime: { value: 0 }, uPulse: { value: 1 }, uCurve: curveUniform },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${CURVE_GLSL}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * curveWorld(modelMatrix * vec4(position, 1.0));
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColour; uniform float uTime, uPulse;
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        ${body}
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** One door's meshes. */
function doorMesh() {
  const group = new THREE.Group(), glow = new THREE.Color(GLOW);
  // The doorway's light catches the stone a little, so the gate reads at night (as the ley stones' veins do).
  const stone = curved(new THREE.MeshLambertMaterial({ color: STONE, emissive: glow, emissiveIntensity: 0.1, flatShading: true }), "-door-stone");
  // Plinth (two steps), two posts, a tie beam, and a top beam wider than the posts: a gate about 10.6 m tall.
  const solid = [box(10, 0.8, 8, 0, 0.4, 0), box(7.5, 0.8, 5.5, 0, 1.2, 0), box(1.1, 8.4, 1.1, -2.7, 5.8, 0), box(1.1, 8.4, 1.1, 2.7, 5.8, 0),
    box(7.4, 0.7, 0.8, 0, 8.4, 0), box(9, 0.9, 1.4, 0, 10.2, 0)].map((g) => new THREE.Mesh(g, stone));
  group.add(...solid);
  // The doorway: brightest low down, soft at the edges, in hard retro bands that slide down as if going in.
  const paneMat = lightMaterial(glow, /* glsl */ `
    float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x) * smoothstep(1.0, 0.86, vUv.y);
    float bands = 0.7 + 0.3 * step(0.5, fract(vUv.y * 6.0 + uTime * 0.6));
    gl_FragColor = vec4(uColour, (0.3 + 0.6 * (1.0 - vUv.y)) * edge * bands * uPulse);`);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(PANE_W, PANE_H).translate(0, PANE_Y + PANE_H / 2, 0), paneMat);
  group.add(pane);
  // The beam: an open column of light, brightest at the bottom, fading up into the sky (as the shrines' do).
  const beamMat = lightMaterial(glow, /* glsl */ `gl_FragColor = vec4(uColour, (1.0 - vUv.y) * (1.0 - vUv.y) * 0.5 * uPulse);`);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 420, 6, 1, true).translate(0, 210 + 1.6, 0), beamMat);
  beam.frustumCulled = false;
  group.add(beam);
  // Far off, a star where it stands: a few pixels at any distance.
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 14, 0], 3));
  const star = new THREE.Points(starGeo, curved(new THREE.PointsMaterial({ color: glow, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), "-door-star"));
  star.frustumCulled = false;
  group.add(star);
  layerTransparent(group);
  return { group, solid: [...solid, pane], paneMat, beamMat, star };
}

/** terrain: heights. Returns { group, update(x, z, t), near(x, z, r), all(), entryOf(object), pickables() }. */
export function buildDoors(frame, terrain) {
  const group = new THREE.Group(), live = [];
  for (const d of doorwaysIn(frame)) {
    const m = doorMesh();
    // Level the plinth on the ground: sit it on the lowest of its corners and let it sink in at the high ones.
    const y = Math.min(...[[-5, -4], [5, -4], [-5, 4], [5, 4], [0, 0]].map(([dx, dz]) => terrain.heightAt(d.x + dx, d.z + dz))) - 0.3;
    m.group.position.set(d.x, y, d.z); // facing south, so arriving from the atlas (from the south) you see it face on
    m.group.userData.door = d;
    group.add(m.group);
    live.push({ door: d, mesh: m, x: d.x, y, z: d.z });
  }
  const entry = (e) => ({ key: e.door.key, name: e.door.name, url: e.door.url, lat: e.door.lat, lon: e.door.lon, x: e.x, y: e.y, z: e.z });
  return {
    group,
    update(x, z, t) {
      for (const { mesh, x: dx, z: dz } of live) {
        mesh.paneMat.uniforms.uTime.value = t;
        mesh.paneMat.uniforms.uPulse.value = 0.85 + 0.15 * Math.sin(t * 1.4);
        mesh.beamMat.uniforms.uPulse.value = 0.75 + 0.25 * Math.sin(t * 1.7);
        const d = Math.hypot(dx - x, dz - z);
        mesh.star.visible = d > 900; // up close the door speaks for itself
        mesh.star.material.opacity = Math.min(1, (d - 900) / 600);
      }
    },
    /** Doors within r of (x, z): [{ key, name, url, lat, lon, x, y, z }] (y: the foot of the plinth). */
    near(x, z, r) { return live.filter((e) => Math.hypot(e.x - x, e.z - z) < r).map(entry); },
    all() { return live.map(entry); },
    /** The door a tapped mesh belongs to, or null. */
    entryOf(object) {
      for (let o = object; o; o = o.parent) if (o.userData?.door) { const key = o.userData.door.key, e = live.find((q) => q.door.key === key); return e ? entry(e) : null; }
      return null;
    },
    /** The stone and the doorway, for a tap to hit (not the beam, which would catch every tap along the column). */
    pickables() { return live.flatMap(({ mesh }) => mesh.solid); },
  };
}
