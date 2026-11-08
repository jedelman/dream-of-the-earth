// Insects: butterflies of four triangles by day, fireflies at night. Each lives
// around a home on the global cell grid and flies a loop keyed to the shared
// clock, so everyone sees the same butterfly in the same place.
import * as THREE from "three";
import { BUTTERFLY, FIREFLY, butterflyHomes, fireflyHomes } from "./insecthomes.js";
import { biomeFor, BIOMES } from "./biome.js";
import { koppenAt } from "./koppen.js";
import { curved, CURVE_GLSL } from "./curvature.js";

const REGROW_M = 100;

/** One butterfly: two wings, each a forewing and a hindwing. Body along z, forward is -z. */
function butterflyGeometry() {
  const right = [
    [[0, 0, -0.12], [1, 0, -0.55], [0.75, 0, 0.05]], // forewing
    [[0, 0, 0.0], [0.62, 0, 0.12], [0.42, 0, 0.6]], // hindwing
  ];
  const pos = [], col = [];
  for (const side of [1, -1])
    right.forEach((tri, k) => {
      for (const [x, y, z] of tri) { pos.push(x * side, y, z); col.push(...(k ? [1, 0.55, 0.85] : [1, 1, 1])); }
    });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export function buildInsects(frame, terrain) {
  const time = { value: 0 };
  const group = new THREE.Group();

  // Butterflies: the flight is in the vertex shader, so each frame costs nothing.
  const bgeo = butterflyGeometry();
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(BUTTERFLY.max), 1);
  bgeo.setAttribute("aSeed", seeds);
  const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  bmat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSeed;\nuniform float uTime;")
      .replace("#include <begin_vertex>", `
        float ph = aSeed * 6.2831;
        float tt = uTime * (0.25 + 0.15 * aSeed) + ph;
        // A lazy figure-of-eight around home, bobbing up and down.
        vec3 off = vec3(sin(tt) * 9.0, 1.4 * sin(tt * 2.3 + ph), sin(tt * 2.0 + ph * 0.7) * 5.0);
        vec2 vel = vec2(cos(tt) * 9.0, 2.0 * cos(tt * 2.0 + ph * 0.7) * 5.0);
        float yaw = atan(-vel.x, -vel.y);
        float flap = 0.25 + 0.95 * sin(uTime * 17.0 + ph * 7.0);
        vec3 p = position;
        float span = abs(p.x);
        p = vec3(sign(p.x) * span * cos(flap), span * sin(flap), p.z);
        p = vec3(p.x * cos(yaw) + p.z * sin(yaw), p.y, -p.x * sin(yaw) + p.z * cos(yaw));
        vec3 transformed = p + off;`);
  };
  curved(bmat, "-butterfly");
  const butterflies = new THREE.InstancedMesh(bgeo, bmat, BUTTERFLY.max);
  butterflies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BUTTERFLY.max * 3), 3);
  butterflies.count = 0;
  butterflies.frustumCulled = false;
  group.add(butterflies);

  // Fireflies: points that blink, slow and out of step.
  const fpos = new Float32Array(FIREFLY.max * 3), fseed = new Float32Array(FIREFLY.max);
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute("aSeed", new THREE.BufferAttribute(fseed, 1));
  const night = { value: 0 };
  const fmat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uNight: night },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${CURVE_GLSL}
      attribute float aSeed;
      uniform float uTime;
      varying float vGlow;
      void main() {
        float s = aSeed * 40.0;
        vec3 p = position + vec3(sin(uTime * 0.4 + s) * 3.0, sin(uTime * 0.7 + s * 0.3) * 0.8, cos(uTime * 0.33 + s * 0.4) * 3.0);
        vec4 mv = viewMatrix * curveWorld(modelMatrix * vec4(p, 1.0));
        gl_Position = projectionMatrix * mv;
        vGlow = pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed) + s), 14.0);
        gl_PointSize = clamp(1.0 + vGlow * 900.0 / -mv.z, 1.0, 4.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uNight;
      varying float vGlow;
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.4) * (0.5 + vGlow), uNight * (0.12 + 0.88 * vGlow));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const fireflies = new THREE.Points(fgeo, fmat);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  // A cell's ground and biome, or null over the sea.
  const at = (c) => {
    const p = frame.toLocal(c.lat, c.lon);
    const h = terrain.heightAt(p.x, p.z);
    if (h < 3) return null;
    return { p: { x: p.x, z: p.z }, h, biome: BIOMES[biomeFor(koppenAt(c.lat, c.lon), terrain.reliefAt(p.x, p.z), c.lat, h)] };
  };
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let centre = null;
  function settle(x, z) {
    const ll = frame.toLatLon(x, z);
    const bs = butterflyHomes(ll.lat, ll.lon, at);
    bs.forEach((b, k) => {
      butterflies.setMatrixAt(k, m4.makeScale(b.size, b.size, b.size).setPosition(b.x, b.y, b.z));
      butterflies.setColorAt(k, col.setHSL(b.hue, 0.95, 0.6));
      seeds.array[k] = b.seed;
    });
    butterflies.count = bs.length;
    butterflies.instanceMatrix.needsUpdate = true;
    butterflies.instanceColor.needsUpdate = true;
    seeds.needsUpdate = true;
    const fs = fireflyHomes(ll.lat, ll.lon, at);
    fs.forEach((f, k) => { fpos.set([f.x, f.y, f.z], k * 3); fseed[k] = f.seed; });
    fgeo.setDrawRange(0, fs.length);
    fgeo.attributes.position.needsUpdate = true;
    fgeo.attributes.aSeed.needsUpdate = true;
    centre = { x, z };
  }

  return {
    group,
    /** sunAltitude in degrees; clock in seconds (the shared one, wrapped to a day). */
    update(x, z, clock, sunAltitude) {
      if (!centre || Math.hypot(x - centre.x, z - centre.z) > REGROW_M) settle(x, z);
      time.value = clock;
      butterflies.visible = sunAltitude > 3;
      night.value = Math.max(0, Math.min(1, (-sunAltitude - 2) / 6));
      fireflies.visible = night.value > 0;
      return { butterflies: butterflies.count, fireflies: fgeo.drawRange.count };
    },
  };
}
