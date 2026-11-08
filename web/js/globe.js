// The whole Earth, for when you zoom far enough out: a faceted low-poly globe
// coloured and lifted by real elevation (relief exaggerated so it reads at this
// scale), the ley grid wrapped around it in gold, an atmosphere glow, the real
// sun on the day side, and a sparkle where you are.
import * as THREE from "three";
import { fetchDecoded, groundColor } from "./terrain.js";
import { ensureKoppen } from "./koppen.js";
import { lonLatToTile, latLonToVec, vecToLatLon, R_EARTH } from "./geo.js";
import { network, greatCircle } from "./ley.js";
import { subsolarPoint } from "./sun.js";
import { mulberry32 } from "./rng.js";

const RELIEF = 25; // vertical exaggeration
const Z = 2; // 4×4 tiles: the whole world at ~39 km a pixel

async function worldHeights() {
  const n = 2 ** Z, size = 256 * n;
  const h = new Float32Array(size * size);
  await Promise.all(
    Array.from({ length: n * n }, (_, i) => fetchDecoded(Z, i % n, Math.floor(i / n)).then((t) => {
      if (!t) return;
      const tx = i % n, ty = Math.floor(i / n);
      for (let y = 0; y < 256; y++) h.set(t.subarray(y * 256, y * 256 + 256), (ty * 256 + y) * size + tx * 256);
    }).catch(() => {})),
  );
  return (lat, lon) => {
    if (lat > 85) return 0; // Arctic sea ice
    if (lat < -85) return 2800; // the Antarctic plateau
    const t = lonLatToTile(lon, lat, Z);
    const x = Math.min(size - 1, Math.max(0, Math.floor(t.x * 256))), y = Math.min(size - 1, Math.max(0, Math.floor(t.y * 256)));
    return h[y * size + x];
  };
}

export function buildGlobe() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05030f);
  const camera = new THREE.PerspectiveCamera(50, 1, 5000, 2e8);
  camera.up.set(0, 0, 1); // north up (the globe uses z toward the north pole)
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
  scene.add(sun, new THREE.AmbientLight(0x5a4a8a, 0.35));

  // Stars.
  const rand = mulberry32(11);
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    sp.set([r * Math.cos(th) * 9e7, r * Math.sin(th) * 9e7, u * 9e7], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6dd, size: 1.5, sizeAttenuation: false })));

  // The ley grid, a little above the surface: one set of lines per class,
  // brighter for the rarer ones. From far out only the two rarest show, so the
  // planet isn't lost in a net of gold.
  const c = new THREE.Color();
  const classLines = new Map();
  for (const line of network().lines) {
    if (!classLines.has(line.cls.id)) classLines.set(line.cls.id, { rank: line.cls.rank, pos: [] });
    const pts = greatCircle(line.a, line.b, 1);
    for (let i = 0; i < pts.length - 1; i++)
      for (const p of [pts[i], pts[i + 1]]) classLines.get(line.cls.id).pos.push(p[0] * R_EARTH * 1.012, p[1] * R_EARTH * 1.012, p[2] * R_EARTH * 1.012);
  }
  const leyMeshes = [];
  for (const { rank, pos } of classLines.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color().setHSL(0.11, 1, 0.3 + 0.08 * rank), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.userData.rank = rank;
    leyMeshes.push(m);
    scene.add(m);
  }

  // Atmosphere: a rim of light, brighter on the day side.
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R_EARTH * 1.035, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vN; varying vec3 vW;
        void main() { vN = normalize(position); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 v = normalize(cameraPosition - vW);
          float rim = pow(1.0 - abs(dot(vN, v)), 3.0);
          float day = 0.25 + 0.75 * smoothstep(-0.25, 0.4, dot(vN, uSun));
          gl_FragColor = vec4(mix(vec3(0.5, 0.3, 1.0), vec3(1.0, 0.5, 0.72), day) * rim * day * 0.9, rim * day);
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(atmo);

  // You are here.
  const markerGeo = new THREE.BufferGeometry();
  markerGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const marker = new THREE.Points(markerGeo, new THREE.PointsMaterial({ color: 0xfff3b0, size: 7, sizeAttenuation: false, depthTest: false, transparent: true }));
  marker.renderOrder = 10;
  scene.add(marker);

  // The Earth itself loads once (16 tiles) the first time you zoom out this far.
  let earth = null, loading = null;
  function load() {
    if (loading) return loading;
    // The whole climate map (72 small tiles) for the biomes.
    const allTiles = Promise.all([-75, -45, -15, 15, 45, 75].flatMap((la) => [-165, -135, -105, -75, -45, -15, 15, 45, 75, 105, 135, 165].map((lo) => ensureKoppen(la, lo, 1))));
    loading = Promise.all([worldHeights(), allTiles]).then(([heightOf]) => {
      // Detail subdivides each of the 20 faces linearly: (31 + 1)² × 20 = 20,480 facets.
      const geo = new THREE.IcosahedronGeometry(R_EARTH, 31);
      const pos = geo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        // One colour per facet, from its centre; each vertex lifted by its own height.
        let clat = 0, ch = 0;
        const clon = [];
        const lls = [];
        for (let k = 0; k < 3; k++) {
          v.fromBufferAttribute(pos, i + k);
          const ll = vecToLatLon([v.x, v.y, v.z]);
          const h = heightOf(ll.lat, ll.lon);
          lls.push(h);
          v.setLength(R_EARTH + Math.max(0, h) * RELIEF);
          pos.setXYZ(i + k, v.x, v.y, v.z);
          clat += ll.lat / 3; ch += h / 3; clon.push(ll.lon);
        }
        const steep = Math.max(...lls) - Math.min(...lls) > 1800;
        // From orbit, the ocean is water, not seafloor: bright in the shallows, deep offshore.
        if (ch < 0) c.setHSL(0.56 + 0.06 * Math.min(1, -ch / 5000), 0.85, 0.5 - 0.28 * Math.min(1, -ch / 4000));
        else {
          // Mean longitude of the facet's corners (careful across the date line).
          const lon0 = clon[0];
          const lonMean = lon0 + clon.reduce((s, l) => s + (((l - lon0 + 540) % 360) - 180), 0) / 3;
          groundColor(c, clat, ((lonMean + 540) % 360) - 180, ch, 0, steep);
        }
        for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      earth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scene.add(earth);
    });
    return loading;
  }

  /** ll: where you are; heading: east/north unit; altitude: metres above the surface; date; aspect. */
  function update(ll, heading, altitude, date, aspect, t) {
    if (!earth) load();
    const s = subsolarPoint(date);
    const sv = latLonToVec(s.lat, s.lon);
    sun.position.set(sv[0] * 1e8, sv[1] * 1e8, sv[2] * 1e8);
    atmo.material.uniforms.uSun.value.set(...sv);
    const here = new THREE.Vector3(...latLonToVec(ll.lat, ll.lon));
    marker.geometry.attributes.position.setXYZ(0, here.x * R_EARTH * 1.015, here.y * R_EARTH * 1.015, here.z * R_EARTH * 1.015);
    marker.geometry.attributes.position.needsUpdate = true;
    marker.material.size = 6 + 3 * Math.sin(t * 3);
    // Fewer, fainter lines the further out you are.
    const out = THREE.MathUtils.smoothstep(altitude, 2.5e6, 9e6);
    for (const m of leyMeshes) {
      m.visible = m.userData.rank >= 2 || out < 0.95;
      m.material.opacity = (m.userData.rank >= 2 ? 0.85 : 0.6) * (1 - 0.55 * out);
    }
    // Camera: above you, tilted back along your heading when close, swinging to
    // look at the whole planet as you pull away.
    const la = (ll.lat * Math.PI) / 180, lo = (ll.lon * Math.PI) / 180;
    const east = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
    const north = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la));
    const fwd = east.multiplyScalar(heading.e).add(north.multiplyScalar(heading.n)).normalize();
    const far = THREE.MathUtils.smoothstep(altitude, 800e3, 9000e3);
    const tilt = Math.min(0.6, (1.2 * altitude) / R_EARTH) * (1 - far); // ~50° pitch, flattening out with distance
    const dir = here.clone().addScaledVector(fwd, -tilt).normalize();
    camera.position.copy(dir).multiplyScalar(R_EARTH + altitude);
    const target = here.clone().multiplyScalar(R_EARTH * (1 - far));
    camera.up.copy(fwd).lerp(new THREE.Vector3(0, 0, 1), far).normalize();
    camera.lookAt(target);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, load };
}
