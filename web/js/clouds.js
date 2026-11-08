// Clouds at two heights, for depth and distance. A high deck (~8 km) is shader
// noise posterized into retro bands, lit by the real sun. Below it, cumulus
// (~1.5 km) are flat-shaded puffs arranged by L-systems. They share a base
// altitude, so they make a floor that recedes to the horizon, and they drift
// with the prevailing wind on the real clock, so everyone shares the same sky.
import * as THREE from "three";
import { CURVE_GLSL, curveUniform, curved } from "./curvature.js";
import { cloudsNear, cumulusPuffs, driftLon, windSign, WIND } from "./cloudfield.js";

const DECK_ALT = 8000;

const deckVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${CURVE_GLSL}
  varying vec2 vXZ;
  varying float vDist;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vXZ = w.xz;
    vDist = length(w.xz - cameraPosition.xz);
    vec4 mvPosition = viewMatrix * curveWorld(w);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;
const deckFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform vec2 uWind;     // metres of drift
  uniform vec3 uLight;    // sunlit colour
  uniform vec3 uShade;    // shadowed colour
  uniform float uCover;   // 0..1
  varying vec2 vXZ;
  varying float vDist;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
    return v;
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vXZ + uWind) / 9000.0;
    // Stretch along the wind, like high streaks.
    float n = fbm(vec2(p.x * 0.6, p.y * 1.4));
    float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.08, n);
    if (c < 0.01) discard;
    // Two hard tones, lit side and shade, like an old palette.
    float band = step(0.55, noise(p * 3.0 + 3.1));
    vec3 col = mix(uShade, uLight, band);
    float edgeFade = 1.0 - smoothstep(250000.0, 420000.0, vDist);
    gl_FragColor = vec4(col, c * 0.85 * edgeFade);
    #include <fog_fragment>
  }`;

export function buildClouds() {
  const group = new THREE.Group();

  // The high deck: a disc centred on the camera.
  const deckUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uWind: { value: new THREE.Vector2() }, uLight: { value: new THREE.Color(0xffffff) }, uShade: { value: new THREE.Color(0xc9b3ff) }, uCover: { value: 0.42 } },
  ]);
  deckUniforms.uCurve = curveUniform;
  const deck = new THREE.Mesh(
    new THREE.CircleGeometry(420000, 48).rotateX(Math.PI / 2), // faces down, toward you
    new THREE.ShaderMaterial({ uniforms: deckUniforms, vertexShader: deckVertex, fragmentShader: deckFragment, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  deck.frustumCulled = false;
  deck.renderOrder = 0;
  group.add(deck);

  // Cumulus: one instanced mesh of puffs.
  const MAX = 5000;
  const puffMat = curved(new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x20142e }), "-puff");
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), puffMat, MAX);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.frustumCulled = false;
  puffs.count = 0;
  group.add(puffs);
  const shapes = new Map(); // seed -> puffs (L-system output, cached)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const tint = new THREE.Color();

  /**
   * frame: the world's local frame (or a ley-space frame); ll: where the camera
   * is; unix: seconds; sun: { altitude, dir, day }; sky: horizon colour.
   */
  function update(frame, ll, camera, unix, sunAlt, day, sky, heightAt) {
    // The deck follows you; its pattern is keyed to world position plus wind.
    deck.position.set(camera.position.x, DECK_ALT, camera.position.z);
    const windM = WIND * unix * windSign(ll.lat);
    deckUniforms.uWind.value.set(-windM % 900000, 0);
    const dusk = Math.min(1, Math.max(0, (sunAlt + 4) / 14));
    deckUniforms.uLight.value.setRGB(1, 0.75 + 0.25 * dusk, 0.7 + 0.3 * dusk).lerp(sky, 0.15).multiplyScalar(0.25 + 0.75 * day);
    deckUniforms.uShade.value.copy(sky).lerp(new THREE.Color(0x8f7ad6), 0.5).multiplyScalar(0.35 + 0.65 * day);

    // Cumulus within ~78 km.
    let n = 0;
    for (const c of cloudsNear(ll.lat, ll.lon, unix)) {
      if (!shapes.has(c.seed)) {
        shapes.set(c.seed, cumulusPuffs(c.seed));
        if (shapes.size > 2000) shapes.delete(shapes.keys().next().value);
      }
      const centre = frame.toLocal(c.lat, c.lon);
      const base = Math.max(c.base, (heightAt ? heightAt(centre.x, centre.z) : 0) + 700); // over mountains, higher
      tint.setHSL(((c.seed >>> 3) % 1000) / 1000, 0.35, 0.9);
      // Distant clouds keep only their first few puffs: the silhouette survives,
      // the triangle count doesn't.
      const d = Math.hypot(centre.x - camera.position.x, centre.z - camera.position.z);
      const keep = d < 25000 ? 24 : d < 50000 ? 8 : 4;
      const list = shapes.get(c.seed);
      for (let k = 0; k < Math.min(keep, list.length); k++) {
        const p = list[k];
        if (n >= MAX) break;
        pv.set(centre.x + p.p[0], base + p.p[1], centre.z + p.p[2]);
        sc.set(p.r, p.r * 0.72, p.r);
        m.compose(pv, q, sc);
        puffs.setMatrixAt(n, m);
        puffs.setColorAt(n, tint);
        n++;
      }
    }
    puffs.count = n;
    puffs.instanceMatrix.needsUpdate = true;
    if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
    return n;
  }

  return { group, update };
}
