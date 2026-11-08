// The sea, as a shader. A mesh of rings centred on the camera (dense near, sparse
// far, out past the horizon) carries a sum of directional waves. The fragment
// shader re-evaluates the waves per pixel for lighting: banded crests, foam, a
// sun glint that sparkles, and the sky reflected at grazing angles. Fine waves
// fade out with distance before they can shimmer, so the shrinking pattern
// reads as depth.
import * as THREE from "three";
import { CURVE_GLSL, curveUniform } from "./curvature.js";

const WAVES = /* glsl */ `
  // xy: direction (unit), z: wavelength (m), w: amplitude (m). Speed follows from
  // the deep-water dispersion relation, c = sqrt(g * wavelength / 2π).
  const int NW = 6;
  const vec4 W[NW] = vec4[NW](
    vec4( 0.94,  0.34, 420.0, 4.0),
    vec4(-0.47,  0.88, 160.0, 2.2),
    vec4( 0.71, -0.70,  64.0, 1.1),
    vec4( 0.20,  0.98,  27.0, 0.55),
    vec4(-0.86, -0.51,  11.0, 0.25),
    vec4( 0.55,  0.83,   4.6, 0.12)
  );
  float waveSpeed(float wl) { return sqrt(9.81 * wl / 6.2832); }
  // height and gradient at world xz, with each wave faded by 'fade' (per pixel footprint)
  vec3 waves(vec2 p, float t, float footprint) {
    float h = 0.0; vec2 g = vec2(0.0);
    for (int i = 0; i < NW; i++) {
      vec2 d = W[i].xy; float wl = W[i].z; float a = W[i].w;
      float k = 6.2832 / wl;
      float f = 1.0 - smoothstep(wl * 0.12, wl * 0.45, footprint); // fade waves smaller than a pixel
      if (f < 0.01) continue; // far away, the small waves cost nothing
      float ph = k * dot(d, p) - k * waveSpeed(wl) * t;
      h += a * f * sin(ph);
      g += a * f * k * cos(ph) * d;
    }
    return vec3(h, g);
  }
`;

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${CURVE_GLSL}
  ${WAVES}
  uniform float uTime;
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vDist = length(w.xz - cameraPosition.xz);
    // Geometry only carries the waves its ring spacing can hold.
    float footprint = max(8.0, vDist * 0.08);
    w.y += waves(w.xz, uTime, footprint).x;
    vWorld = w.xyz;
    vec4 mvPosition = viewMatrix * curveWorld(w);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  ${WAVES}
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uDay;
  uniform float uOpacity;
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    #include <logdepthbuf_fragment>
    float footprint = length(fwidth(vWorld.xz));
    vec3 hw = waves(vWorld.xz, uTime, footprint);
    vec3 n = normalize(vec3(-hw.y, 1.0, -hw.z));
    vec3 v = normalize(cameraPosition - vWorld);
    if (!gl_FrontFacing) {
      // From below: a bright, rippling ceiling, still fogged by the murk.
      float lit = 0.5 + 0.5 * n.y;
      gl_FragColor = vec4(mix(uDeep, uShallow * 1.4, lit * 0.6), 0.95);
      #include <fog_fragment>
      return;
    }
    float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0);
    // Posterize: a few hard bands, like an old palette.
    diffuse = floor(diffuse * 4.0 + 0.5) / 4.0;
    vec3 col = mix(uDeep, uShallow, 0.35 + 0.65 * diffuse * uDay);
    // The sky at grazing angles.
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    col = mix(col, uSky, clamp(fres * 1.4, 0.0, 0.85));
    // Crests and foam: the tops of the waves, in hard white bands.
    float crest = hw.x / 9.0;
    col = mix(col, vec3(0.92, 0.97, 1.0), step(0.55, crest) * 0.55 * (1.0 - smoothstep(4000.0, 20000.0, vDist)));
    // The sun glint sparkles.
    vec3 r = reflect(-uSunDir, n);
    float glint = pow(clamp(dot(r, v), 0.0, 1.0), 90.0);
    col += uSunColor * step(0.35, glint) * uDay * 1.2;
    gl_FragColor = vec4(col, uOpacity);
    #include <fog_fragment>
  }`;

/** Rings from ~15 m out to ~700 km, geometric spacing; returns positions for a flat disc. */
function ringDisc(innerStep = 15, growth = 1.16, outer = 700000, segments = 128) {
  const radii = [0];
  let r = innerStep;
  while (r < outer) { radii.push(r); r *= growth; }
  radii.push(outer);
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++)
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
    }
  const ring = (i, s) => (i === 0 ? 0 : 1 + (i - 1) * segments + (s % segments));
  for (let s = 0; s < segments; s++) idx.push(0, ring(1, s + 1), ring(1, s));
  for (let i = 1; i < radii.length - 1; i++)
    for (let s = 0; s < segments; s++) {
      const a = ring(i, s), b = ring(i, s + 1), c = ring(i + 1, s), d = ring(i + 1, s + 1);
      idx.push(a, b, c, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

export function buildSea() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff1c8) },
      uSky: { value: new THREE.Color(0xff9ec7) },
      uDeep: { value: new THREE.Color(0x0d2f7a) },
      uShallow: { value: new THREE.Color(0x3fd6ff) },
      uDay: { value: 1 },
      uOpacity: { value: 0.82 },
    },
  ]);
  uniforms.uCurve = curveUniform; // shared, not cloned
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(ringDisc(), mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    /** t seconds; sunDir a local unit vector; day 0..1; sky the horizon colour. */
    update(t, sunDir, day, sky) {
      uniforms.uTime.value = t;
      uniforms.uSunDir.value.set(sunDir.x, Math.max(-0.2, sunDir.y), sunDir.z).normalize();
      uniforms.uDay.value = day;
      uniforms.uSky.value.copy(sky);
    },
    set underwater(on) { uniforms.uOpacity.value = on ? 0.95 : 0.82; },
  };
}
