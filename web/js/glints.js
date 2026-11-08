// Glints on the things in reach: a small four-point star that twinkles, the
// sparkle on something you can touch. The one with the prompt glints bigger and
// golder, and steady; the rest wink out of step. Drawn over everything, a few
// pixels across in the small picture, so they read as a hint, not a marker.
import * as THREE from "three";
import { CURVE_GLSL, curveUniform } from "./curvature.js";
import { layerTransparent } from "./skyshader.js";

const MAX = 8;

export function buildGlints(scene) {
  const pos = new Float32Array(MAX * 3), focus = new Float32Array(MAX), phase = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aFocus", new THREE.BufferAttribute(focus, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  const time = { value: 0 }, fade = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCurve: curveUniform, uTime: time, uFade: fade },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${CURVE_GLSL}
      attribute float aFocus, aPhase;
      uniform float uTime;
      varying float vFocus, vLight, vTurn;
      void main() {
        vec4 mv = viewMatrix * curveWorld(modelMatrix * vec4(position, 1.0));
        gl_Position = projectionMatrix * mv;
        // The rest wink: mostly small, now and then a flash. The focus breathes.
        float w = 0.5 + 0.5 * sin(uTime * 2.3 + aPhase * 6.283);
        float flash = pow(w, 6.0);
        float breathe = 0.5 + 0.5 * sin(uTime * 3.1);
        vLight = mix(0.35 + 0.65 * flash, 0.8 + 0.2 * breathe, aFocus);
        vFocus = aFocus;
        vTurn = mix(step(0.5, fract(uTime * 0.6 + aPhase)), 0.0, aFocus); // FF-style: the star turns 45° now and then
        gl_PointSize = mix(5.0 + 4.0 * flash, 11.0 + 2.0 * breathe, aFocus);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform float uFade;
      varying float vFocus, vLight, vTurn;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        if (vTurn > 0.5) p = vec2(p.x + p.y, p.y - p.x) * 0.7071;
        vec2 a = abs(p);
        // Two thin arms and a bright core.
        float arms = max(exp(-a.y * 9.0) * (1.0 - a.x), exp(-a.x * 9.0) * (1.0 - a.y));
        float core = exp(-dot(p, p) * 10.0);
        float v = clamp(arms + core, 0.0, 1.0) * vLight * uFade;
        if (v < 0.02) discard;
        vec3 c = mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.86, 0.42), vFocus * (1.0 - core));
        gl_FragColor = vec4(c * v, v);
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10; // over the bursts and the route
  scene.add(points);
  layerTransparent(points); // after the sky

  return {
    points,
    /** spots: [{ x, y, z, focus (bool), phase (0..1) }], at most 8. */
    set(spots) {
      const n = Math.min(MAX, spots.length);
      for (let k = 0; k < n; k++) {
        const s = spots[k];
        pos.set([s.x, s.y, s.z], k * 3);
        focus[k] = s.focus ? 1 : 0;
        phase[k] = s.phase;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = geo.attributes.aFocus.needsUpdate = geo.attributes.aPhase.needsUpdate = true;
      points.visible = n > 0;
    },
    /** t: seconds; on: whether glints should show (they fade in and out). */
    update(t, dt, on) {
      time.value = t;
      fade.value += ((on ? 1 : 0) - fade.value) * Math.min(1, dt * 6);
      if (fade.value < 0.01) points.visible = false;
    },
  };
}
