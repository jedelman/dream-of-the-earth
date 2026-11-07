// A psychedelic sky for the real hour: dome colours, sun disc, stars and the
// light all follow the sun's real altitude at the creature's coordinate.
import * as THREE from "three";
import { mulberry32 } from "./rng.js";

const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));

/** Zenith and horizon colours for a sun altitude in degrees. */
export function skyColors(alt) {
  if (alt > 12) return { zenith: new THREE.Color(0x3d3fd6), horizon: new THREE.Color(0xff9ec7) };
  if (alt > -2) { // golden hour into sunset
    const t = (alt + 2) / 14;
    return { zenith: lerpColor(0x2a1a6e, 0x3d3fd6, t), horizon: lerpColor(0xff6a3d, 0xff9ec7, t) };
  }
  if (alt > -12) { // twilight
    const t = (alt + 12) / 10;
    return { zenith: lerpColor(0x070418, 0x2a1a6e, t), horizon: lerpColor(0x1e0f45, 0xff6a3d, t) };
  }
  return { zenith: new THREE.Color(0x070418), horizon: new THREE.Color(0x1e0f45) };
}

export function buildSky() {
  const group = new THREE.Group();
  const uniforms = { zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(250000, 16, 8),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith; uniform vec3 horizon; varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          float band = floor(pow(h, 0.45) * 7.0) / 7.0;   // banded, like an old palette
          gl_FragColor = vec4(mix(horizon, zenith, band), 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  group.add(dome);

  // Stars (seeded, so every phone has the same sky).
  const rand = mulberry32(7);
  const n = 900, starPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    starPos.set([r * Math.cos(th) * 240000, Math.abs(u) * 240000, r * Math.sin(th) * 240000], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xfff8e0, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  group.add(new THREE.Points(starGeo, starMat));

  // The sun: a low-poly disc that always faces the camera.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(9000, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false, depthWrite: false }));
  group.add(sun);

  return {
    group,
    /** alt in degrees; dir a unit vector toward the sun in the local frame. */
    update(alt, dir, camera) {
      const { zenith, horizon } = skyColors(alt);
      uniforms.zenith.value.copy(zenith);
      uniforms.horizon.value.copy(horizon);
      starMat.opacity = Math.min(1, Math.max(0, (-alt - 4) / 8));
      group.position.copy(camera.position); // the sky travels with you
      sun.position.set(dir.x * 200000, dir.y * 200000, dir.z * 200000);
      sun.lookAt(camera.position);
      sun.visible = alt > -3;
      return horizon;
    },
  };
}
