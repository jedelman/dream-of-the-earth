// Inland water, drawn (11-14): rivers as ribbons laid on the land, lakes as flat water at their shore's height. Where
// they come from and the rules are in inland.js; this file fetches the tiles and builds the meshes. One shader for both,
// the sea's palette in hard bands, with ripples, a glint and the sky at grazing angles.
import * as THREE from "three";
import { CURVE_GLSL, curveUniform } from "./curvature.js";
import { NEAR_M, FAR_M, BIG_RANK, waterTilesNear, parseWaterTile, riverWidth, densify, ribbon, lakeLevel, lakePolygons, subdivide, distToLine, inRing } from "./inland.js";

let listed = null, listing = null;
const tiles = new Map(); // key -> parsed tile (or an empty one if it failed)
const pending = new Map();

async function loadIndex() {
  if (listed) return listed;
  listing ??= fetch("./data/water/index.json").then((r) => (r.ok ? r.json() : { tiles: [] })).then((j) => (listed = new Set(Array.isArray(j.tiles) ? j.tiles : []))).catch(() => (listed = new Set()));
  return listing;
}

/** Make sure the water tiles round (lat, lon) are loaded (a few, of 226, each under 70 KB). */
export async function ensureWater(lat, lon) {
  const have = await loadIndex();
  await Promise.all(waterTilesNear(lat, lon, FAR_M + 20000, have).map((key) => {
    if (tiles.has(key)) return null;
    if (!pending.has(key)) pending.set(key, fetch(`./data/water/${key}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => tiles.set(key, parseWaterTile(j))).catch(() => tiles.set(key, parseWaterTile(null))).finally(() => pending.delete(key)));
    return pending.get(key);
  }));
}

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${CURVE_GLSL}
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    // Lifted a little off the land, more with distance, so the facets don't show through.
    w.y += 1.2 + 0.0004 * length(w.xz - cameraPosition.xz);
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
  uniform float uTime, uDay;
  uniform vec3 uSunDir, uSunColor, uSky, uDeep, uShallow;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vWorld.xz;
    float far = smoothstep(800.0, 6000.0, length(p - cameraPosition.xz));
    // Ripples: two small wave trains, faded out with distance before they can shimmer.
    vec2 g = (1.0 - far) * (0.18 * cos(dot(p, vec2(0.21, 0.13)) - uTime * 1.7) * vec2(0.21, 0.13) + 0.12 * cos(dot(p, vec2(-0.09, 0.31)) + uTime * 1.3) * vec2(-0.09, 0.31));
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float diffuse = clamp(dot(n, uSunDir), 0.0, 1.0);
    diffuse = floor(diffuse * 4.0 + 0.5) / 4.0;
    vec3 col = mix(uDeep, uShallow, 0.35 + 0.65 * diffuse * uDay);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    col = mix(col, uSky, clamp(fres * 1.2, 0.0, 0.4)); // less than the sea: a thin river all sky would read as a road
    // A river's banks: a pale band of shallows along each edge (lakes carry 0.5 across, so none).
    col = mix(col, vec3(0.75, 0.95, 1.0), step(0.4, abs(vUv.y - 0.5)) * 0.35);
    vec3 r = reflect(-uSunDir, n);
    col += uSunColor * step(0.4, pow(clamp(dot(r, v), 0.0, 1.0), 90.0)) * uDay * (1.0 - far);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

const uniforms = THREE.UniformsUtils.merge([
  THREE.UniformsLib.fog,
  {
    uTime: { value: 0 }, uDay: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(0xfff1c8) },
    uSky: { value: new THREE.Color(0xff9ec7) }, uDeep: { value: new THREE.Color(0x184f96) }, uShallow: { value: new THREE.Color(0x52e2ff) },
  },
]);
uniforms.uCurve = curveUniform; // shared, not cloned
const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, side: THREE.DoubleSide });

/** Each frame, with the sea's: t seconds, sunDir a local unit vector, day 0..1, sky the horizon colour. */
export function updateInland(t, sunDir, day, sky) {
  uniforms.uTime.value = t;
  uniforms.uSunDir.value.set(sunDir.x, Math.max(-0.2, sunDir.y), sunDir.z).normalize();
  uniforms.uDay.value = day;
  uniforms.uSky.value.copy(sky);
}

const boxOf = (m) => ({ minX: -m, maxX: m, minZ: -m, maxZ: m });
const inBox = (p, b) => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minZ && p[1] <= b.maxZ;

/** The runs of a polyline that lie in a box (a segment with either end inside is kept whole). */
function clipRuns(pts, b) {
  const runs = [];
  let run = [];
  for (let k = 0; k < pts.length; k++) {
    const inside = inBox(pts[k], b) || (k > 0 && inBox(pts[k - 1], b)) || (k + 1 < pts.length && inBox(pts[k + 1], b));
    if (inside) run.push(pts[k]);
    else if (run.length) { if (run.length > 1) runs.push(run); run = []; }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/**
 * The rivers and lakes round a world's middle, from the loaded tiles: { group, wadingAt(x, z, y), stats }. wadingAt says
 * which water a creature at local (x, z), its feet at y, is standing in: { kind: "river" | "lake", name, reservoir }.
 */
export function buildInland(frame, terrain) {
  const near = boxOf(NEAR_M), far = boxOf(FAR_M);
  const local = (ll) => { const p = frame.toLocal(ll[1], ll[0]); return [p.x, p.z]; };
  const center = frame.toLatLon(0, 0);
  const keys = listed ? waterTilesNear(center.lat, center.lon, FAR_M + 20000, listed) : [];
  const pos = [], uv = [], idx = [];
  const add = (m) => { const base = pos.length / 3; pos.push(...m.pos); uv.push(...m.uv); for (const i of m.idx) idx.push(base + i); };
  const rivers = [], lakes = [], seen = new Set();
  let riverCount = 0;

  for (const key of keys) {
    const t = tiles.get(key);
    if (!t) continue;
    for (const r of t.rivers) {
      const b = r.rank <= BIG_RANK ? far : near;
      const pts = r.pts.map(local);
      const width = riverWidth(r.rank);
      for (const run of clipRuns(pts, b)) {
        const line = densify(run, Math.max(120, width));
        const m = ribbon(line, width, terrain.heightAt);
        if (!m.idx.length) continue;
        add(m);
        riverCount++;
        if (run.some((p) => inBox(p, near))) rivers.push({ name: r.name, width, line });
      }
    }
    for (const l of t.lakes) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      for (const poly of lakePolygons(l.rings)) {
        const outer = poly.outer.map(local), holes = poly.holes.map((h) => h.map(local));
        const xs = outer.map((p) => p[0]), zs = outer.map((p) => p[1]);
        if (Math.max(...xs) < far.minX || Math.min(...xs) > far.maxX || Math.max(...zs) < far.minZ || Math.min(...zs) > far.maxZ) continue;
        // The water's height: low round the shore, from the shore points near enough to have terrain under them.
        const shore = densify([...outer, outer[0]], 400).filter((p) => inBox(p, boxOf(FAR_M + 30000)));
        const level = lakeLevel(shore.map((p) => terrain.heightAt(p[0], p[1])));
        if (level === null || level <= 1) continue; // at the sea's height, the sea already covers it
        const tri = THREE.ShapeUtils.triangulateShape(outer.map((p) => new THREE.Vector2(p[0], p[1])), holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1]))));
        const all = [outer, ...holes].flat();
        const parts = subdivide(tri.map(([a, b, c]) => [all[a], all[b], all[c]]), 6000, far);
        if (!parts.length) continue;
        const m = { pos: [], uv: [], idx: [] };
        for (const t3 of parts) for (const p of t3) { m.idx.push(m.pos.length / 3); m.pos.push(p[0], level, p[1]); m.uv.push(0, 0.5); }
        add(m);
        const xs2 = outer.map((p) => p[0]), zs2 = outer.map((p) => p[1]);
        lakes.push({ name: l.name, reservoir: l.kind === 1, level, outer, holes, box: { minX: Math.min(...xs2), maxX: Math.max(...xs2), minZ: Math.min(...zs2), maxZ: Math.max(...zs2) } });
      }
    }
  }

  const group = new THREE.Group();
  if (idx.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; // curvature moves vertices after culling would have run
    mesh.userData.sharedMaterial = true;
    group.add(mesh);
  }

  // The near rivers' segments, bucketed by kilometre square, so asking "is this wet?" for every plant stays cheap.
  const buckets = new Map(), B = 1000;
  for (const r of rivers)
    for (let k = 1; k < r.line.length; k++) {
      const a = r.line[k - 1], b = r.line[k], pad = r.width / 2 + 4, seg = { r, pts: [a, b] };
      for (let i = Math.floor((Math.min(a[0], b[0]) - pad) / B); i <= Math.floor((Math.max(a[0], b[0]) + pad) / B); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - pad) / B); j <= Math.floor((Math.max(a[1], b[1]) + pad) / B); j++) {
          const key = i * 100000 + j;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(seg);
        }
    }
  const lakeAt = (x, z) => lakes.find((l) => x >= l.box.minX && x <= l.box.maxX && z >= l.box.minZ && z <= l.box.maxZ && inRing(x, z, l.outer) && !l.holes.some((h) => inRing(x, z, h))) ?? null;
  const riverAt = (x, z, margin) => (buckets.get(Math.floor(x / B) * 100000 + Math.floor(z / B)) ?? []).find((s) => distToLine(x, z, s.pts) < s.r.width / 2 + margin)?.r ?? null;

  function wadingAt(x, z, y) {
    const l = lakeAt(x, z);
    if (l && y < l.level + 4) return { kind: "lake", name: l.name, reservoir: l.reservoir };
    const r = riverAt(x, z, 3);
    return r ? { kind: "river", name: r.name } : null;
  }
  /** Whether the ground at (x, z) is under a river or a lake (so nothing grows there). */
  function wet(x, z) {
    const l = lakeAt(x, z);
    if (l && terrain.heightAt(x, z) < l.level + 2) return true;
    return !!riverAt(x, z, 2);
  }
  return { group, wadingAt, wet, stats: { rivers: riverCount, lakes: lakes.length, triangles: idx.length / 3 } };
}
